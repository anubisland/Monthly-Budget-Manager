# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.6] - 2026-10-27

### Fixed

- **An upgraded install could replace your cloud copy without asking.** Found
  by an independent review of 2.2.5, not by testing. The remembered "last
  agreed" hash is stored on the device, and 2.2.5 changed what that hash *is* —
  a canonical form instead of a raw serialization — without versioning where it
  is stored. For an install that had synced before, the remembered value could
  then match neither side, which routes the decision past "first sign-in: ask
  the human" and into last-write-wins. The protection the design has for exactly
  that case was skipped, and the cloud document could be overwritten silently.
  The stored keys now carry a scheme version, so a stale value reads as *no
  agreement yet* and the app asks.
- **A burst of pulls no longer destroys the safety copy it exists to make.**
  Every pull writes `before-sync-<month>.json` first. During the reload loop
  that file — the one holding "what this device had before sync" — was
  overwritten several times a second, so after the loop the safety copy held a
  halfway state and protected nothing. The first copy in a burst is now kept.
  (This also answers a worry raised earlier: the fixed filename means a loop
  cannot fill the disk, but it could quietly ruin the undo copy.)
- Three status messages were passing whole English sentences as their
  translation key, so Arabic users saw English for "data too large to sync" and
  "nothing was applied". They use real keys now.
- The reload guard: a backward clock change used to leave future-dated marks
  that are always "recent", keeping sync stopped until the wall clock caught up;
  the counter is per account rather than shared; and when it trips it logs what
  it saw, and no longer claims your data is untouched — a suppressed reload
  leaves the page showing yesterday's copy until you reload it yourself.

## [2.2.5] - 2026-10-27

### Fixed

- **Signing in could make the whole app reload over and over.** The bridge
  compared the two copies by hashing the document as one serialized string.
  Firestore hands a document's fields back in its own order, so the same
  budget serialized differently on each side, each side concluded the other had
  changed, and they pushed and pulled in a loop - on a phone that is the screen
  shaking several times a second. It showed up right after signing in, on both
  Android and desktop, and it did not settle on its own.
  The hash is now taken over a canonical form - keys sorted recursively, arrays
  left alone because their order means something - so equal content hashes
  equal wherever it has been. A test asserts the reordered-document case.
- As a second line of defence, reloads are now counted. If the page reloads
  more than three times inside twenty seconds, the bridge unsubscribes and says
  so instead of cycling. Local data is untouched either way.

### Changed

- The sync card is translated - status lines, the conflict question, the
  buttons and the field placeholders - through the app's own language table
  rather than English text baked into the markup.
- A one-time, dismissible invitation to turn on sync appears for anyone who is
  not signed in. Saying "not now" is remembered, because a reminder that comes
  back every launch trains people to swipe past the ones that matter.

## [2.2.4] - 2026-10-27

### Changed

- Chart surfaces are white again. The budget page and the two panels under the
  summary on the home page - budget bars and recent movements - now sit on
  white, because their gridlines and colored series were chosen against white
  and a pale blue ground makes some of them read as one. Every other panel
  keeps the sky tier.

## [2.2.3] - 2026-10-27

### Changed

- The card surface is sky blue. It was a sandy camel in 2.2.1 and 2.2.2, which
  read yellow against the blue header, and then a near-white in between; what
  was wanted is the pale sky blue of a clear day. Cards are now `#cfe7f7` on a
  lighter sky page (`#eaf3fb`), so the ramp runs navy header, blue month strip,
  sky panels.
- The bottom bar and shadows follow the same cool palette, so nothing on the
  screen keeps a warm cast.
- Secondary text darkened to `#42505f` so it still reads on sky blue: black
  text sits at 13:1 and secondary at 6.5:1.
- The three counters under the summary are no longer three identical boxes.
  Each carries a soft wash of the color its number already uses - green for
  income, red for expenses, blue for net - so the row reads by color before the
  labels are read.
- Income moved from turquoise `#00bfa6` to green `#0b8f4a`. On the sky surface
  the old turquoise managed 1.8:1 - effectively decorative rather than
  readable - and it read as teal, not as the green the owner asked for. The new
  green reaches 3.3:1 for those large figures and 4.6:1 for white text on it.

## [2.2.2] - 2026-10-27

### Fixed

- v2.2.1 shipped no Android APK. Bumping the version with a shell command
  prepended an invisible byte-order mark to `mobile/pyproject.toml`, Briefcase
  rejected the file with `Invalid statement (at line 1, column 1)`, and the
  Android job died - while the release itself published with its desktop builds
  and gave no sign that the phone build was missing. Both files are BOM-free
  now, and a test fails if one ever reappears.
- The colour work in v2.2.1 is unchanged in this release; it simply never
  reached a phone, because there was no APK to install it from.

## [2.2.1] - 2026-10-27

### Changed

- The screen now reads as one colour ramp instead of a white page with a blue
  strip on top: a navy header carrying the app name, a blue month strip, and
  beige cards, stat boxes and summary panel underneath. The three surfaces are
  CSS variables, so the dark theme answers with the same hue at dark values
  rather than beige, which would glare.
