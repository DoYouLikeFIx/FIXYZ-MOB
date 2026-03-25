# Mobile Release Readiness Checklist Guide

This file is the checked-in entry point for mobile release checklists. Candidate-specific completed checklists must live under `docs/release/candidates/v<semver>/mobile-readiness-checklist.md` so release metadata and evidence stay scoped to the exact mobile candidate.

Do not record candidate-specific build IDs, reviewer names, or approval state in this guide. Put those details in the candidate file instead.

## Generate Candidate Pack

Run the scaffold command after the mobile release lanes are ready to package:

```bash
npm run release:notes
```

The command reads the mobile version from `package.json`, creates the candidate directory under `docs/release/candidates/v<package-version>/`, creates any missing candidate-pack files, and preserves any existing candidate evidence.
That preservation applies to both draft files with manual notes and approved files that must remain immutable.
Delete a specific draft file only when you intentionally want to regenerate that template from scratch.

Current mobile package version path:

- `docs/release/candidates/v0.1.0/mobile-readiness-checklist.md`

## Candidate Companion Files

Each candidate directory should keep these reviewer-facing evidence records together:

- `mobile-readiness-checklist.md`
- `mobile-release-notes.md`
- `mobile-handoff-package.md`
- `ios-simulator-direct-maestro-evidence.md`
- `live-backend-contract-evidence.md`
- `physical-device-edge-smoke-evidence.md`
- `upstream-story-10.1-evidence.md`
- `upstream-story-10.4-evidence.md`

## Checklist Contract

Every candidate checklist should include these sections:

- `## Candidate Metadata`
- `## Evidence Index`
- `## Lane Checks`
- `## Manual Smoke Metadata`
- `## Approval Notes`
