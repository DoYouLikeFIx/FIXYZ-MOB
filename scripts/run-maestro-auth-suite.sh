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
RENDER_ROOT=""
RESOLVED_FLOW_TARGET=""
FLOW_IS_LIVE=0
DEEPLINK_URL="${MOB_MAESTRO_OPEN_URL:-}"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

metro_pid=""
server_pid=""
started_metro=0
SIMULATOR_UDID=""

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

  if [[ -n "$RENDER_ROOT" ]] && [[ -d "$RENDER_ROOT" ]]; then
    rm -rf "$RENDER_ROOT"
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

launch_app_with_deeplink_args_if_requested() {
  local launch_args=()

  if [[ -z "$DEEPLINK_URL" ]]; then
    return 0
  fi

  if [[ "$FLOW_IS_LIVE" -eq 1 ]]; then
    if [[ -z "${LIVE_API_BASE_URL:-}" ]]; then
      echo "LIVE_API_BASE_URL is required when MOB_MAESTRO_OPEN_URL is used with auth-live flows" >&2
      exit 1
    fi
    launch_args+=(-mobApiBaseUrl "$LIVE_API_BASE_URL")
  elif [[ "$use_mock_auth_server" -eq 1 ]]; then
    launch_args+=(-mobApiBaseUrl "http://localhost:${API_PORT}")
  fi

  launch_args+=(
    -mobDisableAnimations true
    -mobQaPlaintextPasswords true
  )

  DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl terminate "$SIMULATOR_UDID" "$APP_ID" >/dev/null 2>&1 || true
  DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl launch --terminate-running-process "$SIMULATOR_UDID" "$APP_ID" "${launch_args[@]}" >/dev/null
}

open_deeplink_if_requested() {
  if [[ -z "$DEEPLINK_URL" ]]; then
    return 0
  fi

  sleep "${MOB_MAESTRO_DEEPLINK_DELAY_SECONDS:-5}"
  DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl openurl "$SIMULATOR_UDID" "$DEEPLINK_URL"
  sleep 2
}

resolve_flow_target() {
  local target="$1"
  local resolved=""

  if [[ -e "$target" ]]; then
    resolved="$(cd "$(dirname "$target")" && pwd)/$(basename "$target")"
    printf '%s\n' "$resolved"
    return 0
  fi

  if [[ -e "$ROOT_DIR/$target" ]]; then
    resolved="$(cd "$(dirname "$ROOT_DIR/$target")" && pwd)/$(basename "$target")"
    printf '%s\n' "$resolved"
    return 0
  fi

  echo "Flow target not found: $target" >&2
  exit 1
}

collect_template_vars() {
  local target="$1"

  if [[ -d "$target" ]]; then
    rg --no-filename --only-matching '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$target" -g '*.yaml' \
      | sed -E 's/^\$\{|\}$//g' \
      | sort -u
    return 0
  fi

  rg --no-filename --only-matching '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$target" \
    | sed -E 's/^\$\{|\}$//g' \
    | sort -u
}

render_flow_target_if_needed() {
  local source="$1"
  local needs_render=0
  local vars=""
  local rendered_target=""

  if [[ -d "$source" ]]; then
    if rg -q '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$source" -g '*.yaml'; then
      needs_render=1
    fi
  elif rg -q '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$source"; then
    needs_render=1
  fi

  if [[ "$needs_render" -eq 0 ]]; then
    printf '%s\n' "$source"
    return 0
  fi

  vars="$(collect_template_vars "$source")"
  require_cmd envsubst

  while IFS= read -r var_name; do
    [[ -z "$var_name" ]] && continue
    if [[ -z "${!var_name:-}" ]]; then
      echo "Missing required environment variable for Maestro flow rendering: $var_name" >&2
      exit 1
    fi
  done <<<"$vars"

  RENDER_ROOT="$(mktemp -d /tmp/fixyz-maestro-render.XXXXXX)"

  if [[ -d "$source" ]]; then
    rendered_target="$RENDER_ROOT/$(basename "$source")"
    mkdir -p "$rendered_target"
    cp -R "$source"/. "$rendered_target"/

    while IFS= read -r yaml_file; do
      [[ -z "$yaml_file" ]] && continue
      envsubst <"$yaml_file" >"${yaml_file}.tmp"
      mv "${yaml_file}.tmp" "$yaml_file"
    done < <(find "$rendered_target" -type f -name '*.yaml' | sort)

    printf '%s\n' "$rendered_target"
    return 0
  fi

  rendered_target="$RENDER_ROOT/$(basename "$source")"
  envsubst <"$source" >"$rendered_target"
  printf '%s\n' "$rendered_target"
}

require_cmd curl
require_cmd lsof
require_cmd maestro
require_cmd nc
require_cmd rg
require_cmd xcrun

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

if [[ ! -d "$DEVELOPER_DIR" ]]; then
  echo "Xcode developer directory not found at $DEVELOPER_DIR" >&2
  exit 1
fi

RESOLVED_FLOW_TARGET="$(resolve_flow_target "$FLOW_TARGET")"
if [[ "$RESOLVED_FLOW_TARGET" == *"/auth-live"* ]]; then
  FLOW_IS_LIVE=1
fi
RESOLVED_FLOW_TARGET="$(render_flow_target_if_needed "$RESOLVED_FLOW_TARGET")"
SIMULATOR_UDID="$(resolve_simulator_udid "$IOS_SIMULATOR_NAME")"

use_mock_auth_server=1
if [[ "$FLOW_IS_LIVE" -eq 1 ]]; then
  use_mock_auth_server=0
fi

if ! nc -z 127.0.0.1 "$METRO_PORT" >/dev/null 2>&1; then
  pushd "$ROOT_DIR" >/dev/null
  nohup ./node_modules/.bin/react-native start --port "$METRO_PORT" >"$METRO_LOG" 2>&1 &
  metro_pid="$!"
  disown "$metro_pid" 2>/dev/null || true
  started_metro=1
  popd >/dev/null

  wait_for_tcp_port "$METRO_PORT"
fi

if [[ "$use_mock_auth_server" -eq 1 ]]; then
  kill_processes_on_port "$API_PORT"

  pushd "$ROOT_DIR" >/dev/null
  nohup node ./scripts/mock-auth-server.mjs --port "$API_PORT" >"$SERVER_LOG" 2>&1 &
  server_pid="$!"
  disown "$server_pid" 2>/dev/null || true
  popd >/dev/null

  wait_for_tcp_port "$API_PORT"
  wait_for_healthcheck "http://127.0.0.1:${API_PORT}/__health"
fi

pushd "$ROOT_DIR" >/dev/null
npx react-native run-ios --port "$METRO_PORT" --simulator "$IOS_SIMULATOR_NAME" --no-packager
launch_app_with_deeplink_args_if_requested
open_deeplink_if_requested
maestro test --udid "$SIMULATOR_UDID" "$RESOLVED_FLOW_TARGET"
popd >/dev/null

echo "Maestro suite passed for ${FLOW_TARGET} on ${IOS_SIMULATOR_NAME}."
