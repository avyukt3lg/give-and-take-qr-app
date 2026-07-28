# React host dashboard — composition and hierarchy audit

Working document for the post-cutover refinement pass. Findings are measured on
the deployed build, not inferred from source. Each slice is verified on the
public URL before it is called done.

Canonical URL:
<https://avyukt3lg.github.io/give-and-take-qr-app/website/host-dashboard/>

Source of truth: `react-migration/` (its own git repo, branch `main`, deployed by
GitHub Actions). `website/host-dashboard/` at the repository parent is dead
legacy code and is not edited.

## Measurement baseline

Measured 2026-07-28 against production commit `b100369` in Chrome at a 1440-wide
window (742 CSS px viewport) and, for the entry surface, in same-origin iframes
sized to exact acceptance viewports so that height-dependent media queries and
`svh` resolve correctly. Window-level resize was unreliable in this environment;
the iframe harness is the reproducible method.

## Confirmed defects

### Entry surface

| # | Defect | Measured evidence (before) |
| --- | --- | --- |
| 1 | Primary CTA below the fold | `.access-submit` bottom at 742 px in a 686 px viewport; 750 px in a 723 px viewport. Every access mode was affected. |
| 2 | Inverted hierarchy | `.access-tabs` occupied 217→387 px while the panel heading (`.access-form header h2`, "Table entry / Host a table") rendered at 440 px — below the selector it was supposed to label. |
| 3 | Dead zone below the console | Hero content ended at 847 px, `.entry-chapters` first content began at ~1121 px: 274 px of empty page, produced by 101 px of hero bottom padding plus 173 px of section padding. |
| 4 | ASCII panel degrades to noise at mid-scroll | Open. Caption "BOX ARTWORK TRANSLATED LIVE INTO A SAMPLED TABLE SIGNAL" over-promises relative to what renders at lower quality tiers. Scheduled for slice 3. |

### Command Deck

| # | Defect | Measured evidence (before) |
| --- | --- | --- |
| 5 | Marketing headline in an operational console | `header.surface-intro` occupies 146→418 px (272 px) on Setup, carrying "Build the table before the first roll." |
| 6 | "Now" zone pushed down | `section.setup-now` starts at 476 px; the roster (`.setup-layout`) starts at 722 px, entirely below a 742 px fold. |
| 7 | Table code repeated four times | `aside.command-rail .table-code-block` (top 88), `header.workspace-header .header-code` (top 38), the "Copy GT-…" button in `.surface-intro__aside` (top 333), and `section.setup-now .metric` (top 539). |
| 8 | Verbose rail item descriptions | Seven rail buttons at 76 px each; nav spans 157→689 and the rail footer runs 689→835, overflowing a 742 px viewport by 93 px. |

## Slice 1 — entry fold and hierarchy (defects 1–3)

### Changes

