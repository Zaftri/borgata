# Design 08: Harness and Testing

Status: design, 2026-09-21. Inputs: designs 01 to 04, `docs/build-plan.md` sections 3, 5 and 7, review items T-1 (test strategy), N-1 (determinism), N-2 (failure modes) and C-1 (measured requirements). The harness is the reviewer's main instrument: it runs the headless `sim` package without a renderer and reports whether the game still makes the claims the brief makes. Nothing here is implementation; commands and types are sketches.

---

## 1. Commands

The harness is `packages/harness`, run with `pnpm harness <command>` (via `tsx`). Every command exits non-zero on any failure and writes a JSON result to `harness/out/<command>-<timestamp>.json` plus a one-page Markdown summary (section 11).

| Command | Runs | Exit criteria |
|---|---|---|
| `harness quick` | Typecheck, unit tests, content schema validation, invariants over 100 seeds for 52 turns each, replay of the golden seeds. Target under 3 minutes. | Zero invariant violations; every golden hash matches or the difference is listed as unexplained (fails) |
| `harness sweep --seeds N` | Generates N worlds (default 1,000), checks every generator constraint (K5, C13), records archetype and family statistics, exercises the constraint relaxation order by forcing failures on a sample | 100 percent of seeds satisfy required constraints after at most the allowed relaxation; distribution of relaxation depth reported |
| `harness careers --seeds N --strategy quiet\|loud\|mixed [--turns T]` | Full AI-only careers with the AI player (section 2) driving the player character; all invariants on; collects outcome distributions (section 3) | Zero invariant violations; every distribution inside its band or the deviation is listed |
| `harness replay [--golden\|--file save.json]` | Rebuilds worlds from seed plus action log, compares the state hash at every snapshot and at the end | All hashes equal |
| `harness scenario <name\|all>` | Runs scenario tests (section 5) | Expected Facts present, no forbidden Facts, expected signs present in the projected report |
| `harness perf` | Measures turn time and generation time on a fixed seed set under the budget in NF-12, on the current machine, and normalizes against a stored baseline machine score | Turn under 2 seconds and generation under 15 seconds at the baseline scale |
| `harness report [--against <accepted-run>]` | Produces the reviewer summary from the latest outputs, with deltas against the last accepted run | Always exits zero; the reviewer decides |

`harness quick` is what agents run before every task report. `harness careers` and `harness sweep` run overnight on the widest seed set and post their summary to `docs/NOW.md`.

---

## 2. The AI player

The AI player drives the same `PlayerAction[]` API as the interface, so a career run exercises the exact code path a human uses. It is a goal-driven policy, not a search: each turn it reads the projected `Report` (never the raw world, so it plays under the same fog of war), scores candidate actions against its preset, and submits a set within the request budget.

```ts
type PlayerPolicy = {
  preset: "quiet" | "loud" | "mixed";
  weights: { income; safety; growth; respect };     // scoring terms
  rules: PolicyRule[];                                // e.g. "pay every jailed man's household", "never approve a killing above band 1"
  decide(report: Report, memory: PolicyMemory, rng: Stream): PlayerAction[];
};
```

- **quiet**: high safety weight, never climbs the refusal ladder past property damage, closes intake when Attention reaches band 2, launders aggressively, invests in careers, accepts most dispute outcomes.
- **loud**: high growth and respect weights, answers refusal with escalation, approves killings when offered, enters heroin when offered, ignores lifestyle costs.
- **mixed**: switches between the two on a seeded schedule to produce careers that are neither, which the walkthrough says most real runs are.

The AI player is also the stand-in for other families' heads in compact provinces, so the same policy code drives rivals. Its decisions are drawn from the `aiPlayer` stream so a career is reproducible from its seed.

---

## 3. Outcome distributions and target bands

Collected per career and aggregated over the seed set. Bands are starting targets for tuning; the harness fails a run that leaves its band and the reviewer decides whether the band or the game is wrong. Each metric names the brief claim it measures.

