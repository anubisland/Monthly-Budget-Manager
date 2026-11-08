# The icon artwork

Put the original here as `icon.png` (or `.webp`/`.jpg`).
`python mobile/tools/make_icon.py` reads it and writes every size Briefcase
asks for into `../../src/budget_manager_mobile/resources/`.

What the file should be:

- **Square**, and as large as you have — 1024x1024 or more.
- **The artwork only.** No screenshot frame, no share button, no grey band.
- Exported from the original, not screenshotted: a screenshot is
  re-compressed, and the loss shows on the 48px icon where every pixel counts.

The generated files are committed, so the icon does not depend on this file
being present on any particular machine — but keep it here so the icon stays
editable instead of being twenty-six binaries nobody can change.
