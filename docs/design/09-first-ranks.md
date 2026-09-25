# Design 09: The First Ranks (phase 6b)

Status: design, 2026-09-24, from `docs/first-ranks-requirements.md`. Everything here runs on the existing engine (design 04), the existing owners (design 02 §6) and the existing view contract (`view.ts`). New engine surface is listed in §7 and is small. Numbers are starting values for tuning; the harness metric in §10 owns the bands.

---

## 1. Mapping: requirement to mechanism

| Requirement (first-ranks §) | Mechanism | New? |
|---|---|---|
| Two or three decisions a week (§2) | Decision templates in the `families` lane spawned per player with `maxActivePerScope 1` each; the existing per-rank request budget (3 at associate) is the cap | Templates only |
| Late payer (§2.1) | `CollectionMissed` fact emitted by the protection-tax chain; template `assoc.latePayer` spawns on it | One fact kind |
| Card game (§2.2) | Weekly decision template `assoc.game.stake` with weighted outcomes; venue heat via `HeatDelta`; raid via `assoc.game.raid` | Templates only |
| Sponsor's favors (§2.3) | Templates `assoc.favor.drive`, `.note`, `.door` with outcome pools conditioned on world state; bones via memory tag `murder` | Templates only |
| Rival associate (§2.4) | Generator guarantees a second associate on the sponsor; templates `assoc.rival.*` | Generator + templates |
| Shopkeeper's problem (§2.5) | Template `assoc.civil.help` | Templates only |
| Patrol stop (§2.6) | Template `state.patrol.stop` in the `state` lane | Templates only |
| Sponsor's short week (§2.7), feast (§2.8) | Templates `assoc.sponsor.short`, `assoc.feast.chipIn` | Templates only |
| The bar, la proposta (§3) | Derived value from a per-character `record` (counters) plus favor and intake; `RecordDelta` fact owned by progression | One fact kind, one field |
| Dropped, death, flip (§3) | Templates `assoc.sponsor.warning`, `assoc.sponsor.dropped`; death as an outcome of favors; flip via existing arrest templates | Templates only |
| Sponsor personality, rival, kid (§4) | Traits on characters; the kid as a generated civilian on record with the player | Generator + traits |
| News labeled as news (§4) | `RequestView.kind: "decision" \| "news"` in the view | View field |
| Soldier opening (§5) | Loan book (new small subsystem, §6), `soldier.askAssociate` with `CharacterCreate`, existing claims and shares | One subsystem, one fact kind |
| Presentation (§6) | Situation cards = decisions with cost hints in `DecisionOption.hint`; proposal panel; sponsor mood line | Template field, view fields |

---

## 2. State additions (design 02 owners unchanged)

```ts
// Character (owner: progression for record; characters for traits)
record: {
  weeksPaid: number;      // envelopes paid in full on time, cumulative
  weeksMissed: number;
  jobsDone: number;       // favors accepted and completed
  jobsRefused: number;
  jobsBotched: number;
  arrests: number;
  streakPaid: number;     // consecutive weeks paid; reset on a miss
};
// Family.policy (owner: territory/families as today)
bonesRequired: boolean;   // set by the generator: 30 percent of families
// Character.traits gains the sponsor personalities: "patient" | "hothead" | "schemer" | "gambler"
// and roles: "kid" (a civilian errand boy on record with the player), "reporter" | "proud" | "latePayer" (shopkeepers)
// Character.memory tags used by templates: "murder", "talkedToPolice", "refusedJob", "gameRaided", "dropped", "owesSponsor"
```

New facts: `CollectionMissed { businessId, collectorId }` (owner towns; no state change, logged so `recent` predicates can see it); `RecordDelta { characterId, field, delta }` (owner progression); `CharacterCreate { id, name, rank, familyId, superiorId, crewId, onRecordWith, traits }` (owner characters; the id is minted by the emitter via the `$mint:chr` reference, §7); `LoanOpen`, `LoanPayment`, `LoanDefault` (owner ledger, §6).

---

## 3. Derived values

**La proposta** (0 to 1000, shown as a band with signs; owner progression, recomputed each turn):

