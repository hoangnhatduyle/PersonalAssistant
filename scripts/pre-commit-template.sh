#!/bin/sh
# Harness gate — see scripts/harness-gate.js for what this checks and why.
# Installed by scripts/install-git-hooks.sh; not tracked by git (hooks never are),
# so re-run that script after a fresh clone or if this file goes missing.
node "$(git rev-parse --show-toplevel)/scripts/harness-gate.js"
