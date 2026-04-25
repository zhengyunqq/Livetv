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
exec python3 -m http.server "${HTTP_PORT}" --bind 0.0.0.0 --directory "${HTTP_ROOT}"
