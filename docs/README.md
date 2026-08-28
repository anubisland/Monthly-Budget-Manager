# Monthly Budget Manager — Documentation

This directory hosts the user-facing documentation that ships with each
release. The release-hygiene gate (ANU-682) requires that `docs/guides/`
contains at least one guide whenever user-visible code changes.

## Layout

| Path | Contents |
|------|----------|
| `docs/guides/` | End-user how-tos: getting started, CLI/GUI usage, exporting data |
| `docs/README.md` | This index |

## Guides

- [Getting Started](guides/getting-started.md) — install Python, run the CLI
  and the GUI, and produce a first monthly report.
- [CLI Reference](guides/cli-reference.md) — every CLI flag with example
  input and JSON output.
- [Exporting to Excel](guides/exporting-to-excel.md) — how the GUI export
  packs charts and tables into an `.xlsx` workbook.

## Project README

The top-level [`README.md`](../README.md) covers feature overview,
installation, and platform matrix. Anything that documents a workflow longer
than three paragraphs belongs here under `docs/guides/` instead so the
release-hygiene gate can audit it.
