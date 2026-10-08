#!/usr/bin/env python3
"""Black-box regressions: the conformance runner must reject wrong HTTP behavior."""
import http.server
import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]


class FixtureServer(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def answer(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        if self.server.behavior == "duplicate-header" and self.path == "/json":
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        responses = {
            "/health": (200, "application/json", b'{"status":"ok"}'),
            "/plaintext": (200, "text/plain; charset=utf-8", b"hello, world!"),
            "/json": (200, "application/json", b'{"message":"hello, world!"}'),
        }
        status, content_type, body = responses.get(
            self.path, (404, "text/plain; charset=utf-8", b"Not Found"))
        if self.server.behavior == "wrong-media" and self.path == "/json":
            content_type = "text/plain; charset=utf-8"
        self.answer(status, content_type, body)

    def do_POST(self):
        size = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(size)
        if size > 1_048_576:
            self.answer(413, "text/plain; charset=utf-8", b"Payload Too Large")
        else:
            if self.server.behavior == "bad-echo" and body:
                body = body[:-1] + b"X"
            self.answer(200, "application/octet-stream", body)


class RunnerRegressionTests(unittest.TestCase):
    def run_probe(self, behavior, *, occupied=False):
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FixtureServer)
        server.daemon_threads = True
        server.behavior = behavior
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            command = [sys.executable, str(ROOT / "scripts/conformance.py"),
                       "--port", str(server.server_address[1]), "--target", "negative-fixture"]
            if occupied:
                command += ["--", sys.executable, "-c", "pass"]
            proc = subprocess.run(command, cwd=ROOT, capture_output=True,
                                  text=True, timeout=25, check=False)
            output = json.loads(proc.stdout)
            return proc.returncode, output
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_good_server_matches_36_checks(self):
        exit_code, report = self.run_probe("normal")
        self.assertEqual(exit_code, 0, report)
        self.assertTrue(report["passed"])
        self.assertEqual(report["checks"], 36)
        self.assertEqual(report["failures"], [])
        self.assertEqual(len(report["contract_sha256"]), 64)

    def test_wrong_media_type_rejected(self):
        code, report = self.run_probe("wrong-media")
        self.assertEqual(code, 1)
        self.assertFalse(report["passed"])
        self.assertTrue(any("header content-type" in err for err in report["failures"]))

    def test_duplicate_response_header_rejected(self):
        code, report = self.run_probe("duplicate-header")
        self.assertEqual(code, 1)
        self.assertTrue(any("duplicate content-type" in err for err in report["failures"]))

    def test_corrupted_binary_echo_rejected(self):
        code, report = self.run_probe("bad-echo")
        self.assertEqual(code, 1)
        self.assertTrue(any("binary echo mismatch" in err for err in report["failures"]))

    def test_existing_listener_cannot_impersonate_spawned_server(self):
        code, report = self.run_probe("normal", occupied=True)
        self.assertEqual(code, 1)
        self.assertEqual(report["checks"], 0)
        self.assertTrue(any("already accepts connections" in err for err in report["failures"]))


if __name__ == "__main__":
    unittest.main()
