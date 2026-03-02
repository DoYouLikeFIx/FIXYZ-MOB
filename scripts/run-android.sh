#!/usr/bin/env bash
set -euo pipefail

SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
JAVA_HOME_DEFAULT="$(/usr/libexec/java_home -v 21)"

export ANDROID_SDK_ROOT="$SDK_ROOT"
export ANDROID_HOME="$SDK_ROOT"
export JAVA_HOME="${JAVA_HOME:-$JAVA_HOME_DEFAULT}"
export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$PATH"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Expected at: $ANDROID_SDK_ROOT/platform-tools/adb" >&2
  exit 1
fi

if ! command -v emulator >/dev/null 2>&1; then
  echo "emulator not found. Expected at: $ANDROID_SDK_ROOT/emulator/emulator" >&2
  exit 1
fi

adb start-server >/dev/null

find_emulator_serial() {
  adb devices | awk 'NR > 1 && $1 ~ /^emulator-/ { print $1; exit }'
}

find_online_emulator_serial() {
  adb devices | awk 'NR > 1 && $1 ~ /^emulator-/ && $2 == "device" { print $1; exit }'
}

emulator_serial="$(find_online_emulator_serial || true)"

if [ -z "$emulator_serial" ]; then
  if ! pgrep -f "qemu-system.*-avd" >/dev/null 2>&1; then
    avd_name="${ANDROID_AVD:-$(emulator -list-avds | head -n 1)}"

    if [ -z "$avd_name" ]; then
      echo "No Android AVD found. Create one in Android Studio Device Manager." >&2
      exit 1
    fi

    echo "Launching emulator: $avd_name"
    nohup emulator -avd "$avd_name" >/tmp/fixyz-android-emulator.log 2>&1 &
  fi
fi

for _ in $(seq 1 90); do
  emulator_serial="$(find_emulator_serial || true)"
  if [ -n "$emulator_serial" ]; then
    break
  fi
  sleep 2
done

if [ -z "${emulator_serial:-}" ]; then
  echo "Emulator did not appear in adb devices within timeout." >&2
  echo "Check logs: /tmp/fixyz-android-emulator.log" >&2
  exit 1
fi

echo "Waiting for emulator device: $emulator_serial"
for _ in $(seq 1 120); do
  device_state="$(adb devices | awk -v serial="$emulator_serial" '$1 == serial { print $2 }')"
  if [ "$device_state" = "device" ]; then
    break
  fi
  sleep 2
done

device_state="$(adb devices | awk -v serial="$emulator_serial" '$1 == serial { print $2 }')"
if [ "$device_state" != "device" ]; then
  echo "Emulator did not reach online device state in time." >&2
  echo "Check logs: /tmp/fixyz-android-emulator.log" >&2
  exit 1
fi

for _ in $(seq 1 150); do
  boot_completed="$(
    (adb -s "$emulator_serial" shell getprop sys.boot_completed 2>/dev/null || true) | tr -d '\r'
  )"
  if [ "$boot_completed" = "1" ]; then
    break
  fi
  sleep 2
done

boot_completed="$(
  (adb -s "$emulator_serial" shell getprop sys.boot_completed 2>/dev/null || true) | tr -d '\r'
)"

if [ "$boot_completed" != "1" ]; then
  echo "Emulator boot did not complete in time." >&2
  echo "Check logs: /tmp/fixyz-android-emulator.log" >&2
  exit 1
fi

exec react-native run-android --port 8088 --device "$emulator_serial"
