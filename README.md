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

## Email-first auth contract

- Login uses `email + password`.
- Register uses `email + name + password`.
- The same email is also the password-recovery key for Story 1.7.
- The login screen now includes inline recovery guidance so the user can verify which email will be used before submitting a reset request.

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
- Order boundary command: `npm run e2e:maestro:order`
- Tooling:
  - Maestro CLI in `$HOME/.maestro/bin`
  - Xcode app installed at `/Applications/Xcode.app`
  - iOS simulator available (default: `iPhone 17`)
- What the command does:
  1. starts Metro on `8088` if it is not already running
  2. starts a local mock auth server on `127.0.0.1:18080`
  3. builds/launches the iOS simulator app
  4. runs the Maestro flows in `e2e/maestro/auth` or `e2e/maestro/order`

The app reads Maestro launch arguments through `react-native-launch-arguments`, so the suite can point the auth runtime at the mock server without needing port `8080` to be free.

The login form also supports keyboard `Enter` submission, which the Maestro flows use to avoid brittle button taps while the iOS password manager is presenting or dismissing system UI.

The mock auth server validates the CSRF cookie/header contract and drives Story 1.4 scenarios by credential:

- `demo@fix.com` -> successful login
- fresh register emails such as `new-success@fix.com` -> successful register + follow-up login
- `taken-user@fix.com` -> duplicate email error on register
- `locked@fix.com` -> `AUTH-002` account locked
- `rate@fix.com` -> `RATE-001` rate limited
- `unknown@fix.com` -> unknown-code fallback with `문의 코드: corr-auth-999`
- `reauth@fix.com` -> successful login, then deterministic re-auth on protected refresh
- `stale@fix.com` -> successful login, then stale-session rejection on app resume
- `kickout@fix.com` -> successful login, then forced re-auth after server-side invalidation by a newer login
- `pending-order@fix.com` -> successful login, then `/api/v1/orders` returns `FEP-002` pending-confirmation guidance
- `unknown-order@fix.com` -> successful login, then `/api/v1/orders` returns safe unknown external fallback guidance
- `no-account@fix.com` -> successful login without a linked order account, so the order boundary stays gated

### Story 3.6 order flows

The order-boundary Maestro suite lives in `e2e/maestro/order`.

- `01-order-success.yaml` -> successful order submission shows inline received feedback
- `02-order-fep-pending.yaml` -> `FEP-002` shows wait-for-update guidance and support reference
- `03-order-unknown-fallback.yaml` -> unknown external state shows safe fallback guidance and support reference
- `04-order-unavailable-without-account.yaml` -> authenticated user without a linked order account sees the gated order boundary instead of submit controls

### Story 1.6 film flows

The raw-film capture set for Story 1.6 uses `e2e/maestro/auth-film` against the same mock server credentials above so FE and MOB can demonstrate the same semantics with different UIs.

### Live Backend Auth Flows

Real backend verification flows live in `e2e/maestro/auth-live`.

- Register against a live backend:
  - `export PATH="$PATH:$HOME/.maestro/bin"`
  - `maestro test --udid <SIMULATOR_UDID> -e LIVE_API_BASE_URL=http://localhost:18080 -e LIVE_EMAIL=<unique_email> -e LIVE_NAME='<display_name>' -e LIVE_PASSWORD=<password> e2e/maestro/auth-live/01-register-success-live-be.yaml`
- Login against the same live backend account:
  - `maestro test --udid <SIMULATOR_UDID> -e LIVE_API_BASE_URL=http://localhost:18080 -e LIVE_EMAIL=<registered_email> -e LIVE_PASSWORD=<same_password> -e LIVE_NAME='<same_display_name>' e2e/maestro/auth-live/02-login-success-live-be.yaml`
- Invalid-credentials check against the live backend:
  - `maestro test --udid <SIMULATOR_UDID> -e LIVE_API_BASE_URL=http://localhost:18080 -e LIVE_EMAIL=<registered_email> -e LIVE_INVALID_PASSWORD=<wrong_password> e2e/maestro/auth-live/03-login-invalid-credentials-live-be.yaml`

Run the live flows individually. `01-register-success-live-be.yaml` should run before `02-login-success-live-be.yaml` when you are validating a freshly created account, while `03-login-invalid-credentials-live-be.yaml` can run independently against any existing account email.
