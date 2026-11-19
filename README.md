> **AI agent instructions (organization-wide):** Before working on code, issues, or pull requests, read and follow the [organization `AGENTS.md`](https://github.com/atto-lang/.github/blob/main/AGENTS.md), including its **merge-first stealth-development policy**. Honor any repository-local `AGENTS.md`, explicit holds, and GitHub-enforced rules.

# atto-restful-server-perf-benchmarks

Performance benchmarks and regression tests for AttoLang HTTP server implementations.

## Naming migration and language authority

This repository is maintained at [atto-lang/atto-restful-server-perf-benchmarks](https://github.com/atto-lang/atto-restful-server-perf-benchmarks); use `https://github.com/atto-lang/atto-restful-server-perf-benchmarks.git` for Git remotes and canonical `.atto` source examples. The normative language contract is [atto-spec](https://github.com/atto-lang/atto-spec), with executable guest evidence tracked by [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance). Follow current ownership, borrowing, effects, actor, and syntax rules there; do not infer implemented features from a README or unexecuted CI.

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

AttoLang is the canonical project name; new source, examples and documentation use `.atto` and the `atto-lang` repository organization. This README defines scope, not feature readiness.

**Acceptance:** name exact source SHA/tree, runtime/toolchain, positive and negative checks and execution receipt before claiming support. Host-only tests and empty CI steps do not prove guest execution.
