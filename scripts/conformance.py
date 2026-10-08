#!/usr/bin/env python3
"""HTTP correctness checks; no throughput benchmark numbers are generated."""
import argparse
import concurrent.futures
import http.client
import json
import os
import subprocess
import sys
import time

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("--host", default="127.0.0.1")
ap.add_argument("--port", type=int, default=8080)
ap.add_argument("--timeout", type=float, default=10)
ap.add_argument("command", nargs=argparse.REMAINDER)
args = ap.parse_args()
if not 1 <= args.port <= 65535: ap.error("port must be 1..65535")
command = args.command[1:] if args.command[:1] == ["--"] else args.command
process = None

def request(method, path, data=None, conn=None):
    own = conn is None
    c = conn or http.client.HTTPConnection(args.host, args.port, timeout=args.timeout)
    try:
        c.request(method, path, body=data, headers={"Accept-Encoding": "identity"})
        r = c.getresponse()
        result = (r.status, r.getheader("Content-Type", ""), r.read())
        return result
    finally:
        if own: c.close()

def expect(method, path, status, mime=None, body=None, data=None, conn=None):
    result = request(method, path, data, conn)
    if result[0] != status or (mime is not None and result[1].lower() != mime.lower()) or (body is not None and result[2] != body):
        raise AssertionError(f"{method} {path}: expected {(status,mime,body and len(body))}, got {(result[0],result[1],len(result[2]))}")
    return result

def run():
    cases = [
        ("GET", "/health", 200, "application/json", b'{"status":"ok"}'),
        ("GET", "/plaintext", 200, "text/plain; charset=utf-8", b"hello, world!"),
        ("GET", "/json", 200, "application/json", b'{"message":"hello, world!"}'),
    ]
    checks = 0
    for method,path,status,mime,body in cases:
        expect(method,path,status,mime,body)
        checks += 1
        if mime == "application/json": assert isinstance(json.loads(body),dict)
    expect("GET","/not-found",404)
    checks += 1
    for body in (b"", bytes(range(256))*4, bytes(range(256))*256, bytes(range(256))*4096):
        expect("POST","/echo",200,"application/octet-stream",body,body)
        checks += 1
    # HTTP/1.1 persistent-connection smoke: the same socket must survive.
    conn = http.client.HTTPConnection(args.host,args.port,timeout=args.timeout)
    try:
        for method,path,status,mime,body in cases:
            expect(method,path,status,mime,body,conn=conn)
            if conn.sock is None: raise AssertionError("server closed keep-alive connection")
            checks += 1
    finally: conn.close()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda _:request("GET","/plaintext"),range(24)))
    for result in results:
        if result[0] != 200 or result[1].lower() != "text/plain; charset=utf-8" or result[2] != b"hello, world!":
            raise AssertionError(f"concurrent response mismatch: {result!r}")
        checks += 1
    return checks

try:
    if command:
        process=subprocess.Popen(command,env=dict(os.environ,PORT=str(args.port),HOST=args.host),stdout=subprocess.DEVNULL)
    deadline=time.monotonic()+40
    while True:
        if process is not None and process.poll() is not None:
            raise RuntimeError(f"server exited before readiness: {process.returncode}")
        try:
            if request("GET","/health")[0]==200: break
        except (OSError,http.client.HTTPException):
            pass
        if time.monotonic()>deadline: raise TimeoutError("server readiness timeout")
        time.sleep(0.15)
    count=run()
    print(json.dumps({"conformance":"passed","checks":count,"benchmarks_run":False}))
except Exception as exc:
    print(json.dumps({"conformance":"failed","error":str(exc),"benchmarks_run":False}),file=sys.stderr)
    sys.exit(1)
finally:
    if process is not None:
        process.terminate()
        try: process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=8)
