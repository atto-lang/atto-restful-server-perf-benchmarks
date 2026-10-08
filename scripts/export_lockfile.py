#!/usr/bin/env python3
"""CI-only: publish reproducible build lockfile bytes as bounded log chunks.

Private cross-organization test runners cannot push to the private source repo.
The connector copies these exact bytes to the source branch after checking hashes.
Never run this script on credentials, secrets, environment files or user data.
"""
import base64
import hashlib
import pathlib
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: export_lockfile.py <allowlisted relative path>")
name = sys.argv[1]
ALLOWED = {
    "contracts/conformance/package-lock.json",
    "contracts/conformance/generated/openapi.json",
    "src/golang/gin/go.mod",
    "src/golang/gin/go.sum",
    "src/rust/axum/Cargo.lock",
    "src/erlang/phoenix/mix.lock",
}
if name not in ALLOWED:
    raise SystemExit(f"refusing to export non-allowlisted path: {name}")
data = pathlib.Path(name).read_bytes()
sha = hashlib.sha256(data).hexdigest()
encoded = base64.b64encode(data).decode("ascii")
print(f"LOCK_START|{name}|{sha}|{len(data)}", flush=True)
for index, offset in enumerate(range(0, len(encoded), 3000)):
    print(f"LOCK_CHUNK|{name}|{index}|{encoded[offset:offset + 3000]}", flush=True)
print(f"LOCK_END|{name}|{sha}|{len(data)}", flush=True)
