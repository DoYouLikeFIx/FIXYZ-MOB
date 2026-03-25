# FIXYZ-MOB

Mobile foundation scaffold for Epic 0 Story 0.4.

## Dev Server Port

- Metro defaults to `8088` (`npm run start`) to avoid collision with backend services mapped to `8081`.
- This does **not** change backend API contract ports; API host matrix remains on `:8080`.
- iOS run uses simulator mode by default via `npm run ios` (default target: `iPhone 17`).
- To use a different simulator: `IOS_SIMULATOR=\"iPhone 17 Pro\" npm run ios`.
- Android run uses `npm run android` and now bootstraps SDK/JDK env automatically.
- Optional Android AVD override: `ANDROID_AVD=\"<Your_AVD_Name>\" npm run android`.

## Runtime Modes

`MOB_API_INGRESS_MODE` is the canonical mobile ingress selector:

- `direct` -> keep the existing developer host matrix for simulator/emulator convenience
- `edge` -> require `MOB_EDGE_BASE_URL` and route mobile traffic through the canonical HTTPS edge ingress

When `MOB_API_INGRESS_MODE` is unset, MOB defaults to `direct`.

Launch arguments map to the same contract:

- `mobRuntimeTarget='android-emulator' | 'ios-simulator' | 'physical-device'`
- `mobApiIngressMode='direct' | 'edge'`
- `mobEdgeBaseUrl='https://edge.fix.example'`
- `mobApiBaseUrl='http://localhost:8080'`
- `mobAllowInsecureDevBaseUrl='true' | 'false'`

### Direct-dev mode

`MOB_RUNTIME_TARGET` determines the default direct host:

- `android-emulator` -> `http://10.0.2.2:8080`
- `ios-simulator` -> `http://localhost:8080`
- `physical-device` -> `http://<LAN_IP>:8080` (`MOB_LAN_IP` required)

Examples:

- Env-driven physical device lane: `MOB_RUNTIME_TARGET=physical-device MOB_LAN_IP=192.168.0.77`
- Launch-arg physical-device selector: `mobRuntimeTarget='physical-device'` plus env `MOB_LAN_IP=192.168.0.77` or explicit `mobApiBaseUrl` / `MOB_API_BASE_URL`

### Edge mode

Use `MOB_API_INGRESS_MODE=edge` together with `MOB_EDGE_BASE_URL=https://<edge-host>`.

- Edge mode is intended for shared QA, hardened ingress validation, and physical-device flows.
- `MOB_EDGE_BASE_URL` must be a valid HTTPS origin.
- Edge mode does not change API paths; MOB continues to use canonical `/api/v1/auth/*`, `/api/v1/orders/*`, and `/api/v1/notifications/*` routes.
- Live harness validation rejects `MOB_API_BASE_URL` when edge mode is selected so CI proves the canonical selector contract instead of an override escape hatch.

### Explicit override escape hatch

`MOB_API_BASE_URL` still overrides the resolved target or edge mode for controlled testing, but it is now an explicit escape hatch rather than the primary runtime selector.

- Any non-localhost plaintext override that would require `SameSite=None; Secure` fails fast with `MOB-CONFIG-004`.
- Development-only plaintext testing can bypass that guard with `MOB_ALLOW_INSECURE_DEV_BASE_URL=true`.
- The bypass is ignored outside development runtime.
- Override URLs must be valid absolute `http` or `https` URLs without credentials, query params, or fragments.

`MOB_STRICT_CSRF_BOOTSTRAP` controls startup behavior when `GET /api/v1/auth/csrf` is missing:

- default: non-production builds tolerate `404` and continue bootstrap (with warning log)
- production/default strict mode: bootstrap fails fast
- explicit override: set `true|false`

## Security Contract

- Cookie-session is canonical (`JSESSIONID` managed by transport, never read/persisted by app code).
- CSRF token is read from `XSRF-TOKEN` cookie when available, with fallback to the `GET /api/v1/auth/csrf` response body for backends that use `HttpSessionCsrfTokenRepository`.
- Non-safe methods inject the server-advertised CSRF header name. Default remains `X-XSRF-TOKEN` when the backend does not override it.
- CSRF bootstrap/refresh endpoint: `GET /api/v1/auth/csrf` at app start, login success, and foreground resume.
- Shared QA and physical-device release validation should prefer HTTPS edge mode over plaintext LAN access.
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