```
proposta = clamp(
    15 * min(weeksPaid, 30)              // up to 450: a steady earner (tuned 2026-09-24 from 12)
  +  4 * min(streakPaid, 30)              // up to 120 for a long streak
  + 45 * min(jobsDone, 6)                 // up to 270: useful (tuned from 40)
  - 60 * jobsRefused
  - 90 * arrests
  + favor(sponsor -> player) / 4          // -250..250
  + (bonesRequired ? (has memory "murder" ? 150 : -200) : 0)   // -200 tuned 2026-09-24 so the proposal can still fire and send the player on the test
)
```

Bands and signs: 0 to 249 "your sponsor barely knows your name"; 250 to 499 "your sponsor is pleased"; 500 to 749 "you are spoken of"; 750 and up "the books decide". Proposal fires when `proposta >= 750`, the family's `intakeOpen` is true and the player is not detained. Target on default difficulty for a player who takes most jobs and pays on time: 25 to 35 weeks (15 × 26 + 4 × 10 + 45 × 6 + favor ≈ 750 by week 30).

**Associate Weight** uses the same inputs at a lower scale: `lnScaled120(jobsDone) + streakPaid + weeksPaid/2`, so Weight and the proposal agree and the soldier threshold is reachable from the record alone.

**Sponsor mood** (a sentence in the header): from `favor(sponsor -> player)` and his personality: five bands, personality-flavored text.

**Signs shown for the proposal**: the top three contributing terms rendered as sentences, positive or negative ("You have paid every week since spring." "You said no twice." "This family wants a man to have done something first.").

---

## 4. The templates (associate)

All in lane `families` unless noted, scope `town`, kind `event`, spawn `per: character` bound to the player role `me` (`where: playerControlled is true`), `maxActivePerScope 1`, duration 1 so the decision pass offers them (design 04 note in NOW), decision role `me`, timeout 1 with a stated default. Each option carries `hint` (the cost in words). Budget: the request budget (3 at associate) is the cap; templates carry priorities so the late payer and the game outrank the feast.

