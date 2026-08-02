# Board Route Relief design decision

Selected on 30 July 2026 after the repository, deployed Entry surface, and
reference sites were audited. The [Superdesign canvas](https://superdesign.dev/teams/044cda13-1703-4dc6-b2d1-db836e390512/projects/247f794b-e29e-4133-8e3a-94de76401281)
contains the production ground truth and exactly three branched directions.

| Direction | Preview | Decision |
| --- | --- | --- |
| Route Signal Gantry | [Preview](https://p.superdesign.dev/draft/3efb0979-c20b-4f5d-bd04-cb1b61fd2eda) | Strong construction logic, but too much technical framing for a classroom table. |
| Board Route Relief | [Preview](https://p.superdesign.dev/draft/b39d3445-d021-4948-99bf-375ad68dce6d) | Selected. It makes the real route, printed decks, and physical pawns the focal object. |
| Referee's Fieldbook | [Preview](https://p.superdesign.dev/draft/99556363-1cd3-463b-8257-e0ed452d41c2) | Useful classroom tone, but too document-led for the memorable Entry → Deck transition. |

## Production translation

The selected draft was treated as art direction, not source truth. Production
uses the verified printed-board perimeter: 13 spaces across the top, 9 down the
right, 13 across the bottom, and 9 up the left, for ordered spaces S00–S43. The
five deck wells use the real deck labels and the pawn tray uses the five
supported token colours. No decorative player positions, prices, cards, or
status values were invented.

The Entry object is semantic CSS 2.5D. A compact version lands in Setup through
the native View Transition API, and the active player's real route position
remains visible in the desktop host header. Market was recomposed around the
latest real reveal and a printed tracker strip so it no longer reads as a stock
terminal.

Three.js was not added. It would have duplicated semantic DOM, increased the
initial graph, and made the static, forced-colors, and reduced-motion states
harder to keep truthful. Existing Radix/shadcn primitives remain in place. The
adapted Number Ticker and Scroll Progress are the only Magic UI mechanics;
21st was used for critique and grounding, not a generated template.

## Evidence and gates

- [Desktop Entry](evidence/board-route-relief/selected-entry-desktop-1440x900.png)
- [Tablet Entry](evidence/board-route-relief/selected-entry-tablet-900x900.png)
- [Mobile Entry](evidence/board-route-relief/selected-entry-mobile-390x844.png)
- [Reduced-motion Entry](evidence/board-route-relief/selected-entry-reduced-motion-1440x900.png)
- [Forced-colors Entry](evidence/board-route-relief/selected-entry-forced-colors-1440x900.png)
- Matching Setup captures are in the same evidence directory.

The release gate enforces the 44-space and 81-card contracts, the complete
initial JavaScript graph under 240 KB gzip, all four motion classes, the absence
of production `var(--asset)`, risk-based asset encoding, and ownership of
`data-entry-state` by EntryScreen. Browser coverage exercises every host surface
at seven widths, all-severity Axe checks, independent OS and in-app reduced
motion, forced colors, focus handoff, console errors, QR flow, and production
path reloads.

Known limitations: depth is deliberately CSS-based rather than a free-camera 3D
scene, and the route stamp is hidden below desktop width because persistent
operational context outranks a miniature graphic on small screens.
