# Design 07: Interface and Rendering

Status: design, 2026-09-21. Inputs: designs 01 to 04, the brief (FR-H, FR-I, decisions 8 and 17, NF-1, NF-2, NF-8), `docs/gameplay-walkthrough.md`, review items K-1 and the two open design questions (decisions per turn, the animated turn at island scale). This document decides what the player sees at each rank, how the three loop screens work, how fog of war is projected, how the renderer is built, and the pixel-art pipeline. It does not contain implementation code.

Two rules from design 01 govern everything here: the renderer is a replay of the `TurnLog` (S8), and the interface never computes an outcome. Every number on screen comes from the `Report` projection (design 01 §7), never from the `World` directly.

---

## 1. UI layers and the rank ladder

The rank ladder is the tutorial (I1). Each rank unlocks a set of UI layers; a layer is a screen or a panel that did not exist before. `player.uiLayersUnlocked` (design 02 §5) is the single source of truth; the shell renders only unlocked layers and the promotion scene names the new ones in character.

| Rank | Layers unlocked | What the player can now see |
|---|---|---|
| Associate | `block`, `sponsor`, `ledger.small`, `report.basic`, `newspaper` | One block of businesses with pay state; the sponsor's card with his expectation for the turn; cash in, cash to sponsor, cash kept; a one-page newspaper |
| Man of honor | `loanbook`, `associates`, `dispute.scene`, `exposure.self`, `rumors.self` | Borrowers, collateral and vig; two or three associates with shares and loyalty estimates; the dispute scene as a party; the player's own exposure estimate and the first rumors about them |
| Crew chief | `territory`, `crew.chart`, `treasury.contribution`, `professionals`, `attention.band`, `operation.planner`, `ownership`, `feast` | Every business on the crew's blocks with status; men with loyalty, exposure, traits and assignment; the cut flowing to the treasury; accountant and lawyer cards; the Attention band with signs; the operation planner; partnerships; the feast committee |
| Administration | `family.chart`, `buffer.indicator`, `arbitration`, `policy`, `district.map`, `treasury.full`, `careers`, `state.panel` | All crews and chiefs; the head's buffer setting shown from inside; disputes between chiefs awaiting arbitration; policy proposals; the district's families; the treasury's obligations; the career tracker; "what the state may know" |
| Head of family | `district.council`, `commission` (read-only until district head), `politics`, `approvals`, `fugitive`, `heir`, `legacy` | District council and the Commission table; politicians, votes and elections; the approvals queue for killings and inductions; fugitive mode; heir grooming; the legacy summary |

A layer never appears before its rank, and a layer never disappears after it: as head the crew chart still exists, but it is one click deeper because the underboss runs it. Layers can also be unlocked by events ahead of rank in narrow cases (a soldier arrested sees the trial screen), which the template declares in its `report` spec.

---

## 2. The three loop screens

### 2.1 Planning

The shell is a persistent frame: the calendar and turn length top left (with the crisis flag and its cause when the turn is shortened), the Attention band top right from crew chief up, the request queue down the left, the working area in the center, and the end-turn button bottom right. The working area holds whichever layer is selected: block, territory, crew chart, family chart, district map and so on.

**The request queue** is the answer to the decisions-per-turn question. It shows only instances in `awaitingDecision` whose deciding actor is the player, capped by the scheduler budget in design 04 §4 (3 at associate and soldier, 5 at crew chief, 7 at administration, 8 at head). Deferred requests are not shown; they arrive next turn with aged priority. Each request card shows the asker's portrait, the kind of decision, and the options with projected effects as estimates (not results). Requests from above are pinned to the top. A player may end the turn with requests unanswered; the template's default option applies and the report says so.

**Standing orders** live in the layer screens, not the queue: share rules per man, assignments to chains, intimidation ladder settings per business, treasury cut, buffer setting, lifestyle slider. Changing them creates `PlayerAction`s that become Facts at step 1 of the pipeline.

Crew chief's Planning screen, wireframe:

