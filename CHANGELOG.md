# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The mobile app can import a bank statement. Paste the rows out of the bank's
  export, see what they became — with the ones already in the month marked —
  and only then add them. Reading and writing are separate steps, so a paste of
  two hundred transactions never lands in a month unseen, and a preview read
  against one month cannot be applied to another.
- The web app can do the same, in both languages: the same paste, the same
  preview of what is to be added, what already exists and what could not be
  read, and the same confirmation before anything is written to the month.
- Auto-category rules in the web app, read the way the mobile app reads them:
  a word and the category it implies, case-insensitive, first match wins. The
  statement preview shows the category each imported expense will land in, so
  the import files the month instead of leaving it all under Uncategorized.
- Envelopes in the mobile app: a ceiling per category, shown under the month's
  total budget as a bar per category that turns amber near the ceiling and red
  over it. The plan carries into the next month from the one before it, and
  survives a restart — a plan that has to be retyped every month is not a plan.
- Search across every month in the mobile app, from the header. Matches the
  description, the category, and the Arabic category name the screen shows, so
  searching what you see finds the row that is stored in English.
- Favourites in the mobile app: star any entry, and it appears above the add
  form as a chip that adds it to the month in one tap.
- Deleting an entry in the mobile app, with an undo on the toast that follows.
  The delete routes existed and nothing in the interface called them.
- CSV import and export in the mobile app, in the same column order the web app
  writes (`type,name,category,amount,date`), so a file moves between the two.
  Import names the lines it refused and why; export writes the file before
  offering to share it.

### Changed

- The web app now looks like the mobile app rather than a form on a white page:
  the same palette, the same rounded cards, a gradient card at the top showing
  the month's net, three coloured totals under it (income, expenses, margin),
  one-tap buttons that open the matching form, and the tabs as a segmented
  control. Every figure above the tabs is computed from the same totals the
  Report tab uses, so the two cannot disagree.

### Fixed

- A push to `main` no longer fails when the repository has no GitHub Pages site:
  the web workflow asks GitHub whether Pages is configured and skips the deploy
  with a notice, instead of failing inside `configure-pages`.

## [2.0.0] - 2026-10-24

### Added

- The project is pip-installable: `pip install .` provides `budget-manager` and
  `budget-manager-gui`, with `gui` and `export` extras. The CLI still needs
  nothing outside the standard library.

### Changed

- One domain model. The copy of `monthly_budget` that the mobile app carried is
  gone — `mobile/pyproject.toml` now pulls the package at the repository root
  into the Android bundle, so a fix reaches both apps instead of one.
- `BudgetMonth` carries both budget shapes the two apps had drifted into: the
  desktop's per-category `budget_limits` and the mobile app's single
  `total_budget`. Both round-trip through `to_dict`/`from_dict`.
- One version number. `monthly_budget/__init__.py` is the source, `pyproject.toml`
  reads it dynamically, and the mobile Briefcase project is held to it by a test.
- Coverage is measured across `monthly_budget/` and the mobile app rather than the
  re-export shim, so it now reports the real figure; the floor is that measured
  baseline and ratchets up as tests are added.
- `ruff` lints the real source instead of the shim; the 58 findings it surfaced
  are fixed.
- Jest runs with coverage, so its thresholds actually apply; they are set to the
  measured baseline.
- The release version gate reads the package, and skips the semver comparison for
  the date-scheme tags produced by `daily-release.yml`.

### Fixed

- The README no longer documents a `react-native/` workspace, desktop Excel/CSV
  export, or keyboard shortcuts that do not exist.
- Coverage no longer counts the same 3,613 lines twice, so the reported figure
  went from 32% to 45% without a single test changing; the floor moved with it.
- Removed `openpyxl`, which nothing imported.

## [v2026.10.23] - 2026-10-24

## [v2026.10.21] - 2026-10-22

- No shippable change — re-published with updated date stamp.
## [v2026.10.19] - 2026-10-20

## [v2026.10.18] - 2026-10-19

- No shippable change — re-published with updated date stamp.
## [v2026.10.16] - 2026-10-17

## [v2026.10.14] - 2026-10-15

## [v2026.10.12] - 2026-10-13

## [v2026.10.11] - 2026-10-12

## [v2026.10.10] - 2026-10-11

## [v2026.10.08] - 2026-10-09

- No shippable change — re-published with updated date stamp.
## [v2026.10.06] - 2026-10-07

## [v2026.10.04] - 2026-10-05

## [v2026.10.03] - 2026-10-04

- No shippable change — re-published with updated date stamp.
## [v2026.10.01] - 2026-10-02

