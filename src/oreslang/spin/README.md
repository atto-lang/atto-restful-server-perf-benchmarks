# Oreslang Spin server implementation

This is a benchmark **adapter**, not a fork of Spin. Its source is staged into the pinned [oreslang-spin](https://github.com/ores-truffle-oreslang/oreslang-spin) checkout only for execution, then removed.

* `server_shared.ores`: dispatch one shared actor per request.
* `server_isolated.ores`: dispatch one isolated actor per request.
* Both contain byte-for-byte equivalent handler logic aside from the actor declaration. The echo path buffers bounded chunks up to 1 MiB and explicitly returns HTTP 413 when the body exceeds the benchmark limit; the underlying transport has a 2 MiB guardrail so the actor can produce the required error header. Both variants expose `GET /health`, `GET /plaintext`, `GET /json`, and `POST /echo`.

## Requirements and run commands

Obtain local clones of **private** `oreslang-spin` and `oreslang-source.java` (and initialize Spin's `dependencies/http-routing` submodule). Check out the exact upstream Spin SHA `8f29b2f75f13beb3e03357e6b15839129c33d72b` and the compiler SHA recorded in its `SOURCE_REF`. Build that compiler with JDK 25/Maven per upstream README.

From the **benchmark repo root**, for shared mode:

```bash
export ORESLANG_SPIN_DIR=/path/to/oreslang-spin
export ORESLANG_SOURCE_DIR=/path/to/oreslang-source.java
bash src/oreslang/spin/run.sh shared
```

For isolated mode, replace `shared` with `isolated`. Server binds localhost port 8080, no TLS. Current pinned Spin implementation has no demonstrated environment-based PORT API here, so the adapter **rejects non-default HOST/PORT** rather than pretending to support them. Separate conformance can be run against that port:

```bash
python3 scripts/conformance.py --port 8080
```

Run the command from the benchmark repo root. No automated cross-repository CI checkout is configured: `GITHUB_TOKEN` in this private repo cannot authenticate access to private sibling repositories automatically, and credentials must not be baked into this repository.

Both actor modes passed 36/36 real HTTP contract checks against the compiler pinned by Spin's SOURCE_REF. The private CI mirror verified all 95 relevant original Git blob SHAs across the compiler, Spin, and HTTP-routing repositories. See [verification evidence](../../../docs/VERIFICATION.md). Existing Spin local timing numbers remain unsuitable as cross-framework rankings.
