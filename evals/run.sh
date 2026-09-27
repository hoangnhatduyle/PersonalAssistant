#!/usr/bin/env bash
# Runs the live assistant eval.
#
#   bash evals/run.sh
#   EVAL_ONLY=priority-advice,deadline-cancel-series bash evals/run.sh
#   EVAL_REPS=5 bash evals/run.sh
#
# Pins the nvm-managed Node: `process.loadEnvFile` in setup.ts needs Node 20+,
# and vitest 4 will not run on the distro's Node 18.
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_BIN="$HOME/.nvm/versions/node/v24.12.0/bin"
if [ -d "$NODE_BIN" ]; then
  export PATH="$NODE_BIN:$PATH"
fi

exec node ./node_modules/vitest/vitest.mjs run --config evals/vitest.config.ts "$@"
