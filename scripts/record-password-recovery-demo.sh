#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/_bmad-output/implementation-artifacts/demos}"
OUTPUT_PATH="$OUTPUT_DIR/mob-password-recovery-demo.mp4"
TMP_MOV="/tmp/fixyz-mob-password-recovery-demo.mov"
METRO_PORT="${MOB_METRO_PORT:-8088}"
API_PORT="${MOB_MAESTRO_AUTH_PORT:-18080}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR:-iPhone 17}"
APP_ID="org.reactjs.native.example.FIXYZMob"
DEEPLINK_URL="${MOB_DEMO_DEEPLINK_URL:-fixyz://reset-password?token=valid-reset-token}"
DEEPLINK_DELAY_SECONDS="${MOB_DEMO_DEEPLINK_DELAY_SECONDS:-1}"
METRO_LOG="/tmp/fixyz-mob-demo-metro.log"
SERVER_LOG="/tmp/fixyz-mob-demo-auth-server.log"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export PATH="$PATH:$HOME/.maestro/bin"

metro_pid=""
server_pid=""
recorder_pid=""
started_metro=0
started_server=0

cleanup() {
  if [[ -n "$recorder_pid" ]] && kill -0 "$recorder_pid" >/dev/null 2>&1; then
    kill -INT "$recorder_pid" >/dev/null 2>&1 || true
    wait "$recorder_pid" >/dev/null 2>&1 || true
  fi

  if [[ "$started_server" -eq 1 ]] && [[ -n "$server_pid" ]] && kill -0 "$server_pid" >/dev/null 2>&1; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi

  if [[ "$started_metro" -eq 1 ]] && [[ -n "$metro_pid" ]] && kill -0 "$metro_pid" >/dev/null 2>&1; then
    kill "$metro_pid" >/dev/null 2>&1 || true
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
require_cmd ffmpeg
require_cmd maestro
require_cmd nc
require_cmd xcrun

mkdir -p "$OUTPUT_DIR"
rm -f "$TMP_MOV" "$OUTPUT_PATH"

if ! nc -z 127.0.0.1 "$METRO_PORT" >/dev/null 2>&1; then
  pushd "$ROOT_DIR" >/dev/null
  nohup ./node_modules/.bin/react-native start --port "$METRO_PORT" >"$METRO_LOG" 2>&1 &
  metro_pid="$!"
  disown "$metro_pid" 2>/dev/null || true
  popd >/dev/null
  started_metro=1
  wait_for_tcp_port "$METRO_PORT"
fi

if ! nc -z 127.0.0.1 "$API_PORT" >/dev/null 2>&1; then
  pushd "$ROOT_DIR" >/dev/null
  nohup node ./scripts/mock-auth-server.mjs --port "$API_PORT" >"$SERVER_LOG" 2>&1 &
  server_pid="$!"
  disown "$server_pid" 2>/dev/null || true
  popd >/dev/null
  started_server=1
  wait_for_tcp_port "$API_PORT"
  wait_for_healthcheck "http://127.0.0.1:${API_PORT}/__health"
fi

pushd "$ROOT_DIR" >/dev/null
npx react-native run-ios --port "$METRO_PORT" --simulator "$IOS_SIMULATOR_NAME" --no-packager
popd >/dev/null

xcrun simctl launch --terminate-running-process booted "$APP_ID" \
  -mobApiBaseUrl "http://localhost:${API_PORT}" \
  -mobDisableAnimations true \
  -mobQaPlaintextPasswords true >/dev/null

xcrun simctl io booted recordVideo --force --codec=h264 "$TMP_MOV" >/tmp/fixyz-mob-demo-record.log 2>&1 &
recorder_pid="$!"
sleep 1

sleep "$DEEPLINK_DELAY_SECONDS"
xcrun simctl openurl booted "$DEEPLINK_URL"

pushd "$ROOT_DIR" >/dev/null
maestro test "$ROOT_DIR/e2e/maestro/auth/11-password-reset-deeplink-handoff.yaml"
popd >/dev/null

if [[ -n "$recorder_pid" ]] && kill -0 "$recorder_pid" >/dev/null 2>&1; then
  kill -INT "$recorder_pid" >/dev/null 2>&1 || true
  wait "$recorder_pid" >/dev/null 2>&1 || true
  recorder_pid=""
fi

ffmpeg -y -i "$TMP_MOV" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUTPUT_PATH" >/tmp/fixyz-mob-demo-ffmpeg.log 2>&1

echo "$OUTPUT_PATH"