| Metric | Definition | Target band (initial) | Brief claim |
|---|---|---|---|
| War frequency | Wars per district per in-game decade | 0.3 to 1.0 | E3, E5: war is a last resort, not the default |
| War-to-dispute ratio | Wars started divided by disputes resolved | under 0.10 | E1, story 5: peace has value |
| Destruction modes | Share of dissolved families by mode (extermination, purge, mass trial, decapitation, confiscation, dissolution, refusal) | No single mode above 45 percent; every mode observed in 1,000 careers | U-2: distinct signatures |
| Collaborator rate | Cooperating members divided by members ever inducted | 3 to 8 percent (one in twenty) | D6 |
| Time to rank | Turns from start to soldier, chief, administration, head; median and interquartile range, per strategy | Soldier 30 to 60, chief 100 to 180, administration 250 to 400, head 350 to 550; loud reaches ranks faster and dies more | G3, I1, walkthrough arithmetic |
| Career length | Turns until loss or shelving, per strategy | Quiet median above 500; loud median under 350 | Decision 2: Attention decides the opponent |
| Attention band occupancy | Share of turns spent in each band, per strategy | Quiet: 70 percent or more in bands 0 to 1; loud: 40 percent or more in bands 3 to 4 | Story 6: equal Weight, different opponents |
| Weight versus Attention correlation | Across families at the same Weight, spread of Attention | Standard deviation of at least one band | Story 6 |
| Income trajectory | Crew income per turn by rank, median | Monotone by rank; envelope between 35 and 50 percent of crew income | Reference turn in design 03 §7 |
| Treasury health | Turns in which the treasury cannot meet obligations | Under 10 percent of turns in quiet careers | P-5, P-2 |
| Compliance by Sentiment | Mean compliance in towns with Sentiment above 300, near 0, below -300 | Above 85 percent, 60 to 80 percent, under 50 percent | B6, C4 |
| Refusal spread | Probability a surviving refuser produces a second refuser within a year | 30 to 60 percent | B6, B6a |
| Flip after unpaid support | Cooperation rate for jailed men whose household went unsupported versus supported | At least double | P-1, P-2 |
| Event budget utilization | Player-facing spawns entering the queue divided by budget, per rank | 60 to 95 percent; deferrals dropped under 5 percent | Design 04 §4 budget |
| Follow-up cancellation rate | Follow-ups cancelled on re-validation divided by follow-ups scheduled | 5 to 20 percent | H-1: chains react to changed causes without becoming noise |
| Scheme discovery | Share of schemes discovered before completion, by kind | Confidant 40 to 70 percent; secret men under 30 percent | V-1, V-6 |
| Tutorial beat timing | Turn at which the late payer, the claim collision and the first arrest occur | All within the first 40 turns in 100 percent of seeds | K5, C13 |

---

## 4. Invariants

Run after every `step` in debug builds; a sampled subset in release. A violation halts and prints the cause chain of the offending Fact. Grouped by owner.

**Ledger.** Sum over all accounts of dirty plus clean equals `minted - destroyed`. No account goes negative. Every `MoneyMove` has a cause. Every `MoneyMint` names a source listed in content; every `MoneyDestroy` names a listed sink.

**Claims and territory.** Each business, associate and institution slot has at most one claim. Every claim holder is alive and of eligible rank. Every `Block.crewId` belongs to a crew of the family that owns the town. Families do not overlap: each town has at most one `familyId`. Districts contain three or more families or are flagged for redraw.

**Characters and families.** Each character is in exactly one crew or administration role, or has no family. `dissolved` implies no towns and no head. `regency` implies a living `regentFamilyId` of another family. A dead character holds no claims, no roles, no locks. Rank is consistent with unlocked interface layers for the player.

**Evidence.** Exposure never decreases except through `EvidenceRemove` with a witness-death or retraction cause, or `CaseReset` on conviction. Every dossier item carries a source and a turn. A case in `trial` has a magistrate bound.