Password-reset handoff now uses the app-owned custom scheme `fixyz://reset-password?token=<token>`. The JS auth shell consumes both cold-start and in-app `Linking` events, while iOS/Android native configuration registers the scheme with the current app shell.

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
- `pending-order@fix.com` -> successful login, then order session execute returns `FEP-002` pending-confirmation guidance
- `unknown-order@fix.com` -> successful login, then order session execute returns safe unknown external fallback guidance
- `no-account@fix.com` -> successful login without a linked order account, so the order boundary stays gated
- `valid-reset-token` -> successful password reset for local handoff automation

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

`scripts/run-maestro-auth-suite.sh` now handles `auth-live` launch-argument rendering automatically, so the live flows can be executed through the checked-in runner without a manual `envsubst` step. The runner also skips the local mock auth server when the target lives under `e2e/maestro/auth-live`.

Vitest also includes a live auth contract regression for the mobile runtime itself:

- `LIVE_API_BASE_URL=http://localhost:8080 LIVE_EMAIL=<registered_email> LIVE_PASSWORD=<same_password> npm run test:live:auth`
- `MOB_API_INGRESS_MODE=edge MOB_EDGE_BASE_URL=https://edge.fix.example LIVE_EMAIL=<registered_email> LIVE_PASSWORD=<same_password> npm run test:live:auth`
- `MOB_RUNTIME_TARGET=physical-device MOB_LAN_IP=192.168.0.77 MOB_ALLOW_INSECURE_DEV_BASE_URL=true LIVE_EMAIL=<registered_email> LIVE_PASSWORD=<same_password> npm run test:live:auth`
- If `LIVE_EMAIL` / `LIVE_PASSWORD` are omitted, the test self-registers a disposable member before replaying an invalid-credentials login.
- The Vitest live regression now resolves its base URL through the same direct/edge runtime contract as the app, then captures the real `/api/v1/auth/login` error body and `X-Correlation-Id` header to verify the mobile normalized error preserves backend correlation metadata.

For the dashboard-specific live contract, prefer an existing MFA-enabled account that already owns at least one position:

- `LIVE_API_BASE_URL=http://localhost:8080 LIVE_EMAIL=<registered_email_with_holdings> LIVE_PASSWORD=<same_password> LIVE_TOTP_KEY=<base32_totp_secret> npm run test -- tests/e2e/mobile-dashboard-live.e2e.test.ts`

The dashboard live lane can still self-register a disposable member when `LIVE_EMAIL` / `LIVE_PASSWORD` are omitted, and that path now verifies dashboard bootstrap + summary retrieval without requiring synthetic holdings to materialize immediately. Release-readiness runs should still provide a holdings-backed account so chart metadata parity assertions execute instead of skipping.

- Register against a live backend:
  - `export PATH="$PATH:$HOME/.maestro/bin"`
  - `LIVE_API_BASE_URL=http://localhost:8080 LIVE_EMAIL=<unique_email> LIVE_NAME='<display_name>' LIVE_PASSWORD=<password> DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/run-maestro-auth-suite.sh ./e2e/maestro/auth-live/01-register-success-live-be.yaml`
- Login against the same live backend account:
  - `LIVE_API_BASE_URL=http://localhost:8080 LIVE_EMAIL=<registered_email> LIVE_PASSWORD=<same_password> LIVE_NAME='<same_display_name>' DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/run-maestro-auth-suite.sh ./e2e/maestro/auth-live/02-login-success-live-be.yaml`
- Invalid-credentials check against the live backend:
  - `LIVE_API_BASE_URL=http://localhost:8080 LIVE_EMAIL=<registered_email> LIVE_INVALID_PASSWORD=<wrong_password> DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/run-maestro-auth-suite.sh ./e2e/maestro/auth-live/03-login-invalid-credentials-live-be.yaml`
