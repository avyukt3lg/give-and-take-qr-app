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

---

## Slice 1 — Command Deck hierarchy (shipped, `a039204`)

Measured with `scripts/measure-deck.mjs`, added this slice, at 1440×900 and
1280×742. Numbers verified twice: once on the dev server and once against a
`--mode test` production build served by `vite preview`, because the fixture is
correctly gated to DEV/test and the Deck therefore cannot be measured on the
public URL without creating a real Supabase table.

| Defect | Before | After |
| --- | --- | --- |
| 5 / 10 — marketing headline | Setup intro 272 px (146→418); every surface 200–280 px | Setup 55 px, Market 103 px, all seven 55–103 px |
| 6 — Now zone below the fold | Now 476, roster 722, fold 742 | Now 225 / 218, roster 483 / 473 |
| 7 — table code ×4 on Setup | rail, header, intro Copy button, Now metric | rail + Now metric; header code is now ≥901 px hidden, Copy moved beside the code |
| 8 — rail overflow | nav 157→689, footer 689→835, overflows 742 by 93 | nav 157→596, footer ends at 742, no overflow |
| 9 — Play headline occluded | intro top 58, header bottom 88 | intro top 146 / 139 on all seven surfaces |
| 11 — stale phase eyebrow | "TURN TABLE · ROLL" on Market, Ledger, Scores, Export, Help | "Aanya · Roll" — the live player and phase |

### How each was fixed

`SurfaceIntro` is shared by all seven surfaces, so defects 5 and 10 were one
change. Its `title` is now the directive — what the host does here — set at
`--fs-h3` rather than up to 91 px. The surface is already named by the `h1` in
the workspace header, so the `h2` states the task instead of repeating the
name, which keeps the heading order valid (h1 surface → h2 task → h3 sections)
without touching the twenty `h3`s.

Defect 9 had a root cause worth naming: `focusMain` called
`focus({ preventScroll: false })`, so the browser scrolled `#main-content`
flush to the viewport top and the sticky header then covered the first 88 px of
the surface. `window.scrollY` was exactly 88 on Play. Focus still moves for
screen readers; the scroll to the top of the new surface is now explicit, and
`scroll-margin-top` guards any future in-page scroll.

Defect 8 keeps the descriptions accessible — every rail button carries the full
`label — description` on `aria-label`; only the current destination renders it
visually.

### Note on defect 7 and Export

Export still shows five visible instances of the code, but four of them are
content rather than chrome: the archive's own identity, an `h2` and a footer
inside the printable teacher-review sheet, and the raw JSON preview. A document
preview that contains the table code is not a duplicate of the chrome. Left as
is.

### Test brittleness found

Three e2e specs used the marketing string "Build the table before the first
roll." as their "Setup has loaded" signal. They now assert the `h1` surface
name, which is what actually identifies a surface and does not change when copy
does. 11/11 desktop-chromium pass.

### Still open

Defect 4 (ASCII legibility), 13 (Market palette — seven competing hues, worst
in Contrast), 14 (board strip clips mid-cell with no scroll affordance, clearly
visible in `evidence/react/slice1b/survey/table-2-play.png`).

---

## Slice 3+4 — ASCII legibility and the entry hero (shipped, `88dc78a`)

Live and verified: Instrument Serif regular and italic load from the public
URL, no console errors, `data-entry-state="settled"` reached.

### Defect 4 — closed

The engine was never the problem. Three things made the frame unreadable, all
in the configuration and the source:

- `progressivePosition: 55` hides every cell where `(x + y) / 2 > 0.55`, cutting
  roughly the bottom-right half of the field on a diagonal.
- The source was the dark product-box photo; dithering it lights few cells.
- `tint: #00ff66` belongs to no theme here, and `glitch` and `chromatic`
  displace cells.

`BENJAMINS_DITHER_PRESET` is untouched. `createEntryBoardPreset` derives the
entry config: full field, grayscale then a single-hue tint, no displacement,
and a coverage/contrast floor per quality tier so weak hardware degrades to a
coarser board rather than to noise. Tint and ground resolve from the live theme
through `useThemeTokens`, because a canvas cannot read CSS custom properties.

