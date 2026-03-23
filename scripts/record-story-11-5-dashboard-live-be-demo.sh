#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/_bmad-output/implementation-artifacts/media}"
OUTPUT_BASENAME="${MOB_ORDER_DEMO_OUTPUT_BASENAME:-11-5-mob-dashboard-chart-live-be-flow}"
OUTPUT_PATH="$OUTPUT_DIR/${OUTPUT_BASENAME}.mp4"
POSTER_PATH="$OUTPUT_DIR/${OUTPUT_BASENAME}-poster.png"
TMP_MOV="/tmp/${OUTPUT_BASENAME}.mov"
BOOTSTRAP_ENV="/tmp/${OUTPUT_BASENAME}-bootstrap.env"
METRO_PORT="${MOB_METRO_PORT:-8088}"
LIVE_API_BASE_URL="${LIVE_API_BASE_URL:-http://127.0.0.1:8080}"
LIVE_EMAIL="${LIVE_EMAIL:-}"
LIVE_NAME="${LIVE_NAME:-}"
LIVE_PASSWORD="${LIVE_PASSWORD:-LiveMob115!}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR:-iPhone 17}"
APP_ID="org.reactjs.native.example.FIXYZMob"
FLOW_LOGIN_PATH="${MOB_LIVE_FLOW_LOGIN_PATH:-$ROOT_DIR/e2e/maestro/auth-live/10-story-11-5-dashboard-chart-live-be.yaml}"
FLOW_DASHBOARD_PATH="${MOB_LIVE_FLOW_DASHBOARD_PATH:-$ROOT_DIR/e2e/maestro/auth-live/11-story-11-5-dashboard-chart-live-be-dashboard.yaml}"
METRO_LOG="/tmp/${OUTPUT_BASENAME}-metro.log"
RECORDER_LOG="/tmp/${OUTPUT_BASENAME}-record.log"
FFMPEG_LOG="/tmp/${OUTPUT_BASENAME}-ffmpeg.log"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

metro_pid=""
started_metro=0
recorder_pid=""
SIMULATOR_UDID=""

cleanup() {
  if [[ -n "$recorder_pid" ]] && kill -0 "$recorder_pid" >/dev/null 2>&1; then
    kill -INT "$recorder_pid" >/dev/null 2>&1 || true
    wait "$recorder_pid" >/dev/null 2>&1 || true
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

require_cmd curl
require_cmd ffmpeg
require_cmd maestro
require_cmd nc
require_cmd npx
require_cmd node
require_cmd xcrun

mkdir -p "$OUTPUT_DIR"
rm -f "$TMP_MOV" "$OUTPUT_PATH" "$POSTER_PATH" "$BOOTSTRAP_ENV"
SIMULATOR_UDID="$(resolve_simulator_udid "$IOS_SIMULATOR_NAME")"

if [[ -z "$LIVE_EMAIL" ]]; then
  node "$REPO_ROOT/scripts/story-11-5-live-dashboard-account.mjs" \
    --format=env \
    --base-url="$LIVE_API_BASE_URL" \
    --password="$LIVE_PASSWORD" \
    --email-prefix=story11_5_mob_video \
    --name-prefix="Story 11.5 Mobile" >"$BOOTSTRAP_ENV"
  # shellcheck disable=SC1090
  source "$BOOTSTRAP_ENV"
fi

export LIVE_API_BASE_URL
export LIVE_EMAIL
export LIVE_NAME
export LIVE_PASSWORD
export LIVE_TOTP_KEY

if ! nc -z 127.0.0.1 "$METRO_PORT" >/dev/null 2>&1; then
  pushd "$ROOT_DIR" >/dev/null
  nohup ./node_modules/.bin/react-native start --port "$METRO_PORT" >"$METRO_LOG" 2>&1 &
  metro_pid="$!"
  disown "$metro_pid" 2>/dev/null || true
  popd >/dev/null
  started_metro=1
  wait_for_tcp_port "$METRO_PORT"
fi

wait_for_healthcheck "${LIVE_API_BASE_URL/http:\/\/localhost/http:\/\/127.0.0.1}/actuator/health"

pushd "$ROOT_DIR" >/dev/null
npx react-native run-ios --port "$METRO_PORT" --simulator "$IOS_SIMULATOR_NAME" --no-packager
popd >/dev/null

DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl launch --terminate-running-process "$SIMULATOR_UDID" "$APP_ID" \
  -mobApiBaseUrl "$LIVE_API_BASE_URL" \
  -mobDisableAnimations true >/dev/null

DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl io "$SIMULATOR_UDID" recordVideo --force --codec=h264 "$TMP_MOV" >"$RECORDER_LOG" 2>&1 &
recorder_pid="$!"
sleep 1

pushd "$ROOT_DIR" >/dev/null
maestro test \
  --udid "$SIMULATOR_UDID" \
  -e LIVE_API_BASE_URL="$LIVE_API_BASE_URL" \
  -e LIVE_EMAIL="$LIVE_EMAIL" \
  -e LIVE_NAME="$LIVE_NAME" \
  -e LIVE_PASSWORD="$LIVE_PASSWORD" \
  "$FLOW_LOGIN_PATH"
if [[ -n "${LIVE_TOTP_KEY:-}" ]]; then
  LIVE_OTP_CODE="$(
    STORY_11_5_HELPER_PATH="$REPO_ROOT/scripts/story-11-5-live-dashboard-account.mjs" \
    node --input-type=module <<'NODE'
import { pathToFileURL } from 'node:url';

const helperModuleUrl = pathToFileURL(process.env.STORY_11_5_HELPER_PATH).href;
const { generateStableTotp } = await import(helperModuleUrl);

const code = await generateStableTotp(process.env.LIVE_TOTP_KEY ?? '', 22_000);
process.stdout.write(code);
NODE
  )"
  export LIVE_OTP_CODE
fi
maestro test \
  --udid "$SIMULATOR_UDID" \
  -e LIVE_OTP_CODE="${LIVE_OTP_CODE:-}" \
  "$FLOW_DASHBOARD_PATH"
popd >/dev/null

if [[ -n "$recorder_pid" ]] && kill -0 "$recorder_pid" >/dev/null 2>&1; then
  kill -INT "$recorder_pid" >/dev/null 2>&1 || true
  wait "$recorder_pid" >/dev/null 2>&1 || true
  recorder_pid=""
fi

ffmpeg -y -i "$TMP_MOV" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUTPUT_PATH" >"$FFMPEG_LOG" 2>&1
ffmpeg -y -ss 00:00:12 -i "$OUTPUT_PATH" -frames:v 1 "$POSTER_PATH" >/dev/null 2>&1 || true

echo "$OUTPUT_PATH"