- Forgot-password request against the live backend:
  - `LIVE_API_BASE_URL=http://localhost:8080 LIVE_EMAIL=<registered_or_unknown_email> DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/run-maestro-auth-suite.sh ./e2e/maestro/auth-live/04-password-recovery-request-live-be.yaml`
- Invalid reset-token guidance against the live backend:
  - `LIVE_API_BASE_URL=http://localhost:8080 DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/run-maestro-auth-suite.sh ./e2e/maestro/auth-live/05-password-reset-invalid-token-live-be.yaml`
- Forgot-password challenge bootstrap against the live backend:
  - `LIVE_API_BASE_URL=http://localhost:8080 LIVE_EMAIL=<registered_or_unknown_email> DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/run-maestro-auth-suite.sh ./e2e/maestro/auth-live/06-password-recovery-challenge-live-be.yaml`
- Reset-success handoff against the live backend:
  - `MOB_MAESTRO_OPEN_URL='fixyz://reset-password?token=<live_reset_token>' LIVE_API_BASE_URL=http://localhost:8080 LIVE_RESET_PASSWORD=<new_password> DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/run-maestro-auth-suite.sh ./e2e/maestro/auth-live/07-password-reset-success-live-be.yaml`

Run the live flows individually. `01-register-success-live-be.yaml` should run before `02-login-success-live-be.yaml` when you are validating a freshly created account, while `03-login-invalid-credentials-live-be.yaml`, `04-password-recovery-request-live-be.yaml`, `05-password-reset-invalid-token-live-be.yaml`, and `06-password-recovery-challenge-live-be.yaml` can run independently once `LIVE_API_BASE_URL` is reachable. `07-password-reset-success-live-be.yaml` additionally requires a real recovery token supplied through `MOB_MAESTRO_OPEN_URL`.

For hardened ingress validation, prefer the Vitest live lane with `MOB_API_INGRESS_MODE=edge` and `MOB_EDGE_BASE_URL=https://...` so the app runtime exercises the canonical selector contract instead of only `MOB_API_BASE_URL`.

### Mobile Release Readiness Pack

Story 10.6 uses the documents under `docs/release` as the mobile release-readiness contract:

- `docs/release/mobile-test-matrix.md` describes the required lanes, commands, and evidence shape.
- `docs/release/mobile-readiness-checklist.md`, `docs/release/mobile-release-notes.md`, and `docs/release/mobile-handoff-package.md` are the checked-in guide entry points for the versioned candidate pack.
- `docs/release/candidates/v<package-version>/mobile-readiness-checklist.md` is the candidate-specific evidence index.
- `docs/release/candidates/v<package-version>/mobile-release-notes.md` is the candidate-specific release summary.
- `docs/release/candidates/v<package-version>/mobile-handoff-package.md` is the candidate-specific handoff bundle, including rollback and distribution ownership.
- Current version paths:
  - `docs/release/candidates/v0.1.0/mobile-readiness-checklist.md`
  - `docs/release/candidates/v0.1.0/mobile-release-notes.md`
  - `docs/release/candidates/v0.1.0/mobile-handoff-package.md`

Generate the candidate pack or recreate any missing companion files with:

```bash
npm run release:notes
```

The generator preserves existing candidate evidence, including approved files, and only creates missing templates.

The mobile release pack links to Story 10.1 CI evidence and Story 10.4 smoke/rehearsal evidence rather than duplicating them, so the mobile reviewer path stays centralized and traceable.

### Deep-Link Handoff Flow

Use the checked-in runner plus `MOB_MAESTRO_OPEN_URL` to verify the supported password-reset handoff on the iOS simulator:

- `MOB_MAESTRO_OPEN_URL='fixyz://reset-password?token=valid-reset-token' DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/run-maestro-auth-suite.sh ./e2e/maestro/auth/11-password-reset-deeplink-handoff.yaml`

This flow re-launches the simulator app with the same QA launch arguments that the local reset flows use, opens the native deep link after the auth shell is ready, then asserts that the reset screen can complete successfully without manually typing the token.

`mobQaPlaintextPasswords` is now honored only in `__DEV__` builds, so the plaintext password field mode remains limited to simulator/dev automation and cannot leak into production app behavior.