- `features/entry/EntryScreen.tsx` — added `.entry-console__head` ("Table
  entry" / "Enter the table") above the access-mode selector, so the panel
  heading labels the panel instead of floating between the selector and the
  fields.
- `features/entry/AccessForm.tsx` — removed the per-mode display heading that
  caused the inversion. The active mode is now confirmed by a compact
  `.access-form__mode` line (title plus qualifier) directly under the selector,
  and the form carries `aria-label={item.title}` so the mode is still announced.
  The preview block collapsed from a heading-plus-paragraph pair to a single
  paragraph.
- `styles/surfaces.css` —
  - hero block padding `clamp(3rem, 7vw, 7rem)` → `clamp(1.75rem, 3.2vw, 3.75rem)`;
  - artwork min-height `34rem` → `min(34rem, 62svh)` so the hero can compress on
    short viewports instead of forcing the row taller than the screen;
  - access-mode tab min-height `5.3rem` → `4.5rem`;
  - `.entry-chapters` top padding `clamp(6rem, 12vw, 13rem)` →
    `clamp(3rem, 5vw, 5.5rem)` with a `border-top` rule, so the hero/chapters
    boundary reads as a deliberate band rather than a hole;
  - short-height tiers rewritten. The former single `max-height: 680px` rule
    became `max-height: 840px` (moderate tightening) and `max-height: 730px`
    (selector collapses to one row of four, hints hidden, hero top-aligned,
    display type capped);
  - at `max-width: 900px` the console now takes `order: 2` and the artwork
    `order: 3`, matching the existing `max-width: 520px` behaviour so the
    primary action is never buried behind the artwork on tablet widths.

### Verification (after)

Submit-button bottom edge versus viewport height, measured per access mode in
exact-size iframes:

| Viewport | Host | Join | Log in | Sign up |
| --- | --- | --- | --- | --- |
| 1440×900 | 757 | 808 | 783 | 864 |
| 1280×720 | 487 | — | — | 608 |
| 1280×640 | 487 | 536 | 511 | 608 |

All twelve combinations fit without scrolling. Hierarchy reads panel heading →
mode selector → mode confirmation → fields → action. The hero-to-chapters gap
fell from 274 px to 78 px with a rule marking the transition.

Checks run: `typecheck`, `lint`, `test` (85/85), `build`, `check:artifact`,
`test:e2e --project=desktop-chromium` (11/11).

Evidence: [`evidence/react/slice1/`](evidence/react/slice1/) — `before-live-*`
captured from the deployed pre-slice build, `after-*` from the local production
build at the same viewports.

### Environment note

`NODE_ENV=production` is exported in this machine's shell. `npm ci` under it
installs production dependencies only, and a stale mixed `node_modules` made
`vitest` report 13 spurious `React.act is not a function` failures. Unset
`NODE_ENV` before installing or running any check locally.

## Full-surface survey (2026-07-28, after slice 1)

Captured with `scripts/survey-surfaces.mjs` against the dev fixture
(`?fixture=host`) at 1440×900: all seven host surfaces in Table, plus Setup,
Play and Market in Classroom and Contrast. Files in
[`evidence/react/survey/`](evidence/react/survey/).

New defects, none of which the deterministic review can see:

| # | Defect | Evidence |
| --- | --- | --- |
| 9 | Play headline sits under the sticky workspace header at rest | `main h1` top = 83 px while `.workspace-header` occupies 0→88 px, `scrollTop` = 0. "Aanya owns the table." is occluded before the user touches anything. |
| 10 | Defect 5 is systemic, not Setup-only | Every surface opens with 200–280 px of display headline before operational content. Market's is three lines ("One fictional market. Every screen in sync.") and pushes the price tape to 545 px. |
| 11 | Stale phase eyebrow on every surface | The workspace header reads "TURN TABLE · ROLL" on Market, Ledger, Scores, Export and Help. The Play phase label leaks into surfaces it does not describe. |
| 12 | Themes do not theme the whole system | In Classroom and Contrast the command rail renders identically to Table — dark ink against a parchment or true-black workspace. The requirement is that a theme alters the complete component system. |
| 13 | Market palette is off-system | The seven price cards use blue, teal, orange, red, purple and yellow accents with matching sparklines. This is outside the moss/parchment/brass/chartreuse palette and is the finance-terminal cliché the design language explicitly excludes. |
| 14 | Board strip overflows without affordance | The S00–S43 strip on Play clips mid-cell at the right edge with no scroll indication. |

### Deterministic review

`npx @21st-dev/cli@1.15.0 review website/host-dashboard/src` — 103 files, 122
findings, zero errors or warnings. 120 are `design-hardcoded-color` (info) in
`surfaces.css`, two are `responsive-overflow-hidden` (info) inside the vendored
`command` and `select` shadcn primitives. The defects that matter on this
project are compositional and only surface by looking at rendered states.

### On rebuilding the ASCII engine

`components/effects/ascii/` is already a complete implementation of the
Benjamins pipeline: `preset.ts` is byte-identical to the published parameter
set, `types.ts` declares all 25 render modes and all five animation styles, and
`engine.ts` executes the documented order — background, primitives, tint, blur,
post-effects, lights, mask reveal — across `engine.ts` (846), `renderers.ts`
(600), `sampling.ts` (493), a Web Worker, and a dev parameter lab. A
from-scratch rewrite would reproduce the same architecture and re-introduce
solved problems in the worker handoff, quality tiers and `SceneOrchestrator`
arbitration. The open defect is legibility at the entry hero's settings, not
missing capability.

## Open slices

2. Command Deck hierarchy — defects 5–8.
3. ASCII/canvas legibility across quality tiers and themes — defect 4.
4. Full sweep: every surface × three themes × seven widths, keyboard, reduced
   motion, canvas-failure fallback, realtime.

---

## Slice 0 — design-language recovery (shipped)

Full extraction in `docs/design/legacy-design-language.md`; legacy captures in
`docs/design/evidence/legacy/`, post-change captures in
`docs/design/evidence/react/slice0/`.

Landed in the token layer:

- **Instrument Serif restored as the display face.** Self-hosted (the CSP is
  `font-src 'self'`), 43 KB for both cuts, with Newsreader kept as fallback.
  `"Newsreader", Georgia, serif` was hardcoded 23 times in `surfaces.css`, which
  is why the display face never followed the token; all 23 now use
  `var(--font-display)`. Set in Newsreader the entry headline needed four lines;
  in Instrument Serif it needs two, as the approved design did.
- **Rules are translucent again** — `--line` moved from an opaque `#34382c` to
  `rgb(232 225 210 / 0.11)`. This alone removes the olive grid that made the
  entry page read as a table.
- **Motion, spacing and type scales added.** None existed. `surfaces.css` —
  5,705 lines — contained two `transition` declarations in total. The four
  duration classes map to the timing contract.
- **Missing tokens restored**: `--canvas-sunk`, `--surface-strong`, `--felt`,
  `--ink-dim`, `--ink-faint`, `--brass-soft`, `--signal-soft`, the three-step
  radius (controls are 2px again), `--shadow-low`, `--shadow-high`, and the
  double-ring `--focus-ring`.
- **Palette re-warmed** to the approved values: ink `#e8e1d2`, brass `#b18a43`,
  signal `#c8f04a`, danger `#e2705e`.
- **Contrast theme rescued.** It was `--brass: #ffff00`, `--signal: #00ff66`,
  every surface flat black, `--muted` equal to `--ink` so all text hierarchy was
  gone. It is now a high-contrast rendering of the same palette with four
  surface steps and three ink steps.
- **`#00ff66` leak removed** from `surfaces.css` — the ASCII tint is a parameter
  of that effect, not a UI colour.
- **Reduced motion now means "no positional animation", not "no feedback".**
  The blanket `transition-duration: 0.01ms` made every control feel dead; colour
  and opacity now still transition, under 120 ms.

### Correction — defect 12 is not real

The survey harness I added in slice 1 passed `setTheme` to `page.evaluate` as a
**string**, so Playwright evaluated it as an expression and discarded the
argument. The theme was never applied, and every `classroom-*` and `contrast-*`
file in `docs/design/evidence/react/survey/` is actually the Table theme. The
claim that "in Classroom and Contrast the command rail renders identically to
Table" was an artefact of that bug, not a finding.

With the harness fixed, both themes apply correctly across the rail, header and
primitives — see `evidence/react/slice0/survey/classroom-2-play.png` and
`contrast-3-market.png`. **Defect 12 is closed as not-reproducible.** The theme
work remaining is the Market palette (defect 13), which is real and is worse in
Contrast, where seven hues compete against a pure-black ground.

Two supporting fixes:

- `scripts/survey-surfaces.mjs` now seeds the theme into stored UI preferences
  before boot, uses a fresh context per theme, and **asserts** that
  `html[data-theme]` matches before capturing, so it can no longer produce
  mislabelled evidence.
- `app/fixture.ts` was discarding stored UI preferences (`ui: {}`), so
  `?fixture=host` could not exercise themes or reduced motion at all. Session,
  auth and backend are still discarded; UI preferences are now honoured.

### Confirmed still open after slice 0

Defects 4, 5, 6, 7, 8, 9, 10, 11, 13, 14 all reproduce. Defect 9 is especially
clear in `evidence/react/slice0/survey/classroom-2-play.png`, where "Aanya owns
the table." is clipped by the sticky workspace header at rest. Defect 13 is
clear in `contrast-3-market.png`.
