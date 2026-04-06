# Release and Versioning Guide

This project uses automated SemVer releases based on Conventional Commits.

## Versioning model

- Version format: `vMAJOR.MINOR.PATCH`
- Scope: one repo-wide version for backend and frontend together
- Release branch: `main`
- Initial release baseline: `v0.1.0`

## How version bumps are decided

`release-please` inspects commit messages since the last tag:

- `feat:` -> minor bump (`0.1.0` -> `0.2.0`)
- `fix:` -> patch bump (`0.1.0` -> `0.1.1`)
- `feat!:` or `BREAKING CHANGE:` footer -> major bump (`0.x` -> `1.0.0` when applicable)
- `docs:`, `ci:`, `refactor:`, etc. are included in notes but do not force a bump by themselves

Use Conventional Commit messages for all merge commits/PR titles to keep release automation accurate.

## Automated release flow

1. Changes are merged to `main`.
2. `.github/workflows/release-pr.yml` runs `release-please`.
3. `release-please` opens or updates a Release PR with:
   - next version
   - `CHANGELOG.md` updates
   - release notes draft
4. A maintainer merges the Release PR.
5. `release-please` creates a GitHub tag and GitHub Release.
6. `.github/workflows/release.yml` runs on `release.published` and publishes release assets.

## What gets published

### GitHub release assets

- Backend binaries (tar.gz/zip) for:
  - `linux/amd64`, `linux/arm64`
  - `darwin/amd64`, `darwin/arm64`
  - `windows/amd64`
- Frontend bundle tarball (`dash-frontend_<version>.tar.gz`)
- `checksums.txt` (SHA256)
- Image SBOM files (`*.spdx.json`)

### Container images (public GHCR)

- `ghcr.io/aceobservability/ace-backend`
- `ghcr.io/aceobservability/ace-frontend`

Image tags published per release:

- immutable: `vX.Y.Z`, `X.Y.Z`, `sha-<commit>`
- rolling: `X.Y`, `X`, `latest` (stable releases)

## Supply-chain security in releases

Release workflow also performs:

- keyless Cosign signing for container images
- GitHub provenance attestations
- SBOM generation for published images

## Maintainer checklist

Before merging a Release PR:

1. Confirm release notes and changelog entries look right.
2. Confirm version bump type matches intended change scope.
3. Merge the Release PR.
4. Verify GitHub Release assets uploaded successfully.
5. Verify GHCR images are published and public.
