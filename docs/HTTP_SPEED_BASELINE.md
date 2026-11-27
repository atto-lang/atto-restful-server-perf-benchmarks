# Five-language HTTP speed baseline

Use the existing verified HTTP contract and real server adapters: Node core HTTP,
Go/Gin, Rust/Axum, Erlang/OTP/Cowboy, and the two existing **legacy Oreslang
Spin JVM guest** modes (shared and isolated fresh actors). Spin imports its real
routing library; it is not a host-side stand-in. The initial pinned source is
historical, not proof of current canonical Atto .atto or native-AOT performance.

Build the dependencies as in the smoke workflow. From the repository root run:

```sh
node scripts/http-speed.mjs smoke results/smoke-local
node scripts/http-speed.mjs full results/full-local
```

Use a fresh output directory for each invocation. Optional target IDs after the
output directory select a subset. All servers use port 8080, one at a time.
Set ORESLANG_SPIN_DIR and ORESLANG_SOURCE_DIR to the exact pins in the workflow
for Spin. The runner refuses a pre-existing listener and requires the existing
36-case live HTTP conformance suite before sampling. Each timed response is
checked for correct HTTP version, status, media type and exact body. The fixed
JSON route measures transport/dispatch, not JSON serialization speed.

Smoke: 1s warmup, 2s timing, concurrency 1 and 8, persistent connections.
Full: 30s warmup, 60s timing, 5 trials, concurrency 1/8/32/128, both keep-alive
and connection-per-request. Separate plaintext, JSON, and binary 1KiB echo.
The throughput denominator includes completion of outstanding requests.
Latency is measured by a closed-loop Node client (0.1ms upper-bound histogram
buckets); coordinated omission and client saturation are possible. Every
failure invalidates the trial, including warmup errors. No retries.

The workflow stores raw JSONL and conformance/server logs plus environment
metadata. Both profiles are deliberately marked ranking-ineligible until
resource isolation, generator headroom, repeatability, CPU/RSS sampling and
runtime/compiler flags are independently established. Hosted runner smoke
results are only for diagnostics. Pooled Spin, current canonical Atto guest
and native compiler tiers need separate exact-pin adapters and validation.

Audit additions: verify tracked source matches HEAD and the conformance receipt's target and fixture hash; record actual socket reuse and reject samples that contradict the requested connection mode. A failed historical Spin build allows separately labeled reference-only smoke artifacts, but fails the overall job. No reference-only run is a five-language comparison.

The timed client now lives in `scripts/http-speed-client.mjs`; `node --test scripts/test-http-speed-client.mjs` exercises that same module with real loopback HTTP servers. It rejects unexpected encoding, status, MIME, payload length/bytes, deadline failures, and keep-alive phases without reuse. These are host client regressions, not guest compiler or performance qualification.

The speed workflow independently validates the complete expected matrix (36 smoke rows or 720 full rows), exact source/contract identity and historical Spin pins, durations, connection mode, arithmetic and zero-error status. Explicit reference-only mode requires 24 smoke rows and never qualifies as a five-language run. The HTTP conformance workflow also runs the client and receipt tests; passing these tests does not prove compiled guest performance.