```
+--------------------------------------------------------------------------------------+
| Anno 4, settimana 17 (year 4, week 17)   Turno: 2 settimane (turn: 2 weeks)          |
|                                                    Attenzione (Attention): OSSERVATI |
|                                                    (Watched)  [signs: 2]             |
+----------------------+---------------------------------------------------------------+
| RICHIESTE (requests) | TERRITORIO (territory)   [Crew] [Treasury] [Professionals]    |
| 4 of 5               |                                                               |
|                      |   Via Maqueda block      Ballaro block       Piazza block      |
| [!] Sottocapo:       |   [$][$][$][!][$]        [$][$][x][$][$]     [$][$][$][$]      |
|  envelope +300 kL    |   [$][$][ ][$][$]        [P][$][$][$][$]     [~][$][$]         |
|  this quarter        |                                                               |
|  > accept / plead    |   $ paying   ! late   x refusing (stage 1)   P partnership    |
|                      |   ~ owned by neighbour family   [ ] unclaimed                 |
| Salvo (soldier):     |                                                               |
|  wants 800 kL        |   Selected: Farmacia Lo Presti (size 3)                       |
|  capital for loans   |   Pays: at feasts   Compliance: ~70%   Fear: low              |
|  > lend / refuse     |   On record: Salvo   Last collection: paid (Easter)           |
|                      |   [Set intimidation ladder] [Offer partnership] [Reassign]    |
| Turi (soldier):      |                                                               |
|  nephew as associate |---------------------------------------------------------------|
|  > allow / refuse    | ORDINI PERMANENTI (standing orders)                           |
|                      |  Shares: default 40%  [edit per man]   Treasury cut: 10%      |
| Widow Cusumano:      |  Lawyer: Avv. Ferrara (retained)  Accountant: none [hire]     |
|  asks for help       |  Lifestyle: modesto (modest)                                  |
|  > 120 kL / decline  |                                                               |
+----------------------+------------------------------------------------[FINE TURNO]---+
```

Labels follow decision 17: Italian term, English in parentheses, until the codex has introduced the term; then the Italian label alone with a tooltip.

### 2.2 The Turn (animated view)

The animated view answers the island-scale question: **it always shows one chosen place**. The default is the player's own block, stretch or town; the player may pick any place they have a claim in or a man stationed in. Everything that happened elsewhere is summarized in the Report, never animated. This keeps the PixiJS scene bounded to one town's tiles and the log entries filtered to one `placeId`.

The view plays `TurnLog` entries with the chosen `placeId` in `tick` order: collectors walking to shops, a shutter being glued, a patrol lingering, an arrest, a den filling at night, a funeral procession. Speed controls are 1x, 2x and skip. Clicking an animated entry opens its plain-language cause from the log (I2). The view has no state of its own beyond the playhead. At weekly ranks the sequence is short; at monthly ranks entries are grouped by week with a day strip, so the view reads as four beats rather than one long stream.

Entries with `visibility: none` for the player are not sent to the view. Entries with `visibility: sign` are animated in their partial form (an unknown car, not a labeled wiretap van).

### 2.3 The Report

The Report is a paged panel. Pages exist only when their layer is unlocked.

```
+--------------------------------------------------------------------------------------+
| RAPPORTO (report)  Anno 4, settimane 17-18    [Envelopes] [Newspaper] [Lawyer] [Books] |
|                                                              [The state] [Family]     |
+--------------------------------------------------------------------------------------+
| BUSTE (envelopes)                                                                     |
|   Crew income this turn                          4,429 kL                            |
|     protection tax, 38 small payers (90%)          513      why: 4 stalls late        |
|     Easter collection, 6 shops                   2,400      all paid                  |
|     loans, 85% paying                              816      why: Cusumano defaulted   |
|     two dens                                       700                                |
|   Men kept (40%)                                -1,300                                |
|   Treasury cut (10%)                              -313                                |
|   Envelope to the family (expected 1,800)       -1,800   delivered in full           |
|   Lawyer, support to Cusumano household           -270                                |
|   Yours                                            746 kL   [ledger]                  |
|                                                                                       |
| Received from your men:  Salvo 410 (on time)  Turi 380 (short: 2 refusals)  ...       |
+--------------------------------------------------------------------------------------+
| GIORNALE (newspaper) - L'Ora di Palermo, 3 stories about your district                |
|   "Fire at pharmacy in Via Maqueda; owner unhurt"  [cause chain 4 steps]              |
|   "Carabinieri patrols doubled in Ballaro"          [cause chain]                     |
+--------------------------------------------------------------------------------------+
| LO STATO (what the state may know)                          band: OSSERVATI (Watched) |
|   Signs this turn: an unfamiliar car near the club, twice.  A friend at the           |
|   prefecture has stopped answering.                                                   |
|   Your exposure: moderate (estimate)    Men at risk: Turi (high, arrested last year)  |
+--------------------------------------------------------------------------------------+
```

