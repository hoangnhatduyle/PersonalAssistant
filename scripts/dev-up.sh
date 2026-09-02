#!/usr/bin/env bash
# Starts everything needed for manual testing:
#   - the local Supabase stack (Postgres + Auth + Storage + Studio, via Docker)
#   - the Next.js dev server (serves both the frontend and the /api/* backend)
#
# Safe to re-run: `supabase start` no-ops if already running, and this script
# refuses to start a second Next.js dev server if one it started is still up.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="/tmp/personalassistant-dev"
PID_FILE="$RUN_DIR/next-dev.pid"
LOG_FILE="$RUN_DIR/next-dev.log"

mkdir -p "$RUN_DIR"
cd "$PROJECT_ROOT"

if [ ! -f .env.local ]; then
  echo "Warning: .env.local not found in $PROJECT_ROOT — voice/knowledge features (Deepgram/ElevenLabs/OpenAI) will fail without it." >&2
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker isn't running. Start Docker Desktop (or your Docker daemon), then re-run this script." >&2
  exit 1
fi

echo "==> Starting local Supabase stack (database + auth + storage)..."
npx supabase start

echo
echo "==> Applying any pending migrations..."
npx supabase migration up --local

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo
  echo "==> Next.js dev server already running (PID $(cat "$PID_FILE")) — leaving it alone."
else
  echo
  echo "==> Starting Next.js dev server (frontend + API routes)..."
  # setsid makes this its own process-group leader (PID == PGID) — `npm run
  # dev` spawns `sh -c "next dev"` which spawns further node/next-server
  # children, and killing just npm's own PID doesn't reliably reach them
  # (npm doesn't always forward signals to its children). dev-down.sh signals
  # the whole group via `kill -TERM -$PGID` instead of chasing descendants.
  setsid nohup npm run dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  disown 2>/dev/null || true

  echo "    Waiting for http://localhost:3000 to respond..."
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -qE "^[23]"; then
      break
    fi
    sleep 1
  done
fi

# supabase status -o json pretty-prints ("KEY": "value", one per line) —
# tolerate the optional whitespace after the colon, and never let a missing
# field (grep finding no match) take the whole script down via pipefail.
extract_json_field() {
  local key="$1"
  echo "$SUPABASE_STATUS" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | cut -d'"' -f4 || true
}

SUPABASE_STATUS="$(npx supabase status -o json 2>/dev/null || true)"
STUDIO_URL="$(extract_json_field STUDIO_URL)"
DB_URL="$(extract_json_field DB_URL)"
MAILPIT_URL="$(extract_json_field MAILPIT_URL)"

echo
echo "================================================================"
echo " Everything is up."
echo "----------------------------------------------------------------"
echo " App (frontend + API):  http://localhost:3000"
echo " Supabase Studio:       ${STUDIO_URL:-http://127.0.0.1:54323}"
echo " Postgres:               ${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54332/postgres}"
echo " Mailpit (auth emails):  ${MAILPIT_URL:-http://127.0.0.1:54324}"
echo " Next.js dev log:        $LOG_FILE"
echo " Next.js dev PID:        $(cat "$PID_FILE" 2>/dev/null || echo unknown)"
echo "================================================================"
echo " Run scripts/dev-down.sh when you're done."
