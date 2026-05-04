---
name: Release Checklist
about: Pre-release verification checklist
title: "[Release] v"
labels: release
---

## Release Checklist

**Version:** <!-- e.g., v1.2.0 -->
**Release date:** <!-- target date -->
**Release manager:** <!-- @username -->

### Quality Gates (automated via CI)

- [ ] **Unit tests** — all pass, coverage >= 80%
- [ ] **Integration tests** — all pass (or N/A documented)
- [ ] **E2E smoke** — module imports, CLI runs
- [ ] **Accessibility** — GUI has keyboard navigation, minimum 12pt fonts
- [ ] **Security scan** — pip-audit clean, Bandit no high issues, no eval/exec
- [ ] **Secret scan** — Gitleaks clean, no hardcoded credentials
- [ ] **Privacy checklist** — no financial PII in logs, file encryption for sensitive data
- [ ] **Performance smoke** — import < 5s, executable size reasonable
- [ ] **Changelog & version** — CHANGELOG.md updated, __version__ matches tag

### Manual Verification

- [ ] Tested on Windows
- [ ] Tested on macOS
- [ ] Tested on Linux
- [ ] Budget creation and tracking verified
- [ ] Data import/export verified
- [ ] GUI runs without errors

### First-Run Tour (per company standard ANU-681)

- [ ] Web surface: tour auto-starts on a wiped browser profile (no `anubisland-tour-completed-at`)
- [ ] Skip and Replay tour controls work; Replay button visible in the status bar
- [ ] Tour copy localizes EN/AR; Arabic renders RTL
- [ ] Telemetry: `tour_started`, `tour_step_completed`, `tour_completed`, `tour_skipped` observed in browser DevTools console / `window.__tourTelemetryBuffer`
- [ ] Screen-reader pass on the primary platform (e.g. NVDA on Windows for the web build)
- [ ] WCAG 2.2 AA contrast verified on tooltip and overlay

### Release Artifacts

- [ ] Windows executable built and tested
- [ ] Linux executable built and tested
- [ ] macOS executable built and tested
- [ ] Release notes drafted
- [ ] GitHub Release created with all platform binaries

### Rollback Plan

- [ ] Previous version binaries available
- [ ] User data backward-compatible
- [ ] Rollback procedure documented
