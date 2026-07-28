# Legacy design language — extraction and drift list

**Source of truth:** `website/host-dashboard/styles.css` (149,735 bytes, pre-React).
**Captured:** `docs/design/evidence/legacy/` — entry at 1440/1280/768/390, plus
scroll positions 33 % and 66 % where the chapter mechanic lives.
**Compared against:** `react-migration/website/host-dashboard/src/styles/globals.css`
(212 lines) and `surfaces.css` (5,705 lines) at `185c98c`.

This document is the authoritative work queue for the visual port. Where it and
the defect list in the session brief disagree, this document wins, because it is
derived from the stylesheet rather than from rendered symptoms.

---

## 1. Colour ramp

### 1.1 Table theme (default, `:root`)

| Token | Legacy | Role |
| --- | --- | --- |
| `--bg-void` | `#0b0c0a` | page ground |
| `--bg-deep` | `#070806` | inset wells, below-ground |
| `--surface-1` | `#101310` | primary panel |
| `--surface-2` | `#161a15` | card on panel |
| `--surface-3` | `#1d231c` | raised / hover |
| `--felt` | `#1d2a22` | **board and table surfaces only** — the one green in the system |
| `--parchment` | `#e8e1d2` | primary ink |
| `--parchment-dim` | `#b4ae9f` | secondary ink |
| `--parchment-mute` | `#8c8779` | tertiary ink, captions, eyebrows |
| `--brass` | `#b18a43` | display italics, numerals, links, secondary accent |
| `--brass-soft` | `rgba(177,138,67,0.16)` | brass fills and callout grounds |
| `--signal` | `#c8f04a` | **primary action, active state, success — nothing else** |
| `--signal-ink` | `#0b0c0a` | text on signal |
| `--signal-soft` | `rgba(200,240,74,0.14)` | signal fills |
| `--danger` | `#e2705e` | |
| `--warning` | `#dfa94f` | |
| `--line` | `rgba(232,225,210,0.11)` | hairline — **ink-derived and translucent** |
| `--line-strong` | `rgba(232,225,210,0.22)` | emphasised hairline |

The single most important property of this ramp is that **rules are translucent
tints of the ink colour, not opaque colours.** A hairline at 11 % alpha over
`#0b0c0a` disappears into the ground and only registers where it crosses a
lighter surface. That is what produces the "thin border, editorial" quality.

Note also that there is exactly **one green** (`--felt`) and it is reserved for
board surfaces. Everything else is warm: near-black, parchment, brass,
chartreuse.

### 1.2 Classroom theme

Light, parchment-grounded, **not** an inverted dark theme. Ink goes to `#171a15`,
brass darkens to `#6e5417`, signal darkens to a moss `#4b6a0f`, and the rules
invert to `rgba(23,26,21,0.16)` / `0.34`. Shadows warm: `rgba(70,52,25,0.18)`.

### 1.3 Contrast theme

Critically, legacy contrast is **a high-contrast rendering of the same palette**,
not a different palette:

```
--bg-void #000000   --surface-1 #060806   --surface-2 #0d100c   --surface-3 #171b16
--parchment #ffffff --parchment-dim #f1f5ee --parchment-mute #d2d8cd
--brass #f0cf7d     --signal #d9ff6b       --danger #ff9d8c     --warning #ffc978
--line rgba(255,255,255,0.4)   --line-strong rgba(255,255,255,0.72)
```

It keeps a four-step surface hierarchy, a three-step ink hierarchy, and the
brass/chartreuse identity. It just raises every contrast ratio.

---

## 2. Type

### 2.1 Families

```
--font-display : "Instrument Serif", Newsreader, Georgia, "Times New Roman", serif
--font-ui      : Inter, "Source Sans 3", -apple-system, …, sans-serif
--font-mono    : ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace
```

`index.html` loads **Instrument Serif with its italic** from Google Fonts
(`family=Instrument+Serif:ital@0;1`). Instrument Serif is the display face; the
variable Newsreader is only a fallback. Inter leads the interface stack, with
Source Sans 3 as fallback.

### 2.2 Scale

```
--fs-display : clamp(38px, 5.2vw, 76px)
--fs-h1      : clamp(28px, 3.2vw, 44px)
--fs-h2      : clamp(22px, 2.2vw, 30px)
--fs-h3      : 1.15rem
```

