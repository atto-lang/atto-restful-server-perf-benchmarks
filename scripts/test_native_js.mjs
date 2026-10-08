// Node's built-in test runner executes the actual Bun/Deno HTTP handlers with
// host APIs mocked. This tests application semantics but NOT Bun/Deno sockets.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const maxBody = 1024 * 1024;

function loadHandler(runtime) {
  const file = new URL(`src/js/${runtime}/server.mjs`, root);
  const source = readFileSync(file, "utf8");
  let handler;
  const fakeProcess = {
    env: {},
    on: () => {},
    exit: (code) => { throw new Error(`unexpected process.exit(${code})`); },
  };
  const fakeDeno = {
    env: { get: () => undefined },
    addSignalListener: () => {},
    exit: (code) => { throw new Error(`unexpected Deno.exit(${code})`); },
    serve: (options, callback) => {
      assert.equal(options.hostname, "127.0.0.1");
      assert.equal(options.port, 8080);
      handler = callback;
    },
  };
  const fakeBun = {
    env: {},
    serve: (options) => {
      assert.equal(options.hostname, "127.0.0.1");
      assert.equal(options.port, 8080);
      handler = options.fetch;
      return { port: 8080, stop() {} };
    },
  };
  vm.runInNewContext(source, {
    TextEncoder, Uint8Array, Response, URL, AbortController,
    process: fakeProcess, Bun: fakeBun, Deno: fakeDeno,
    console: { error() {} },
  }, { filename: file.pathname, timeout: 5000 });
  assert.equal(typeof handler, "function");
  return handler;
}

const cases = [
  { name: "health", method: "GET", path: "/health", status: 200,
    type: "application/json", body: Buffer.from('{"status":"ok"}') },
  { name: "plaintext", method: "GET", path: "/plaintext", status: 200,
    type: "text/plain; charset=utf-8", body: Buffer.from("hello, world!") },
  { name: "json", method: "GET", path: "/json", status: 200,
    type: "application/json", body: Buffer.from('{"message":"hello, world!"}') },
  { name: "echo-empty", method: "POST", path: "/echo", status: 200,
    type: "application/octet-stream", body: Buffer.alloc(0) },
  { name: "echo-binary", method: "POST", path: "/echo", status: 200,
    type: "application/octet-stream", body: Buffer.from([0, 1, 127, 128, 254, 255]) },
  { name: "echo-1MiB", method: "POST", path: "/echo", status: 200,
    type: "application/octet-stream", body: Buffer.alloc(maxBody, 255) },
  { name: "echo-over-limit", method: "POST", path: "/echo", status: 413,
    type: "text/plain; charset=utf-8", body: Buffer.alloc(maxBody + 256) },
  { name: "not-found", method: "GET", path: "/not-found", status: 404,
    type: "text/plain; charset=utf-8" },
  { name: "wrong-method", method: "POST", path: "/health", status: 404,
    type: "text/plain; charset=utf-8" },
];

for (const runtime of ["bun", "deno"]) {
  const handler = loadHandler(runtime);
  for (const scenario of cases) {
    test(`${runtime}/${scenario.name}`, async () => {
      const request = new Request(`http://127.0.0.1:8080${scenario.path}`, {
        method: scenario.method,
        ...(scenario.method === "POST" ? { body: scenario.body } : {}),
      });
      const response = await handler(request);
      assert.equal(response.status, scenario.status);
      assert.equal(response.headers.get("content-type"), scenario.type);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(Number(response.headers.get("content-length")), bytes.length);
      if (scenario.status === 200) {
        assert.deepEqual(bytes, scenario.body);
      } else if (scenario.status === 413) {
        assert.equal(bytes.toString(), "Payload Too Large");
      } else {
        assert.equal(bytes.toString(), "Not Found");
      }
    });
  }
}