Pages: **Envelopes** (every money line with a "why" from the log), **Newspaper** (issues grouped by `causeChainId`, with codex links), **Lawyer** (cases, custody, witnesses, trial dates), **Books** (accountant: laundering capacity used, skim suspicions, declared versus visible wealth), **The state** (band, signs, estimates), **Family** (loyalty movements, memory entries added, promotions, deaths), and at higher ranks **District** and **Commission minutes**. Every line links to its cause chain.

---

## 3. Fog of war: the projection

The Report is a pure function `project(world, log, playerId) -> Report` (design 01 §7). Visibility is decided per value, not per screen.

| Class | When | What the player sees |
|---|---|---|
| Exact | The player's own accounts, claims, standing orders, their own actions | The true value |
| Estimate | Loyalty and exposure of the player's own men, compliance of businesses on their blocks, their own exposure, Weight progress toward the next threshold | The true value plus a deterministic error, shown as a band ("~70%", "moderate", "high") |
| Rumor | Rival families' strength, standing, factions, the head's health; other crews' income | A qualitative statement that is true with probability by source reliability, drawn from the `fog` stream ("they say the Ciaculli men are short of money") |
| Sign | The state's tools, case strength, active schemes against the player | Only the sign text declared by the template's `report` spec; never the underlying value |

The estimate error is drawn once per (viewer, subject, turn) from the `fog` stream seeded with those three keys, so the same estimate re-renders identically, replay matches, and the harness can assert what a player could have known. Error width shrinks with the viewer's `discretion` skill and with an accountant or a friend in the police (S-2), and grows with the number of buffers between viewer and subject.

---

## 4. Renderer architecture

- **Shell and panels: Preact.** All panels bind to the `Report` object and to `PlayerAction` emitters. No panel imports `sim` internals beyond the shared types. Panels are pure views of the Report plus local, non-authoritative UI state (selected tab, playhead).
- **Animated view: PixiJS 8.** One scene per chosen place, built from the town's tile grid and building sprites. It receives an ordered array of `TurnLog` entries filtered by `placeId` and visibility, and plays them as animation clips. It emits nothing back into the simulation except UI events (click an entry to open its cause).
- **No game logic in either.** Enforced by the ESLint dependency rule in design 01 §2 and by a test.
- **Equivalence test.** For every golden seed and turn, the harness computes the set of `TurnLog` entries with `visibility >= player` and asserts that each appears in exactly one Report page or in the animated view for its place, and that the animated view's clip list for a place equals the log filtered by that place. Any divergence is a renderer bug by definition (S8).
- **Text rendering.** All report and newspaper text comes from `report` templates in content (design 06), filled from log entries. The renderer never composes sentences.

---

## 5. Pixel-art pipeline

**Tiles and scale.** 16 by 16 pixel tiles, rendered at integer scale (3x on a 1080p desktop, 2x on small screens). Towns are tile grids from the generator's archetype (design 05): a market quarter is dense stalls and arcades, a harbor quarter is quays and warehouses, an agricultural town is a piazza, a church and low houses with fields at the edge.

**Palette.** One master palette of 48 colors, warm and sun-bleached: ochres, terracotta, faded blues and greens, deep shadow browns, one hot red reserved for events that matter (fire, blood, a headline). Period cues in the sprite set: 1970s and 1980s cars (small boxy saloons), shutters, hand-painted shop signs, scooters, television aerials, a bar with a jukebox glow. Attention band colors are a separate five-step ramp chosen to be distinguishable under the common colorblind types and always paired with the band's word.

