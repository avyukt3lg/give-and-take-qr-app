# Give And Take QR App

React/TypeScript source for the Give And Take physical board-game companion.
The production site is published at:

<https://avyukt3lg.github.io/give-and-take-qr-app/website/host-dashboard/>

## Local development

Use Node 24.

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and provide the existing public Supabase
URL and publishable key. Never put a service-role key in this repository.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:artifact
npm run test:e2e
npm run review:21st
```

The app deliberately remains one static URL. Setup, Play, Market, Ledger,
Scores, Export and Help are in-app views, not client-side routes.

## Deployment

`main` is editable source. `.github/workflows/pages.yml` validates and builds
`dist`, then publishes only that artifact through GitHub Pages Actions.
Generated output is never committed.

The rollback branch `legacy-pages` and tag
`pre-react-pages-2026-07-28` preserve the final legacy deployment.

## Non-negotiable compatibility

- 44 spaces (`S00`–`S43`), 81 cards, 2–5 players and 12 turns.
- Existing Supabase public RPCs, revision behavior and client roles.
- Existing `give-and-take:*` local storage keys and v5 session shape.
- Table, Classroom, Contrast and reduced-motion behavior.
- The physical board, cards, pawns and D6 remain the source of truth.
