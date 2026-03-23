#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export MOB_ORDER_DEMO_OUTPUT_BASENAME="${MOB_ORDER_DEMO_OUTPUT_BASENAME:-11-5-mob-market-ticker-runtime-flow}"
export MOB_ORDER_DEMO_FLOW_PATH="${MOB_ORDER_DEMO_FLOW_PATH:-$ROOT_DIR/e2e/maestro/order/27-story-11-5-market-ticker-stale-quote.yaml}"
export MOB_MAESTRO_AUTH_PORT="${MOB_MAESTRO_AUTH_PORT:-18081}"

exec "$ROOT_DIR/scripts/record-order-session-demo.sh" "$@"
