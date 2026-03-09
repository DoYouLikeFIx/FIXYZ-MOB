#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR:-iPhone 17}"
METRO_PORT="${MOB_METRO_PORT:-8088}"
API_PORT="${MOB_MAESTRO_AUTH_PORT:-18080}"
APP_ID="org.reactjs.native.example.FIXYZMob"
FLOW_TARGET="${1:-./e2e/maestro/auth}"
METRO_LOG="/tmp/fixyz-mob-maestro-metro.log"
SERVER_LOG="/tmp/fixyz-mob-maestro-auth-server.log"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

metro_pid=""
server_pid=""
started_metro=0

cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" >/dev/null 2>&1; then
    kill "$server_pid" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi

  if [[ "$started_metro" -eq 1 ]] && [[ -n "$metro_pid" ]] && kill -0 "$metro_pid" >/dev/null 2>&1; then
    kill "$metro_pid" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$metro_pid" >/dev/null 2>&1 || true
    wait "$metro_pid" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

wait_for_tcp_port() {
  local port="$1"

  for _ in $(seq 1 90); do
    if nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for localhost:$port" >&2
  exit 1
}

wait_for_healthcheck() {
  local url="$1"

  for _ in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $url" >&2
  exit 1
}

require_cmd curl
require_cmd maestro
require_cmd nc
require_cmd xcrun

if [[ ! -d "$DEVELOPER_DIR" ]]; then
  echo "Xcode developer directory not found at $DEVELOPER_DIR" >&2
  exit 1
fi

if ! nc -z 127.0.0.1 "$METRO_PORT" >/dev/null 2>&1; then
  pushd "$ROOT_DIR" >/dev/null
  nohup ./node_modules/.bin/react-native start --port "$METRO_PORT" >"$METRO_LOG" 2>&1 &
  metro_pid="$!"
  started_metro=1
  popd >/dev/null

  wait_for_tcp_port "$METRO_PORT"
fi

pushd "$ROOT_DIR" >/dev/null
nohup node ./scripts/mock-auth-server.mjs --port "$API_PORT" >"$SERVER_LOG" 2>&1 &
server_pid="$!"
popd >/dev/null

wait_for_tcp_port "$API_PORT"
wait_for_healthcheck "http://127.0.0.1:${API_PORT}/__health"

pushd "$ROOT_DIR" >/dev/null
npx react-native run-ios --port "$METRO_PORT" --simulator "$IOS_SIMULATOR_NAME" --no-packager
maestro test "$FLOW_TARGET"
popd >/dev/null

echo "Maestro auth suite passed for ${APP_ID} on ${IOS_SIMULATOR_NAME}."
