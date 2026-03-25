# Mobile Handoff Package Guide

This file is the checked-in entry point for mobile handoff packages. Candidate-specific handoff bundles must live under `docs/release/candidates/v<semver>/mobile-handoff-package.md` so rollback ownership and release evidence stay version-scoped.

Do not record candidate-specific build IDs, timestamps, or final approval state in this guide. Put those details in the generated candidate file instead.

## Generate Candidate Handoff

Run the scaffold command after the mobile release lanes are ready to package:

```bash
npm run release:notes
```

The command reads the mobile version from `package.json`, creates the candidate directory under `docs/release/candidates/v<package-version>/`, creates any missing candidate-pack files, and preserves existing candidate evidence.
That preservation applies to both draft files with manual notes and approved files that must remain immutable.
Delete a specific draft file only when you intentionally want to regenerate that template from scratch.

Current mobile package version path:

- `docs/release/candidates/v0.1.0/mobile-handoff-package.md`

## Template Contract

Every generated candidate handoff file should include these sections:

- `## Package Metadata`
- `## Matrix Result Summary`
- `## Required Links`
- `## Handoff Notes`
