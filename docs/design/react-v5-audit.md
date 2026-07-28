# React v5 UI audit and implementation record

Date: 2026-07-28

## Baseline inspected

The production dashboard was inspected at the canonical GitHub Pages URL at
1440×900 and 390×844 in Table and Classroom. The legacy page loaded without
console errors or horizontal overflow and already provided keyboard tabs, skip
navigation, live regions, focus restoration, native dialogs/popovers, reduced
motion, forced-color handling and 44px targets.

The weakness was not the landing screen. Setup, Play, Market, Ledger, Scores,
Export and Help had collapsed into a repetitive admin-card system. The source
also had no safe ownership boundary: a 6,389-line runtime and 6,718-line
stylesheet mixed rules, persistence, network work and several generations of
presentation overrides.

Baseline evidence:

- [`before-live-desktop-1440.png`](evidence/react-v5/before-live-desktop-1440.png)
- [`before-live-mobile-390.png`](evidence/react-v5/before-live-mobile-390.png)

## High-confidence defects and fixes

1. **Source and deployment drift.** Editable source was separate from the only
   Git checkout. The React source now lives on `main`; a Pages workflow builds
   and deploys only `dist`. `legacy-pages` and
   `pre-react-pages-2026-07-28` preserve the rollback.
2. **Untestable monolith.** Game rules, storage, synchronization and rendering
   were coupled. Typed pure commands now own the 44-space/81-card contract,
   `useReducer` owns canonical state, and side effects own storage, timers,
   focus, speech, downloads and Supabase.
3. **Legacy cascade.** Multiple visual systems competed in one stylesheet.
   React now consumes one authored token layer with separate Table, Classroom
   and Contrast themes.
4. **Unsafe supplied buttons.** LiquidButton previously risked duplicate SVG
   IDs and undersized interaction states; MetalButton could replace consumer
   pointer handlers. Both were rebuilt with composed handlers, forwarded refs,
   44px minimums, visible focus and static fallbacks.
5. **Missing renderer failure paths.** Image, worker and scene failure now
   resolve to a complete semantic page and static artwork rather than a blank
   hero.
6. **Scene budget violation.** The first Three.js board scene produced a
   184.8KB gzip lazy chunk against an 80KB ceiling. It was replaced with a
   2.15KB gzip Canvas2D point-field renderer; the visual chapter and one-scene
   orchestration remain.
7. **Mobile session dead end.** New session and Leave table existed only in
   the desktop rail. Confirmed versions now live in the mobile More drawer,
   including unsynced-save protection.
8. **Notification obstruction.** Mobile status messages could cover and block
   the bottom navigation. They now sit above its safe-area boundary.
9. **Classroom contrast.** Small brass text measured 4.17:1 and raw asset/player
   colors were used as text on bone paper. The brass token now measures 5.8:1
   against the canvas; asset/player color remains a non-text marker while text
   uses the theme ink.
10. **Disabled-control affordance.** Three shadcn primitives suppressed pointer
    feedback. Disabled controls now retain a clear cursor and focus treatment.

## Deliberate art-direction judgments

These are product choices, not mislabeled accessibility defects:

- Logged-in views are distinct physical-table instruments instead of one
  reusable dashboard-card layout.
- The manufacturer box cover is the ASCII source. Classroom retains the exact
  green treatment inside a dark artwork frame.
- Entry gets LiquidButton once. MetalButton is limited to Start Game, Confirm
  Move and End Turn.
- One renderer runs at a time; native scrolling stays untouched.
- Mobile and low-power screens use authored static/Canvas substitutes for the
  large scene.
- Scores end in a settled composition rather than confetti.
- Export is intentionally calmer and optimized for a four-page A4 teacher
  record.

## Verification evidence

- TypeScript strict build: passed.
- ESLint: passed with zero warnings.
- Vitest: 12 files, 85 tests passed, including all 25 ASCII modes, effects,
  masks, lights, animation styles, storage/RPC parity and domain behavior.
- Production artifact: 44 spaces, 81 cards, nested Pages path, redirect,
  query/hash, CSP and asset checks passed.
- Initial JavaScript: 227.71KB gzip against a 240KB limit.
- Largest surface chunk: 4.94KB gzip; largest non-scene lazy dependency:
  17.10KB gzip; board point-field: 2.15KB gzip.
- Hero images: 165.84KB desktop and 116.59KB mobile.
- 21st UI review: 103 files, zero errors, zero warnings and 122 informational
  suggestions. Remaining notices are deliberate Canvas/tone colors and
  controlled overflow inside Radix primitives.
- Playwright: desktop/mobile host flow, two-client joined-player privacy,
  lifecycle confirmations, direct reload, failed imagery, reduced motion,
  forced colors, seven acceptance widths and all theme/surface combinations;
  19 passed and 3 redundant mobile-matrix cases were intentionally skipped.
- Axe: zero serious or critical findings in all seven Table and Classroom
  surfaces and Play/Market/Scores in Contrast.
- Browser QA: no horizontal overflow or console warnings/errors at 1440×900
  and 390×844.

After evidence:

- [`after-final-entry-desktop-1440.png`](evidence/react-v5/after-final-entry-desktop-1440.png)
- [`after-final-entry-classroom-desktop-1440.png`](evidence/react-v5/after-final-entry-classroom-desktop-1440.png)
- [`after-final-entry-mobile-390.png`](evidence/react-v5/after-final-entry-mobile-390.png)
- [`after-local-play-desktop-1440.png`](evidence/react-v5/after-local-play-desktop-1440.png)

## Intentional implementation deviation

The plan named TypeScript 7, but that version was not compatible with the
current stable ESLint TypeScript parser range. The implementation pins strict
TypeScript 6.0.3 instead of forcing an unsupported toolchain. This changes no
runtime contract.

## Production acceptance

Pending the green migration-branch workflow, Pages switch and final read-only
production smoke. This section will be updated only after the exact public URL
serves the verified React artifact.
