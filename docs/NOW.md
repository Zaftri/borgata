# NOW

Updated: 2026-09-25

## Phase

Phase 7, the pixel slice (design 11), complete on the code side 2026-09-25 (see status below); the gate is the owner's ten minutes on the Turno tab. Phase 6b (the first ranks, design 09) complete on the code side (2026-09-24). Build-plan phase 6 complete on the code side (2026-09-23). The game runs in the browser as a text interface over the headless core: `pnpm dev` then http://localhost:5173/. The phase 6 gate is the owner's playtest of the vertical slice (associate to crew chief) answering the three hypotheses in build plan section 4. Next after that: phase 7, pixel presentation (renderer as replay of the turn log).

## Phase 8, group 2 status (disputes to the district, war; design 13; code complete 2026-09-25)

Owner contracts landed: `world.standing` (family pairs, `StandingDelta`, fades over 104 weeks), `Family.warWith` with `WarStateSet` (chains collect half at war, both towns heat 5 a week), `District.districtHeadFamilyId` set at generation by made men and claims with `DistrictHeadSet` for later elections, the `relationships.standing` predicate, `PlayerView.district` (families, head, standing bands, at war). Tests in `district.test.ts`. Landed: the crew quarrel and the district sit-down with the player's approaches (`district.ts`; relations `districtHeadOf`, `headOf`); war as a state with weekly hits, hiding men, the district head's meeting every four weeks, exhaustion and return (`war.ts`; relation `warWithOf`); crew chief succession so a chief can die (the crew's soldier of most Weight takes the crew); the district panel and standing bands on Territory, the war banner, folded tables and 44-pixel touch targets under 700 pixels (the phone pass: every screen fits a 390-pixel viewport, screenshots `packages/harness/out/phone-*.png`); district metrics in careers. Two integration findings: the request budget was throttling the world (news on the player's town counted against the player's card budget, so poaching and quarrels rarely spawned; the budget now counts only the player's own decisions), and the first odds were far too high (six crew quarrels a turn); tuned to quarrel 8 and poach 8 per business, refusal 20 percent. Careers yesMan 20 x 100 after: made median 33.5 in 70 percent (in band), two or more cards in 85.5 percent of weeks, family disputes 45 per 100 turns, district sit-downs 4 per 100, wars 0.5 per 100 with a median length of 5 weeks, sit-downs that end in war 23 percent (band 20, WARN, one step of tuning left). Per turn 79 ms (per-business spawns; budget 2,000). Owner's questions answered the same day: publishing is a static build (GitHub CLI logged in, no commit or remote yet); the interface is written for phone width but unverified, the phone pass is in this wave.

## Phase 8, group 1 status (obligations, treasury, lifestyle; design 12; code complete 2026-09-25)

Owner contracts landed: `world.obligations` with its own reducer (owner order: ledger, obligations, claims, ...), facts ObligationOpen/Due/Met/Missed/Close, `Character.lifestyle` with `LifestyleSet`, the `setLifestyle` player action, `Family.shortfallStreak` and `FamilyStateSet` (weakened after four turns of income below duties, healthy after four above), the system `obligationsStep` (the player's dues raise a card; an AI debtor pays from his purse, else the treasury for a made man, else misses; lifestyle sinks 0/5/40 kL a week or falls to modest; a prisoner's support closes at release), Weight +0/+10/+30 and heat +0/+1/+3 by lifestyle, the flip roll's prisoner-support resistance (250), report lines for all of it. Tests in `obligations.test.ts`. Landed the same day: the cards in `packages/content/src/templates/obligations.ts` (the prisoner's family, the weekly due, the missed support's consequence, the funeral, the family weakened and recovered in the paper, the fall to modest) with scenario tests and `stories/obligations.story.test.ts`; `soldier.detained.support` unregistered (superseded). The due card pays through a same-turn memory marker the system reads back (one answer per turn for all dues; noted gap). The three storming hotspots landed too: shopkeepers as people (`Business.ownerId`, `BusinessOwnerSet`, the `ownerOf` relation, owners with traits on the player's blocks, the reporter branch and the keeper's memories back on the cards, owner names on Territory and the Book); `decision.role` as a priority list in the engine so the player decides his own intimidation and disputes; the kid becomes the player's first man when old and loyal enough, else a named stranger. View: duties in the Book, lifestyle on the player, the family line with a treasury band, the lifestyle order. Golden re-frozen (generation, decisions, content). Numbers: 747 tests in 56 files; quick 0 violations, 48 ms per turn; careers yesMan 20 x 100: made median 29 in 60 percent, ended in rank 5 percent (in band), two or more cards in 80 percent of weeks, bad favors 15.5 percent (edge of band); coverage: every obligation card reached. The interface shows the duties in the Book and the family and lifestyle in the header; `harness careers` prints a duties block (obligations met share, detained-associate flip rate supported versus not, weakened share, lifestyle). That block found a design flaw: the flip roll ran at the moment of arrest, so support could never matter; the roll now runs in `state.detained.interrogation` in the second week of detention, the arrest outcomes only arrest, the support card pays the first week at once, and every arrest holds a man four turns. Careers yesMan 30 x 100 after: obligations met 98.5 percent; supported detentions 4, no cooperation in either bucket (the base collaborator rate is small by design; the mechanism is proven by tests). Group 1 complete on the code side; gate: the owner's ten minutes with a jailed man.

