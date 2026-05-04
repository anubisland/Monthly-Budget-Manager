# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial changelog
- iOS workflow preflight that fails fast when the runner lacks Xcode 26+ / `iphoneos26.*` SDK, surfacing App Store submission gaps in CI (ANU-532, ANU-769).
- Web: first-run guided tour (12 steps) covering every navigation surface and README "value moment" with skip/replay, EN/AR localization with RTL, ARIA live-region announcements, keyboard operability, and the four standard telemetry events (`tour_started`, `tour_step_completed`, `tour_completed`, `tour_skipped`). Replay control lives in the status bar. (ANU-701, ANU-681).

### Changed

- React Native CI: replace retired `macos-13` (Ventura) runner label with `macos-14` for both `ios` and `macos` jobs to stop 24h queue timeouts (ANU-532, ANU-506).
