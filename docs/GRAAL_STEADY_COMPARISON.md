# GraalVM steady diagnostic

This follow-up deliberately uses the pinned compiler's upstream GraalVM setup
action, rather than pretending a Temurin JVM provides the optimizing Truffle
runtime. Both Java/Vert.x and Spin run on the same GraalVM 25 JDK and host.
The environment receipt includes java properties; the setup step also records
java and native-image versions. This is a GraalVM JVM measurement, **not proof
of actual guest JIT compilation**. A separate compilation-trace characterization
is needed to prove individual handlers were optimized.

The steady profile is 10 seconds warmup, 10 seconds measurement, two repeats,
8 and 32 clients, keep-alive, 3 endpoints and 6 targets (72 measured rows).
Minimum timed phases total 24 minutes, excluding startup, conformance and builds.
The full legacy profile would take at least 18 hours for six targets, exceeding
ordinary CI job budgets. Smoke and full profiles remain unchanged; runner and
validator now import the same registry and reject unknown/inherited names.
Neither profile is ranking-grade or a native AOT claim. Native Image host AOT
does not compile each Atto guest to application machine code; LLVM guest AOT
and GraalVM host AOT must remain distinct categories.