At cell size 7 the board border, the track and the GIVE AND TAKE lettering all
read — see `evidence/react/hero/board-settled-1440.png`. In the hero the field
is full-bleed atmosphere, so the caption there is deliberately modest.

### Hero composition

Two zones instead of three; the artwork is a full-bleed layer behind the fold
rather than a bordered panel between two columns. Headline restored to the
Ricardo Chance treatment the approved design named explicitly — 17ch,
`clamp(42px, 6.4vw, 96px)`, line-height 0.92, letter-spacing -0.022em. At 11ch
the display face was forced into four lines. Registration marks, the vertical
chapter index and the persistent status band are back.

The one legacy flaw not carried forward: the approved design ran the texture
under the body copy, which failed contrast. A horizontal mask keeps the copy
column clean and gives the field the right two thirds.

### Three defects found only by running it in a real browser

1. **Background-tab load left the headline invisible.** A reveal starting at
   opacity 0 and driven by rAF never runs while the document is hidden. Copy
   must not depend on an animation to become readable — hidden at mount now
   means start settled.
2. **The raster fallback showed the raw board photograph as the page
   background** any time the canvas had not yet painted, once the frame's
   opaque ground was removed. It is now visible only on actual failure.
3. **The artwork overscan widened `documentElement.scrollWidth`.** The hero
   clips it. Verified at 1440, 1280, 900, 768, 390, 320.

### CI failed twice before this landed — worth recording why

The runner failed while macOS passed, and the first two attempts at a fix were
guesses that did not hit it. Reading the actual log gave two real defects:

- The chapter index used `--ink-faint` at 0.55 opacity, compositing to
  `#504e45` on the artwork ground — 2.4:1 against 4.5:1. `aria-hidden` does
  not excuse contrast; a sighted user still reads it.
- axe sampled the brass italic mid-entrance and measured 2.4:1. Text that
  fades in is below its contrast ratio while it is fading. That is a state no
  user reads, but nothing told the audit when the page had settled. The page
  now reports `data-entry-state` and the spec waits for `settled`.

Both were timing-dependent, which is why a faster machine passed. The workflow
now uploads the Playwright report and traces on failure, so the next runner
failure is readable rather than reproducible only by guessing.

### Still open

