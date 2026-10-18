#!/usr/bin/env python3
"""Structural evidence gate; validates claims, not the truth of measurements."""
import json
import math
import re
import sys
from pathlib import Path

SOFTWARE = {"jvm-jit", "graal-native-aot", "graal-native-pgo",
            "graal-native-hybrid", "llvm-native", "wasm-scalar", "wasm-simd128"}
HARDWARE = {"fpga-rtl", "asic-rtl"}
STAGES = {"NOT_RUN", "UNSUPPORTED", "FAILED", "STATIC_PREFLIGHT_ONLY",
          "SIMULATED", "SYNTH_ONLY", "PLACED_ROUTED",
          "SOFTWARE_MEASURED", "HARDWARE_MEASURED", "ASIC_PPA_ESTIMATE"}
BASE_KEYS = {"schema_version", "target", "stage", "source_commit",
             "workload_sha256", "toolchain", "flags", "correctness_passed",
             "repetitions", "metrics", "artifacts", "reason"}
SHA256 = re.compile(r"^[0-9a-f]{64}$")
GIT_SHA = re.compile(r"^[0-9a-f]{40}$")


class Rejected(ValueError):
    pass


def require(ok, message):
    if not ok:
        raise Rejected(message)


def nonneg_number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def validate(data):
    require(isinstance(data, dict), "manifest must be an object")
    require(set(data) == BASE_KEYS, "missing or unknown manifest fields")
    require(type(data["schema_version"]) is int and data["schema_version"] == 1,
            "unsupported evidence version")
    target, stage = data["target"], data["stage"]
    require(target in SOFTWARE | HARDWARE, "unknown target")
    require(stage in STAGES, "unknown evidence stage")
    require(isinstance(data["source_commit"], str) and
            GIT_SHA.fullmatch(data["source_commit"]), "exact source commit required")
    require(isinstance(data["workload_sha256"], str) and
            SHA256.fullmatch(data["workload_sha256"]), "workload SHA-256 required")
    require(isinstance(data["toolchain"], str) and 0 < len(data["toolchain"]) <= 512,
            "versioned toolchain required")
    require(isinstance(data["flags"], list) and len(data["flags"]) <= 128 and
            all(isinstance(f, str) and 0 < len(f) <= 256 for f in data["flags"]),
            "flags must be a bounded string list")
    require(type(data["correctness_passed"]) is bool, "correctness_passed must be boolean")
    repeats = data["repetitions"]
    require(type(repeats) is int and 0 <= repeats <= 100000, "invalid repetition count")
    metrics = data["metrics"]
    require(isinstance(metrics, dict) and len(metrics) <= 64 and
            all(isinstance(k, str) and nonneg_number(v) for k, v in metrics.items()),
            "metrics require finite nonnegative numeric values")
    artifacts = data["artifacts"]
    require(isinstance(artifacts, dict) and len(artifacts) <= 32 and
            all(isinstance(k, str) and isinstance(v, str) and SHA256.fullmatch(v)
                for k, v in artifacts.items()), "artifacts require SHA-256 hashes")
    reason = data["reason"]
    require(isinstance(reason, str) and len(reason) <= 2048, "reason must be text")

    if stage in {"NOT_RUN", "UNSUPPORTED", "FAILED"}:
        require(bool(reason.strip()), "non-success evidence needs explicit reason")
        require(repeats == 0 and not metrics, "non-success evidence cannot report measurements")
        require(not data["correctness_passed"], "non-success stage cannot claim parity")
    else:
        require(data["correctness_passed"], "optimization stage requires correctness parity")
        require(bool(artifacts), "optimization claim needs hashed artifacts")
    if stage == "SOFTWARE_MEASURED":
        require(target in SOFTWARE, "software metrics on hardware target")
        require(repeats >= 5, "need five or more independent software repetitions")
        require({"p50_ms", "p95_ms", "p99_ms", "throughput_ops_per_sec"} <= metrics.keys(),
                "measured software must include latency/throughput distribution")
        require(metrics["p50_ms"] <= metrics["p95_ms"] <= metrics["p99_ms"],
                "latency percentiles must be ordered")
        require("raw_runs" in artifacts, "hash the full raw run observations")
    elif stage == "HARDWARE_MEASURED":
        require(target == "fpga-rtl", "board hardware measurement is FPGA-only here")
        require(repeats >= 1 and {"clock_hz", "throughput_ops_per_sec"} <= metrics.keys(),
                "measured FPGA needs clock and actual throughput")
        require({"pnr_log", "board_log"} <= artifacts.keys(),
                "measured FPGA needs P&R and board verification hashes")
    elif stage == "PLACED_ROUTED":
        require(target == "fpga-rtl" and "pnr_log" in artifacts,
                "FPGA P&R requires placed-and-routed evidence")
        require(not metrics.get("board_measured_ops_per_sec"),
                "P&R report is not a board measurement")
    elif stage == "ASIC_PPA_ESTIMATE":
        require(target == "asic-rtl" and {"mapped_netlist", "timing_log"} <= artifacts.keys(),
                "ASIC estimates need mapped netlist and timing evidence")
        require("measured_watts" not in metrics,
                "ASIC synthesis estimate cannot claim silicon power measurement")
    elif stage in {"STATIC_PREFLIGHT_ONLY", "SIMULATED", "SYNTH_ONLY"}:
        require(target in HARDWARE, "hardware stage used for software run")
    return {"accepted": True, "target": target, "stage": stage,
            "note": "structural admission ONLY; no independent validation of raw evidence"}


def main(argv):
    if len(argv) != 2:
        print("usage: check_optimization_evidence.py evidence.json", file=sys.stderr)
        return 64
    try:
        path = Path(argv[1])
        if path.stat().st_size > 65536:
            raise Rejected("manifest exceeds 64 KiB")
        data = json.loads(path.read_text(encoding="utf8"))
        print(json.dumps(validate(data), sort_keys=True))
        return 0
    except (OSError, ValueError, UnicodeError) as exc:
        print(f"REJECTED: {exc}", file=sys.stderr)
        return 65


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
