#!/usr/bin/env python3
"""Run contract-backed HTTP conformance; this is not a performance benchmark."""
import argparse
import concurrent.futures
import http.client
import hashlib
import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from jsonschema import Draft202012Validator

from check_contracts import CONTRACTS, load_cases

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=8080)
parser.add_argument("--target", default="unspecified")
parser.add_argument("--timeout", type=float, default=10.0)
parser.add_argument("command", nargs=argparse.REMAINDER)
args = parser.parse_args()
if not 1 <= args.port <= 65535 or args.timeout <= 0:
    parser.error("invalid port or timeout")
command = args.command[1:] if args.command[:1] == ["--"] else args.command
proc = None


def payload_for(case):
    spec = case.get("payload")
    if spec is None:
        return None
    return bytes(range(spec["byteRange"])) * spec["repeat"]


def request(method, path, payload=None, conn=None):
    owned = conn is None
    c = conn or http.client.HTTPConnection(args.host, args.port, timeout=args.timeout)
    try:
        headers = {"Accept-Encoding": "identity"}
        if method == "POST":
            headers["Content-Type"] = "application/octet-stream"
        c.request(method, path, body=payload, headers=headers)
        r = c.getresponse()
        if r.version != 11:
            raise AssertionError(f"{method} {path}: expected HTTP/1.1, got {r.version}")
        pairs = r.getheaders()
        for unique in ("content-type", "content-length", "transfer-encoding"):
            if sum(name.lower() == unique for name, _ in pairs) > 1:
                raise AssertionError(f"{method} {path}: duplicate {unique} response header")
        headers_out = {k.lower(): v for k, v in pairs}
        if "content-length" in headers_out and "transfer-encoding" in headers_out:
            raise AssertionError(f"{method} {path}: ambiguous response framing")
        raw = r.read()
        if "content-length" in headers_out:
            try:
                claimed = int(headers_out["content-length"])
            except ValueError as exc:
                raise AssertionError(f"{method} {path}: invalid Content-Length") from exc
            if claimed < 0 or claimed != len(raw):
                raise AssertionError(f"{method} {path}: Content-Length/body mismatch")
        return r.status, headers_out, raw
    finally:
        if owned:
            c.close()


def verify(case, response):
    status, headers, body = response
    expected = case["expected"]
    if status != expected["status"]:
        raise AssertionError(f"{case['id']} status: {status} != {expected['status']}")
    for key, required in expected["headers"].items():
        actual = headers.get(key, "")
        if actual.lower() != required.lower():
            raise AssertionError(f"{case['id']} header {key}: {actual!r} != {required!r}")
    spec = expected["body"]
    if spec["kind"] == "ignore":
        return
    if spec["kind"] == "utf8":
        want = spec["equals"].encode("utf-8")
        if body != want:
            raise AssertionError(f"{case['id']} UTF-8 body mismatch")
    elif spec["kind"] == "json":
        decoded = json.loads(body)
        Draft202012Validator({"type": "object", "required": list(spec["equals"]),
            "properties": {key: {"const": value} for key, value in spec["equals"].items()},
            "additionalProperties": False}).validate(decoded)
        if decoded != spec["equals"]:
            raise AssertionError(f"{case['id']} JSON value mismatch")
    elif spec["kind"] == "echo":
        if body != payload_for(case):
            raise AssertionError(f"{case['id']} binary echo mismatch {len(body)} bytes")
    else:
        raise AssertionError(f"unknown body mode: {spec['kind']}")


def wait_for_server():
    deadline = time.monotonic() + 45.0
    while time.monotonic() < deadline:
        if proc is not None and proc.poll() is not None:
            raise RuntimeError(f"server exited before readiness: {proc.returncode}")
        try:
            code, _, body = request("GET", "/health")
            if code == 200 and body == b'{"status":"ok"}':
                return
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(0.15)
    raise TimeoutError(f"server not ready on {args.host}:{args.port}")


def run(cases):
    passed = 0
    failures = []
    for case in cases:
        try:
            verify(case, request(case["method"], case["path"], payload_for(case)))
            passed += 1
        except Exception as exc:
            failures.append(f"{case['id']}: {exc}")

    # The same HTTP/1.1 socket must survive 3 consecutive GET responses.
    reuse = [c for c in cases if c["id"] in ("health", "plaintext", "json")]
    conn = http.client.HTTPConnection(args.host, args.port, timeout=args.timeout)
    try:
        for case in reuse:
            try:
                verify(case, request(case["method"], case["path"], conn=conn))
                if conn.sock is None:
                    raise AssertionError("keep-alive socket closed")
                passed += 1
            except Exception as exc:
                failures.append(f"keepalive/{case['id']}: {exc}")
                break
    finally:
        conn.close()

    # Concurrency is a correctness smoke test, not an RPS measurement.
    plaintext = next(c for c in cases if c["id"] == "plaintext")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(request, "GET", "/plaintext") for _ in range(24)]
        for index, future in enumerate(futures):
            try:
                verify(plaintext, future.result())
                passed += 1
            except Exception as exc:
                failures.append(f"concurrent/{index}: {exc}")
    return passed, failures


try:
    cases = load_cases()["scenarios"]
    if command:
        # Fail closed if another server already occupies this endpoint.
        # Otherwise a broken child process could get credit for its responses.
        try:
            existing = socket.create_connection((args.host, args.port), timeout=0.5)
        except ConnectionRefusedError:
            pass
        else:
            existing.close()
            raise RuntimeError(f"refusing to run: {args.host}:{args.port} already accepts connections")
        env = dict(os.environ, HOST=args.host, PORT=str(args.port))
        proc = subprocess.Popen(command, env=env, stdout=subprocess.DEVNULL,
                                start_new_session=(os.name == "posix"))
    wait_for_server()
    checks, failures = run(cases)
except Exception as exc:
    checks, failures = 0, [str(exc)]
finally:
    if proc is not None:
        # Kill the entire server process group, not only the bash/mix wrapper.
        # This prevents a stale server making the next conformance run appear green.
        try:
            if os.name == "posix":
                os.killpg(proc.pid, signal.SIGTERM)
            else:
                proc.terminate()
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            if os.name == "posix":
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            else:
                proc.kill()
            proc.wait(timeout=8)

# Hash the cases actually used by this run, not the generated OpenAPI.
fixture_hash = hashlib.sha256((CONTRACTS / "cases.json").read_bytes()).hexdigest()
report = {"schema_version": 1, "target": args.target, "passed": not failures,
          "checks": checks, "failures": failures, "benchmarks_run": False,
          "contract_sha256": fixture_hash}
result_schema = json.loads((CONTRACTS / "result.schema.json").read_text())
Draft202012Validator(result_schema).validate(report)
print(json.dumps(report))
if failures:
    sys.exit(1)
