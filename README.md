# atto-restful-server-perf-benchmarks

Performance benchmarks and regression tests for AttoLang HTTP server implementations.

## Project scope

HTTP throughput, latency, repeatability, and regression comparisons.

## Development and validation

Record environment, toolchain, load generator, warmup, samples, baseline and exact commit before interpreting benchmark results. Avoid comparing unlike configurations.

## Status

This is a statement of intended scope, not a claim of completed implementation or production readiness. Source, CI, and checked-in examples are authoritative for actual supported features and commands.

## Ecosystem

- [AttoLang organization](https://github.com/atto-lang)
- [Language specification](https://github.com/atto-lang/atto-spec)
- [Platform conformance](https://github.com/atto-lang/atto-platform-conformance)

## Repository ownership and contribution routing

**Belongs here:** Repeatable REST server benchmarks, latency distributions, raw datasets, load generators and comparable source/toolchain metadata.

**Belongs elsewhere:** Server implementation in atto-api-server.atto or atto-demo-restful-server; routing correctness in atto-http-routing.

**Security and portability boundary:** Never compare dissimilar warmup/capacity targets or publish unverifiable throughput; document exact source SHA, hardware, isolation mode, sample sizes and error rates.

AttoLang is the public name; preserve existing Oreslang/.ores compatibility and use canonical .atto for new portable library source. This README defines scope, not feature readiness.

**Acceptance:** name exact source SHA/tree, runtime/toolchain, positive and negative checks and execution receipt before claiming support. Host-only tests and empty CI steps do not prove guest execution.