Defect 13 (Market's seven competing hues, worst in Contrast) and defect 14
(board strip clips mid-cell with no scroll affordance). The Command Deck motion
layer — Now-zone re-key, rail marker, number tickers, phase strip, connection
states — is not started.

## Slice 5 — defects 13 and 14

Both re-verified before the fix and after. Evidence in
`evidence/react/slice5/survey/` (seven surfaces in Table, three each in
Classroom and Contrast, captured from a `--mode test` build served by
`vite preview`).

### Defect 13 — the market palette was off-system

Worse than the audit recorded. The seven `asset.color` values in
`game_data/game_config.json` are Tailwind's default palette verbatim:

| asset | hex | Tailwind |
| --- | --- | --- |
| cash | `#22C55E` | green-500 |
| bond | `#3B82F6` | blue-500 |
| index | `#14B8A6` | teal-500 |
| growth | `#F97316` | orange-500 |
| crypto | `#EF4444` | red-500 |
| ethical | `#8B5CF6` | violet-500 |
| trend | `#EAB308` | yellow-500 |

They reached the screen through an inline `--asset` custom property set in five
components, not one: `MarketView`, `LedgerView`, `HelpView`, `TableDisplay` and
`PlayerAssist`. Fixing only the market tape would have left `.projection-band`
drawing a 3px Tailwind-orange bar across a **projected classroom display** —
the worse offence for this product, and the one the design language's "fails on
a projector at 2m" test exists to catch. One encoding change fixed all five.

**What replaced it.** Not a hue substitution. Asset *identity* was never
carried by the colour — every card already states the ticker ID in mono caps and
the full asset name beneath it, and no legend mapping hue to asset existed
anywhere in the app. Seven competing hues were decorative data, which the
language excludes explicitly.

So the mark now carries **risk**, which is the one asset attribute that is
ordinal, that a host needs at a glance, and that had *no* visual encoding at all
— it was buried in a `<small>` as "Risk 5". `--asset-mark` and `--asset-rule`
resolve `data-risk` to an ink weight and a rule thickness: risk 1–3 on a
three-step ink ramp, risk 4–5 on `--warning`. The rule width scales 1px → 5px.

Two things this gained beyond removing the hue:

- The two risk-5 assets — Crypto-Style Asset and Unverified Trend — now cluster
  visually for the first time. That is the game's teaching point, and it was
  previously invisible: red and yellow read as unrelated.
- The sparkline stroke weight is now risk-derived, so a volatile line also reads
  as a heavy one. Seven coloured traces on one screen were the worst single
  instance of the old palette.

**Contrast keeps the ramp.** The pre-existing rule flattened every asset rule to
a constant 5px in Contrast, which would have erased the encoding in the theme
that needs it most. Contrast now widens each step by a constant instead (3px →
7px), and the three ink steps are re-derived at 0.62 / 0.82 / 1.0 white so each
clears AA against pure black on its own rather than relying on opacity.

**An accessibility problem the fix introduced, and the fix for it.** Encoding
risk as weight put information into appearance in three views that did not state
risk in text — WCAG 1.4.1. Corrected in the same slice: the projection band now
prints `risk N` beside the asset name (useful on a projector regardless), the
assist holdings row includes it in the existing `<small>`, and the ledger
dossier bar is `aria-hidden` with an `sr-only` equivalent. `asset.color` remains
in the schema and the JSON untouched — it describes the printed components, and
nothing was changed for visual reasons.

**Also found:** `HelpView` read "The six fictional categories" while the config
has carried seven assets. Now counted from `game.assets.length` so it cannot
drift again.

### Defect 14 — the board strip overflowed without affordance

`.board-route` already had `overflow-x: auto`; it scrolled but never said so,
clipping mid-cell at the right edge.

**progressive-blur was not the right tool, and was not used.** The brief
suggested it. These 44 cells carry the S-codes and space labels the host reads
off the screen to match against the physical board — blurring the edge cells to
advertise that the strip scrolls trades legibility for a hint. That is the trade
the design language forbids: more expressive, no more legible. A fade to the
strip's own ground says the same thing without degrading the text.

**The real defect was worse than the cosmetic one.** The strip is 44 cells and
shows about eleven. The active player's pawn could sit entirely outside the
fold, so the single thing a host most needs — where the current player is —
required hunting. `BoardRoute` now re-centres the active cell whenever the
position or current player changes. Under reduced motion that is a jump rather
than a glide: a designed static outcome, and the cell still ends up centred.

Three implementation notes worth keeping:

- **The fade is an overlay on a wrapper, not a mask on the scroller.** The
  scroller is `tabIndex=0`; `mask-image` clips the element's own focus ring, so
  masking it would have made the focus indicator partly invisible.
- **The first attempt hung the fades off `.board-route-frame`**, which contains
  the range line as well as the strip. The gradient painted over the text —
  visible in the first capture as "SHOWING" rendering as "HOWING" and the hint
  clipped mid-word. A dedicated `.board-route-viewport` bounds them.
- **`scrollTo` needs a fallback.** jsdom does not implement it at all (two unit
  tests failed on `scroller.scrollTo is not a function`), and older Safari
  accepts only the `(x, y)` signature. Assigning `scrollLeft` is the fallback;
  the cell ends up centred either way and only the easing is lost.

**Paired with a text equivalent.** `Showing S07–S17 of 44 spaces` plus a scroll
hint, both derived from measured scroll position via a new
`useScrollOverflow` hook. Without it the fact that the route continues would
live in a gradient alone. Contrast drops the fade entirely and relies on the
text, since a soft edge is exactly the subtle cue that theme exists to remove.

`useScrollOverflow` is deliberately general — the ledger and scores tables have
the same `overflow-x` pattern and will want it in the sweep.

### Verification

`typecheck` clean · `lint` 0 errors, 4 pre-existing `react-refresh` warnings ·
85/85 unit · `check:artifact` verified 44 spaces and 81 cards · 11/11
`desktop-chromium` e2e including the axe audit across Table, Classroom and
Contrast.

## Slice 6 — the Command Deck motion layer

Evidence in `evidence/react/slice6/`: `survey/` for the settled states across
three themes, `motion/` for a frame sequence across a real phase advance plus
the machine-checked report.

Every effect below has a one-sentence answer to "what does this tell the user?"
recorded in the source next to it. Nothing here is present because it looks
good, and two candidate effects were rejected outright — see the end.

### Verifying motion, rather than asserting it

Static screenshots cannot prove an animation ran and cannot prove it did not
shift the layout, so `scripts/verify-motion.mjs` drives a genuine Roll → Resolve
advance and samples eight frames across it, in both the animated and the
reduced-motion state. Current output:

```
ok  animated: blur-fade observed mid-transition (opacities 0.43, 0.98, 1.00, ...)
ok  animated: instruction never drops below 0.35 opacity (min 0.43)
ok  animated: Now zone box unchanged through the transition ({x:355,y:331,w:1042,h:272})
ok  animated: phase advanced Roll -> Resolve
ok  animated: underline travelled (x 356 -> 616)
ok  reduced: instruction fully opaque immediately (1)
ok  reduced: no blur left applied (none)
ok  reduced: phase still advanced Roll -> Resolve
ok  reduced: active phase is still marked — the state is designed, not disabled
PASS (12 checks)
```

Two traps the harness itself fell into, both worth keeping:

- **The die is a two-step control.** Selecting a face does not advance the phase;
  it has to be committed with "Record die and show destination". The first run
  reported `Roll -> Roll` and every downstream check failed for the right
  reason — nothing had happened.
- **Playwright's element screenshots scroll the target into view**, so a
  `getBoundingClientRect().y` reports the *page scrolling* as layout drift. The
  first version of the stability check failed with `y: -233 -> -1`, which was not
  a layout shift at all. Geometry is now document-relative.

### Now-zone re-key — enter-only, and not `AnimatePresence`

The brief's most important motion. A host looks away to move a pawn; on looking
back, an instruction panel that swapped silently is indistinguishable from one
that never changed, and following a stale instruction is a real failure mode.

The obvious implementation is wrong. `AnimatePresence mode="wait"` runs the
outgoing exit to completion *before* the incoming enter begins — 340ms of empty
panel, then 340ms of fade, on every phase change. An instruction the host cannot
read for a third of a second is worse than one that swaps silently.
`mode="popLayout"` is no better: it pulls the outgoing child out of flow and
collapses the zone.

So `NowRekey` changes the child's `key` and animates only the arriving content,
and it starts at **opacity 0.4, not 0** — the text resolves into focus rather
than appearing from nothing, so the panel is legible on the first frame and the
change still registers. Measured minimum across the transition: 0.43.

Its change key is deliberately narrower than the `transitionKey` already in
`PlayView`. That key includes the pending physical confirmations, so re-keying on
it would blur-fade an instruction whose text has not changed every time the host
ticks a checkbox.

### Phase advance — a travelling underline

Was `box-shadow: inset 0 -3px var(--signal)` on `[data-active]`, which can only
swap instantly. Now one element shared across the four steps via `layoutId`, so
advancing moves it: measured travel x 356 → 616. The four phases are a sequence
the host walks through, so direction of travel is information, which is why this
is a shared layout rather than four cross-faded underlines.

The active step still changes background and ink, so it is never identified by
the underline alone — and under reduced motion the underline appears at the
active step instead of travelling to it.

### Connection state — four channels, not a dot

The defect was real and worse than "differentiated only by a dot colour": the
whole distinction between synced, saving and offline was the fill of a 0.55rem
circle, plus the **raw state word** rendered directly (`saving`, `offline`,
`idle`) with `text-transform: capitalize` to make it look intentional.

`SyncIndicator` gives each state a distinct glyph, a real word, a rule weight and
only then a colour:

| state | word | glyph | weight |
| --- | --- | --- | --- |
| `saved` / `idle` | Synced / Ready | check | 1px |
| `saving` / `connecting` | Saving / Connecting | refresh | 1px + pulse |
| `offline` | Offline | cloud-off | 3px danger |
| `error` | Sync failed | warning triangle | 3px danger |

The slow pulse runs **only while a request is genuinely in flight** — never on a
settled or broken table, where a moving element beside a control is noise. It
animates opacity alone so it cannot shift the row. Under reduced motion the pulse
is replaced by a rule weight, so "busy" stays distinguishable without movement.

Broken states escalate to `role="alert"` / `aria-live="assertive"`, because a
table that has stopped reaching the server interrupts what the host is doing. A
routine save stays `role="status"` / polite.

The revision counter moved here from beside the table code, which is where it
means something — it is the host's proof a save landed, so it belongs next to the
connection state. It is ticked, and its slot has a reserved `min-width` so an
arriving revision cannot reflow the row.

### NumberTicker — rewritten, not adopted as-is

The vendored Magic UI component had three problems for an operational surface:

1. **`useSpring({ damping: 60, stiffness: 100 })` has no duration guarantee** and
   settled well past a second. The contract caps this class at 400ms, so it is
   now a fixed tween at 340ms.
2. **It rendered `startValue` on mount.** A metric could display `0` — or the
   previous figure — while the host was reading it. On a surface where the host
   reads cash and portfolio off the screen that is a correctness bug, not a
   polish issue. The committed value is now the first paint, and animation only
   ever runs from a genuinely previous value.
3. **Accessibility was left to every call site.** `MarketView` hand-rolled the
   `aria-hidden` + `sr-only` pair; `ScoresView` did not, so a screen reader there
   was read mid-tween digits. Handled once, inside the component. Both call
   sites lost their workarounds.

Added a `format` callback so `formatMoney` can drive cash and portfolio.
Position is deliberately **not** ticked: counting through S09, S10, S11 would
imply the pawn travelled those spaces, and on this board it may not have.

**Unexpected result: initial JS fell from 230.57 KB to 159.07 KB gzip.** Dropping
`useInView`, `useSpring` and `AnimatePresence` shed Motion's scroll-tracking and
presence systems. `layoutId` still pulls in the layout animation system and the
underline demonstrably travels, so this is a real 71 KB saving rather than a lost
feature.

### Copy feedback — confirmation at the control

The only confirmation for copying the table code was a message in a live region
elsewhere on the page: correct for a screen reader, invisible to a host looking
at the button they just pressed. The table code is how players join, so the host
needs to know it is on the clipboard before pasting it.

This required an honest contract change. `copyText` now returns
`Promise<boolean>`, and `onCopyCode` / `onCopy` return it, because a control
cannot truthfully confirm an outcome it was never told. `CopyButton` shows the
confirmed state for 2s and **changes its label**, so the state is not carried by
a glyph or a colour alone. Failure is deliberately not shown at the control:
`copyText` already raises an assertive message, and the honest outcome of a
failed copy is that the button simply does not confirm. Applied to the Export
JSON copy too — same defect.

### Rejected

- **`progressive-blur` on the board strip** (slice 5, recorded above) — trades
  the legibility of the S-codes for a hint.
- **Ticking the position metric** — would assert movement the pawn did not make.

### Not yet built

Rail destination `layoutId` marker, evidence/ledger row stagger, export
determinate progress, theme clip-path wipe, and the entry → Deck transition.
The four primitives that the rest depend on — `NowRekey`,
`TravellingUnderline`, the rewritten ticker, and the measured-state indicator
pattern — are in place, and `scripts/verify-motion.mjs` is the harness to prove
the remainder.

### Verification

`typecheck` clean · `lint` 0 errors, 4 pre-existing warnings · 92/92 unit (7 new
in `test/ui/deck-feedback.test.tsx` covering the copy confirmation, the three
sync states, the pulse gating, and the ticker's committed value) ·
`check:artifact` verified 44 spaces and 81 cards · 11/11 `desktop-chromium` e2e
including the axe audit and the reduced-motion/forced-colors spec · 12/12 motion
checks.
