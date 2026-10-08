#!/usr/bin/env python3
"""Validate scaffold inventory and tracked implementation locations (no dependencies)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / "benchmarks" / "targets.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
assert manifest["schema_version"] == 1, "Unsupported manifest schema"
targets = manifest["targets"]
expected = {
    "js": {"nodejs", "bun", "deno"},
    "java": {"vertx", "springboot"},
    "golang": {"gin", "mux"},
    "scala": {"akka"},
    "erlang": {"otp", "phoenix"},
    "rust": {"axum", "actix", "ractor"},
    "oreslang": {"spin"},
}
actual = {}
ids = set()
for target in targets:
    target_id = target["id"]
    assert target_id not in ids, f"Duplicate target id: {target_id}"
    ids.add(target_id)
    parts = Path(target["path"]).parts
    assert len(parts) == 3 and parts[0] == "src", f"Invalid target path: {target_id}"
    _, language, framework = parts
    assert language == target["ecosystem"], f"Wrong ecosystem: {target_id}"
    actual.setdefault(language, set()).add(framework)
    directory = ROOT.joinpath(*parts)
    assert directory.is_dir(), f"Missing directory: {directory}"
    assert any(directory.iterdir()), f"Untracked/empty directory: {directory}"
    assert target["status"] in {"scaffold", "implemented", "verified"}, f"Bad status: {target_id}"
assert actual == expected, f"Targets differ: {actual!r}"
assert (ROOT / "docs" / "BENCHMARK_PROTOCOL.md").is_file()
print(f"Scaffold OK: {len(targets)} targets, {len(expected)} ecosystems")
