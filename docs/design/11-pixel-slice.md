# Design 11: The pixel slice (build plan phase 7)

Status: plan, 2026-09-25, on the owner's "next phase" after the phase 6b and 6c sessions. Design 07 §2.2, §4, §5 and §9 decide the shape; this document decides the slice, the contracts and the waves. Stories first (build plan §5b): the story table is §1, the contracts §2, the waves §3.

## 1. The story: one week, seen

| Week | The player does | The player sees |
|---|---|---|
| 1 | Opens the Turn tab | Their town as a tile map: a piazza with a church and a police post, streets of shops as pixel buildings with hand-painted-sign colours by type, their sponsor's stalls marked, their own stall marked once they have one, the water or the fields at the edge by archetype. Their man stands on the street under his stall; the kid beside him. Portraits in the People tab, composed from parts, the same face every time. |
| 1 | Presses Fine turno | The week modal opens as before. Behind it the map plays the week: collectors walk to their shops and coins rise; a shop that came up short shows a shutter; a lean shows a figure at the door; an arrest shows a car and a man taken; a raid a sweep of blue; the card game a glow at the bar at night. Speed 1x, 2x, skip. Clicking a beat shows its sentence. |
| 2 to 30 | Plays the associate's weeks | The Newspaper panel on the Report tab carries the town's public news: a raid, an arson, a feast, an arrest with a name when the paper has it. The paper never knows what only the family knows. |
| Any | Loads a save | The same map, the same faces (layout and portraits are derived from ids, never stored). |

Acceptance: the equivalence test holds on every golden seed (the clip list for a place equals the player-visible log about it); 60 frames per second on a mid-range laptop with one town; the People tab composes 200 portraits in under 200 ms; nothing drawn contradicts the report.

## 2. Contracts (landed 2026-09-25, packages/sim/src/scene.ts)

- `projectScene(world, log, content, placeId): SceneView | null`: `tiles` (row-major `TileKind`), `buildings` (one per business: tile position, width by size, type, state `open | refusing | yours | sponsor | closed`), `actors` (the player, the kid, the family's men in the town, each with `portrait: PortraitParts`), and `clips` in tick order (`collect | missed | lean | game | arrest | release | raid | patrol | favor | kid | loan | claim | share | note | news`, each with its sentence, its actor and shop when known, and `visibility: known | sign`).
- `layoutTown(world, town)`: deterministic from the town's ids: two piazza rows, one row of buildings and one street per block, two edge rows (water and a quay for harbor, coastal and island archetypes; fields for agricultural; street otherwise).
- `portraitParts(character)`: twelve part indices from a hash of the character id, the age band and the rank (design 07 §5's layer list). Aging changes `hairAge` and `ageMarks` at 35, 45, 50, 60 and 65.
- `placesForPlayer(world)`: the family's towns; `PlayerView.places` carries it and `PlayerView.newspaper` the newspaper lines.
- `ReportNote.channel`: `sponsor | sign | lawyer | newspaper`; the scheduler emits the newspaper line as its own note when an outcome has one. The Report keeps the other channels; the newspaper panel shows this one.
- Equivalence test: `packages/sim/src/scene.test.ts`.

## 3. Waves

- **A1, the map and the week (PixiJS 8, packages/ui/src/pixel/).** A `TurnView` component hosting a Pixi application; a tile atlas and a building atlas generated in code from the 48-colour palette (design 07 §5; no hand-drawn art in this phase, but the atlas module is the single place art will replace); sprites for actors composed from `PortraitParts` at 16 by 16 for the street and 32 by 32 for panels; clip playback with 1x, 2x and skip; a click on a beat opens its sentence; a place picker from `view.places`. Integer scale, 16-pixel tiles, phone width supported by scrolling the map.
- **A2, portraits.** `packages/ui/src/pixel/portrait.ts`: composes the twelve layers on a canvas from procedurally drawn parts in the palette (skin tones, hair shapes, brows, eyes, noses, mouths, facial hair, age overlays, clothing by role, accessories); a cache by character id and age band; used in the People tab, the Book, the situation cards (the sponsor's face on his favors, the kid's on his errand) and the header.
- **A3, the newspaper and the Turn tab wiring.** A styled DOM panel with a masthead, columns and one photo slot (the place's tile snapshot from the Pixi canvas or a portrait); the Turn tab in the shell; the week modal plays the map behind it; tests for the panel; a Playwright screenshot in `packages/harness/out/phase7-turn.png`.
- **B, the gate.** Equivalence over the golden seeds in the harness, the performance budget test, the catalogue's newspaper column, ten minutes of play with a question list, NOW.md.

Nothing in `packages/sim` changes in the waves except by the owner. Art quality is placeholder by design: the phase proves the pipeline, the palette and the replay; a pixel artist's tiles drop into the atlas module later.
