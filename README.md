# FIXYZ-MOB

Mobile foundation scaffold for Epic 0 Story 0.4.

## Dev Server Port

- Metro defaults to `8088` (`npm run start`) to avoid collision with backend services mapped to `8081`.
- This does **not** change backend API contract ports; API host matrix remains on `:8080`.
- iOS run uses simulator mode by default via `npm run ios` (default target: `iPhone 17`).
- To use a different simulator: `IOS_SIMULATOR=\"iPhone 17 Pro\" npm run ios`.
- Android run uses `npm run android` and now bootstraps SDK/JDK env automatically.
- Optional Android AVD override: `ANDROID_AVD=\"<Your_AVD_Name>\" npm run android`.

## Host Selection Rule

`MOB_RUNTIME_TARGET` determines API host:

- `android-emulator` -> `http://10.0.2.2:8080`
- `ios-simulator` -> `http://localhost:8080`
- `physical-device` -> `http://<LAN_IP>:8080` (`MOB_LAN_IP` required)

`MOB_API_BASE_URL` overrides all targets for local/dev testing.

`MOB_STRICT_CSRF_BOOTSTRAP` controls startup behavior when `GET /api/v1/auth/csrf` is missing:

- default: non-production builds tolerate `404` and continue bootstrap (with warning log)
- production/default strict mode: bootstrap fails fast
- explicit override: set `true|false`

## Security Contract

- Cookie-session is canonical (`JSESSIONID` managed by transport, never read/persisted by app code).
- CSRF token is read from `XSRF-TOKEN` cookie when available, with fallback to the `GET /api/v1/auth/csrf` response body for backends that use `HttpSessionCsrfTokenRepository`.
- Non-safe methods inject the server-advertised CSRF header name. Default remains `X-XSRF-TOKEN` when the backend does not override it.
- CSRF bootstrap/refresh endpoint: `GET /api/v1/auth/csrf` at app start, login success, and foreground resume.
- Forbidden persistence: password, OTP, raw session cookie, raw CSRF token.
- Conditional secure-storage only: device-bound key material / future bootstrap secret classes.

## CI Quality Gate

Use `npm run ci-mobile` for install-time quality checks:

1. type-check
2. lint
3. unit tests
4. bundle dry-run (simulator launch intentionally skipped)

Manual simulator/device smoke evidence is required in PR for AC1.

## Simulator UI Automation

Story 1.4 now includes Maestro-based iOS simulator coverage for the real mobile UI flow.

- Command: `npm run e2e:maestro:auth`
- Tooling:
  - Maestro CLI in `$HOME/.maestro/bin`
  - Xcode app installed at `/Applications/Xcode.app`
  - iOS simulator available (default: `iPhone 17`)
- What the command does:
  1. starts Metro on `8088` if it is not already running
  2. starts a local mock auth server on `127.0.0.1:18080`
  3. builds/launches the iOS simulator app
  4. runs the Maestro flows in `e2e/maestro/auth`

The app reads Maestro launch arguments through `react-native-launch-arguments`, so the suite can point the auth runtime at the mock server without needing port `8080` to be free.

The login form also supports keyboard `Enter` submission, which the Maestro flows use to avoid brittle button taps while the iOS password manager is presenting or dismissing system UI.

The mock auth server validates the CSRF cookie/header contract and drives Story 1.4 scenarios by credential:

- `demo` -> successful login
- `new_user_success` -> successful register + follow-up login
- `taken_user` -> duplicate username error
- `reauth_refresh` -> successful login, then deterministic re-auth on protected refresh
- `stale_resume` -> successful login, then stale-session rejection on app resume
- `new_login_kickout` -> successful login, then forced re-auth after server-side invalidation by a newer login

### Live Backend Auth Flows

Real backend verification flows live in `e2e/maestro/auth-live`.

- Register against a live backend:
  - `export PATH="$PATH:$HOME/.maestro/bin"`
  - `maestro test --udid <SIMULATOR_UDID> -e LIVE_API_BASE_URL=http://localhost:18080 -e LIVE_USERNAME=<unique_username> -e LIVE_EMAIL=<unique_email> -e LIVE_NAME='<display_name>' -e LIVE_PASSWORD=<password> MOB/e2e/maestro/auth-live/01-register-success-live-be.yaml`
- Login against the same live backend account:
  - `maestro test --udid <SIMULATOR_UDID> -e LIVE_API_BASE_URL=http://localhost:18080 -e LIVE_USERNAME=<same_username> -e LIVE_EMAIL=<same_email> -e LIVE_NAME='<same_display_name>' -e LIVE_PASSWORD=<same_password> MOB/e2e/maestro/auth-live/02-login-success-live-be.yaml`

Run the live flows individually in that order. Passing the whole folder at once does not guarantee register-before-login execution.