## Phase 7 status (slice complete on the code side, 2026-09-25; owner playtest pending)

Design 11. The Turno tab shows the player's town as a 16-pixel tile map drawn from `projectScene` (packages/sim/src/scene.ts): piazza with church and police post, streets of buildings by type and size with state overlays (yours, sponsor's, refusing), the family's men and the kid as figures, water or fields at the edge by archetype. The week plays as beats from the turn log (collect, missed, lean, game, arrest, release, raid, patrol, favor, kid, loan, claim, share, news) at 1x, 2x or skip, with a caption strip and clickable beats; "Guarda la settimana" in the week modal opens it. Portraits are composed from twelve procedurally drawn layers (design 07 §5's counts) from `portraitParts`, deterministic per character and age band, in People, the Book and on the situation cards. The newspaper "La Voce della Provincia" prints the `newspaper` channel of outcome reports (43 lines written across the content) on the Report tab. All art is procedural placeholder in `packages/ui/src/pixel/atlas.ts` and `portrait.ts`, the two files an artist replaces. Equivalence rule (design 07 §4) tested in `scene.test.ts`. Three Sonnet agents, one Haiku writer, owner contracts and one fix (Pixi's async init raced the first redraw). Screenshots: `packages/harness/out/phase7-turn-owner.png`, `phase7-people-owner.png`, `phase7-newspaper.png`.

Known gaps for the next pass: the newspaper has no photo yet (the slot is wired); stories are not grouped by cause chain (design 07 §2.3); the piazza row stacks the family's men who hold no stall; the street and wall tiles read too alike; sign-visibility beats are only partially distinct. Per-turn time unchanged (about 47 ms); the map draws about 1,600 by 700 pixels at scale 3 and scrolls.

Method work the same day (owner's question "can you have an inner event storming"): `docs/event-storming-2026-09-25.md`, a three-role walk of the timeline (player, domain expert, engineer) with gaps and five hotspots. Landed from it and from beat coverage: report lines for the three plain orders (set share, claim, release); ceremony and band-change beats; a validation rule that every outcome following a player choice, and every option, has an answering report line (it found "say nothing" at a patrol stop showing nothing, the feast card with no outcomes at all, and catch-all outcomes that let a choice draw a random result); the proposal scene on an eight-week cooldown (with a bones rule it returned every week); the starter fixture runs the card game like generated worlds; a "one week, seen" story test; beat coverage in `harness coverage`. Open decisions from the storming, for the owner: a business-to-owner relation so shopkeepers become people; routing the first intimidation and the first dispute to the player when they are the party; the kid becoming the player's first associate by name.

## Playtest notes (phase 7)

- (owner) The Turno tab and the newspaper, ten minutes: pending. Questions: does the week read as a place; are the beats legible; do the faces feel like people.

## Phase 6b status (code complete, 2026-09-24; owner playtest pending)

Design 09 (`docs/design/09-first-ranks.md`, §12 has the integration notes). The associate's week is now thirteen decision templates on the engine (`packages/content/src/templates/associate-week.ts`, `associate-people.ts`) and the soldier opening five more (`soldier.ts`); content 0.4.0. La proposta is a derived bar with signs; the sponsor has a personality and a mood line; the rival and the kid exist; the loan book, the record counters, the refusal streak, the succession of the dead, and the `PermissionAsked` fact are in the core; the interface shows situation cards with cost hints, "Sentito sul quartiere" for news, the proposta panel, the sponsor line, the lend form at soldier rank, and a run-end screen for death and being dropped. Harness presets `yesMan`, `careful`, `mixed` and the first-ranks metrics in `harness careers`. Eight Sonnet agents in two waves plus owner contracts, integration, tuning and four engine fixes (decision cadence, scope slot release, zero-delay schedules, AI default for duration-0 decisions).

Two gameplay defects found by the owner's probe and fixed before tuning: the player's sponsor could sit in a crew with no block (now never more crews than blocks, and the player collects first among associates); a weekly decision came every third week (scheduler cadence, design 09 §12).

Fixes from the owner's first soldier session (2026-09-24, same day): the chief's answer to "open the book" was deferred behind the weekly cards by the request budget and lost, so templates that react to a concrete recent event (`spawnFrom`) now bypass the budget; outcome texts never reached the report, so a resolved outcome of a player-facing instance now emits a `ReportNote` ("Lean on him: he paid"), owner progression, no state; a made man's loan draws on the family treasury when his own purse is short (the chief held 71 kL); the ask-permission orders are hidden from associates and "open the book" disappears once open. Golden re-frozen for the report notes.

Owner feedback the same evening: "I miss information" on the cards, and "show the report after ending the turn". Every option hint now states what usually happens, what can go wrong and how often, and what it earns; a week modal ("La settimana") shows the report right after Fine turno and the Report tab keeps it.

Owner's soldier session, second round (2026-09-24): "I don't see the share money", "hard to say who and what is under me", "what are the points". Causes and fixes: a made man held no claim because generation gave every shop to the soldiers of the day, and crews of nine men shared one block of four shops; generation now follows design 05's table (blocks 3 to 6, 6 to 18 businesses per block, crews capped at six soldiers), the crew chief hands a claimless soldier a stall from the crewmate holding the most (family AI, `ClaimTransfer`), and protection collection honors claims (a holder's associates collect his shops, unclaimed shops go round-robin). New "Il libro (the book)" tab: men with share and last turn's payment, stalls with last turn's result, loans with interest and lateness, debts; `Cause.subjectId` carries the shop on a collection. The lend form labels points as percent of the principal per week and previews the weekly sum. ⓘ help on orders and header stats. Golden re-frozen for the generation change. Per turn now about 75 ms (more businesses; budget 2,000; the candidate filter remains the lever). Careers yesMan 20 x 45 after the change: made at median 25 weeks in 65 percent, ended in rank 5 percent (in band), bad favors 20 percent.

Method change, same day (build plan §5b "Stories first", `docs/retrospective-2026-09-24.md`): `harness catalogue` generates `docs/catalogue.md` (every card, option, hint, outcome, odds, effects, report line); content validation rejects an option without a hint and a state-changing outcome without a report line (it found 20 in existing content, all written); `harness coverage` lists options and outcomes never reached by a preset; `harness trace` prints a player's weeks; two executable stories in `packages/sim/src/stories/` (the associate's week from first-ranks §8, the made man's first ten weeks) run on the starter and three generated seeds; economy health checks (crew has a block, shops per soldier, a stall for every made man, the player's treasury can fund a book) reported by `harness sweep` as WARN, never thrown; generation bounds soldiers by shops on the crew's blocks; the archetype ranges are asserted against design 05's table. The rival card's "work harder" now costs 20 kL and "cut him in" thins the game for eight weeks; the card game's stake is 90 with a 70 win and a 200 big night so a bad week still outweighs a week's collections.

Numbers after the method change (2026-09-24, evening): 550 tests in 44 files; `harness quick` 0 violations, deterministic, golden re-frozen (generation bounded by shops, stake retune, rival card), 74 ms per turn; sweep 40 x 52: no health check failing for the player's family; careers yesMan 20 x 45: made at median 28 in 75 percent, ended in rank 0 percent (WARN, low), two or more decisions in 62 percent of weeks (INFO), bad favors 19 percent (WARN), card swing 21 percent (PASS); coverage yesMan 10 x 60: 24 of 94 player-facing outcomes reached, the soldier and chief cards unreached because the presets never ask for the book (retrospective item 2, open).

2026-09-25: the AI presets play the soldier opening (ask for the book and a man every eight turns until granted, lend 100 kL at 3 to 6 points up to three loans) and answer the soldier and patrol cards. Coverage yesMan 20 x 100: 33 of 94 player-facing outcomes reached, every soldier and chief card now reached; careers yesMan 20 x 100: made at median 35 in 70 percent, ended in rank 10 percent (in band), 0 violations. Golden re-frozen for the two seeds that use the loud and mixed presets (their actions changed).

Phase 6c, 2026-09-25 (design 10, `docs/design/10-situations.md`): nine situations with seven follow-ups landed by three Sonnet agents in `packages/content/src/templates/situations-{a,b,c}.ts`: the kid's errand (weekly) and the kid caught; the new owner and the report to the station; the debtor, his week and his flight; the witness who wants to talk and the statement; the sponsor picked up and his return; the block feud; the associate who is short and the man who leaves; the loan gone bad and its extension. Engine: `spawn.cooldownTurns`; favors fade toward zero (half-life 52 weeks); player cards scan only the player (per-turn time back from 155 ms); `LoanDefault` names the business. Presets know the new options. The no-repeat clause of story 1 now holds. Catalogue regenerated: 52 templates. Golden re-frozen (content grew).

Interactive turn (owner's idea, 2026-09-25): a follow-up scheduled with delay 0 now spawns inside the same scheduler run, bound from the parent's roles and outside the request budget, so a card that follows from this week's choice is offered in the same week's modal under "E adesso (and now)", labelled with the choice it came from; the modal cannot be dismissed until those cards are answered. `DecisionView.followUp` carries the parent prompt and option label. The kid caught, the report to the station and the debtor who ran are immediate; the rest keep their delays. Golden re-frozen (spawn sequence changed).

## Playtest notes (phase 6b)

- (owner) Phase 6b, browser, 30 weeks as an associate: pending. Questions: do the cards read as choices with stakes; is the proposta bar legible; does being made feel earned; is 30 to 45 minutes right.

## Last harness numbers (2026-09-24, phase 6b code complete)

- `pnpm check`: typecheck clean (sim and ui), lint clean, 478 tests in 40 files.
- `harness quick`: 30 seeds x 52 turns, 0 violations, deterministic, golden re-frozen (content 0.4.0, generator additions, record facts every turn, engine cadence); about 45 ms per turn (up from 17: eighteen `per: character` spawn templates scan every character; budget 2,000; a per-lane candidate filter on `playerControlled` is the next lever).
- `harness careers --seeds 30 --turns 45 --strategy yesMan`: made at median 27 weeks (18 to 44), in 57 percent of careers (PASS on the median; the rest were arrested or unlucky); ended in the rank 0 percent (band 5 to 10, WARN: death is 3 percent of the bad favor outcomes and rare); decisions per turn median 2, two or more in 67 percent of weeks (story 1 asks 90; INFO); bad favor outcomes 18 percent (band 5 to 15, WARN; "witnessed" counts); card game banked: 15 percent of weeks lose more than a week's collections (PASS).
- `careful`: dropped in 53 percent of careers (band under 2, WARN). This follows from requirement story 5 (five refusals in a row drops you) and a preset that refuses two favors in three; the band and the story disagree, owner's call.
- `mixed`: made at median 29 in 47 percent; bad favors 16 percent.

## Open tuning levers (for the owner after the playtest)

1. Two or more decisions in nine weeks of ten needs a second recurring card (the kid's errand, or a stall of the player's own); weights alone gave 67 percent.
2. Death rate: raise the death branch from 3 to 5 percent, or add death to the game raid, if "ended in the rank" should reach 5 percent.
3. Careful: either accept the drop as the story says, or let favor recover with time.
4. Perf: 45 ms per turn; prefilter `per: character` templates by `playerControlled` in the candidate index.

## Phase 6 status

Complete. The fog-of-war projection `projectView` in the core (exact for what you own, bands for your men, rumors for rivals, signs for the state; deterministic error per viewer, subject and turn), 44 tests. The Preact interface in `packages/ui`: setup (seed, archetype, background, difficulty, ironman, continue, import), shell with calendar, turn length and crisis flags, rank, weight, balances, loyalty and layers; Planning with requests, decisions and rank-gated actions; Report with grouped lines and "What the state may know" from signs only; People and Territory tables with precision marks; IndexedDB saves with export and import; components read only the view. Build 65 kB gzipped. Two Sonnet agents plus owner integration and a browser smoke test with Playwright.

Fixes from the browser smoke test and the terminal probe: associates now collect before men of honor so the player earns from turn 2 in every start archetype; crisis flags contract the turn only when the player's family, crew, town or territory is involved (a war between two other families is news, not a crisis); a business or block on the player's territory counts as player-facing; requests fall back to a sentence instead of a template id; poaching weight 400 to 60 per business per turn; deferred requests carry no instance id (a stale id was tripping engine.requestsValid).

## Playtest notes

- (owner) Phase 4b, terminal: pending. Command: `pnpm harness play --seed <any>`.
- (owner) Phase 6, 2026-09-23, after twelve scripted weeks and a browser session: "It's not fun when all you do is click one button and no action to make." Verdict: the loop and the economy are legible (envelopes in, half up, loyalty and news readable), but the associate rank has no decisions and no path to promotion (weight stays 0), so the first hour is spectating. The share economy cannot be judged until the player has choices. Result: not a go for phase 7; phase 6b "the associate's week" is proposed first.
- Findings feeding 6b: ask-permission actions are placeholders that do nothing; the heavy-share loyalty penalty applies to the customary associate half share and bleeds loyalty four points a week; requests shown to an associate are the chief's decisions and read as if they were his; weight has no associate-reachable input.
- (owner) Phase 6, browser, formal three-question note: pending until 6b lands.

## Phase 5 status

Complete. Seven town archetypes and invented period-correct name pools with schemas (content 0.3.0). A deterministic generator in `packages/sim/src/generation/`: one full-detail province with a capital of 4 to 6 neighborhoods and 4 to 8 provincial towns, 2 to 3 districts, one family per town with 1 to 3 crews, claims, share rules, associates, the player placed as an associate in a start archetype with a high-exposure crew chief, the K5 tutorial beats with re-roll then relax (300 seeds: 0 invariant violations, 0 relaxations after the troubled-business draw). `initialWorld` now generates; the hand-built starter remains a test fixture. Three Sonnet agents plus owner integration.

Performance work, all recorded in code comments: spawn draw before role binding (45 ms saved per turn), a subordinate index for Weight, evidence items merged per crime (dossiers were growing by 12,000 items a year), high-volume facts excluded from the recent-fact window, per-turn hashing made optional for bulk runs. Per-turn time on a generated province: 142 ms and growing before; about 15 ms flat after (25 ms in the harness perf command which includes the report). The 5 ms target in the phase 5 task was not reached; `structuredClone` of the world is now the largest single cost (5 ms) and is the next lever if needed.

Tuning from the careers probe: routine collection heat is emitted once per town per turn instead of per block (four-block towns were drifting into band 3 from collections alone); patrol threshold 40 to 20; arrests metric normalized per family; collaborator-rate band scaled by career length (the 2 to 10 percent target is for forty years).

## Phase 4 status

Complete. Engine extensions (entity equality, bound, cmpRoles, sameFamily, decided; relations blockOf, chiefOf, membersOf, claimHolderOf, crewOf from a business; `$turnPlus`, `$role.claim`, the `each` iterating effect; flip roll as a registered predicate). Arrests moved from code onto five lane-1 templates (patrol and raids by heat and squad). Weight per design 03 §1 as a derived value with rank thresholds; promotion of the player from associate to soldier and from soldier to crew chief with `CrewChiefSet`; UI layer unlocks. Player actions: set share, claim business, release claim, ask permission. Disputes: a second starter family in the town of Contrada, a poaching template, and `dispute.claim` with the three approaches (concede, pay, hold) resolved by Weight comparison, war as the failure state. Associates on record now collect with their sponsor's crew, so the player earns from turn 2. The terminal play loop `harness play` with scripted mode and shared save files. Six Sonnet agents in two waves plus a test-repair agent.

Watch item: per-turn time rose from 0.8 to 1.8 ms with the second family (spawn passes iterate businesses per template). Budget is 2,000 ms; fine, but generation in phase 5 multiplies towns and the engine should gain a per-lane candidate index before that.

## Playtest notes

- (owner) Phase 4b: pending. Command: `pnpm harness play --seed first --save packages/harness/out/first.json`. Commands inside: `who`, `map`, `end`, `ask makeAssociate`, `save`, `quit`.

## Phase 3 status

Complete. The event engine per design 04: template and instance contracts, the predicate language with a `fn` registry, role binding with nine relations and pick rules, effect resolution with `$role` references and `$expr`, the six-lane scheduler (decisions with timeouts, due firings, scheduled entries re-validated at fire time, weighted spawn pools, exclusive tags, subject locks, per-rank request budget with deferral, crisis flags), four engine invariants, the content package's zod schemas with referential validation (fact kinds, fn names, template ids, declared roles, option ids), content version 0.2.0, and the first chain of consequence as six data templates: refusal, the intimidation decision (glue, arson, bomb, none), arson and bomb operations with weighted outcomes, refusal spreading, and a police squad watch. Scenario tests drive a player decision through the chain. Four Sonnet agents in two waves.

Two defects found by the chain's scenario tests and fixed: the schedule invariant was off by one against the step order (fixed in `invariants/engine.ts`); requests stayed in the queue after their process resolved (fixed by `sweepRequests` in `reducers/progression.ts`, run every turn).

Deferred from the phase 3 list: migrating the state's arrest chain from `systems/state-actions.ts` onto templates. It works as code today; the migration is scheduled as the first task of phase 4 so disputes and arrests land on the engine together.

Known limits recorded in `packages/content/src/templates/civil.ts` comments: a decision template needs duration 1 (duration 0 resolves before the decision pass); no business-to-crew relation in roles.ts, so the chief is found through the town; no string interpolation in effect references; no entity-equality predicate, so `civil.refusal.spread` may pick the refusing shop as its own neighbour.

## Phase 2 status

Complete. Evidence (dossiers, derived exposure, activity-based evidence for collectors and a discounted item for the chain owner), pressure (local heat with 4-week half-life feeding family Attention with a size floor and 104-week half-life; five bands with hysteresis; tools unlocked per band), the state's lane-1 actions (raids at heat 300 and 600, band-1 patrol arrests, four-turn detention, the flip roll against loyalty with testimony, fear and betrayal memories), release of detainees, report lines for arrests, band changes and talk, and the harness `careers` command with the first outcome distributions. Four Sonnet agents in one wave, docs by Haiku.

Tuning done from the careers probe (recorded in code comments): Attention inflow divisor 8 to 16 (at 8 a quiet family saturated near 900; at 32 it plateaued at 173 in band 0); band-1 patrol arrests added (2 percent per turn at heat 40 or more under the informant network) so arrests and flips are exercised before intimidation exists.

## Phase 1 status

Complete. Claims (one holder per subject, associates on record), relationships (loyalty, favors, bounded memory, loyalty decay), towns (Sentiment, compliance, fear, refusal ladder, compliance chance), territory (block assignment, crew membership), processes (chain instances as slot boards), characters (superior, share rules), the protection-tax chain (weekly tariffs for small payers, feast collections for large), shares cascading leaves-first with the treasury cut, family AI that runs non-player crews (ensures chains, fills slots, sets share rules), and a hand-built starter world (one town, two blocks, eleven businesses, one family, one crew, the player as an associate on record with a soldier). Method: contracts written by the owner, implementation by five Sonnet agents in two waves with disjoint file ownership, docs by a Haiku agent.

One defect found by probing a 52-turn run and fixed: shares did not cascade (the chief's income was minted money only, so the head received nothing). Fixed in `systems/shares.ts` with a leaves-first pass counting received shares as income; test added.

## Last harness numbers (2026-09-23, phase 6 complete)

- `pnpm check`: typecheck clean (sim and ui), lint clean, 394 tests in 31 files; `pnpm build` 239 kB (65 kB gzipped).
- `harness quick`: 30 seeds x 52 turns, 0 violations, deterministic, golden re-frozen; `harness sweep --seeds 100`: 0 violations; 17 to 18 ms per turn.
- `harness careers --seeds 12 --turns 208`: arrests 0.72 per 100 turns per family (in band); bands 3 and 4 at 0 percent; collaborator rate on pace for the forty-year target; loyalty mean 448 (down from 476 after the poaching and dispute effects; watch).
- Terminal probe, ten turns as an associate on a generated world: collections from turn 2, half paid up, balance 182 kL by turn 10.

## Harness numbers (2026-09-23, phase 5 complete)

- `pnpm check`: typecheck clean, lint clean, 345 tests in 28 files.
- `harness quick` (now 30 seeds x 52 turns): 0 violations, deterministic; golden re-frozen for generated worlds; 25 ms per turn.
- `harness careers --seeds 12 --turns 208` (quiet, 8 families each): arrests 0.72 per 100 turns per family (in band); band occupancy 59 percent band 0, 41 percent band 1, none above; collaborator rate 0 to 0.8 percent over four years, on pace for the forty-year target; loyalty mean 476.
- Generation: 300 worlds in 0.7 s, 181 to 502 characters, 8 towns, about 200 businesses, all seven start archetypes drawn.

## Harness numbers (2026-09-23, phase 4 complete)

- `pnpm check`: typecheck clean, lint clean, 326 tests in 26 files.
- `harness quick`: 100 seeds x 52 turns, 0 violations, deterministic; golden re-frozen; 1.8 ms per turn.
- `harness careers --seeds 20 --turns 208` (quiet): minted about 45,000 kL per career (two families); arrests 1.2 per 100 turns (in band); band occupancy 65 percent band 0, 35 percent band 1; loyalty mean 570; collaborator rate WARN (family size, as before).
- `harness play`, ten scripted turns as an associate: collections from three small businesses, half paid up to the sponsor, balance 24 kL after the first collection turn.

## Harness numbers (2026-09-23, phase 3 complete)

- `pnpm check`: typecheck clean, lint clean, 273 tests in 21 files.
- `harness quick`: 100 seeds x 52 turns, 0 violations, deterministic; golden re-frozen for content 0.2.0; about 0.8 ms per turn (up from 0.29 with the scheduler running; budget 2,000).
- `harness careers --seeds 20 --turns 208` (quiet): arrests 0.96 per 100 turns (in band); band occupancy 30 percent band 0, 70 percent band 1; peak heat now 50 to 70 (the refusal chain fires in some seeds); collaborator rate WARN as before (family size).

## Harness numbers (2026-09-23, phase 2 complete)

- `pnpm check`: typecheck clean, lint clean, 192 tests in 17 files.
- `harness quick`: 100 seeds x 52 turns, 0 violations, deterministic; 4 golden seeds re-frozen; about 0.28 ms per turn.
- `harness careers --seeds 20 --turns 208` (quiet): arrests median 2 per career (0.96 per 100 turns, in band 0.5 to 6); cooperations 0 to 1; band occupancy 30 percent band 0, 70 percent band 1, none above; loyalty mean 527; collaborator rate WARN because the starter family has three members, so one flip is 33 percent; the metric needs generated families (phase 5).

## Harness numbers (2026-09-23, phase 1 complete)

- `pnpm check`: typecheck clean, lint clean, 138 tests in 13 files.
- `harness quick`: 100 seeds x 52 turns, 0 invariant violations, same-seed reruns identical; 4 golden seeds re-frozen for the starter world and matching; 0.135 ms per turn.
- 52-turn probe of the starter world: 7,892 kL minted; soldiers hold about 2,100 to 2,700, the chief 1,874, the head 844, the treasury 398. The player earns nothing yet (no player actions until phase 4). Chief loyalty rose to 574 under the head's 30 percent rule.

## Harness numbers (2026-09-22, phase 0 scaffold)

- `pnpm check`: typecheck clean, lint clean, 31 tests passing in 6 files.
- `harness quick`: 100 seeds x 52 turns, 0 invariant violations, same-seed reruns identical.
- `harness replay`: 4 golden seeds match (`packages/harness/golden/seeds.json`, schema 1, content 0.1.0).
- `harness perf`: generation under 1 ms, about 0.03 ms per turn on an empty world (budgets 15,000 ms and 2,000 ms). Meaningless until phase 1 populates the world; recorded as the baseline.

## Phase 0 status

Complete. Foundations in place: monorepo (`shared`, `sim`, `content`, `harness`), seeded named streams, the full World tree with empty branches, Facts with owner order and three reducers (ledger, characters, calendar), seven invariants, `step`, record/replay/load with snapshots, the content loader with schema, the harness CLI with quick/sweep/replay/perf/golden, and the repository rulebook in `CLAUDE.md`.

## Plan change

- 2026-09-23: phase 4b added to the build plan: a command-line play loop in the harness (`harness play`), delivered with phase 4 so the game is playable in the terminal before the text interface.

## Phase 6b, "the first ranks" (specified 2026-09-24, awaiting go)

Requirements: `docs/first-ranks-requirements.md`. Design: `docs/design/09-first-ranks.md` (2026-09-24) (decisions: two or three decisions a week; real stakes including death; a visible bar toward being made; 30 to 45 minutes). It supersedes the five-item sketch below, which is kept for history.

### Earlier sketch

1. The late-payer decision as a player-facing template when a business the player collects from fails to pay: let it slide, lean on him (FearDelta, small HeatDelta, EvidenceAdd), or tell the sponsor (FavorDelta spent, the sponsor's crew handles it).
2. The card game as a second core chain the associate runs: weekly stake decision (bank it yourself with variance, or borrow the stake from the sponsor and owe him), income by town population and Sentiment, heat when left in one place; a `relocateGame` action.
3. Sponsor favors as templates: drive, carry a note, watch a door; accept (FavorDelta up, small EvidenceAdd) or refuse (FavorDelta down, MemoryAdd).
4. Associate weight: steady collections and reliable envelopes count toward Weight so a year of good work reaches the soldier threshold; the customary half share carries no loyalty penalty; requests that are another man's decision are labeled as news in the view.
5. Hide the permission actions until soldier rank, then wire them: make an associate (chief's favor and intake) and open the book (loan capital from the chief, the loan chain from design 03 §4).

## Next tasks (phase 7, pixel presentation), after phase 6b and the owner's playtest

1. Renderer as replay (design 07 §6): a PixiJS 8 view that plays TurnLog entries for one chosen place in tick order, with a place filter and an equivalence test that every player-visible entry appears in exactly one report view.
2. Pixel pipeline (design 07 §7): 16 px tiles, a 48-color 1970s palette, layered 32 px portraits that age, building sprites per business type; generated content only, no hand-placed art.
3. The newspaper as a styled panel with period masthead and headlines grouped by cause chain (design 04 §6, L5).

## Phase 6 task list (done)

1. `packages/ui`: a Preact application over the headless core with no art: setup screen (seed, archetype, background, difficulty, ironman), the Planning screen with the request queue and rank-gated actions, the Report screen, `who` and `map` as panels; saves in IndexedDB with export and import (design 01 §6, design 07 §2 to §4 and §8).
2. The fog-of-war projection as a pure function (design 07 §5): exact, estimate, rumor, sign; the "what the state may know" panel from signs only.
3. Playtest gate: the owner plays the vertical slice (associate to crew chief) in the text interface and answers the three hypotheses from build plan section 4 phase 6.

## Phase 5 task list (done)

1. Generation pipeline stages 1 to 6 of design 05 for ONE province: real-shaped island stub, the player's province, districts of 3 or more families, towns and Palermo neighborhoods from the seven archetypes with their business mixes and institutions, blocks and businesses, families with sizes per K2, the cast around the player (K3). Replace `buildStarterWorld` with the generator behind the same `initialWorld` entry point; keep the starter as a fixture for tests.
2. Constraints and guaranteed tutorial beats (K5, C13) with the re-roll then relax policy; the harness `sweep` gains the generator property checks over 1,000 seeds; period-correct name pools in content.
3. Performance: a per-lane candidate index in the scheduler so spawn passes do not iterate every business for every template; keep turn time under 5 ms with a full province.

## Phase 4 task list (done)

1. Migrate `systems/state-actions.ts` onto lane-1 templates (`state.raid`, `state.arrest.flip`, `state.detention.release`) keeping the state-actions tests green by asserting the same facts; add `EntityEquals` and a business-to-crew relation to the engine as the chain authoring exposed.
2. Disputes (E1, E2): a claim collision detector emitting `dispute.claim` templates with the decision options concede, pay, hold; outcomes by rank, prior claim, favors and reputation; a war flag as the failure state; scenario tests for user stories 2 and 5.
3. Weight and promotion (G2, G3): the Weight formula from design 03 §1 as a derived value, thresholds per rank, promotion scenes as templates, UI layer unlocks; the first player actions (set share, claim a business, request permission) as PlayerAction kinds; then phase 4b: `harness play` terminal loop.

## Phase 3 task list (done)

1. Engine core: `ProcessTemplate`, `ProcessInstance`, the predicate DSL (`all/any/not/cmp/band/has/status/rank/recent/fn`), role selectors, effects as Fact constructors, the six-lane scheduler with priority order, re-validation at fire time, subject locks, per-rank budget, exclusive tags (design 04 §1 to §4). Content package gets the zod schema for templates (design 06).
2. Migrate the state's arrest-to-release chain and the flip roll onto templates in lane 1 so `stateActions` becomes template spawning; keep the tests green by asserting the same facts.
3. The first chain of consequence: `civil.refusal.start`, the player decision `family.intimidation.choose`, `operation.arson`, and follow-ups (`civil.refusal.spread`, `state.squad.assigned`, `civil.antagonist.spawn`) with heat and Sentiment effects (design 04 §8), plus the scenario test for user story 11.

## Notes

- Golden seeds are created by `pnpm harness golden --update` after phase 0 is green and are then frozen.
- Design-level items still open for design refinement during phase 1: exact Weight coefficients (03 §1), heat constants (03 §2).

## Golden seed changes

- 2026-09-23: golden hashes re-frozen after phase 1 wave 1 contracts added fields to World (`favors`, `Character.onRecordWith`, `Character.memory`, typed towns/blocks/businesses/claims). No behaviour change; shape change only.
- 2026-09-23: re-frozen after wave 2 contracts (families, crews, chains tables; Character.superiorId/shareRules/crewId; Ledger.turnIncome). Shape only.
- 2026-09-23: re-frozen after the starter world, protection-tax chain, shares and family AI landed. Behaviour change: money now flows in every golden run. Baseline confirmed by a 52-turn probe.
- 2026-09-23: re-frozen after phase 2 contracts (Dossier table, Family.attentionBand, Character.detainedUntilTurn/cooperating). Shape only.
- 2026-09-23: re-frozen after phase 2 systems landed and tuning (inflow divisor 16, patrol arrests). Behaviour change: exposure accrues, Attention reaches band 1, arrests occur.
- 2026-09-23: re-frozen after phase 3 contracts (engine instance/schedule tables typed, Request queue and deferred, history.recentFacts). Shape only.
- 2026-09-23: re-frozen for content 0.2.0 with the refusal chain templates live. Behaviour change: the chain fires on low-compliance shops; golden runs on the starter world are mostly unaffected (compliance 700).
- 2026-09-23: re-frozen after phase 4 contracts (Character.weight). Shape only.
- 2026-09-23: re-frozen after arrests moved from code onto lane-1 templates and WeightSet facts began firing. Behaviour: same arrest formulas, different stream usage; arrests 1.68 per 100 turns.
- 2026-09-23: re-frozen after phase 4: second starter family (Contrada), dispute and poaching templates, associates as collectors, WeightSet. Behaviour change confirmed by careers.
- 2026-09-23: re-frozen after phase 5 contracts (Province, District typed; Town.provinceId/districtId/isNeighborhood; Family.districtId). Shape only.
- 2026-09-23: phase 4b owner playtest still pending; phase 5 started at the owner's request.
- 2026-09-23: re-frozen for phase 5: generated worlds behind initialWorld, content 0.3.0, spawn draw before binding, evidence merging, recent-fact filtering. Behaviour change confirmed by careers.

## Watch items after phase 5

- `initialWorld` falls back to the hand-built starter when content has no archetypes (tests with EMPTY_CONTENT). Generated worlds are the only path in the harness and the game.
- `engine/perf.test.ts` asserts a 5 ms scheduler median on a synthetic large world; it can flake under CPU contention when several harness runs execute concurrently. Run it alone in CI.
- Crew count per family is derived from the family size target rather than drawn independently (generator note); no invariant depends on soldiers per crew.
- 2026-09-23: re-frozen for phase 6 fixes: crisis flags only for player-facing instances, associates collect first, poaching weight 60, request text fallback.
