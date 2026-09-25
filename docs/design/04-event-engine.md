# Design 04: The Event Engine

Status: design, 2026-09-21. One engine runs every process in the game: world events, chains of consequence, schemes (FR-V), operations (FR-O), disputes (FR-E), career progress (FR-T), the negotiation (L7), regencies (FR-U). This resolves review items F-2 and H-1. A process is an instance of a template with roles bound to entities, a lifecycle, and effects expressed as Facts.

---

## 1. Template

```ts
type ProcessTemplate = {
  id: string; version: number;
  kind: "event" | "scheme" | "operation" | "chain" | "dispute" | "career" | "regional";
  scope: "town" | "family" | "district" | "province" | "island";
  lane: Lane;                         // scheduler lane, see §4
  roles: Record<RoleName, RoleSelector>;   // how to bind entities
  spawn?: SpawnRule;                  // for templates the engine spawns itself
  preconditions: Predicate[];         // evaluated at spawn and re-evaluated at every firing
  duration: { turns: number | Range; perTurn?: StepRule[] };  // 0 = instant
  progress?: ProgressRule;            // schemes and operations: how success accrues
  discovery?: DiscoveryRule;          // schemes: how signs and evidence leak
  decision?: DecisionSpec;            // if the player (or AI) must choose; options with effects
  resolve: Outcome[];                 // weighted outcomes, each with predicates and effects
  followUps: FollowUp[];              // scheduled templates with delay, probability, condition
  crisis?: { flag: CrisisFlag; ttl: number };  // sets a turn-length crisis while active
  report: ReportSpec;                 // text templates for newspaper, lawyer, sponsor, sign; visibility
  tags: string[];                     // for harness metrics and codex links
  codexId?: string;
};
```

**Role selectors** are queries over the world: `{ entity: "character", where: [Predicate], pick: "random" | "highest:loyalty" | "lowest:exposure" | "nearest" , stream: "events" }`. A role may be bound at spawn by the caller (a player action binds `target` and `crew`) or resolved by the engine.

**Predicates** are a small JSON expression language evaluated against the world and the bound roles:

```
{ "all": [ {"band": {"role":"family","gte":2}}, {"has": {"role":"target","trait":"talker"}}, {"not": {"status": {"role":"target","is":"jailed"}}} ] }
```

Supported operators: `all`, `any`, `not`, `cmp` (meter or number compare on a path), `band`, `has` (trait, tag, role, ban), `status`, `rank`, `owns`, `claimBy`, `standing`, `favor`, `inTownOf`, `recent` (a fact kind happened within N turns involving a role), `flag` (world flag), and `fn` (a named predicate registered in code for the few cases the DSL cannot express). Content may only use `fn` names that exist; the schema validator checks.

**Effects** are Fact constructors with role references: `{ "fact": "LoyaltyDelta", "characterId": "$victimKin", "delta": -150 }`. Effects may also `schedule`, `cancel`, `setFlag`, `bindRole`.

---

## 2. Instance

```ts
type ProcessInstance = {
  id; templateId; templateVersion; kind; state: "pending" | "active" | "awaitingDecision" | "resolved" | "cancelled";
  roles: Record<RoleName, EntityRef>;
  startedTurn; turnsLeft; progress: Meter; discovery: Meter;
  locks: EntityRef[];                 // subjects exclusively held (one operation per subject per turn)
  parentId?: ProcessInstanceId;       // chain provenance
  causeChainId: string;               // shared by an entire chain of consequence; the newspaper groups by it
  playerVisible: Visibility;          // none | sign | known
};
```

---

## 3. Lifecycle

1. **Spawn.** From a player action, an AI decision, a follow-up firing, or the engine's own spawn pass (templates with `spawn` rules are candidates each turn; the engine draws from the weighted pool per lane using the `events` stream, subject to the per-turn budget).
2. **Bind roles.** Unbound roles are resolved. If any required role cannot be bound, the spawn is dropped and logged (never an error).
3. **Precondition check.** Failing at spawn drops the instance silently (logged). Failing at a later firing cancels it with `ProcessCancel{reason}`, which is a Fact the report can render ("the deal fell through because the buyer was arrested").
4. **Active turns.** For instances with duration, `perTurn` step rules run each turn: progress accrues, discovery accrues, evidence leaks, money moves. A `decision` may pause the instance in `awaitingDecision` until the deciding actor (player via request queue, AI immediately) picks an option.
5. **Resolve.** When `turnsLeft` reaches 0 or a step rule triggers resolution, outcomes are evaluated in order: the first outcome whose predicates hold is chosen; if several are weighted, the engine draws. Outcome effects emit Facts. Follow-ups are scheduled.
6. **Locks released.** Subjects are freed for the next turn.

---

## 4. Scheduler semantics (review H-1)

Each turn the scheduler runs six lanes in a fixed order. Within a lane, due instances fire before new spawns; instances fire in (priority desc, createdTurn asc, id asc). All draws use the `events` stream.

| Lane | Contents | Why this order |
|---|---|---|
| 1 state | The state's responses: raids, arrests, magistrate actions, seizures, case steps, tool unlocks | The state reacts to last turn's facts before anyone acts this turn |
| 2 commission | District and Commission: disputes escalated, bans, regency decisions, elections of district heads | Institutional decisions bind the families' options this turn |
| 3 families | Family AI actions and player-initiated operations: collections, operations, schemes progress, chain runs | The core of the turn |
| 4 civil | Civil society and towns: refusals, antagonists, feasts, press, petty crime | Reactions to what the families did |
| 5 world | Regional and island events: elections, scandals, booms, compact-province facts | Background that seeds next turn |
| 6 people | Aging, births, marriages, illness, career steps, household events | Slow variables last |

Rules:

