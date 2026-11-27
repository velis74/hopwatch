#!/usr/bin/env bash
# Starts the development servers: Django on 127.0.0.1:8100, FastAPI on 127.0.0.1:8101 and Vite on
# 127.0.0.1:5180. MOTIS runs separately (motis/README.md). Ctrl+C stops all three.
set -euo pipefail

cd "$(dirname "$0")/.."

pids=()
cleanup() {
  trap - INT TERM EXIT
  kill "${pids[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

uv run python manage.py migrate --no-input
uv run python manage.py runserver 127.0.0.1:8100 &
pids+=($!)
uv run uvicorn hopwatch.api.main:app --host 127.0.0.1 --port 8101 --reload --reload-dir hopwatch &
pids+=($!)
npm run dev &
pids+=($!)

wait -n