**Pressure.** Attention never falls below the family's size floor. Band changes emit `ToolUnlock` exactly once per crossing. Heat is within 0 to 1000.

**Processes and scheduler.** No two `operation` instances lock the same subject in a turn. Every `ScheduledEntry` names an existing template and a valid instance or spawn. An instance in `awaitingDecision` has a decider who is alive and free. Exclusive tags hold: at most one active instance per tag per scope. Lane order is respected: no Fact in the log is attributed to a later lane before an earlier lane's Facts in the same turn.

**Chains.** A chain runs only when all required slots are bound; every bound filler exists and is of the slot's type; a jailed, dead or exiled filler vacates the slot within one turn.

**Calendar.** `meta.turnLength` equals the value design 03 §6 computes from the player's rank and active crisis flags. Expired flags are cleared.

**Determinism.** Two `step` calls on equal inputs produce equal state hashes. No entry in the turn log depends on object key order (checked by shuffling table insertion order in a debug mode and comparing hashes).

**Projection completeness.** Every `TurnLog` entry with `visibility >= player` appears in exactly one report view (newspaper, lawyer, sponsor, town, sign panel). No report entry lacks a log entry.

---

## 5. Scenario tests

A scenario is a fixture, a set of bound roles, actions, and expectations. One per template (design 04 §7) and one per user story.

```ts
type Scenario = {
  name: string;
  fixture: (b: WorldBuilder) => World;        // builders: smallNeighborhood(), crewOf(6), businessesOnBlock(...)
  bind?: Record<RoleName, EntityRef>;           // roles to force on the template under test
  actions: PlayerAction[] | ((w: World) => PlayerAction[]);
  turns: number;
  expect: {
    facts: FactMatcher[];                       // kind, payload predicates, cause template
    forbid?: FactMatcher[];
    signs?: SignMatcher[];                      // text template ids expected in the projected report
    invariants?: "all" | InvariantId[];
    metrics?: Record<string, Range>;            // e.g. loyalty of a character within a range
  };
};
```

Fixtures are deterministic: builders use the `fixture` stream from a scenario-local seed. Scenarios are the acceptance criteria of the brief made executable; the mapping below is binding.

| Story | Scenario name | Key expectations |
|---|---|---|
| 1 The share | `share.loyalty-and-envelope` | Share change emits `LoyaltyDelta` with matching sign; report shows projected envelope and the delivered one with a reason |
| 2 The claim | `claim.collision-dispute` | Second collector triggers a `dispute` instance with correct arbiter rank; outcome emits `ClaimTransfer` or confirms |
| 3 The arrest | `arrest.flip-roll-visible` | Arrest shows estimates; a cooperating outcome moves items into implicated dossiers |
| 4 The buffer | `buffer.direct-vs-intermediary` | Direct order resolves this turn with evidence on the head; buffered resolves later with evidence on the intermediary |
| 5 The dispute | `dispute.three-approaches-war-on-violation` | Three approaches offered; violating the outcome spawns `war` with exclusive tag |
| 6 The pressure ladder | `attention.equal-weight-different-bands` | Two families of equal Weight in different bands face different tools; band crossing emits an in-character report |
| 7 The intake | `intake.open-closed` | Open intake produces recruits including an infiltrator archetype; closed raises average age |
| 8 The animated turn | `log.ten-event-kinds-with-explanations` | Ten distinct log kinds, each with an explanation text |
| 9 The newspaper | `newspaper.headlines-and-tone` | Every witnessed violent act produces a headline; tone template changes with band |
| 10 The vote | `vote.deliver-and-liability` | Votes committed; winner returns access; disloyal winner becomes a liability with Attention cost |
| 11 The chain | `chain.public-killing-three-steps` | At least three connected steps under one `causeChainId` |
| 12 Stepping back | `shelved.quiet-mode-residual-risk` | Shelved state entered; long turns; residual risk decays with Attention |
| 13 The partnership | `ownership.forced-partnership` | Merchant choice with fear and Sentiment effects; laundering and jobs available next turn; protection tax stops; prior claimant disputes |
| 14 The son at university | `career.law-degree` | Recurring cost; trait-driven outcome; completed lawyer selectable with higher starting loyalty |
| 15 The regency | `regency.bid-and-absorb` | Weakened neighbor spawns a district-lane bid; share and timer; restore or absorb at the end |
| 16 The confidant | `scheme.confidant-signs-and-ladder` | Two distinct signs over several turns; each ladder step costs loyalty; wrong judgment possible |
| 17 The coup | `scheme.coup-coalition` | Coalition recruitment; tolerance estimate; three resolutions |
| 18 The landing | `route.island-landing` | Landing fees as main income; route proposal; landing appears as a hittable slot |
| 19 A new island | `generation.two-seeds-differ` | Two seeds differ in layout, families, cast and archive while both satisfy tutorial beats |

