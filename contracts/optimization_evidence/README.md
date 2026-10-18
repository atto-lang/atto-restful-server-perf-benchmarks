# Cross-target optimization evidence, version 1 (draft)

Tracks [#11](https://github.com/ores-truffle-oreslang/oreslang-restful-server-perf-benchmarks/issues/11)
and [organization epic](https://github.com/ores-truffle-oreslang/.github/issues/5).

This is an **admission check for the SHAPE of a report**, not a cryptographic
signature, a performance benchmark, a hardware equivalence proof, an FPGA
place-and-route report or an ASIC power model. It does not execute any build.
Never read `accepted: true` as verified speedup or real source provenance.
The sample uses obvious placeholder hashes and is an UNSUPPORTED illustration.

```sh
python3 scripts/check_optimization_evidence.py contracts/optimization_evidence/unsupported.example.json
(cd scripts && python3 -m unittest test_optimization_evidence.py)
```

A report must identify exact source commit and workload SHA-256, versioned
toolchain, explicit flags, status, correctness outcome, repetition count,
nonnegative numeric metrics with units encoded in keys and hashed artifacts.
Software measurement requires 5+ repetitions plus raw run hash; FPGA board
measurement requires both P&R and board log hashes, while FPGA P&R alone must
not claim board throughput. ASIC PPA is explicitly an **estimate**, not
measured silicon power. Unsupported and failed stages must state why and
carry no synthetic numeric measurements.

Follow-up: independently verify artifact hashes against immutable build
artifacts and recorded command lines; store raw observations, stable
training/held-out identities, resource and environmental confounders; add
per-target schemas for clock/PDK/library/process corner, comparisons and
correctness equivalence. This generic metadata check must not replace those.
