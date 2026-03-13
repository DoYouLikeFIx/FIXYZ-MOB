#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/_bmad-output/implementation-artifacts/demos}"
OUTPUT_PATH="$OUTPUT_DIR/mob-password-recovery-redirect-demo.mp4"
TMP_MOV="/tmp/fixyz-mob-password-recovery-redirect-demo.mov"
TMP_CLIP_DIR="/tmp/fixyz-mob-password-recovery-redirect-clips"
TMP_CLIP_ONE="$TMP_CLIP_DIR/clip-01.mov"
TMP_CLIP_TWO="$TMP_CLIP_DIR/clip-02.mov"
TMP_CONCAT_LIST="$TMP_CLIP_DIR/concat.txt"
METRO_PORT="${MOB_METRO_PORT:-8088}"
API_PORT="${MOB_MAESTRO_AUTH_PORT:-18080}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR:-iPhone 17}"
APP_ID="org.reactjs.native.example.FIXYZMob"
FLOW_PRE_RESET="$ROOT_DIR/e2e/maestro/auth-film/08-password-recovery-challenge.yaml"
FLOW_POST_RESET="$ROOT_DIR/e2e/maestro/auth-film/09-password-reset-login-mfa.yaml"
DEEPLINK_URL="${MOB_DEMO_DEEPLINK_URL:-fixyz://reset-password?token=valid-reset-token}"
METRO_LOG="/tmp/fixyz-mob-password-recovery-redirect-metro.log"
SERVER_LOG="/tmp/fixyz-mob-password-recovery-redirect-auth-server.log"
RECORDER_LOG="/tmp/fixyz-mob-password-recovery-redirect-record.log"
FFMPEG_LOG="/tmp/fixyz-mob-password-recovery-redirect-ffmpeg.log"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

metro_pid=""
server_pid=""
recorder_pid=""
started_metro=0
started_server=0
SIMULATOR_UDID=""

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

resolve_simulator_udid() {
  local simulator_name="$1"
  local udid

  udid="$(
    DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl list devices available \
      | awk -v target="$simulator_name" '
        $0 ~ target " \\(" && $0 !~ /unavailable/ {
          if (match($0, /\(([A-F0-9-]{36})\)/)) {
            print substr($0, RSTART + 1, RLENGTH - 2);
            exit;
          }
        }
      '
  )"

  if [[ -z "$udid" ]]; then
    echo "Unable to resolve simulator UDID for: $simulator_name" >&2
    exit 1
  fi

  printf '%s\n' "$udid"
}

start_recording() {
  local target_path="$1"

  DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl io "$SIMULATOR_UDID" recordVideo --force --codec=h264 "$target_path" >"$RECORDER_LOG" 2>&1 &
  recorder_pid="$!"
  sleep 1
}

stop_recording() {
  if [[ -z "$recorder_pid" ]] || ! kill -0 "$recorder_pid" >/dev/null 2>&1; then
    recorder_pid=""
    return 0
  fi

  kill -INT "$recorder_pid" >/dev/null 2>&1 || true
  wait "$recorder_pid" >/dev/null 2>&1 || true
  recorder_pid=""
}

require_cmd curl
require_cmd ffmpeg
require_cmd lsof
require_cmd maestro
require_cmd nc
require_cmd xcrun

mkdir -p "$OUTPUT_DIR"
rm -rf "$TMP_CLIP_DIR"
mkdir -p "$TMP_CLIP_DIR"
rm -f "$TMP_MOV" "$OUTPUT_PATH" "$TMP_CLIP_ONE" "$TMP_CLIP_TWO" "$TMP_CONCAT_LIST"
SIMULATOR_UDID="$(resolve_simulator_udid "$IOS_SIMULATOR_NAME")"

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

DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl terminate "$SIMULATOR_UDID" "$APP_ID" >/dev/null 2>&1 || true

pushd "$ROOT_DIR" >/dev/null
start_recording "$TMP_CLIP_ONE"
maestro test --udid "$SIMULATOR_UDID" "$FLOW_PRE_RESET"
stop_recording

start_recording "$TMP_CLIP_TWO"
DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl openurl "$SIMULATOR_UDID" "$DEEPLINK_URL"
sleep 1
maestro test --udid "$SIMULATOR_UDID" "$FLOW_POST_RESET"
stop_recording
popd >/dev/null

cat >"$TMP_CONCAT_LIST" <<EOF
file '$TMP_CLIP_ONE'
file '$TMP_CLIP_TWO'
EOF

ffmpeg -y \
  -f concat \
  -safe 0 \
  -i "$TMP_CONCAT_LIST" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUTPUT_PATH" >"$FFMPEG_LOG" 2>&1

echo "$OUTPUT_PATH"
