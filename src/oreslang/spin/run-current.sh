#!/usr/bin/env bash
set -euo pipefail
mode="$1"; lifecycle="$2"
[[ "$mode" == shared || "$mode" == isolated ]]
[[ "$lifecycle" == fresh || "$lifecycle" == pooled ]]
spin="$(cd "$ORESLANG_SPIN_DIR" && pwd -P)"
core="$(cd "$ORESLANG_SOURCE_DIR" && pwd -P)"
here="$(cd "$(dirname "$0")" && pwd -P)"
[[ "$(git -C "$spin" rev-parse HEAD)" == 66662e7b8977283c357bcc7c21601547953baa49 ]]
[[ "$(git -C "$core" rev-parse HEAD)" == e6098659c2e1641564bb5835b4dbb92a6a00b1a8 ]]
[[ "$(git -C "$spin/dependencies/http-routing" rev-parse HEAD)" == 4c28fe37178f52ebe4bd504d608ff42215f1ec48 ]]
bash "$spin/scripts/check-pins.sh"
[[ -s "$core/target/classpath.txt" && ! -L "$core/target/classpath.txt" && -f "$core/target/classes/dev/oreslang/launcher/OresMain.class" && ! -L "$core/target/classes/dev/oreslang/launcher/OresMain.class" && ! -L "$core/target/classes" && ! -L "$core/target" ]]
[[ "${HOST:-127.0.0.1}" == 127.0.0.1 && "${PORT:-8080}" == 8080 ]]
stage="$(node "$here/stage-current.mjs" "$here/server_current.atto" "$spin" "$mode" "$lifecycle")"
cleanup() { rm -f -- "$stage"; rmdir -- "$(dirname "$stage")"; }
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

cd "$spin"
"${ORES_JAVA:-java}" --enable-native-access=ALL-UNNAMED -Dpolyglot.engine.WarnInterpreterOnly=false -cp "$core/target/classes:$(cat "$core/target/classpath.txt")" dev.oreslang.launcher.OresMain --platform=server --allow-net=127.0.0.1:8080 "$stage"
