# Mobile Release Notes Guide

This file is the checked-in entry point for mobile release notes. Candidate-specific notes must live under `docs/release/candidates/v<semver>/mobile-release-notes.md` so each mobile candidate keeps its own immutable evidence trail.

Do not record candidate-specific approval state, build IDs, or dates in this file. Put those details in the generated candidate file instead.

## Generate Candidate Notes

Run the scaffold command after the mobile release lanes are ready to package:

```bash
npm run release:notes
```

The command reads the mobile version from `package.json`, creates the candidate directory under `docs/release/candidates/v<package-version>/`, creates any missing candidate-pack files, and preserves existing draft evidence.
Delete a specific draft file only when you intentionally want to regenerate that template from scratch.

Current mobile package version path:

- `docs/release/candidates/v0.1.0/mobile-release-notes.md`

## What Belongs In The Generated File

- candidate metadata for the exact mobile candidate under review
- links to the candidate checklist and shared test matrix
- links to lane evidence for simulator, live backend, and physical-device smoke
- links to candidate-specific upstream Story 10.1 and Story 10.4 evidence records
- approval outcome, rollback ownership, and reviewer notes for that version only
