# Erlang/OTP HTTP benchmark (Cowboy adapter)

Native Erlang/OTP handler served through Cowboy 2.13.0 / Ranch: Cowboy is disclosed because OTP itself does not ship a modern comparable HTTP server.

Build: `cd src/erlang/otp && rebar3 compile`.
Run from the repository root: `bash src/erlang/otp/run.sh`.
Verify: `python3 scripts/conformance.py --target erlang-otp -- bash src/erlang/otp/run.sh`.

The four handlers send fixed responses or buffer binary echo bodies up to 1 MiB. No per-request actor spawning is introduced by application code; Cowboy handles requests with BEAM processes. Keep this result labelled *OTP + Cowboy* when comparing to Phoenix (Elixir/BEAM + Bandit).

Cowboy is fetched from the upstream **2.13.0 release commit** `24d32de931a0c985ff7939077463fc8be939f0e9` instead of the Hex release, because the Hex package's cowlib dependency-range syntax is not accepted by rebar3 3.25.1. The released Git source directly pins cowlib 2.14.0 and Ranch 1.8.1 through its rebar.config. Commit the resulting rebar.lock after successful CI resolution.
