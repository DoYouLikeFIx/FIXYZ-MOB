#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/_bmad-output/implementation-artifacts/demos}"
OUTPUT_BASENAME="${MOB_ORDER_DEMO_OUTPUT_BASENAME:-mob-order-session-demo}"
OUTPUT_PATH="$OUTPUT_DIR/${OUTPUT_BASENAME}.mp4"
TMP_MOV="/tmp/${OUTPUT_BASENAME}.mov"
METRO_PORT="${MOB_METRO_PORT:-8088}"
API_PORT="${MOB_MAESTRO_AUTH_PORT:-18080}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR:-iPhone 17}"
APP_ID="org.reactjs.native.example.FIXYZMob"
METRO_LOG="/tmp/${OUTPUT_BASENAME}-metro.log"
SERVER_LOG="/tmp/${OUTPUT_BASENAME}-auth-server.log"
RECORDER_LOG="/tmp/${OUTPUT_BASENAME}-record.log"
FFMPEG_LOG="/tmp/${OUTPUT_BASENAME}-ffmpeg.log"
FLOW_PATH="${MOB_ORDER_DEMO_FLOW_PATH:-$ROOT_DIR/e2e/maestro/order/14-order-success-full-flow-swipe-compact.yaml}"
SETUP_FLOW_PATH="${MOB_ORDER_DEMO_SETUP_FLOW_PATH:-}"
MOB_DEMO_EMAIL="${MOB_DEMO_EMAIL:-quote-story@fix.com}"
MOB_DEMO_PASSWORD="${MOB_DEMO_PASSWORD:-Test1234!}"
MOB_DEMO_OTP_CODE="${MOB_DEMO_OTP_CODE:-123456}"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"
export MOB_DEMO_EMAIL
export MOB_DEMO_PASSWORD
export MOB_DEMO_OTP_CODE

metro_pid=""
server_pid=""
recorder_pid=""
started_metro=0
started_server=0
simulator_udid=""

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

kill_processes_on_port() {
  local port="$1"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  for pid in $pids; do
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  done
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
require_cmd lsof
require_cmd maestro
require_cmd nc
require_cmd xcrun

resolve_simulator_udid() {
  local name="$1"

  DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl list devices available \
    | sed -n "s/^[[:space:]]*${name//\//\\/} (\\([^)]*\\)).*/\\1/p" \
    | head -n 1
}

mkdir -p "$OUTPUT_DIR"
rm -f "$TMP_MOV" "$OUTPUT_PATH"

simulator_udid="$(resolve_simulator_udid "$IOS_SIMULATOR_NAME")"
if [[ -z "$simulator_udid" ]]; then
  echo "Unable to resolve simulator UDID for: $IOS_SIMULATOR_NAME" >&2
  exit 1
fi

xcrun simctl shutdown all >/dev/null 2>&1 || true

if ! nc -z 127.0.0.1 "$METRO_PORT" >/dev/null 2>&1; then
  pushd "$ROOT_DIR" >/dev/null
  nohup ./node_modules/.bin/react-native start --port "$METRO_PORT" >"$METRO_LOG" 2>&1 &
  metro_pid="$!"
  disown "$metro_pid" 2>/dev/null || true
  popd >/dev/null
  started_metro=1
  wait_for_tcp_port "$METRO_PORT"
fi

kill_processes_on_port "$API_PORT"
pushd "$ROOT_DIR" >/dev/null
nohup node ./scripts/mock-auth-server.mjs --port "$API_PORT" >"$SERVER_LOG" 2>&1 &
server_pid="$!"
disown "$server_pid" 2>/dev/null || true
popd >/dev/null
started_server=1
wait_for_tcp_port "$API_PORT"
wait_for_healthcheck "http://127.0.0.1:${API_PORT}/__health"

pushd "$ROOT_DIR" >/dev/null
npx react-native run-ios --port "$METRO_PORT" --simulator "$IOS_SIMULATOR_NAME" --no-packager
popd >/dev/null

if [[ -n "$SETUP_FLOW_PATH" ]]; then
  pushd "$ROOT_DIR" >/dev/null
  maestro test --device "$simulator_udid" "$SETUP_FLOW_PATH"
  popd >/dev/null
else
  xcrun simctl launch --terminate-running-process "$simulator_udid" "$APP_ID" \
    -mobApiBaseUrl "http://localhost:${API_PORT}" \
    -mobDisableAnimations true \
    -mobHideDevWarningsOverlay true \
    -mobDemoOrderOtpCode "$MOB_DEMO_OTP_CODE" >/dev/null
fi

xcrun simctl io "$simulator_udid" recordVideo --force --codec=h264 "$TMP_MOV" >"$RECORDER_LOG" 2>&1 &
recorder_pid="$!"
sleep 1

pushd "$ROOT_DIR" >/dev/null
maestro test --device "$simulator_udid" "$FLOW_PATH"
popd >/dev/null

if [[ -n "$recorder_pid" ]] && kill -0 "$recorder_pid" >/dev/null 2>&1; then
  kill -INT "$recorder_pid" >/dev/null 2>&1 || true
  wait "$recorder_pid" >/dev/null 2>&1 || true
  recorder_pid=""
fi

ffmpeg -y -i "$TMP_MOV" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUTPUT_PATH" >"$FFMPEG_LOG" 2>&1

echo "$OUTPUT_PATH"
