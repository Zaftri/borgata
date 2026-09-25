# Dependency Table (living document)

Rule from the build plan: every system lists the values it reads and the values it writes. A system may write only values it owns (design 02 §6). Any change that adds a row or an arrow must update this file in the same change, and a new arrow gets a new invariant or harness metric. Agents: read this before touching a system; update it before reporting.

Legend: W = owns and writes (via its reducer). R = reads. E = emits Facts for another owner (the arrow that creates a correlation).

| System | W (owns) | R (reads) | E (emits to) |
|---|---|---|---|
| ledger | accounts, minted, destroyed, turnIncome, loans on characters (LoanOpen funds from the lender's purse, else his family treasury) | (receives facts from systems) | (receives facts from chains, shares, loans) |
| claims | claims, onRecordWith | characters, businesses | (receives facts from familyAi) |
| characters | rank, role, age, household, career, lifestyle, secret membership, superiorId, shareRules, status, detainedUntilTurn, cooperating | calendar, Weight thresholds, favor | (receives facts from familyAi via ShareRuleSet) |
| relationships | loyalty, favors (fade toward zero, half-life 52 weeks), standing, memory, reputation | (receives facts from systems) | (receives facts from shares via LoyaltyDelta) |
| evidence | dossiers, derived exposure | chains, blocks, collectors, tools unlocked, band | characters, pressure |
| pressure | heatByTown, family attention, attentionBand, toolsByFamily | acts with visibility, arrests, family size | processes (band spawns), evidence (case open at band 3) |
| exposureFromActivity | (none; system, emits only) | chains, blocks, collectors | evidence (EvidenceAdd), pressure (HeatDelta) |
| scheduler | (none; system, emits only) | everything via predicates and role selectors; recent facts with id fields for `spawnFrom` (and `match`) and ProcessSpawn entries with their template id for `spawn.cooldownTurns`; streams events.spawn, events.roles, events.outcomes, events.delay | processes (ProcessSpawn/Progress/AwaitDecision/Decide/Resolve/Cancel, ScheduleAdd/Remove), progression (RequestPush/Defer), calendar (CrisisFlagSet), any fact kind that templates declare to their owner |
| | | | Crisis flags emitted only for player-facing instances; player-facing includes businesses and blocks on the player's territory. Deferred requests carry no instance id. Templates with `spawnFrom` bypass the request budget; a player-facing outcome with report text emits `ReportNote`. |
| generator | provinces, districts, towns, blocks, businesses, families, crews (never more crews than blocks), characters, claims, share rules, player placement, sponsor personality trait, the rival and the kid, family bones policy, the player's starting cash and `runsGame` memory, one planted dossier (sponsor chief), a civilian owner (`Business.ownerId`) and one trait for every shop on the sponsor's crew's blocks | content archetypes, name pools | generation.<stage> streams; nothing after turn 0 |
| towns | sentiment, compliance, fear, refusal stage, petty crime, feast committee, antagonists, business ownerId (BusinessOwnerSet) | (receives facts from systems) | (receives facts from chains via ComplianceDelta) |
| territory | block assignment (block.crewId), crew membership (crew.blockIds, crew.memberIds), crew and family assignment (character.crewId, character.familyId) | (receives facts from familyAi) | (receives facts from familyAi via BlockAssign, CrewMemberAdd/Remove) |
| politics | politicians, votes, elections, bans, Commission seats, contract tables, trial fixes | vote blocks, favors, Weight, Attention | ledger (contract percentages), pressure (Attention buy-down), evidence (fix exposure), processes (election events) |
| progression | request queue, deferred requests, Weight, UI layers (player.uiLayersUnlocked), heir, Character.weight, Character.record; accepts `PermissionAsked` and `ReportNote` (logged, no state) | men on record, territory value, institutions, tribute, assets, votes, standing, rank | processes (promotion scenes), calendar (turn length via rank) |
| progressionStep | (none; system, emits only) | subordinates via superior chains, claims, block business sizes, turnIncome and share rules, weight thresholds | characters (WeightSet, RankChange, CrewMemberAdd, SuperiorSet), territory (CrewChiefSet), progression (UiLayerUnlock, RequestPush) |
| playerActions | (none; system, emits only) | player, claims, businesses, blocks, crews | claims (ClaimSet, ClaimRelease), characters (ShareRuleSet), progression (RequestPush) |
| processes | chain instances with slots (ChainInstance), process instances, the schedule | (receives facts from familyAi via ChainCreate/ChainSlotFill/ChainSlotVacate; from scheduler via ProcessSpawn/Progress/AwaitDecision/Decide/Resolve/Cancel; from scheduler via ScheduleAdd/Remove) | (receives facts from familyAi, scheduler) |
| content loader | (none; validates, emits nothing) | templates, fact kinds (from OWNER_OF_FACT), predicate fn names (from registry) | (none) |
| calendar | turn, calendar, turn length, crisis flags | rank, crisis flags from templates | characters (aging), ledger (feast collections due), processes (seasonal spawns) |
| projectView (report projection) | nothing (pure function) | world, log, content | nothing |
| renderer | nothing | turn log, report | nothing |
| ui store | IndexedDB, export files | view, save file | nothing |
| chains | (none; system, emits only) | chain slots, blocks, businesses, claims (a claimed shop is collected by its holder's associates, else the holder), town sentiment (via complianceChance), turn length, calendar week | ledger (MoneyMint), towns (ComplianceDelta, CollectionMissed) |
| | | | Associates collect before men of honor, and the player first among associates (design 09 §1). |
| succession | (none; system, emits only) | dead characters, claims held, superior links | claims (ClaimRelease), characters (SuperiorSet null) |
| obligations (reducer) | world.obligations (open, met, missed, closed) | (receives facts) | (receives facts from obligationsStep and cards) |
| obligationsStep | (none; system, emits only) | obligations, purses, treasuries, prisoner status, lifestyles, turnIncome | obligations (ObligationDue/Met/Missed/Close), ledger (MoneyMove, MoneyDestroy), characters (LifestyleSet to modest), territory (FamilyShortfallSet, FamilyStateSet) |
| standing (relationships) | world.standing (family pairs, fades over 104 weeks) | (receives StandingDelta) | (dispute and war templates emit) |
| war (territory) | Family.warWith, District.districtHeadFamilyId | (receives WarStateSet, DistrictHeadSet) | chains (collections halved at war), exposureFromActivity (heat at war), generator (district head at turn 0) |
| lifestyle terms | (none) | Character.lifestyle | progression (Weight term), exposureFromActivity (HeatDelta per lifestyle), obligationsStep (weekly sink) |
| shares | (none; system, emits only) | share rules, superiorId, turnIncome, account balances, family treasury cut | ledger (MoneyMove), relationships (LoyaltyDelta) |
| family AI | (none; system, emits only) | crews, chains, characters (rank, status), claims, share rules; associates on record with crew members added as collectors | processes (ChainCreate, ChainSlotFill, ChainSlotVacate), characters (ShareRuleSet), claims (ClaimTransfer: a stall for a soldier who holds none) |
| stateActions | (none; system, emits only) | state.flipOdds (only remaining code); behavior migrated to templates state.patrol.arrest, state.raid.low, state.raid.lowSquad, state.raid.high, state.raid.highSquad; since 2026-09-25 the flip roll runs in `state.detained.interrogation` (second week of detention, spawnFrom the arrest) and reads prisoner support (design 12) | characters (StatusChange via templates), pressure (HeatDelta, AttentionDelta via templates), evidence (EvidenceAdd via templates), relationships (MemoryAdd, LoyaltyDelta via templates) |
| dispute templates | (none; system, emits only) | claims, weights, families; processes family.poach.attempt and dispute.claim outcomes | ledger (MoneyMint), relationships (MemoryAdd, LoyaltyDelta, FavorDelta), claims (ClaimTransfer), ledger (MoneyMove), calendar (CrisisFlagSet war) |
| recomputeBands | (none; pressure owner function) | family attention, toolsByFamily | pressure reducer (BandChange, ToolUnlock) |
| decayPressure | (none; pressure owner function, mutates directly) | heat by town, family size, elapsed weeks | (mutates heatByTown and family.attention) |
| record | (none; system, emits only) | turnIncome (per associate's personal account), character rank and status, recentFacts (last turn's StatusChange, for a one-turn-lagged arrest count) | progression (RecordDelta weeksPaid/weeksMissed/streakPaid/arrests) |
| loans | (none; system, emits only) | Character.loans, business compliance, calendar turn length, stream `loans` | ledger (LoanPayment, LoanDefault), claims (ClaimSet on a business default with no claim), towns (FearDelta on a business default with a claim already held) |

## Arrows that carry the most correlation risk

1. heat → Attention inflow tuning (divisor 16, half-life 104 weeks; a quiet family settles in band 1). Guarded by careers metric band occupancy. Heat emitted once per town per turn by exposureFromActivity, not per collection or crew.
2. arrest → flip → testimony evidence → loyalty. Guarded by collaborator-rate metric and evidence.exposureMatchesDossier. Evidence: same crime and source merge into one item, weight accumulates each turn.
3. evidence → characters → relationships (an arrest becomes a flip becomes a loyalty and standing cascade). Invariant: exposure monotone except by listed causes; flip rate metric in band.
4. towns → ledger (compliance decides collections). Invariant: money conservation; metric: compliance by Sentiment curve.
5. pressure → processes → everything (band changes spawn state responses). Invariant: no follow-up on a stale precondition; metric: cancellation rate. Scheduler: scope-only preconditions evaluated before role binding to draw spawn chance deterministically and cache bindings for every candidate.
6. territory → claims → progression (a transfer changes who is on record and therefore Weight). Invariant: one claim per subject; Weight recompute hash matches inputs.
7. ledger → pressure (visible wealth). Metric: Attention floor by family size; lifestyle contribution bounded.
8. shares cascade: superior chain processed leaves-first; income counted from received shares this pass. Invariant: money.conservation and money.nonNegative; metric: share payment count by depth.
9. Weight → promotion → CrewChiefSet → superiors and shares (advancing a soldier to crew chief reshapes the family hierarchy and income distribution). Guarded by families.crewsConsistent and progression.rankLayersConsistent.
10. dispute outcomes by Weight comparison → war crisis flag → turn length (a failed hold leads to war and extended turns). Guarded by calendar.turnLengthConsistent.
11. templates → any fact kind (templates can emit any fact kind via effects, so every template declares a potential new arrow). Guarded by content validation (schema, declared roles, known fact kinds), engine invariants (engine.scheduleValid, instancesValid, locksExclusive, requestsValid), and scenario test required per template (design 06 §5).
12. generator-planted state (dossier, compliance, exposure) at turn 0. Every invariant must be satisfied: generation.townsHaveProvince, generation.districtsCoherent, generation.oneFamilyPerTown and all structural invariants. Guarded by 300-seed probe and generation invariants; any violation halts generation.
13. interface must never compute an outcome. Guarded by the rule that components import only view types and by the store test that a loaded save hashes equal to the live world.

## Change log

- 2026-09-25: hotspot 1 (docs/event-storming-2026-09-25.md §3): `BusinessOwnerSet` fact (towns owns `Business.ownerId`); role relation `ownerOf` (business -> owner character, roles.ts, read by templates); generator gives every shop on the sponsor's crew's blocks a civilian owner and one shopkeeper trait; `assoc.latePayer`'s reporter branch, sendKid's shopkeeper memory and `assoc.civil.help`'s named shopkeeper now bind it.
- 2026-09-25 (phase 8 group 2, design 13): standing ledger, war state on families with chains and heat reading it, district head at generation, `relationships.standing` fn, the district in the view.
- 2026-09-25 (phase 8 group 1, design 12): obligations owner and system; lifestyle on characters with Weight, heat and a weekly sink; family shortfall streak and state; the flip roll reads prisoner support.
- 2026-09-25: `spawn.cooldownTurns` (scheduler reads ProcessSpawn recent facts); favors fade (relationships decay); presets play the soldier opening; design 10 situations begin.
- 2026-09-24: phase 6b owner integration: succession system; player-first collector order; crews capped by blocks; scheduler cadence (duration-0 player decisions offered in the spawn run, resolved instances free their scope slot, zero-delay schedules dated after their lane's pass, unknown-template entries dropped); `PermissionAsked` fact (progression, logged only) and `spawnFrom.match`; `$mint` shared per effect list.

- 2026-09-24: phase 6b wave A: `record` and `loans` systems (design 09 §2, §6), the `lend` player action, associate Weight now reads the record, sponsor mood, invariants `progression.recordNonNegative`, `ledger.loansConsistent`, `characters.createdValid`.
- 2026-09-23: phase 6 view projection and text interface; crisis gating, collector order, deferral fix.
- 2026-09-23: phase 5 generation, performance work, heat and metric retuning.
- 2026-09-23: phase 4 progression, player actions, disputes, arrests as templates.
- 2026-09-23: phase 3 event engine and content validation as implemented; schedule off-by-one and dangling-request fixes.
- 2026-09-23: phase 2 systems as implemented (evidence, pressure, state actions; tuning of heat inflow and patrol arrests).
- 2026-09-23: phase 1 systems as implemented (chains, shares, familyAi; territory ownership; characters superiorId and shareRules; ledger turnIncome).
- 2026-09-21: initial table from design 02 ownership.
