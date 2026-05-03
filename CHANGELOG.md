# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each daily release tag (`vYYYYMMDD-HHMM-<sha>`) corresponds to a section below.
Add a new dated section under `[Unreleased]` whenever user-visible code changes;
the release-hygiene gate (ANU-682) blocks releases that omit a CHANGELOG entry.

## [Unreleased]

### Added

- Release-hygiene gate scaffolding: `docs/` tree with a user guide under
  `docs/guides/`, and Keep-a-Changelog backfill for recent daily releases.

## [20260430-1040-44d6d77] - 2026-04-30

### Added

- Tag-based and `workflow_dispatch` triggers on `release.yml` so daily release
  re-runs can be initiated manually or off `v*.*.*` tags.

## [20260430-1038-d96d2ba] - 2026-04-30

### Added

- Scheduled release automation via `release-schedule.yml` (2-day cadence cron).

## [20260430-1016-6bc5eba] - 2026-04-30

### Fixed

- Windows: build shared packages before the Release MSBuild + Metro bundle
  step so React Native dependencies are present at bundle time.

## [20260430-0520-2a4a049] - 2026-04-30

### Fixed

- Windows: restore the monorepo `metro.config.js` after
  `react-native-windows-init` clobbers it during scaffolding.

## [20260430-0353-97d3120] - 2026-04-30

### Fixed

- Windows Release: ensure `react-native` is available for the Metro bundler
  during the packaged build.

## [20260430-0330-d9198d9] - 2026-04-30

### Fixed

- Lint: drop the unused `math` import in `budget_manager.py`.

## [20260430-0322-108edf6] - 2026-04-30

### Fixed

- Android: raise the Gradle heap and limit the CI build to `arm64-v8a` so the
  release build no longer OOMs on GitHub-hosted runners.

## [20260428-2132-9dc944c] - 2026-04-28

### Fixed

- CI: pin the Windows SDK version and add per-job timeouts so hung jobs no
  longer block the rest of the matrix.

## [20260425-2053-a271d5e] - 2026-04-25

### Added

- Pytest test suite, Python CI workflow, and an expanded `README.md`.

[Unreleased]: https://github.com/anubisland/Monthly-Budget-Manager/compare/v20260430-1040-44d6d77...HEAD
[20260430-1040-44d6d77]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260430-1040-44d6d77
[20260430-1038-d96d2ba]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260430-1038-d96d2ba
[20260430-1016-6bc5eba]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260430-1016-6bc5eba
[20260430-0520-2a4a049]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260430-0520-2a4a049
[20260430-0353-97d3120]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260430-0353-97d3120
[20260430-0330-d9198d9]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260430-0330-d9198d9
[20260430-0322-108edf6]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260430-0322-108edf6
[20260428-2132-9dc944c]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260428-2132-9dc944c
[20260425-2053-a271d5e]: https://github.com/anubisland/Monthly-Budget-Manager/releases/tag/v20260425-2053-a271d5e
