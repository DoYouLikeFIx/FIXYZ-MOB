import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const mobRoot = resolve(testDir, '../../..');

const readText = (relativePath: string) =>
  readFileSync(resolve(mobRoot, relativePath), 'utf8');

describe('mobile release readiness pack', () => {
  it('links the release pack from the main MOB README', () => {
    const readme = readText('README.md');
    const { version } = JSON.parse(readText('package.json')) as {
      version: string;
    };

    expect(readme).toContain('### Mobile Release Readiness Pack');
    expect(readme).toContain(
      'Story 10.6 uses the documents under `docs/release` as the mobile release-readiness contract:',
    );
    expect(readme).toContain('docs/release/mobile-test-matrix.md');
    expect(readme).toContain('docs/release/mobile-readiness-checklist.md');
    expect(readme).toContain('docs/release/mobile-release-notes.md');
    expect(readme).toContain('docs/release/mobile-handoff-package.md');
    expect(readme).toContain(`docs/release/candidates/v${version}/mobile-readiness-checklist.md`);
    expect(readme).toContain(`docs/release/candidates/v${version}/mobile-release-notes.md`);
    expect(readme).toContain(`docs/release/candidates/v${version}/mobile-handoff-package.md`);
    expect(readme).toContain('npm run release:notes');
    expect(readme).toContain(
      'LIVE_API_BASE_URL=http://localhost:8080 LIVE_EMAIL=<registered_email_with_holdings> LIVE_PASSWORD=<same_password> LIVE_TOTP_KEY=<base32_totp_secret> npm run test -- tests/e2e/mobile-dashboard-live.e2e.test.ts',
    );
    expect(readme).toContain(
      'The mobile release pack links to Story 10.1 CI evidence and Story 10.4 smoke/rehearsal evidence rather than duplicating them',
    );
  });

  it('defines the mobile release matrix, regression gates, and upstream evidence links', () => {
    const matrix = readText('docs/release/mobile-test-matrix.md');

    expect(matrix).toContain('ios-simulator/direct-maestro');
    expect(matrix).toContain('live-backend-contract');
    expect(matrix).toContain('physical-device/edge-smoke');
    expect(matrix).toContain('npm run e2e:maestro:auth');
    expect(matrix).toContain('npm run e2e:maestro:order');
    expect(matrix).toContain(
      'LIVE_API_BASE_URL=http://localhost:8080 npm run test -- tests/e2e/mobile-auth-live.e2e.test.ts tests/e2e/mobile-order-live.e2e.test.ts tests/e2e/mobile-dashboard-live.e2e.test.ts',
    );
    expect(matrix).toContain('LIVE_EMAIL');
    expect(matrix).toContain('LIVE_PASSWORD');
    expect(matrix).toContain('LIVE_TOTP_KEY');
    expect(matrix).toContain('owning at least one position');
    expect(matrix).toContain('MOB_API_INGRESS_MODE=edge');
    expect(matrix).toContain('MOB_EDGE_BASE_URL=<https://edge-host>');
    expect(matrix).toContain('tests/e2e/mobile-dashboard-live.e2e.test.ts');
    expect(matrix).toContain('tests/unit/api/notification-api.test.ts');
    expect(matrix).toContain(
      'tests/unit/order/AuthenticatedHomeScreen.test.tsx',
    );
    expect(matrix).toContain(
      'e2e/maestro/order/18-notification-feed-compact-setup.yaml',
    );
    expect(matrix).toContain(
      'e2e/maestro/order/19-notification-feed-compact-demo.yaml',
    );
    expect(matrix).toContain('Story 10.1 CI evidence');
    expect(matrix).toContain('Story 10.4 smoke/rehearsal evidence');
  });

  it('keeps the guide files and candidate pack aligned with the required release metadata', () => {
    const { version } = JSON.parse(readText('package.json')) as {
      version: string;
    };
    const checklistGuide = readText('docs/release/mobile-readiness-checklist.md');
    const notesGuide = readText('docs/release/mobile-release-notes.md');
    const handoffGuide = readText('docs/release/mobile-handoff-package.md');
    const checklist = readText(`docs/release/candidates/v${version}/mobile-readiness-checklist.md`);
    const notes = readText(`docs/release/candidates/v${version}/mobile-release-notes.md`);
    const handoff = readText(`docs/release/candidates/v${version}/mobile-handoff-package.md`);
    const maestroEvidence = readText(
      `docs/release/candidates/v${version}/ios-simulator-direct-maestro-evidence.md`,
    );
    const liveEvidence = readText(
      `docs/release/candidates/v${version}/live-backend-contract-evidence.md`,
    );
    const deviceEvidence = readText(
      `docs/release/candidates/v${version}/physical-device-edge-smoke-evidence.md`,
    );
    const story101Evidence = readText(
      `docs/release/candidates/v${version}/upstream-story-10.1-evidence.md`,
    );
    const story104Evidence = readText(
      `docs/release/candidates/v${version}/upstream-story-10.4-evidence.md`,
    );

    expect(checklistGuide).toContain('docs/release/candidates/v<semver>/mobile-readiness-checklist.md');
    expect(checklistGuide).toContain('ios-simulator-direct-maestro-evidence.md');
    expect(checklistGuide).toContain('live-backend-contract-evidence.md');
    expect(checklistGuide).toContain('physical-device-edge-smoke-evidence.md');
    expect(checklistGuide).toContain('preserves any existing candidate evidence');

    expect(notesGuide).toContain('docs/release/candidates/v<semver>/mobile-release-notes.md');
    expect(notesGuide).toContain('npm run release:notes');
    expect(notesGuide).toContain('preserves existing draft evidence');
    expect(handoffGuide).toContain('docs/release/candidates/v<semver>/mobile-handoff-package.md');
    expect(handoffGuide).toContain('preserves existing draft evidence');

    expect(checklist).toContain(`Candidate version | \`${version}\``);
    expect(checklist).toContain('./ios-simulator-direct-maestro-evidence.md');
    expect(checklist).toContain('./live-backend-contract-evidence.md');
    expect(checklist).toContain('./physical-device-edge-smoke-evidence.md');
    expect(checklist).toContain('./upstream-story-10.1-evidence.md');
    expect(checklist).toContain('./upstream-story-10.4-evidence.md');
    expect(checklist).toContain('Device model');
    expect(checklist).toContain('OS version');
    expect(checklist).toContain('App build');
    expect(checklist).toContain('Edge host');
    expect(checklist).toContain('Reviewer');
    expect(checklist).toContain('Timestamp');

    expect(notes).toContain(`Version: \`${version}\``);
    expect(notes).toContain('Approval status: `Draft - pending release evidence`');
    expect(notes).toContain('./mobile-readiness-checklist.md');
    expect(notes).toContain('./mobile-handoff-package.md');
    expect(notes).toContain('./live-backend-contract-evidence.md');
    expect(notes).toContain('./upstream-story-10.1-evidence.md');
    expect(notes).toContain('./upstream-story-10.4-evidence.md');

    expect(handoff).toContain('Rollback owner');
    expect(handoff).toContain('Contact owner');
    expect(handoff).toContain('Distribution target');
    expect(handoff).toContain('./mobile-readiness-checklist.md');
    expect(handoff).toContain('./mobile-release-notes.md');
    expect(handoff).toContain('If any lane is unresolved, keep the package in draft state.');

    expect(maestroEvidence).toContain('npm run e2e:maestro:auth');
    expect(maestroEvidence).toContain('npm run e2e:maestro:order');
    expect(liveEvidence).toContain('tests/e2e/mobile-auth-live.e2e.test.ts');
    expect(liveEvidence).toContain('tests/e2e/mobile-order-live.e2e.test.ts');
    expect(liveEvidence).toContain('tests/e2e/mobile-dashboard-live.e2e.test.ts');
    expect(liveEvidence).toContain('LIVE_API_BASE_URL=http://localhost:8080');
    expect(liveEvidence).toContain('LIVE_TOTP_KEY');
    expect(deviceEvidence).toContain('MOB_API_INGRESS_MODE=edge');
    expect(deviceEvidence).toContain('MOB_EDGE_BASE_URL=<https://edge-host>');
    expect(story101Evidence).toContain('Status: `Pending upstream completion`');
    expect(story104Evidence).toContain('Status: `Pending upstream completion`');
  });

  it('keeps upstream evidence linked instead of embedding planning-spec paths', () => {
    const { version } = JSON.parse(readText('package.json')) as {
      version: string;
    };
    const checklist = readText(`docs/release/candidates/v${version}/mobile-readiness-checklist.md`);
    const notes = readText(`docs/release/candidates/v${version}/mobile-release-notes.md`);
    const handoff = readText(`docs/release/candidates/v${version}/mobile-handoff-package.md`);

    expect(checklist).not.toContain('_bmad-output/implementation-artifacts/');
    expect(notes).not.toContain('_bmad-output/implementation-artifacts/');
    expect(handoff).not.toContain('_bmad-output/implementation-artifacts/');
  });
});