- The budget summary panel no longer paints itself solid blue from an inline
  style. It sits on the beige tier like the panels below it and keeps its color
  in the amounts, which is where the color was doing work.
- The panel's own text, the progress bar and the pace line were still written
  as white-on-blue inside the JavaScript that renders them, so the first beige
  shipped them invisible: a white "0" and white captions on a beige card. They
  now use the theme's text colors, and the progress bar fills blue (red when
  over budget) instead of white-on-white.
- Secondary text on light cards went from `#6b7280` to `#525a67`, and the month
  strip blue from `#1a73e8` to `#1665cf`. Both landed at 4.5:1 against the
  surface they now sit on - exactly on the WCAG AA line, which a rounding
  difference in a gate could fail - and now sit at 4.9:1 and 5.5:1.

### Fixed

- The About panel reported `v2.1.0-web` on the hosted build through two
  releases. `apishim.js` carries its own version string and nothing compared it
  to the package; a test now does, so the two cannot drift again.

## [2.2.0] - 2026-10-26

### Added

- Optional cross-device sync. On the Settings page a user can create an
  account or sign in, and the whole budget then mirrors to a private cloud
  document that only their account can read or write (enforced by Firestore
  rules, not by the client). Everything works exactly as before when signed
  out: the device's own storage stays the source of truth, and no network is
  used until someone signs in on purpose.
- When the same account is used on two devices, the last change wins. The one
  case that cannot be settled by time alone — a first sign-in while both the
  phone and the cloud already hold a different budget — is never resolved on
  the user's behalf: the app shows an explicit "which copy should win" choice,
  because the phone's browser cannot rely on pop-up dialogs (a pop-up answers
  itself there, which would have silently overwritten one side).

### Security

- The cloud store is closed by default: `firestore.rules` lets a signed-in
  user read and write only their own document, forbids deleting it, and denies
  everything else on the database to everyone. The web API key is a public
  identifier; these rules, not the key, are the access control — verified
  against the Firebase emulator and live project.
- A pulled cloud document goes through the same migration the app demands of
  its own backups and is refused before any write if it is foreign or from a
  future version; the document it would replace is kept aside first, so a wrong
  pull can be undone.

## [2.1.0] - 2026-10-25

### Added

- One face for both devices. The published web page is now the mobile app
  itself: the same five pages, the same header, the same behaviour. Since a
  Pages visitor has no on-device server, a small shim answers the same
  `/api/*` routes from browser storage — and on the phone, where the real
  server is listening, the shim stays entirely out of the way, so one file
  set ships to both.
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

### Fixed

- A push to `main` no longer fails when the repository has no GitHub Pages site:
  the web workflow asks GitHub whether Pages is configured and skips the deploy
  with a notice, instead of failing inside `configure-pages`.

## [2.0.3] - 2026-10-25

### Added

- The app icon sits beside the app name in the header of both faces, and
  the name is written in Cairo (the web loads it from Google Fonts; the
  mobile app does too, falling back to the system face while offline).
  The web page also carries it as its favicon.

### Fixed

- `Web Build and Deploy`: the Pages-deploy job ran its steps in the `web`
  working directory it never checks out, so bash could not start and every
  push to `main` went red — and after Pages was enabled, the site still
  never published. The check step now runs at the repository root, and the
  web bundle includes the icon.

## [2.0.2] - 2026-10-25

### Added

- The web app carries the same header as the mobile app: the app name in
  bright white on a blue rounded banner, with the tagline in pale white
  beneath it. The two faces of the product now open looking like one app.
  (The web layout was already fluid for tablets — a centred container that
  widens with the screen — so it needed no tablet work.)

## [2.0.1] - 2026-10-25

### Fixed

- **Security: user-typed text is escaped before it is rendered.** An entry
  name, a category, a goal name, or a description cell inside a pasted bank
  statement used to be written back into the page as HTML. Markup in any of
  them ran as part of the app, in the context that can read and rewrite the
  whole budget. Every such render now passes through an escaping function.
- **Security: the local API no longer answers
  `Access-Control-Allow-Origin: *`.** The WebView is served from this very
  server and calls it same-origin, so the header was never needed — it only
  widened the reach of the hole above to any other origin on the device.
- `build-and-release`: a failing iOS build leg can no longer stop the Android
  APK from being attached to a release. The APK is built either way; the iOS
  artifacts are best-effort.

### Added

- A header for the app: its name in bright white on a blue rounded banner,
  the same on every page. The system title bar is hidden on Android, so this
  strip is the only header there is, and until now it carried the name of
  whichever tab was open instead of the name of the app.
- Tablet layout. The phone layout was a 480px column that sat in empty grey
  on a tablet; the column now widens with the screen — to 620px, 740px and
  820px at 600px, 840px and 1100px — and the goals list re-flows into
  columns on wide screens instead of stacking one card per screen-width.

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