Template scenarios follow the same shape and are named `template.<templateId>`.

---

## 6. Golden seeds

A fixed set of twenty seeds chosen to cover: every starting archetype (seven), each strategy preset for the AI player (three, applied to the same seed), the smallest and largest generated families, a seed with an early war and a seed with an early mass trial in the pre-history. Chosen once from the first sweep and frozen; a seed is replaced only by an accepted task report that says why.

Stored per golden seed: the seed, the `GameSetup`, the AI player preset, the content version, the action log for 260 turns, the state hash every 26 turns and at the end, and the outcome metrics of section 3.

Review of differences: `harness quick` lists every golden seed whose hashes diverge, with the first divergent turn and the first differing Fact. The task report must classify each divergence as intended (with a one-line reason) or a defect. The reviewer accepts by running `harness golden accept <seed>`, which rewrites the stored hashes and records the accepting task id. Unexplained divergence fails the gate.

---

## 7. Replay and hash checks

State hash: a 64-bit non-cryptographic hash (xxHash64 or equivalent with a pure-TypeScript implementation) over the canonical JSON of the world: keys sorted, tables serialized in `order` array sequence, no derived caches included. Chosen for speed on multi-megabyte states so debug builds can hash every turn.

Snapshot cadence: every 26 turns in saves and golden logs (design 01 §6). Replay verifies hashes at every snapshot and at the end; on mismatch it bisects turns between the last matching snapshot and the first mismatch by re-stepping, and reports the first turn and the first differing Fact.

CI gates: `harness replay --golden` on every commit; `harness replay --file` on every save fixture in the failure-mode suite (section 10); a shuffled-insertion-order replay weekly to catch key-order dependence.

---

## 8. Generator property tests

Run by `harness sweep`. Properties, each over 1,000 seeds:

- Every required constraint in K5 and C13 holds after generation: the sponsor's chief carries exposure above the vacancy threshold; a neighboring family has a weak border block; a public-works institution is reachable within the district; a late payer, a claim collision and an associate arrest are plausible within 40 turns (checked by running the first 40 turns with the AI player and asserting the beats fire).
- Every town has an archetype and the archetype's economy is present (C12): at least the associate-level businesses and the prize institution exist.
- Geography is valid: districts are contiguous with three or more families; no town without a family unless flagged dormant; routes connect a landing to a harbor.
- Relaxation order is exercised: a debug flag forces constraint failure on 5 percent of seeds; the sweep asserts the generator relaxes named constraints in the documented order, never silently, and logs each relaxation.
- Two seeds differ (story 19) on layout, families, cast and pre-history archive; a similarity score between any two generated worlds stays under a threshold.
- Pre-history produces at least one war, one trial and one contract scandal in the archive for 95 percent of seeds (K4).

---

## 9. Performance tests

