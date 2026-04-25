#!/bin/sh
set -eu

STATE_FILE="/data/last_processed_commit"

sync_repo() {
  if [ ! -d "${UPSTREAM_DIR}/.git" ]; then
    rm -rf "${UPSTREAM_DIR}"
    git clone --branch "${REPO_BRANCH}" --single-branch "${REPO_URL}" "${UPSTREAM_DIR}"
    return
  fi

  git -C "${UPSTREAM_DIR}" fetch --depth 1 origin "${REPO_BRANCH}"
  git -C "${UPSTREAM_DIR}" checkout -f "${REPO_BRANCH}"
  git -C "${UPSTREAM_DIR}" reset --hard "origin/${REPO_BRANCH}"
}

process_repo() {
  python3 /app/scripts/process_playlists.py \
    --source "${UPSTREAM_DIR}" \
    --output "${HTTP_ROOT}" \
    --stream-proxy-prefix "${STREAM_PROXY_PREFIX}" \
    --rtsp-proxy-prefix "${RTSP_PROXY_PREFIX}"
}

current_commit() {
  git -C "${UPSTREAM_DIR}" rev-parse HEAD
}

run_once() {
  echo "[updater] syncing ${REPO_URL}@${REPO_BRANCH}"
  sync_repo
  new_commit="$(current_commit)"
  last_commit=""

  if [ -f "${STATE_FILE}" ]; then
    last_commit="$(cat "${STATE_FILE}")"
  fi

  if [ ! -f "${HTTP_ROOT}/index.json" ] || [ "${new_commit}" != "${last_commit}" ]; then
    process_repo
    printf '%s\n' "${new_commit}" > "${STATE_FILE}"
    echo "[updater] playlists refreshed at $(date '+%Y-%m-%d %H:%M:%S %Z') commit=${new_commit}"
  else
    echo "[updater] no upstream changes detected commit=${new_commit}"
  fi
}

if ! run_once; then
  echo "[updater] initial sync failed; http server will stay up and retry later"
fi

while true; do
  sleep "${UPDATE_INTERVAL_SECONDS}"
  if ! run_once; then
    echo "[updater] sync failed; retrying after ${UPDATE_INTERVAL_SECONDS}s"
  fi
done