## [v2026.09.30] - 2026-10-01

## [v2026.09.28] - 2026-09-29

## [v2026.09.27] - 2026-09-28

- No shippable change — re-published with updated date stamp.
## [v2026.09.25] - 2026-09-26

- No shippable change — re-published with updated date stamp.
## [v2026.09.23] - 2026-09-24

- No shippable change — re-published with updated date stamp.
## [v2026.09.21] - 2026-09-22

## [v2026.09.20] - 2026-09-21

## [v2026.09.19] - 2026-09-20

## [v2026.09.17] - 2026-09-18

## [v2026.09.16] - 2026-09-17

## [v2026.09.14] - 2026-09-15

## [v2026.09.13] - 2026-09-14

- No shippable change — re-published with updated date stamp.
## [v2026.09.11] - 2026-09-12

## [v2026.09.09] - 2026-09-10

- No shippable change — re-published with updated date stamp.
## [v2026.09.07] - 2026-09-08

## [v2026.09.06] - 2026-09-07

- No shippable change — re-published with updated date stamp.
## [v2026.09.04] - 2026-09-05

## [v2026.09.02] - 2026-09-03

- No shippable change — re-published with updated date stamp.
## [v2026.08.31] - 2026-09-01

## [v2026.08.30] - 2026-08-31

## [v2026.08.29] - 2026-08-30

- No shippable change — re-published with updated date stamp.
## [v2026.08.26] - 2026-08-27

## [v2026.08.24] - 2026-08-25

## [v2026.08.23] - 2026-08-24

## [v2026.08.21] - 2026-08-22

## [v2026.08.19] - 2026-08-20

## [v2026.08.17] - 2026-08-18

- No shippable change — re-published with updated date stamp.
## [v2026.08.15] - 2026-08-16

## [v2026.08.13] - 2026-08-14

## [v2026.08.12] - 2026-08-13

- No shippable change — re-published with updated date stamp.
## [v2026.08.10] - 2026-08-11

## [v2026.08.09] - 2026-08-10

## [v2026.08.07] - 2026-08-08

## [v2026.08.05] - 2026-08-06

## [v2026.08.03] - 2026-08-04

## [v2026.08.02] - 2026-08-03

- No shippable change — re-published with updated date stamp.
## [v2026.07.31] - 2026-08-01

- No shippable change — re-published with updated date stamp.
## [v2026.07.29] - 2026-07-30

## [v2026.07.28] - 2026-07-29

## [v2026.07.26] - 2026-07-27

## [v2026.07.12] - 2026-07-13

## [v2026.07.11] - 2026-07-12

## [v2026.07.09] - 2026-07-10

## [v2026.07.08] - 2026-07-09

## [v2026.07.06] - 2026-07-07

## [v2026.07.05] - 2026-07-06

- No shippable change — re-published with updated date stamp.
## [v2026.07.03] - 2026-07-04

## [v2026.07.01] - 2026-07-02

- No shippable change — re-published with updated date stamp.
## [v2026.06.29] - 2026-06-30

## [v2026.06.28] - 2026-06-29

- No shippable change — re-published with updated date stamp.
## [v2026.06.26] - 2026-06-27

- No shippable change — re-published with updated date stamp.
## [v2026.06.24] - 2026-06-25

## [v2026.06.22] - 2026-06-23

## [v2026.06.21] - 2026-06-22

- No shippable change — re-published with updated date stamp.
## [v2026.06.19] - 2026-06-20

- No shippable change — re-published with updated date stamp.
## [v2026.06.17] - 2026-06-18

## [v2026.06.15] - 2026-06-16

## [v2026.06.14] - 2026-06-15

## [v2026.06.13] - 2026-06-14

## [v2026.06.11] - 2026-06-12

## [v2026.06.10] - 2026-06-11

- No shippable change — re-published with updated date stamp.
## [v2026.06.08] - 2026-06-09

## [v2026.06.07] - 2026-06-08

- No shippable change — re-published with updated date stamp.
## [v2026.06.05] - 2026-06-06

## [v2026.06.03] - 2026-06-04

- No shippable change — re-published with updated date stamp.
## [v2026.06.01] - 2026-06-02

## [v2026.05.31] - 2026-06-01

- No shippable change — re-published with updated date stamp.
## [v2026.05.29] - 2026-05-30

## [v2026.05.27] - 2026-05-28

- No shippable change — re-published with updated date stamp.
## [v2026.05.25] - 2026-05-26

## [v2026.05.24] - 2026-05-25

## [v2026.05.23] - 2026-05-24

## [v2026.05.21] - 2026-05-22

## [v2026.05.20] - 2026-05-21

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
