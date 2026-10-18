#!/usr/bin/env python3
"""Cross-target performance evidence admission; this is not a benchmark runner.

No evidence status here claims that software throughput and FPGA/ASIC PPA are
comparable. Records are checked independently and bind to exact source inputs.
"""
import json
import math
import re
import sys
from pathlib import Path

SHA = re.compile(r"^[a-f0-9]{64}$")
GIT_OID = re.compile(r"^(?:[a-f0-9]{40}|[a-f0-9]{64})$")
TARGET_STAGES = {
    "jvm": {"JIT"}, "graal-native": {"AOT", "AOT_PGO"},
    "llvm": {"AOT", "AOT_LTO"}, "wasm": {"SCALAR", "SIMD128"},
    "fpga": {"SYNTH_ONLY", "PLACED_ROUTED", "BOARD_VERIFIED"},
    "asic": {"GENERIC_SYNTH", "CELL_MAPPED", "PLACED_ROUTED"},
}
SOFTWARE = {"jvm", "graal-native", "llvm", "wasm"}
FIELDS = {"schemaVersion", "target", "stage", "status", "workloadSha256",
          "sourceTreeSha", "sourceCommitSha", "artifactSha256", "toolchain", "commandSha256",
          "correctness", "runs", "metric", "logSha256"}

class InvalidEvidence(ValueError):
    pass

def unique_pairs(pairs):
    obj = {}
    for k, v in pairs:
        if k in obj:
            raise InvalidEvidence(f"duplicate JSON key {k}")
        obj[k] = v
    return obj

def require(test, error):
    if not test:
        raise InvalidEvidence(error)

def digest(v):
    return type(v) is str and bool(SHA.fullmatch(v))

def validate(d):
    require(type(d) is dict and set(d) == FIELDS, "unknown/missing evidence fields")
    require(type(d["schemaVersion"]) is int and d["schemaVersion"] == 1, "schema version")
    target, stage, status = (d["target"], d["stage"], d["status"])
    require(type(target) is str and target in TARGET_STAGES, "unsupported target")
    require(type(stage) is str and stage in TARGET_STAGES[target], "unsupported target stage")
    require(type(status) is str and status in {"PASS", "FAILED", "NOT_RUN", "UNSUPPORTED"}, "unknown outcome")
    for key in ("workloadSha256", "commandSha256"):
        require(digest(d[key]), f"exact {key} required")
    for key in ("sourceTreeSha", "sourceCommitSha"):
        require(type(d[key]) is str and bool(GIT_OID.fullmatch(d[key])),
                f"exact Git object ID required: {key}")
    for key in ("artifactSha256", "logSha256"):
        require(d[key] == "" or digest(d[key]), f"invalid {key}")
    require(type(d["toolchain"]) is str and 0 < len(d["toolchain"].strip()) <= 256, "toolchain provenance required")
    require(type(d["runs"]) is int and 0 <= d["runs"] <= 100000, "invalid independent runs")
    require(type(d["correctness"]) is str and d["correctness"] in {"PASS", "FAIL", "NOT_RUN"}, "correctness status")
    metric = d["metric"]
    if status != "PASS":
        require(metric is None and d["runs"] == 0,
                "unexecuted/failed targets cannot report synthetic performance")
        require((status in ("NOT_RUN", "UNSUPPORTED") and d["correctness"] == "NOT_RUN") or
                (status == "FAILED" and d["correctness"] in ("FAIL", "NOT_RUN")),
                "outcome and correctness conflict")
    else:
        require(d["correctness"] == "PASS" and digest(d["artifactSha256"]) and digest(d["logSha256"]),
                "passing evidence needs correctness and immutable artifacts/logs")
        require(d["runs"] >= 1, "PASS requires an executed independent run")
        if metric is not None:
            require(d["runs"] >= 5, "performance claims need at least five independent runs")
            require(type(metric) is dict and set(metric) == {"name", "value", "unit"},
                    "metric must include name, finite value and unit")
            value = metric["value"]
            require(type(value) in (int, float) and math.isfinite(value) and value > 0,
                    "performance metrics must be finite, positive and non-synthetic")
            if target in SOFTWARE:
                require((metric["name"], metric["unit"]) in {("throughput", "requests/s"),
                        ("latency", "ms")}, "software metric/unit pair")
            else:
                require((metric["name"], metric["unit"]) in {("cell_area", "um2"),
                        ("lut", "count"), ("fmax", "Hz"), ("estimated_power", "mW")},
                        "hardware metric/unit pair")
                require(not (target == "asic" and stage == "GENERIC_SYNTH"),
                        "generic synthesis cannot report physical PPA")
                require(not (target == "fpga" and stage == "SYNTH_ONLY" and
                             metric["name"] in ("fmax", "estimated_power")),
                        "synthesis-only evidence cannot claim routing measurements")
    return {"admittedShape": True, "target": target, "stage": stage,
            "outcome": status, "crossTargetComparable": False}

def main(args):
    if len(args) != 2:
        print("usage: validate_cross_target_evidence.py report.json", file=sys.stderr)
        return 64
    try:
        path = Path(args[1])
        if path.stat().st_size > 65536:
            raise InvalidEvidence("evidence file too large")
        record = json.loads(path.read_text(encoding="utf8"), object_pairs_hook=unique_pairs)
        print(json.dumps(validate(record), sort_keys=True))
        return 0
    except (ValueError, OSError, UnicodeError) as exc:
        print("REJECTED: " + str(exc), file=sys.stderr)
        return 65

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
