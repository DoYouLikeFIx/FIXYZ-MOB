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
- CSRF token is read from `XSRF-TOKEN` cookie and injected as `X-XSRF-TOKEN` for non-safe methods.
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
