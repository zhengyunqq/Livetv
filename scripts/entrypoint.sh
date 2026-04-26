#!/bin/sh
set -eu

mkdir -p "${HTTP_ROOT}" "${UPSTREAM_DIR}"

/app/scripts/updater.sh &
updater_pid="$!"

cleanup() {
  kill "${updater_pid}" 2>/dev/null || true
}

trap cleanup INT TERM

cd "${HTTP_ROOT}"
exec python3 /app/scripts/http_server.py