`harness perf` uses a fixed seed set at the design 02 §8 size expectations (a full province of 20 families, 600 characters, 2,000 businesses, 60 active processes) and measures: median and 95th percentile `step` time over 260 turns; generation time including pre-history; save serialization and load time; state hash time. Budgets from NF-12: turn under 2 seconds, generation under 15 seconds, on a mid-range laptop. Results are normalized by a stored baseline benchmark score so CI machines report comparable numbers; the gate fails on a 20 percent regression against the last accepted run as well as on an absolute budget miss.

---

## 10. Failure-mode tests

Each is a scenario against the save and generation layers, from review N-2:

| Case | Expected behaviour |
|---|---|
| Corrupt save (truncated JSON, bad hash) | Load refuses with a clear message; export of the raw file is offered; no partial world is created |
| Older schema version with a migration chain | Migration runs; replay from the last snapshot succeeds; hashes after migration are stored as new goldens for that fixture |
| Older schema version without a chain | Load refuses; export offered |
| Content version mismatch | Replay from the last snapshot only; a warning that earlier outcomes are frozen; no re-generation |
| Storage full on save | Save fails loudly, offers export, and the in-memory game continues |
| Generation constraint unsatisfiable | Re-roll of the local neighborhood up to the allowed count, then relaxation in documented order; the log records every relaxation; never an exception |
| Generation over budget on a slow device | Progress is reported; pre-history shortens in documented steps before anything else degrades |

---

## 11. CI pipeline and reviewer summary

**Per commit:** typecheck; unit tests; content schema validation; `harness quick` (invariants over 100 seeds, golden replay); ESLint core rules (no platform random, no dates, no floats, dependency direction).

**Per task report (agent):** `harness quick` output attached; `harness scenario` for the templates and stories touched; dependency table diff; golden divergences classified.

**Per phase:** `harness careers --seeds 1000` for all three presets; `harness sweep --seeds 1000`; `harness perf`; one written playtest.

**Before first public build:** failure-mode suite green from every earlier schema version; `harness perf` on a fresh device profile for a full 700-turn career; projection completeness over all golden logs.

**The reviewer summary** (`harness report`) is one page:

1. Verdict line: pass or fail, and the count of new invariant violations, unexplained golden divergences and out-of-band metrics.
2. Distribution table: every metric of section 3 with current value, band, delta against the last accepted run, and an arrow if the delta exceeds 10 percent of the band width.
3. Invariants: any violation with its cause chain, at most five shown, the rest counted.
4. Golden seeds: divergences with first turn and first Fact, and the agent's classification.
5. Performance: median and 95th percentile turn time, generation time, deltas.
6. Coverage: templates without a scenario, stories without a passing scenario, values in the dependency table without an invariant.

The reviewer reads this page first, plays the touched scenario second, and reads code only when a number moved or an invariant fired.

---

## 12. Mapping the brief's measured claims to metrics

| Brief claim | Where | Harness metric |
|---|---|---|
| One member in twenty cooperates | D6 | Collaborator rate |
| Peace has value; war is a last resort | E3, E5, story 5 | War frequency, war-to-dispute ratio |
| Equal Weight, different opponents | Story 6 | Attention band occupancy, Weight versus Attention correlation |
| Reaching crew chief in the first two to three hours | I1 | Time to rank (turns) combined with NF-3 turn duration assumptions |
| A forty-year career is 500 to 700 turns | Design 03 §6 | Career length |
| Tutorial beats in every seed | K5, C13 | Tutorial beat timing, sweep constraints |
| Compliance follows Sentiment | B6, C4 | Compliance by Sentiment |
| Support for jailed households is the strongest anti-flip lever | P-1, P-2 | Flip after unpaid support |
| Turn under 2 seconds, generation under 15 seconds | NF-12 | Performance tests |
| Follow-ups never fire on a stale cause | Design 04 §4 | Follow-up cancellation rate plus the re-validation invariant |
| Every failure has a readable cause | I2 | Projection completeness, cause chain on every Fact |
| Two seeds give a different Sicily | Story 19 | Generation similarity score |
