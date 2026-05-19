# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
## [v2026.05.18] - 2026-05-19

## [v2026.05.17] - 2026-05-18

- No shippable change — re-published with updated date stamp.
## [v2026.05.15] - 2026-05-16

- No shippable change — re-published with updated date stamp.
## [v2026.05.11] - 2026-05-12

## [v2026.05.10] - 2026-05-11

## [v2026.05.09] - 2026-05-10

- No shippable change — re-published with updated date stamp.
## [v2026.05.07] - 2026-05-08

## [v2026.05.06] - 2026-05-07

- No shippable change — re-published with updated date stamp.

### Added

- Initial changelog
- iOS workflow preflight that fails fast when the runner lacks Xcode 26+ / `iphoneos26.*` SDK, surfacing App Store submission gaps in CI (ANU-532, ANU-769).

### Changed

- React Native CI: replace retired `macos-13` (Ventura) runner label with `macos-14` for both `ios` and `macos` jobs to stop 24h queue timeouts (ANU-532, ANU-506).