| Template | Spawn weight and preconditions | Options (default marked) | Notable outcomes |
|---|---|---|---|
| `assoc.latePayer` | 10000 when `recent CollectionMissed` names a business the player collects (role `shop` bound via the fact) | slide (default), lean, tellSponsor, sendKid | lean: FearDelta +60 shop, +20 neighbors, HeatDelta +8, EvidenceAdd me 4; if shop has trait reporter: WitnessSet-equivalent EvidenceAdd 30 source witness and 20 percent `state.patrol.stop` follow-up. tellSponsor: FavorDelta sponsor→me −15, RecordDelta; third time within 12 turns: `assoc.sponsor.reassign` follow-up. sendKid: same as lean at half strength; 15 percent botched (MemoryAdd shop "laughed", ComplianceDelta −40). |
| `assoc.game.stake` | 10000 every week while me has memory tag `runsGame` | bankSelf, borrow (default), skip, move | bankSelf outcomes: good (55) MoneyMint +30..+80; bad (35) MoneyDestroy 20..60 sink gamblers; big night (10) +150. borrow: MoneyMint +20..+50 and FavorDelta −5; bad week: FavorDelta −20 and MemoryAdd "owesSponsor". Every run: HeatDelta +3 on the town. move: HeatDelta −30, no income. skip: MemoryAdd regulars drift, next good-week weight −10 for 4 turns (as a follow-up flag). |
| `assoc.game.raid` | lane state, weight 1500 when town heat ≥ 60 and me has `runsGame` and last stake was not skip | none (event) | StatusChange me arrested untilTurn +3, MoneyDestroy bank (last stake), RecordDelta arrests +1, HeatDelta −80, then the existing flip roll fn; MemoryAdd "gameRaided". |
| `assoc.favor.drive` | weight 900 (patient) / 1800 (hothead) / 600 (schemer) / 900 (gambler); not within 6 turns of another favor | accept, decline (default) | accept outcomes by state: pickup (60 base): FavorDelta +40, RecordDelta jobsDone, EvidenceAdd 5. killing (15 base, +25 if a `war` flag or an open `dispute.claim` involves the family, +30 if bonesRequired and proposta ≥ 500): MemoryAdd "murder" 300, EvidenceAdd 120 participation, FavorDelta +80, RecordDelta jobsDone. stopped (10, +10 per band above 0): StatusChange arrested +4 and flip roll. witnessed (10): EvidenceAdd 30 witness. decline: FavorDelta −40, RecordDelta jobsRefused, MemoryAdd sponsor "saidNo" aboutId me. |
| `assoc.favor.note` | weight 700 (schemer 1600) | accept, decline | accept: FavorDelta +25, jobsDone; intercepted (15, +15 if family band ≥ 2): EvidenceAdd me 20 document, EvidenceAdd sponsor 50 document, MemoryAdd "knownCourier". |
| `assoc.favor.door` | weight 700 (hothead 1400) | accept, decline | accept: FavorDelta +30, jobsDone; something happened (30): MemoryAdd "sawSomething" 120; police arrive (10): arrested +4 and flip roll; witnessed (10): EvidenceAdd 30 witness. |
| `assoc.rival.poach` | weight 500 when a rival associate (same sponsor) exists | outwork, cutIn, rat, settle | outwork: RecordDelta jobsDone +1 next favor auto-accepted flag; cutIn: game income −30 percent for 8 turns, rival FavorDelta toward me +40; rat: FavorDelta sponsor→me +20, MemoryAdd rival "ratted" aboutId me, MemoryAdd me "talker" (reputation); settle: operation-like outcome: fear, HeatDelta +15, EvidenceAdd 15, rival MemoryAdd "beaten" grudge 200, 10 percent arrested. |
| `assoc.civil.help` | weight 600 | helpFree, helpFee, ignore (default) | helpFree: SentimentDelta +25 town, FavorDelta shopkeeper→me +30 (a named shopkeeper is created lazily via CharacterCreate if none); helpFee: MoneyMint +15, SentimentDelta +5; ignore: SentimentDelta −10. |
| `state.patrol.stop` | lane state, weight 400 + 20 per town heat/10 | silent (default), talk, bribe | silent: MemoryAdd officer "knowsFace" (a state actor generated lazily). talk: 15 percent EvidenceAdd sponsor 20 document and MemoryAdd me "talkedToPolice" 80. bribe: MoneyDestroy 10 sink bribe, MemoryAdd officer "paid". |
| `assoc.sponsor.short` | weight 300 (gambler 900) | lend, give, refuse | lend: MoneyMove me→sponsor 20..60, FavorDelta +30, follow-up `assoc.sponsor.repay` at 6 turns probability 6000; give: FavorDelta +60; refuse: FavorDelta −30. |
| `assoc.feast.chipIn` | weight 10000 on the feast week of the year | chipIn, keep (default) | chipIn: MoneyDestroy 10 sink feast, SentimentDelta +15, FavorDelta +10. |
| `assoc.sponsor.warning` | weight 10000 when favor(sponsor→me) ≤ −100 and not within 8 turns of the last warning | none | Report sponsor line; MemoryAdd "warned". |
| `assoc.sponsor.dropped` | weight 10000 when favor ≤ −220 or `jobsRefused` ≥ 5 | none | Scene: ClaimRelease of me, `SuperiorSet null`; follow-up `assoc.sponsor.takenOn` (probability 5000: another soldier of the crew takes me, favor 0) else `assoc.run.ends` (legacy screen: "you drifted away from the life"). |
| `assoc.proposal` | weight 10000 when proposta ≥ 750 and intakeOpen and me free | none (scene) | RankChange soldier, CrewMemberAdd, SuperiorSet crew chief, UiLayerUnlock loanBook, MemoryAdd "made"; if bonesRequired and no `murder` memory, the template instead schedules `assoc.favor.drive` with the killing outcome forced (the test). |

Death: the `killing` and `police arrive` outcomes carry a 3 percent `StatusChange dead` branch for me on default difficulty (gentle halves, hard doubles); always preceded by the sign "the crew has been quiet and your sponsor is not" in the report the week before (a follow-up that spawns the favor with the higher risk one turn later).

---

## 5. Generator additions (design 05)

