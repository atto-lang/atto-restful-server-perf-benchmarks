# Current Spin vs Go, Java, Node.js and Rust

Run the same sequential loopback harness on one host, using Node core HTTP,
Go/Gin, Java/Vert.x, Rust/Axum, and the current pinned Spin shared and isolated
pooled JVM variants. Both Java/Vert.x and Spin use JDK 25. Each server must pass
all 36 HTTP conformance checks before timing; current Spin must additionally
prove per-route worker reuse. All six targets must produce six valid smoke
trials (36 total). No reference-only fallback is accepted by this workflow.

The earlier historical and paired lifecycle profiles remain unchanged. The
comparison is explicitly selected to avoid silently swapping historical pins.
These are 1s warmup / 2s timed diagnostic measurements with 1 and 8 clients,
not sustained or ranking-grade results. Client and server share a runner;
JIT warmup, CPU placement, order effects and memory/CPU sampling remain open.
GraalVM optimizing JIT, Native Image and LLVM AOT require separate verified
execution profiles; this workflow does not claim any of them.
