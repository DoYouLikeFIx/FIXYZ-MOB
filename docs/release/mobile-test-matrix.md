# Mobile Release Test Matrix

Story 10.6 treats this matrix as the release gate contract for mobile.

## Lanes

| Lane | What it proves | Command or Evidence Source | Required Evidence |
|---|---|---|---|
| `ios-simulator/direct-maestro` | Core auth and order journeys work in the simulator lane | `npm run e2e:maestro:auth` and `npm run e2e:maestro:order` | Maestro logs, screenshots, and pass/fail result for each scenario |
| `live-backend-contract` | The app matches live backend contracts for auth, order, notification, and dashboard bootstrap flows; holdings-backed chart parity is attached when reusable MFA credentials are available | `LIVE_API_BASE_URL=http://localhost:8080 npm run test -- tests/e2e/mobile-auth-live.e2e.test.ts tests/e2e/mobile-order-live.e2e.test.ts tests/e2e/mobile-dashboard-live.e2e.test.ts`; the dashboard bootstrap flow can self-register a disposable member, but chart metadata parity requires `LIVE_EMAIL`, `LIVE_PASSWORD`, and `LIVE_TOTP_KEY` for a holdings-backed MFA account | Vitest output, CI artifact, any captured backend correlation IDs, and the configured account owning at least one position when the candidate attaches chart-parity evidence |
| `physical-device/edge-smoke` | The approved build works against the canonical HTTPS edge path on a real device | Manual smoke session using `MOB_API_INGRESS_MODE=edge` and `MOB_EDGE_BASE_URL=<https://edge-host>` | Device model, OS version, app build, edge host, reviewer, timestamp, and pass/fail result |

## Regression Gates

- Auth regressions are covered by `tests/e2e/mobile-auth-live.e2e.test.ts` and the auth Maestro flows under `e2e/maestro/auth`.
- Order regressions are covered by `tests/e2e/mobile-order-live.e2e.test.ts`, `tests/e2e/mobile-dashboard-live.e2e.test.ts`, and the order Maestro flows under `e2e/maestro/order`.
- Notification regressions are covered by `tests/unit/api/notification-api.test.ts`, `tests/unit/order/AuthenticatedHomeScreen.test.tsx`, and the compact notification Maestro flows under `e2e/maestro/order/18-notification-feed-compact-setup.yaml` and `e2e/maestro/order/19-notification-feed-compact-demo.yaml`.

## Upstream Evidence

- Story 10.1 CI evidence must be linked in the checklist before the package is approved.
- Story 10.4 smoke/rehearsal evidence must be linked in the checklist before the package is approved.
- The mobile pack must reference those upstream artifacts instead of copying their contents.
- Candidate-specific lane evidence should live under `docs/release/candidates/v<semver>/` so draft scaffolds and approved evidence stay version-scoped.
