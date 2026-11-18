# Oreslang RESTful server performance benchmarks

## AttoLang migration and current specification (2026-11-18)

**AttoLang** is the current language name, formerly **Oreslang**. This `ores-truffle-oreslang/oreslang-restful-server-perf-benchmarks` checkout retains its historical name and documentation. The AttoLang-named destination for new related work is **[atto-lang/atto-restful-server-perf-benchmarks](https://github.com/atto-lang/atto-restful-server-perf-benchmarks)**. These are distinct GitHub repositories unless an exact verified migration establishes otherwise; do not assume identical code, issues, PRs, releases or test status.

**[atto-spec](https://github.com/atto-lang/atto-spec)** is the canonical normative language specification; old Oreslang-named specifications and examples are historical, not an independent authority. Use [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance) for portable executable conformance, [atto-common-source](https://github.com/atto-lang/atto-common-source) for portable `.atto` libraries, and backend-specific `atto-source.*` for compiler/runtime implementations. The design direction includes `snake_case` methods, `borrow!`/`take!`/`share!`/`copy!`/`copy!!`, [implicit borrowing](https://github.com/atto-lang/atto-spec/blob/main/language/implicit-argument-borrow-v1.md), [file/module constants with one-time nonthrowing environment reads](https://github.com/atto-lang/atto-spec/blob/main/language/file-module-const-v1.md) and the [bitwise/stream operator proposal](https://github.com/atto-lang/atto-spec/blob/main/language/bitwise-and-stream-operators-v1.md). **These are targets, not proof that this checkout executes them.**

Existing `.ores`, `oreslang-*` tool commands, package/ABI names and fixture syntax below document legacy compatibility; only replace them after real target-specific compiler/runtime tests. Avoid Python tooling/tests in AttoLang projects; prefer Rust for supporting tooling. For backend feature claims, require exact source SHA/tree, target/toolchain, actual positive and negative guest execution, and explicit passed/failed/unsupported/not-executed status. Host-only and zero-step CI runs do not establish parity.

Reproducible HTTP-server comparisons of [Oreslang Spin](https://github.com/ores-truffle-oreslang/oreslang-spin) against JavaScript, JVM, Go, Rust, and BEAM frameworks.

**Status:** First-wave targets verified (six non-Spin servers plus Spin shared/isolated modes). Seven more framework adapters now have runnable source and CI jobs, but have not passed independent live conformance. No performance rankings have been published.

## Implementations

| Ecosystem | Frameworks / runtimes |
| --- | --- |
| JavaScript | `src/js/nodejs`, `src/js/bun`, `src/js/deno` |
| Java | `src/java/vertx`, `src/java/springboot` |
| Go | `src/golang/gin`, `src/golang/mux` |
| Scala | `src/scala/akka` |
| Erlang / BEAM | `src/erlang/otp`, `src/erlang/phoenix` |
| Rust | `src/rust/axum`, `src/rust/actix`, `src/rust/ractor` |
| Oreslang baseline | `src/oreslang/spin` (reference adapter; upstream implementation lives in oreslang-spin) |

Phoenix is an **Elixir** web framework running on the Erlang VM (BEAM). It is grouped under `erlang/` as requested, not presented as an Erlang-native framework. Ractor is an actor framework; its eventual HTTP integration must be named and disclosed to avoid confusing a framework-versus-server comparison.

All fourteen targets now have source implementations or reference adapters. An `implemented` label is **not** a passing conformance result. Historic `.gitkeep` placeholders are harmless in populated directories.

## Common contract

All candidates must implement the *same behavior* before results are published:

| Endpoint | Expected response |
| --- | --- |
| `GET /health` | HTTP 200, UTF-8 JSON body `{"status":"ok"}` |
| `GET /plaintext` | HTTP 200, UTF-8 text body `hello, world!` |
| `GET /json` | HTTP 200, UTF-8 JSON body `{"message":"hello, world!"}` |
| `POST /echo` | HTTP 200, byte-for-byte copy of the supplied request body; binary payloads supported |

The implementation must bind to a configurable local port and expose clearly documented startup and shutdown commands. Do not add caches, middleware, work, or headers to one implementation that are absent from the equivalent comparison unless a separate experiment specifically measures their impact. Include a fixed-size request-body case and an empty-body case.

See [docs/BENCHMARK_PROTOCOL.md](docs/BENCHMARK_PROTOCOL.md) for validity criteria, environment capture, and reporting requirements.

## Benchmark policy

* First test correctness; record failures and error rates, not just successful requests.
* Keep warm-up, measurements, concurrency, connection reuse, payload, and HTTP protocol identical for every server.
* Separate **HTTP/server** overhead from **per-request actor creation** overhead. Spin shared/isolated actor modes are separate rows; do not compare different handler behavior as though identical.
* Pin and report language/runtime/compiler/framework versions and Git commit SHAs. Do not silently upgrade dependencies within a run.
* Report requests/second, p50/p95/p99 latency, error rate, CPU, RSS, and measurement methodology. Prefer multiple independent trials and a distinct load-generator process/host.
* Avoid publishing winner claims until identical workloads have passed the conformance suite and been reproduced.

## Oreslang Spin

Spin source: https://github.com/ores-truffle-oreslang/oreslang-spin

The upstream repo currently provides `scripts/benchmark.py`, `tests/server.ores`, and `docs/BENCHMARK.md`. Its initial localhost test creates a **new HTTP/1.1 connection per request** and measures shared and isolated actor paths that have different handler implementations. That result is *not* directly comparable to a keep-alive benchmark in another language. The adapter under `src/oreslang/spin` now runs the **same contract** (including 413 errors) in shared and isolated modes, with exact pinned upstream sources verified in a private CI mirror.

## Next work

1. Run live conformance and resolve failures for the seven new targets.
2. Pin the new targets' transitive dependencies and capture full reproducibility evidence without regressing first-wave locks.
3. Add a runner that captures hardware/software provenance and repeatable, machine-readable results.
4. Run separate persistent-connection and new-connection HTTP/1.1 suites, then publish validated results with complete raw data.

## Verified first-wave servers

Node.js, Gin, Axum, Vert.x, Akka HTTP, Phoenix, and both Spin actor modes passed all 36 contract checks. CI tests correctness, not performance. See [verified test evidence](docs/VERIFICATION.md).

```bash
python3 scripts/conformance.py -- node src/js/nodejs/server.mjs
(cd src/golang/gin && go mod tidy && go build -o server .)
python3 scripts/conformance.py -- ./src/golang/gin/server
(cd src/rust/axum && cargo build --release)
python3 scripts/conformance.py -- ./src/rust/axum/target/release/oreslang-benchmark-axum
```

Spin requires local private pinned compiler/framework checkouts; see [its adapter README](src/oreslang/spin/README.md).

**Remaining benchmark work:** establish controlled load generation, worker and connection-mode parity, repeated warmups, raw result provenance, and resource profiles. Spin buffers its echo input in bounded chunks, with a different output transport strategy; disclose this when comparing echo results. No throughput rankings have been produced.

## JVM and BEAM benchmark targets

The following source targets are implemented and have their own conformance jobs:

| Framework | Implementation | Build | Run |
| --- | --- | --- | --- |
| Vert.x Web 4.5.34 | `src/java/vertx` | `mvn -B -q -DskipTests package dependency:build-classpath -Dmdep.outputFile=target/classpath.txt` | `bash src/java/vertx/run.sh` |
| Akka HTTP 10.2.10 | `src/scala/akka` | same Maven command from its own directory | `bash src/scala/akka/run.sh` |
| Phoenix 1.8.15 / Bandit 1.12.5 | `src/erlang/phoenix` | `mix deps.get && mix compile` from its own directory | `bash src/erlang/phoenix/run.sh` |

Run the shared `python3 scripts/conformance.py -- bash .../run.sh` command after building. The Akka target deliberately uses the older Apache-2 licensed libraries that resolve from Maven Central; do not label it the current licensed Akka stack. Phoenix is an Elixir implementation on BEAM, not an Erlang-only program. The Mix lockfile and Maven dependency snapshots are checked in and validated in CI.

## Schema-driven conformance

`contracts/conformance/main.tsp` is the TypeSpec HTTP API with four explicit required routes and response status/Content-Type/body declarations. The CI `contracts` job emits OpenAPI and checks that none of the four methods or the expected response contracts were omitted.

`contracts/conformance/cases.json` describes nine cases, including the fallback 404, four byte-exact valid echo payload sizes plus a 413 over-limit case, the 1 MiB boundary, JSON literals, required headers, and status codes. Draft 2020-12 schemas validate this fixture file and the machine-readable test results. Each runnable server executes these fixtures plus keep-alive and 24 concurrent requests (36 total checks).

```bash
(cd contracts/conformance && npm ci --no-audit --no-fund && npm run compile)
python3 -m pip install jsonschema==4.25.1
python3 scripts/check_contracts.py --openapi contracts/conformance/generated/openapi.json
python3 -m unittest discover -s scripts -p 'test_contracts.py' -v
python3 scripts/conformance.py --target js-nodejs -- node src/js/nodejs/server.mjs
```

TypeSpec npm, Rust Cargo, Go modules, and Phoenix Mix now have committed lockfiles. CI uses npm ci, cargo --locked, Go -mod=readonly, and Mix --check-locked plus OpenAPI snapshot comparison. Maven pins direct dependencies and now checks in resolved dependency-tree snapshots. Conformance remains distinct from performance measurement. Conformance is not a performance benchmark.

## Remaining framework implementations (added, unverified)

All seven prior placeholders now contain real servers and have separate conformance CI jobs:

| Target | Dependencies / implementation | Build / run |
| --- | --- | --- |
| Bun | Native `Bun.serve` (no framework) | `bun src/js/bun/server.mjs` |
| Deno | Native `Deno.serve` (no framework) | `deno run --allow-env --allow-net src/js/deno/server.mjs` |
| Spring Boot | 3.5.6 / embedded Tomcat | `(cd src/java/springboot && mvn -B -q -DskipTests package)`; `bash src/java/springboot/run.sh` |
| Gorilla/mux | Go `net/http` + mux 1.8.1 | `(cd src/golang/mux && go build -mod=readonly -o server .)`; `src/golang/mux/server` |
| Erlang/OTP | Cowboy 2.13.0 + Ranch HTTP transport | `(cd src/erlang/otp && rebar3 compile)`; `bash src/erlang/otp/run.sh` |
| Actix Web | Actix Web 4.15.0 | `(cd src/rust/actix && cargo build --release)`; `src/rust/actix/target/release/oreslang-benchmark-actix` |
| Ractor | Ractor 0.16.5 actor + Axum 0.8.9 HTTP transport | `(cd src/rust/ractor && cargo build --release)`; `src/rust/ractor/target/release/oreslang-benchmark-ractor` |

Use `python3 scripts/conformance.py --target TARGET-ID -- COMMAND` from the repository root, or see the specific directory README. These are **not verified until real runnable tests pass**.

Ractor + Axum deliberately routes requests through one persistent actor's mailbox; it measures **actor processing plus Axum transport**, not a standalone Ractor HTTP framework. Erlang/OTP similarly uses Cowboy as its HTTP transport. Neither result should be conflated with a pure HTTP framework result or used to infer actor-per-request overhead.

## Dependency-free Bun/Deno handler unit tests

`node --test scripts/test_native_js.mjs` runs 18 request-handler assertions using Node 22's built-in Request/Response/Web Streams and mocked Bun/Deno server APIs. The checks cover route payloads, binary echo, exact 1 MiB acceptance, 413 overflow, MIME types, Content-Length, and 404 handling. These are **handler tests only**; they never establish actual Bun/Deno runtime compatibility or HTTP/1.1 keep-alive. Live conformance remains required.
