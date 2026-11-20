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

 
// A Web Streams reader is allowed to reuse backing storage after each read.
// Retaining the producer's Uint8Array view corrupts previously buffered bytes.
for (const runtime of ["bun", "deno"]) {
  const handler = loadHandler(runtime);
  const url = "http://127.0.0.1:8080/echo";

  test(`${runtime}/stream-owned-chunks`, async () => {
    const shared = new Uint8Array([0, 1, 255]);
    let readCount = 0;
    let released = 0;
    const reader = {
      async read() {
        readCount += 1;
        if (readCount === 1) {
          return { done: false, value: shared };
        }
        if (readCount === 2) {
          shared.set([10, 20, 30]);
          return { done: false, value: shared };
        }
        return { done: true };
      },
      releaseLock() {
        released += 1;
      },
      async cancel() {
        throw new Error("unexpected cancel");
      },
    };
    const response = await handler({
      method: "POST",
      url,
      body: { getReader: () => reader },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      Buffer.from([0, 1, 255, 10, 20, 30]),
    );
    assert.equal(released, 1);
  });

  test(`${runtime}/stream-one-byte-over-boundary`, async () => {
    let readCount = 0;
    let released = 0;
    let cancelled = 0;
    const reader = {
      async read() {
        readCount += 1;
        if (readCount === 1) {
          return { done: false, value: new Uint8Array(maxBody) };
        }
        if (readCount === 2) {
          return { done: false, value: new Uint8Array([255]) };
        }
        throw new Error("must cancel immediately after exceeding limit");
      },
      async cancel() {
        cancelled += 1;
      },
      releaseLock() {
        released += 1;
      },
    };
    const response = await handler({
      method: "POST",
      url,
      body: { getReader: () => reader },
    });
    assert.equal(response.status, 413);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "Payload Too Large");
    assert.equal(cancelled, 1);
    assert.equal(released, 1);
    assert.equal(readCount, 2);
  });

  test(`${runtime}/stream-read-failure-releases-lock`, async () => {
    let released = 0;
    const reader = {
      async read() {
        throw new Error("simulated transport failure");
      },
      releaseLock() {
        released += 1;
      },
    };
    const response = await handler({
      method: "POST",
      url,
      body: { getReader: () => reader },
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "Bad Request");
    assert.equal(released, 1);
  });
}