**Building sprites.** One base sprite per `BusinessType` (stall, bar, workshop, shop, pharmacy, restaurant, supermarket, construction site, warehouse, fish market, petrol station, cannery, clinic, church, prefecture, police post, courthouse, harbor office) with state overlays: open, closed, glued shutter, burned, under construction, seized (a state notice), owned by the family (a subtle sign change). Archetype variants recolor and re-roof the same bases so seven archetypes do not need seven sprite sets.

**Portraits.** Layered parts at 32 by 32 pixels, composited in a fixed order: skin and head shape (6), hair (14, each with three age variants: full, thinning, grey), brows (5), eyes (8), nose (6), mouth (7), facial hair (9 including none), age marks (4 overlays: none, lines, heavy lines, gaunt), clothing (12 by role and lifestyle: worker, suit, priest, magistrate, police, uniform, dress), accessories (8: glasses, hat, cigarette, scar, none). The combinatorics exceed a hundred million distinct faces before recolor, enough for generated casts across many seeds. Aging replaces the hair and age-mark layers at thresholds (35, 50, 65), so the same character visibly ages (H5). Women, children and elders share the same layer scheme with their own part sets. Part ids are stored on the character so portraits are deterministic and cheap to redraw.

**Newspaper.** A styled DOM panel, not a sprite: a masthead in a period serif pixel font, columns, one photo slot that shows the relevant place's tile snapshot or a portrait. Pixel fonts are chosen for legibility at 100 percent zoom (a 9 by 12 body font, not a 5 by 7 one).

**Audio hooks.** The animated view emits cue names (bells, market, patrol, feast band, night) that a small audio layer maps to loops; mood shifts with the Attention band (H4). Audio is not required for the vertical slice.

---

## 6. Accessibility

- Every Planning and Report action is reachable by keyboard: tab order follows the visual order, arrow keys move within the request queue and within grids, Enter activates, Escape backs out. The animated view is skippable with one key.
- Text meets 100 percent zoom readability: minimum body font renders at 12 CSS pixels effective height; panels reflow rather than shrink.
- Band colors are never the only carrier: the band word is always present, and map states use icon shapes as well as color.
- A motion-reduction toggle replaces animation clips with a still frame per entry and a caption.
- Rumor and sign text is plain language; no information is carried by color alone or by sound alone.

---

## 7. Mobile web

Planning and Report are fully usable on a phone: the request queue becomes a top sheet, the working area a single scrollable layer, standing orders a separate tab. The animated view on small screens plays a simplified sequence (one still per entry with a caption, the same data) rather than the tile scene. Session fit (NF-3) is unchanged: end turn, read report, done.

---

## 8. The text slice (build plan phase 6)

Before any art exists, the whole loop ships as plain DOM: the request queue as a list, the block as a table of businesses with state letters, the crew as a table, the Turn as a scrolling text log of entries in tick order, the Report exactly as in §2.3 without styling. It uses the same `Report` projection, the same `PlayerAction`s and the same layer unlocks. This is the screen on which the three hypotheses of the vertical slice are tested. The pixel renderer later replaces the text log with the animated view and restyles the panels; nothing underneath changes.

---

## 9. Performance budgets

- Animated view holds 60 frames per second on a mid-range laptop with a scene of one town (up to 2,000 tiles, up to 200 sprites, up to 60 concurrent animated entries). Above that, the view batches entries by week rather than dropping frames.
- Initial download for the first playable screen under 3 megabytes compressed (code plus the base tile and portrait atlases); archetype atlases and audio load on demand. First playable screen within 5 seconds on typical broadband (NF-2).
- The Report projection runs in under 50 milliseconds per turn on the same hardware; it is a pure function and is memoized per turn.
- Portrait composition is cached per (character, age band); a full family chart of 200 portraits composes in under 200 milliseconds.

---

## 10. Out of scope here

Screen-by-screen copy, exact tile art and font selection belong to production. The audio layer, the codex reader's layout and the legacy summary's visual design are release items and follow the same rules: pure views of Report and History, no logic.
