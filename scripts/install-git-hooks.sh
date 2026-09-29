#!/bin/sh
# Installs the harness pre-commit gate (scripts/harness-gate.js) into .git/hooks.
# Git hooks live outside version control, so this needs re-running after a
# fresh clone. Wired as the npm "prepare" script so `npm install` does it
# automatically.
set -e
ROOT="$(git rev-parse --show-toplevel)"
cp "$ROOT/scripts/pre-commit-template.sh" "$ROOT/.git/hooks/pre-commit"
chmod +x "$ROOT/.git/hooks/pre-commit"
echo "[install-git-hooks] pre-commit gate installed."
