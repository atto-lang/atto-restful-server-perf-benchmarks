# Verified correctness — 2026-10-08

**Scope:** machine-readable HTTP behavior only. No RPS, latency, or resource measurements are claimed here.

## Required contract

The TypeSpec source is `contracts/conformance/main.tsp`, compiled to the committed `contracts/conformance/generated/openapi.json` with npm `ci`. `cases.json` is validated against Draft 2020-12 JSON Schema. The harness checks **9 scenario cases**, **3 persistent-connection requests**, and **24 concurrent requests**: **36 checks per server mode**. Fail closed on missing methods, status codes, content types, JSON literals, incorrect bytes, and 413 response contracts.

## Exact-source CI evidence

Benchmark source tested against the private funded mirror in:
- [HTTP conformance run — 8/8 jobs passed](https://github.com/messaging-intel/msgint-api-server.rs/actions/runs/37732800011). All six server jobs returned 36/36 passed.
- [Pinned Spin integration run — 1/1 job passed](https://github.com/messaging-intel/msgint-api-server.rs/actions/runs/37732799933). Spin **shared** and **isolated** modes each returned 36/36 passed.
- [Dependency resolution/export run](https://github.com/messaging-intel/msgint-api-server.rs/actions/runs/37732967950). Maven Vert.x and Akka resolved dependency-tree snapshots were generated and committed.
- [Locked build run](https://github.com/messaging-intel/msgint-api-server.rs/actions/runs/37732372322) validated pinned npm/Go/Cargo/Mix dependencies and matched the TypeSpec OpenAPI snapshot.

The source Git tree was mirrored byte-for-byte to a private test repository, with identity verified using identical Git tree/blob hashes. For the Spin integration test, **95 pinned upstream Git blobs** were checked against the exact compiler, Spin, and routing commit revisions recorded in the manifest of the test-only mirror. The compiler source pinned by `oreslang-spin/SOURCE_REF` was built before running the tests. The test-only mirror's additional `spin-ci/` fixture files are not part of this source repository.

## Target results

| Target | HTTP cases | Build/runtime |
| --- | ---: | --- |
| Node.js | 36/36 | passed |
| Go Gin | 36/36 | passed |
| Rust Axum | 36/36 | passed |
| Java Vert.x Web | 36/36 | passed |
| Scala Akka HTTP | 36/36 | passed |
| Elixir Phoenix/Bandit | 36/36 | passed |
| Oreslang Spin shared actors | 36/36 | passed |
| Oreslang Spin isolated actors | 36/36 | passed |

## Not performance evidence

This establishes compatible response behavior for the measured fixtures, not equal scheduler semantics, native transport overhead, allocations, CPU, worker counts, or fairness across runtimes. Spin buffers echo inputs by bounded chunks, and the response transport still differs from some implementations; separate benchmark modes and disclose these differences. Produce credible rankings only after controlled warmups, repeated trials, raw results, and audited hardware/runtime settings.

## Extended adapter validation — 2026-10-08

The seven newly added adapter source trees and the conformance workflow were copied to a separate funded [test branch](https://github.com/messaging-intel/msgint-api-server.rs/tree/feat/rest-all-14-conformance-20261008). Git blob SHA comparison confirmed **22/22 identical source/workflow files** at the initial mirror commit, including all seven runnable adapters and the CI workflow. This is an incremental test mirror based on the previously validated source mirror, **not** an exact copy of the entire latest benchmark repository tree; test-only Spin fixtures and original baseline files are also present.

- [Initial extended matrix](https://github.com/messaging-intel/msgint-api-server.rs/actions/runs/37803077119): Bun, Deno, Gorilla/mux, OTP+Cowboy and Ractor+Axum all reached successful live conformance jobs; Node failed because the mirror initially lacked the newer `scripts/test_native_js.mjs` fixture, and Spring Boot failed due to MIME whitespace normalization.
- [Follow-up matrix](https://github.com/messaging-intel/msgint-api-server.rs/actions/runs/37803241879): the Node fixture and corrected semantic `Content-Type` comparison were synchronized from this source branch (their Git blob SHA matched); Node, Bun, Deno, and Spring Boot then all passed their live CI jobs. Further jobs, particularly Actix compilation, were still in progress at the time of this evidence entry.

Do **not** interpret this as a cross-language throughput benchmark or as proof all 15 CI jobs completed green. Retain the PR until the complete matrix finishes and compare the tested Git blobs to the final candidate head.