Element defaults: `h1` `clamp(2rem, 3vw, 3.5rem)` / line-height `0.98`;
`h2` `clamp(1.4rem, 1.8vw, 1.8rem)` / `1.06`.

The entry headline is deliberately larger than the scale, and the stylesheet
says why (line 4357):

```css
/* Ricardo Chance scale and rhythm: bigger, tighter, authored line breaks. */
.auth-visual h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(42px, 6.4vw, 96px);
  line-height: 0.92;
  letter-spacing: -0.022em;
  max-width: 17ch;   /* forces the authored two-line break */
}
```

### 2.3 The signature treatment

```css
h1 em, h2 em, h3 em, .gt-em { font-style: italic; color: var(--brass); }
```

An expressive brass italic inside an otherwise parchment serif headline. This is
the identity of the product. In the legacy capture it lands on *physical.* and
*here.* — a roman/italic and parchment/brass alternation across two lines.

Display headings elsewhere: `font-weight: 400–580`, `letter-spacing: -0.012em`
to `-0.02em`, `line-height: 1.02`, `font-variation-settings: "opsz" 48`,
`text-wrap: balance`.

Small type: eyebrows and captions are uppercase `--font-ui`, ~`0.6–0.76rem`,
`letter-spacing: 0.04em`, in `--parchment-mute`. Numerals use
`font-variant-numeric: tabular-nums`.

---

## 3. Borders, radii, rules, marks

```
--r-control 2px   --r-panel 4px   --r-shell 6px
```

Three steps, and controls are nearly square at 2px. Rules are 1px at
`--line`. `--shadow-low: 0 1px 0 rgba(232,225,210,0.03)` is a hairline
highlight, not a drop shadow; `--shadow-high: 0 40px 120px rgba(0,0,0,0.55)` is
reserved for the floating console.

Focus is a **double ring** that works on any ground:

```
--focus: 0 0 0 2px var(--bg-void), 0 0 0 4px var(--signal);
```

From the captures, the page furniture is:

- **Corner registration marks** — thin L-brackets at all four viewport corners.
- **Left vertical chapter index** — `01 02 03` rotated in the left margin, the
  active chapter in `--signal`.
- **Bottom status band** — `S00–S43 · 12 TURNS · FICTIONAL DATA ONLY` left, live
  clock and `SCROLL` in brass right. Persistent, full-width, hairline-topped.
- **Ghost chapter numerals** — the chapter number set enormous in the display
  face at very low contrast, drifting through the section.

---

## 4. Spacing

```
--space-1 4px   --space-2 8px    --space-3 12px   --space-4 16px
--space-5 24px  --space-6 32px   --space-7 48px
```

A 4px base with a widening top end. The stylesheet comment calls it "consumed
throughout the console layout".

---

## 5. Motion

```
--dur-1 160ms   --dur-2 320ms   --dur-3 620ms
--ease     cubic-bezier(0.16, 1, 0.3, 1)
--ease-out cubic-bezier(0.16, 1, 0.3, 1)
```

Five keyframes only: `toast-in`, `popover-in`, `sheet-in`, `gt-pulse`,
`route-pawn-settle`. Restrained, and every one is tied to a state change.

The three durations map cleanly onto the session brief's timing contract:
`--dur-1` = control feedback, `--dur-2` = panel/tab, `--dur-3` = surface change.
Only the major/narrative class (700–1200 ms or scroll-linked) has no legacy
token; it needs adding.

---

## 6. Component patterns

- **Panel** — `--surface-1`, 1px `--line`, `--r-panel`, no gradient, no blur. The
  entry console adds `--shadow-high` because it floats over the artwork.
- **Field** — `--bg-deep` well, 1px `--line`, `--r-control`, label above in
  `--parchment`, help text below in `--parchment-mute`.
- **Primary button** — flat `--signal` ground, `--signal-ink` text, `--r-control`,
  no glow, no gradient, full panel width.
- **Numbered selector (01–04)** — a 2×2 grid of cells divided by hairlines, index
  numeral in mono at `--parchment-mute`, active cell carries a 2px `--signal`
  left edge and its numeral flips to `--signal`.
- **Numbered list (01/02/03)** — brass display numeral in the left column, text in
  the right, a full-width hairline **between and after** every row. This is the
  ledger-row pattern, and it is how the design language handles any ordered set.
