#!/usr/bin/env bash
# Stops everything scripts/dev-up.sh started: the Next.js dev server and the
# local Supabase (Docker) stack. Local Supabase data is preserved (not wiped)
# so your next dev-up.sh picks up where you left off.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="/tmp/personalassistant-dev"
PID_FILE="$RUN_DIR/next-dev.pid"

cd "$PROJECT_ROOT"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    # dev-up.sh starts npm via setsid, so PID is also the process-group id —
    # signal the whole group (negative PID), not just npm's own process,
    # since npm doesn't reliably forward signals to the next/next-server
    # children it spawns and a plain `kill $PID` can leave them orphaned,
    # still holding port 3000.
    echo "==> Stopping Next.js dev server (process group $PID)..."
    kill -TERM "-$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
    for _ in $(seq 1 10); do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.5
    done
    if kill -0 "$PID" 2>/dev/null; then
      echo "    Still running — sending SIGKILL to the process group."
      kill -9 "-$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null || true
    fi
  else
    echo "==> No running Next.js dev server for the recorded PID ($PID) — already stopped."
  fi
  rm -f "$PID_FILE"
else
  echo "==> No PID file found ($PID_FILE) — dev-up.sh's Next.js server isn't tracked as running."
fi

echo
echo "==> Stopping local Supabase stack..."
npx supabase stop

echo
echo "Done. (Supabase data volume was kept — pass --no-backup to 'supabase stop' yourself if you actually want to wipe it.)"
