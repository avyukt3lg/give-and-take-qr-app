# Give And Take — Design Gate System

## Product character

Give And Take is a classroom-host companion for a physical board game. It is not a finance terminal, trading dashboard, SaaS admin, AI landing page, or portfolio. The screen supports the host; the physical board, pawns, printed cards, group conversation, and evidence trail remain primary.

The identity should feel like a deliberately lit tabletop instrument: tactile, precise, slightly theatrical, calm under pressure, and legible across a classroom. Every visual object must be explainable through real game structure or host state.

## Immutable product facts

- Preserve the real 44-space route, identified `S00` through `S43`.
- Preserve the 81-card contract and the actual host/join, QR companion, storage, sync, game-phase, score, evidence, and export flows.
- Never invent prices, players, scores, market events, card content, progress, or system status to decorate a composition.
- Keep `data-entry-state` on the Entry surface.
- Keep risk encoded by weight plus text: risk 1–3 use ascending ink weight; risk 4–5 use warning. Never restore per-asset rainbow hues or production `var(--asset)`.
- Keep the four established motion classes: control, panel, surface, and narrative.

## Current visual tokens

Use the repository’s existing self-hosted fonts and variables.

- Display: `"Instrument Serif", Newsreader, Georgia, serif`
- Interface: `"Source Sans 3", system-ui, sans-serif`
- Codes/data: `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
- Display scale: `clamp(38px, 5.2vw, 76px)`
- H1: `clamp(28px, 3.2vw, 44px)`
- H2: `clamp(22px, 2.2vw, 30px)`
- Body: generally 14–18px depending on reading distance
- Minimum interactive target: 44 × 44px

Table theme:

- Canvas `#0b0c0a`
- Sunk canvas `#070806`
- Raised canvas `#101310`
- Surface `#161a15`
- Strong surface `#1d231c`
- Board-only felt `#1d2a22`
- Ink `#e8e1d2`
- Dim ink `#b4ae9f`
- Faint ink `#8c8779`, limited to large/uppercase secondary labels
- Brass `#b18a43`
- Signal/success `#c8f04a`
- Danger `#e2705e`
- Warning `#dfa94f`
- Hairline `rgb(232 225 210 / 0.11)`
- Strong line `rgb(232 225 210 / 0.22)`

The existing Classroom and Contrast themes must remain first-class variants. Classroom uses parchment/paper with dark moss/brass accents; Contrast uses black/white with stronger rules and signal separation.

Spacing remains on a 4px base: 4, 8, 12, 16, 24, 32, 48px. Controls are near-square: 2px radius, 4px panel radius, 6px shell radius. Avoid default pill-heavy UI.

## Composition rules

- Organize the Entry fold around one meaningful game object and one stable access console.
- Use cinematic negative space to establish hierarchy, not empty marketing acreage.
- Typography may interact with the focal object but may not sit behind controls or reduce reading contrast.
- Real route geometry, real pawn positions, real phases, printed-card proportions, deck wells, ledger rules, scoring marks, and evidence stamps are valid visual material.
- Decorative grids are acceptable only as subtle registration/construction aids; a grid cannot be the identity.
- Operational surfaces must scan in this order: current context, immediate action, proof/status, supporting detail.
- Host controls stay stationary and immediately usable; the user never waits for an exit animation.
- At 900px and below, recomposition should remove depth before it compromises hierarchy. At 520px and below, the form and current action outrank the focal object.

## Material and depth

Depth is measured, not glossy:

- One low hairline highlight
- Restrained print/deck shadow
- One high theatrical shadow on the focal tabletop object only
- Layered planes should read as board/card stock and token thickness
- No glassmorphism stacks, heavy fog, neon bloom, metallic crypto sculpture, generic floating spheres, or glossy SaaS cards

Canvas, SVG, CSS 2.5D, or WebGL may communicate the board, phase, route, pawn movement, or risk. Every such scene needs a semantic DOM equivalent and a static accessible composition when scripting, GPU effects, forced colors, or motion are unavailable.

## Motion contract

Motion communicates state and is limited to one main environment effect plus at most three supporting patterns.

- Control: 180ms — button press, focus, tab switch
- Panel: 340ms — dialog, drawer, tab panel
- Surface: 560ms — phase change, route destination, pawn move
- Narrative: 900ms maximum — Entry to Deck, risk reveal, code reveal

Pointer parallax is decoration only: maximum about 2 degrees rotation and 6px translation. Disable it for touch/coarse pointers and reduced-motion users.

Reduced motion is a designed state: immediate layout/state change, no positional or scale animation, no delayed access, with color/border/text feedback retained. Forced-colors mode removes decorative scenes but preserves route meaning, focus, controls, headings, and status.

## Prohibited visual language

- ASCII, dither, pixel-art, terminal code, code rain
- Random particles, auroras, meteors, fog, generic 3D blobs or spheres
- Crypto/stock-dashboard conventions and fake live metrics
- Unrelated “futuristic” decoration
- Scroll hijacking, unreadable scroll-reveal text, autoplay noise, custom cursors, prolonged loaders
- Decorative fake game data

## Reference principles, not assets

- Izanami: deliberate pacing and negative space
- Agencidev: one dominant focal object with controlled light
- Sharplink: structural navigation and explicit construction logic
- Visual Identity: tension between typographic scale and one meaningful object
- Ricardo Chance: editorial rhythm and confident type hierarchy
- 3dyco: one decisive scene change
- ZEROZ: clear chapter progression and masks while retaining native scroll

Do not copy any reference branding, assets, page layout, shaders, content, or portfolio conventions.

## Accessibility and performance gate

- Maintain semantic headings, labels, form errors, live-region feedback, keyboard order, focus return, and visible focus.
- Do not encode meaning only by color, motion, texture, or depth.
- The access console and every primary action must pass at least WCAG AA contrast in Table, Classroom, Contrast, and forced-colors modes.
- Avoid text over a moving or high-frequency surface.
- Keep initial production JavaScript under the project’s 240KB gzip contract using the complete initial module graph, not just the largest entry chunk.
- The replacement must remove the production ASCII worker/chunk and should not add a dependency unless a measured need justifies it.
