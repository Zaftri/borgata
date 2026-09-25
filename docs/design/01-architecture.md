# Design 01: Architecture

Status: design, 2026-09-21. Inputs: `docs/brainstorm-requirements.md`, `docs/spec-review.md`, `docs/build-plan.md`. This document decides technology and module boundaries. Companion documents: 02 state model, 03 metrics and economy, 04 event engine, 05 world generation, 06 content schemas, 07 interface and rendering, 08 harness and testing.

---

## 1. Decisions

| Area | Decision | Why |
|---|---|---|
| Language | TypeScript, strict mode, ES modules, everywhere (core, harness, UI) | One language for owner and agents; types are the contracts the build plan relies on |
| Core | A dependency-free package `sim` with no DOM, timers, platform random or dates | Build-plan rule S1; runs in Node for the harness and in the browser unchanged |
| Numbers | Integers only in the core. Money in lire as integer thousands (1 unit = 1,000 lire). Meters as integers 0 to 1000 (Sentiment -1000 to 1000). Probabilities as integers per 10,000 | Determinism across engines (S4); no floating-point drift |
| Random | Seeded generator (xoshiro128\*\*) with named streams per system, derived from the world seed | Adding a random call in one system does not perturb another; replay stays stable across content updates |
| State | One plain JSON-serializable object; entity tables keyed by id with an ordered id array beside each table | Deterministic iteration (S4); trivially saved, hashed and diffed |
| Writes | Systems never mutate state. They emit typed Facts; owner reducers apply Facts in a fixed order | One writer per value (S2); every change carries its cause (S5) |
| Processes | One event engine runs events, schemes, operations, chains and disputes from data templates | Build-plan rule S3, review item F-2 |
| Content | JSON files validated by zod schemas at build time; content has a version | S7; agents add content without touching the engine |
| Saves | Seed + action log, with a snapshot every N turns; stored in IndexedDB; export and import as a JSON file; schema and content versions in the header | Small saves, exact replay, migration possible |
| Renderer | PixiJS 8 for the animated turn view; Preact for panels; both consume the turn log, never the simulation | S8; the renderer is a replay |
| Build and test | Vite, Vitest, ESLint with custom rules for the core, `tsx` for the CLI harness | Standard, fast, agent-friendly |
| Hosting | Static site (any static host; Vercel static is available). No backend in the first release | Decision 9 and J1 |

---

## 2. Packages

```
/packages
  sim/          the simulation core (no dependencies)
  content/      data files and schemas (zod), validated at build
  harness/      CLI: seed sweeps, AI-only careers, replay checks, distributions
  ui/           Preact panels + PixiJS turn view; loads sim + content
  shared/       ids, branded types, schema version constants
/docs           requirements, design, decisions (ADRs), NOW.md
```

Dependency direction is strict: `ui -> sim, content, shared`; `harness -> sim, content, shared`; `content -> shared`; `sim -> shared`. `sim` imports nothing else. ESLint enforces the direction and bans `Math.random`, `Date`, `setTimeout`, floating-point literals and `number` arithmetic that is not integer-safe in `sim` (a small custom rule set plus `@typescript-eslint` restrictions).

---

## 3. The turn pipeline

One public operation on the core:

```ts
step(world: World, actions: PlayerAction[], content: Content): StepResult
// StepResult = { world: World; log: TurnLog; report: Report }
```

Inside `step`, in this fixed order:

1. **Ingest actions.** Player actions are validated against the current world (rank, ownership, permissions) and converted into Facts or into new process instances (an order becomes an operation instance; a share change becomes a Fact).
2. **Family AI.** Every simulated family, including the player's own capos and superiors, decides its actions for the turn from its goals and traits. Output: Facts and process instances. Detailed provinces run full AI; simplified provinces run the compact model (design 05).
3. **Scheduler.** The event engine fires due process instances and evaluates spawn candidates in six ordered lanes (design 04). Each firing produces Facts and may schedule follow-ups.
4. **Apply.** Facts are applied by owner reducers in the fixed owner order: ledger, claims, characters (status, rank, household), relationships (loyalty, favors), evidence (dossiers, cases), pressure (heat, Attention, tools), towns (Sentiment, compliance), progression (Weight), processes (schedule, cancel), calendar. Each reducer validates its Facts and rejects invalid ones with a logged reason rather than throwing.
5. **Derived values.** Weight, Attention band, compliance and similar values are recomputed from state. Derived values are never stored except as a cache with a hash of inputs.
6. **Invariants.** In debug builds every invariant runs; a violation halts with the cause chain. In release builds a sampled subset runs.
7. **Log and report.** The `TurnLog` (every Fact with its cause, every process transition, every sign) is finalized. The `Report` (what the player sees) is projected from the log through the fog-of-war rules.
8. **Calendar.** Advance by the current turn length; compute the next turn length from rank and active crises (design 03, section 6).

