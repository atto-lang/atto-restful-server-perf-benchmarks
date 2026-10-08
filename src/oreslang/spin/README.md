# Spin baseline adapter (scaffold)

Upstream implementation: https://github.com/ores-truffle-oreslang/oreslang-spin

Initial upstream commit pinned for integration planning:
`8f29b2f75f13beb3e03357e6b15839129c33d72b`.

The real framework and existing tests belong to the upstream repository; do **not** copy or silently modify Spin and compare the copy to unmodified server implementations. Add a local adapter/start script here that checks out the pinned upstream revision and uses identical routes, byte responses, network configuration, worker settings, connection reuse, and warmup as the other candidates.

Both shared and isolated actor modes should become separate benchmark targets once implemented, with exactly the same handler logic. This folder is *not* yet runnable.