- **Re-validation.** A scheduled follow-up re-evaluates its preconditions when it fires. If they fail, it is cancelled with a reason and the cancellation is a reportable fact. Nothing fires on a stale cause.
- **Locks.** A character may be the subject of at most one `operation` per turn and may be bound in at most one `awaitingDecision` per turn. A spawn that needs a locked subject is deferred one turn with priority +1, up to 3 deferrals, then dropped.
- **Budget.** Per turn, at most `B(rank)` new player-facing instances enter the request queue: 3 at associate and soldier, 5 at chief, 7 at administration, 8 at head. Excess is deferred with priority aging (+1 per turn). State-lane instances are never budgeted; the state does not wait.
- **Mutual exclusion by tag.** Templates may declare `exclusiveTag`; only one instance per tag per scope may be active (one war per district, one negotiation per province, one succession per family).
- **Determinism.** No lane reads the results of a later lane in the same turn; Facts are applied after all lanes (design 01 §3), so ordering is fully specified by lane, priority, creation turn and id.

---

## 5. How each requirement group maps onto templates

| Requirement | Template kind | Notes |
|---|---|---|
| Consequential events (FR-L) | event, regional | Follow-ups make chains; `causeChainId` groups them in the newspaper |
| Schemes (FR-V) | scheme | `progress` toward the scheme's goal; `discovery` produces signs and, at thresholds, `EvidenceAdd` or a `WitnessSet`; the suspicion ladder is a `decision` template the player runs against a suspect |
| Operations (FR-O) | operation | Roles: target, shooters, driver, lookout, lure; method modifies outcome weights; outcomes: success, failure, wrongVictim, survivor, witnesses, shooterArrested; each outcome's effects include evidence for every role |
| Disputes (FR-E) | dispute | Roles: claimant, respondent, arbiter (resolved by rank ladder); `decision` for the player's approach; outcomes read rank, prior claim, favor, reputation; violating an outcome spawns `war` (exclusiveTag per district) |
| Chains (B13) | chain | Long-lived instances whose `perTurn` rule runs the slot board; slots are roles that may be vacant; the chain does nothing while a required role is unbound |
| Careers (FR-T) | career | Multi-year instances with trait-driven outcome weights |
| Rise and fall (FR-U) | event | Family state transitions as outcomes of war, trial, decapitation, confiscation templates; regency as a long-lived district-lane instance |
| Arrest to trial (FR-R) | event chain in lane 1 | arrest → detention → flipRoll (decision-less outcome) → trial → verdict → appeal, with lawyer and witness roles |
| The negotiation (L7) | event, exclusive per province | Spawns only in band 4 |
| Turn contraction | any | `crisis` field sets the flag; calendar reducer clears on expiry or resolution |

---

## 6. Visibility and signs

Each outcome and step declares what the player may perceive: `none`, `sign` (a text template with deliberately partial information: "a car you do not know has been parked near the club for two weeks"), or `known`. The report projection (design 07 §5) renders signs through the newspaper, the lawyer, the sponsor or the town, never as raw modal text (L5). Discovery rules on schemes produce signs with increasing specificity as `discovery` rises.

---

## 7. Authoring rules

- A template changes state only through Facts in `effects`. No template may reference another template's internal progress.
- Every template has at least one scenario test in `harness/scenarios` that binds roles to a fixture world and asserts the Facts produced.
- Every template has `tags` used by harness distributions (design 08) and a `codexId` when it embodies a historical mechanic.
- Templates are versioned. An active instance keeps `templateVersion`; a content update that removes or reshapes a template must ship a migration that cancels or maps instances.
- Content lives in `packages/content/templates/**/*.json`, one template per file, validated by the schema in design 06.

---

## 8. Worked example: a refusing shopkeeper (the vertical slice's chain)

1. Lane 4, `civil.refusal.start`: precondition `compliance < 400` on a business in the player's blocks; roles `shop`, `owner`; outcome sets `refusalStage 1`; report: the collector comes back empty; sign to player.
2. Player decision (request queue): a `decision` template `family.intimidation.choose` with options glue, arson, bomb, none. Choosing arson spawns lane-3 `operation.arson` with roles `shop`, `crew`.
3. `operation.arson` resolves: success (heat +40, fear +200 on the block, compliance +300 on the shop, `EvidenceAdd` on the crew, `SentimentDelta -40`), or witnessed (adds `WitnessSet`), or failure (a man burned, `StatusChange`).
4. Follow-ups scheduled with probability: `civil.refusal.spread` (other shops' compliance falls if the owner is seen unharmed a year later), `state.squad.assigned` if heat crosses 300 (lane 1 next turn), `civil.antagonist.spawn` if Sentiment falls below -300 (a named refuser).
5. The newspaper groups steps 1 to 4 under one `causeChainId`; the codex link opens the entry on the escalation ladder and the anti-protection-tax movement.

## Addendum 2026-09-25: spawn cooldown

`spawn.cooldownTurns: n` keeps a template from spawning again on the same scope entity within n turns of its last spawn there. The scheduler reads the recent `ProcessSpawn` facts, which carry the template id and every bound role id (`step.ts` `recordRecentFacts`). It applies to both spawn paths (per entity and `spawnFrom`). Rare player cards use 3 to 12; weekly cards none (design 10).

## Addendum 2026-09-25: immediate follow-ups

A `schedule` effect with `delay: 0` no longer creates a schedule entry (entries are facts, applied after the run, so they could only fire next turn). It spawns the target template in the same run, bound from the parent's roles, its preconditions checked, outside the request budget, with the parent's instance id. A player decision on such a template (duration 0) is offered in the same run and shown by the interface as "E adesso (and now)" in the week modal. Delays of one or more stay entries dated `turn + delay`.