Everything after step 1 is independent of the UI. The harness calls `step` with an AI player standing in for the human.

---

## 4. Facts

A Fact is the only way state changes. Each Fact carries a `cause`:

```ts
type Cause = { templateId?: string; instanceId?: string; actorId?: CharacterId; rule: string };
```

Fact kinds (the full list is in design 02, section 6): money moves, claim set and transfer, character status and rank changes, household events, loyalty and favor deltas, evidence added, case opened or reset, heat and Attention deltas, Sentiment deltas, reputation tags, territory transfers, family state transitions, process scheduling and cancellation, tool unlocks, calendar changes.

Two rules make Facts safe:

- **Owner order.** Reducers run in the order above. A Fact emitted by a later reducer for an earlier owner is queued for the next turn, never applied out of order. This removes ordering bugs between systems by construction.
- **Conservation.** The ledger reducer rejects any money Fact whose source account cannot pay, and the invariant checks the sum of all accounts against the sum of all minted and destroyed money (the only mints are external income sources listed in content; the only sinks are listed spending categories).

---

## 5. Determinism

- One world seed. Each system gets a named stream: `rng("families")`, `rng("events")`, `rng("generation.towns")`. Streams are derived from the seed and the stream name by hashing, so they are independent of call order in other systems.
- Every iteration over entities uses the ordered id array beside the table. Object key order is never relied on.
- No floating point in `sim`. Percentages are integers per 10,000; meter math uses integer scaling with explicit rounding rules (round half away from zero, stated once in `shared`).
- The state hash (a fast 64-bit hash over the canonical JSON of the world) is computed after every step in debug and stored in the action log every N turns. The replay check compares hashes.
- Content is part of the input. A replay is valid only against the same content version; the harness stores content version with golden seeds.

---

## 6. Saves and versions

```ts
type SaveFile = {
  schemaVersion: number;      // shape of World
  contentVersion: string;     // content package version
  seed: string;
  setup: GameSetup;           // archetype, background, difficulty, ironman
  actions: ActionLogEntry[];  // per turn: actions taken
  snapshots: { turn: number; world: World; hash: string }[]; // every 26 turns
};
```

Loading: find the latest snapshot at or before the requested turn, replay actions forward. If `contentVersion` differs, replay from the last snapshot only (no re-generation) and warn that outcomes before the snapshot are frozen. If `schemaVersion` is older, run the migration chain in `shared/migrations`; if no chain exists, refuse and offer export.

Storage: IndexedDB through a thin wrapper; a `localStorage` flag only for "last save id". Export writes the SaveFile as JSON; import validates with the zod schema.

---

## 7. Fog of war as a projection

The simulation knows everything. The player sees a `Report` projected from the `TurnLog` by visibility rules (design 07, section 5): exact values for what the player owns, estimates with error bands for their own men, rumors for rival families, signs for the state. The projection is a pure function of `(world, log, playerId)`, so the harness can also test what a player would have known.

---

## 8. Simplified provinces

Only the player's province runs the full pipeline. Other provinces run a compact family model: a family is a record of size, territory value, Attention band, standing with neighbors and a small goal state; it produces regional facts (a war, a trial, a route offer) through the same event engine with templates flagged `scope: regional`. When the player's Weight or an action reaches a province, it is expanded: families are populated with characters from the generator using the province's seed stream, so expansion is deterministic and lazy.

---

## 9. What the renderer receives

The `TurnLog` is a list of entries `{ tick, kind, subjectIds, placeId, cause, visibility }`. The PixiJS view plays entries with a place in the current view as animations in tick order; the newspaper and report panels render entries by kind through text templates. Neither computes anything. A test asserts that every entry with `visibility >= player` appears in exactly one of the report views.

---

## 10. Repository rules for agents (to be placed in `CLAUDE.md`)

- Do not import anything into `packages/sim` except `packages/shared`.
- Do not call `Math.random`, `Date`, or any timer in `sim`. Use the provided stream.
- Do not mutate `World`. Emit Facts.
- Do not write a value your system does not own (ownership table in design 02).
- Do not add a new process type. Add a template.
- Do not add content without a schema entry and a scenario test.
- Run `pnpm harness quick` before reporting; attach its output.
- Update `docs/design/dependency-table.md` when your change reads or writes a new value.