- The player's sponsor gets exactly one personality trait; the family gets `bonesRequired` with probability 3000 per ten thousand.
- A second associate on record with the sponsor is guaranteed (the rival), with a name and the trait `ambitious`.
- The kid: a civilian, age 14 to 17, `onRecordWith: me`, trait `kid`, no account income of his own.
- Shopkeepers on the player's block get lazily created characters when first involved, with one trait from {reporter 15 percent, proud 20, latePayer 25, none}.
- The player starts with memory tag `runsGame` and 20 kL of cash (the game needs a bank).
- The K5 beat `earlyCollisionPlausible` is now satisfied by the latePayer trait rather than only by low compliance.

---

## 6. The soldier opening

- **Loan book** (owner ledger; `Character.loans: Loan[]` where `Loan = { id, borrowerBusinessId, principal, points, openedTurn, weeksLate }`). Facts: `LoanOpen { lenderId, businessId, principal, points }` (moves principal from lender's account to the external "civilians" account and records the loan), `LoanPayment` (weekly: MoneyMint interest to lender from civilians, probability from the business's compliance and size; on failure `weeksLate += 1`), `LoanDefault` (when `weeksLate ≥ 4`: the loan closes; if the business is unclaimed the lender gets `ClaimSet`; else `FearDelta +100` and principal lost). Capital: "Open the book" is `soldier.openBook`: the chief moves 400 kL to the player and a `RecordDelta` opens a chief loan at 1 point a week, paid by the shares system as a fixed weekly `MoneyMove` until repaid (the chief's loan is a Loan on the player with the chief as lender). Player action `lend { businessId, principal, points }` validated against balance and claims.
- **Make an associate**: `soldier.askAssociate` decision by the chief (AI: yes when favor(chief→me) ≥ 0 and intakeOpen; else no with a reason line). Yes emits `CharacterCreate` (rank associate, `onRecordWith: me`, `superiorId: me`, joins the crew), `ClaimSet` associate on me, `ShareRuleSet` me→him 500.
- **First arrest below you**: existing patrol templates already arrest associates; add the decision `soldier.detained.support` when one of my associates is arrested: pay lawyer (MoneyDestroy 30), support mother (MoneyDestroy 15 per turn while detained, FavorDelta and a lower flip pressure via the `familySupported` term already in the flip fn), or nothing.
- **The chief's demands**: `chief.demand.envelope` (a fixed extra share this quarter: accept or argue) and `chief.demand.man` (lend an associate for a job: the associate runs `assoc.favor.*` with me as sponsor).

---

## 7. Engine extensions (small)

1. Reference `$mint:<prefix>` in effects resolves to a freshly minted id (`mintId(world.meta.ids, prefix)`), used by `CharacterCreate` and `LoanOpen`.
2. `DecisionOption.hint: string` (a cost sentence) surfaced in `DecisionView.options[].hint`; schema updated.
3. Template field `priority` already exists; the request queue is sorted by priority then age so the late payer and the game come first.
4. `recent` predicate gains `role` binding by any subject id (already) plus a `bind` on spawn: a template may declare `spawnFrom: { factKind: "CollectionMissed", role: "shop", field: "businessId" }` so the spawn pass iterates recent facts instead of entities; this is how `assoc.latePayer` binds the shop. Implemented as a fourth spawn source in the spawn pass.
5. `RequestView.kind` and `DecisionView.hint` in `view.ts`; `PlayerView.proposta: { band, signs }` and `sponsorMood: string`.
6. Fact kinds: `CollectionMissed`, `RecordDelta`, `CharacterCreate`, `LoanOpen`, `LoanPayment`, `LoanDefault`.

Nothing else changes in the engine. All situations are templates; all consequences are existing facts.

---

## 8. Interface (packages/ui)

- Planning: a "This week" list of situation cards (decisions with hints), then "Orders" (actions), then "Heard on the block" (news requests). The late payer and the game cards show the shop and venue names.
- Header: the sponsor's mood sentence beside loyalty; a "Being made" band with its three signs in a small panel on Planning and Report.
- Report: each consequence line names the choice ("You leaned on Turi's stall: ...") using the cause's template and option ids mapped to the option label.
- Setup: no change. The permission actions are hidden until soldier; at soldier they become "Open the book" and "Ask to make an associate" with the outcomes above.

---

## 9. Content volume

12 associate templates with 44 outcomes; 6 soldier templates with 16 outcomes; 4 sponsor personalities as trait sets read by weights; 3 shopkeeper traits; 2 scenes (ceremony, dropped) as report text on templates; about 70 short text lines. Content version 0.4.0.

---

## 10. Harness and tests

- **AI associate player**: three presets for `harness careers` at the associate rank: `yesMan` (accepts every favor, banks the game himself), `careful` (declines favors, borrows the stake, moves the game at heat 40), `mixed`. Metrics: turns to proposal (band 25 to 35 for yesMan on default), share of careers ending in the rank (5 to 10 percent for yesMan, under 2 for careful), decisions offered per turn (median 2 to 3), favor outcomes distribution (5 to 15 percent bad), card game weekly result distribution (bankSelf: at least one week worse than a normal collection week per 20).
- **Scenario tests**: one per template (as the content rule requires) plus the seven user stories in the requirements as scenarios; the dropped path and the ceremony path end to end through `step`.
- **Invariants**: `progression.recordNonNegative`; `ledger.loansConsistent` (every loan's business exists; principal positive; a defaulted loan is closed); `characters.createdValid` (a created character has an account, a superior that exists, and a claim if on record).

---

## 11. Build order (phase 6b waves)

1. Contracts (owner): state fields, six fact kinds, `$mint`, `spawnFrom`, `hint`, view fields, reducer cases for `RecordDelta`, `CharacterCreate`, loans; the proposta derived value; harness presets skeleton.
2. Wave A (parallel): (a) associate templates 1 to 6 with scenario tests; (b) associate templates 7 to 13 with the dropped and proposal scenes; (c) generator additions and the kid; (d) loan book subsystem with tests.
3. Wave B (parallel): (a) soldier templates; (b) view fields, proposta panel, situation cards and news labeling in the UI; (c) harness presets and metrics.
4. Owner: gate, careers on the three presets, tune weights to the bands in §10, browser playtest of thirty weeks, then hand the phase 6 playtest back to the owner.

---

## 12. Implementation notes (2026-09-24, owner integration of wave A)

- **Cadence.** A player decision template uses `duration: 0`; the scheduler offers it in the run it spawns, a resolved instance frees its `maxActivePerScope` slot in the same run, and a zero-delay schedule added after its lane's scheduled pass is dated to the next turn. Without these the weekly card game came every third week.
- **Collections.** Generation never makes more crews than blocks, and the chain sorts the player first among associates; before this the player's sponsor sat in an empty-chain crew in two seeds of twelve and the player earned nothing.
- **Tuning from the probe** (15 seeds x 45 turns per preset): favor cooldown 1 turn, spawn weights drive 3500, note 2500, door 2500, civil 2500, patrol 1500, rival 1200, short 1000; decline costs 20 favor (was 40); borrow costs 3 favor (bad week 10); proposta 15 per week paid, 45 per job, streak capped at 30, bones penalty 200. Result: the yes-man is made in 18 to 37 weeks (median 29) in two thirds of careers; the careful man survives; two or more decisions in about two thirds of weeks (story 1 asks for nine in ten; a second recurring card is the open lever).
- **Refusals in a row.** `record.streakRefused` (reset by an accepted favor) drives the warning at 3 and the drop at 5, per requirement story 5; `jobsRefused` stays cumulative for la proposta.
- **Deaths.** The succession system releases a dead man's claims and clears his subordinates' superior, so the kid and the rival survive the player's death on the books; the run end itself is interface work.
- **Not expressible in the DSL, left as documented gaps in the template files:** personality-conditioned spawn weights, numeric ranges in effects, the shopkeeper `reporter` branch (no business-to-owner relation), the "sign the week before" pre-warning, per-personality favor flavor. Registered fn predicates instead: `progression.proposta`, `relationships.favor`, `relationships.memoryWithin`, `family.policyFlag`, `assoc.feastWeek`.