- **Callout** — 3px `--brass` left edge, `--brass-soft` ground, uppercase brass
  label, body in `--parchment`.
- **Artwork** — full-bleed ambient texture with a warm amber core glow, bleeding
  *under* the console rather than boxed beside it. It is atmosphere, not a widget.

---

## 7. Drift list — legacy vs. React `185c98c`

Ordered by visual impact. This is the work queue.

### D1 — Display face replaced (critical)
Legacy: Instrument Serif, a true display serif with high stroke contrast and wide
letterforms. React: Newsreader only — narrower, lower contrast, a text face.
Compare `evidence/legacy/entry-desktop-1440.png` against
`evidence/react/slice1/after-live-entry-desktop-1440x900.png`: the same words set
in Newsreader need four lines where Instrument Serif needed two, so the headline
reads as a paragraph instead of a statement. `InterVariable.woff2` is also
already vendored in `assets/fonts/` but is not `@font-face`d and does not reach
`dist/`.

### D2 — Rules became opaque (critical)
Legacy `--line: rgba(232,225,210,0.11)`. React `--line: #34382c` — an opaque
olive. Every hairline in the app is now a visible olive-grey stripe. This is
what makes the React entry page read as a noisy table grid, and it is a
one-token fix that changes every surface.

### D3 — No spacing, motion or type-scale tokens at all
React `globals.css` has no `--space-*`, no `--dur-*`, no `--ease*`, no `--fs-*`.
`surfaces.css` — 5,705 lines — contains **two** `transition` declarations and
**two** easing curves in total. There is effectively no motion layer, and no
rhythm to compose against. This is the structural cause of most of the
composition defects downstream.

### D4 — Missing tokens
`--surface-3`, `--felt`, `--brass-soft`, `--signal-soft`, `--parchment-dim`
(React has only one muted step, so all secondary and tertiary text collapses to
the same value), the 3-step radius (React has a single `--radius: 0.25rem`, so
controls lost the near-square 2px), `--shadow-low`, and the double-ring
`--focus`.

### D5 — Palette warmed the wrong way
| | Legacy | React |
| --- | --- | --- |
| ink | `#e8e1d2` | `#f3ecdc` — brighter, cooler |
| brass | `#b18a43` | `#d0a95c` — noticeably brighter, less restrained |
| signal | `#c8f04a` | `#c7ff3f` — more saturated, closer to neon |
| danger | `#e2705e` | `#ff6b5f` — neon |

### D6 — Contrast theme abandoned the palette
React contrast is `--brass: #ffff00`, `--signal: #00ff66`, every surface flat
`#000000`, `--line: #ffffff`, and `--muted` set equal to `--ink` so all text
hierarchy is gone. Legacy contrast keeps four surface steps, three ink steps and
the brass/chartreuse identity while raising contrast. React's version is the
finance-terminal cliché the design language explicitly excludes, and it is the
theme most likely to be used for accessibility.

### D7 — `#00ff66` leaked from the ASCII preset into CSS
Hardcoded three times in `surfaces.css`. The ASCII tint is a parameter of that
effect, not a UI colour.

### D8 — Artwork became a widget
Legacy: full-bleed warm texture bleeding under the console. React: a bordered
panel in the middle of the layout containing sparse green cells, captioned
"BOX ARTWORK TRANSLATED LIVE INTO A SAMPLED TABLE SIGNAL". This is defect 4 in
the session brief, and its root cause is compositional, not a tuning problem.

### D9 — Page furniture dropped
No corner registration marks, no left vertical chapter index, no bottom status
band. These are cheap, they are load-bearing for the editorial feel, and they
are the natural things to parallax.

---

## 8. Where the legacy design was wrong

Ported faithfully, these would carry defects forward:

1. **Chapter body copy is illegible over the artwork.** At 33 % scroll
   (`entry-scroll33-desktop-1440.png`), the paragraph and the caption sit at
   roughly `--parchment-dim` directly on the dot matrix with no protected
   reading zone. It fails AA. The texture must dim, or the text needs a ground.
2. **Dead band below the fold.** Roughly 250 px of nothing between the numbered
   list and the footer band at 1440×900.
3. **Single `max-height: 680px` short-viewport tier** — already superseded by
   slice 1's two-tier approach; do not port it back.

Everything else in the language is worth restoring as-is.
