# Design 06: Content Schemas

Status: design, 2026-09-21. Defines the content package: what is data, how each content type is shaped, how text is templated, how content is versioned and validated, and how much of it the vertical slice and the release need. Inputs: brief K6, NF-10, NF-13, L6; build plan rule S7; review item S-1; design 01 §2, design 03, design 04.

Principle: the engine is code, the game is data. Every racket, trait, event, scene, name and codex entry is a JSON file validated by a zod schema at build time. Agents add content by adding files and a scenario test. Nothing in `packages/sim` changes when content changes.

---

## 1. Package layout

```
packages/content/
  package.json              version = content version (semver)
  src/schemas/              zod schemas, one file per content type, exported as a single Content type
  src/index.ts              loads, validates, freezes and exports Content
  data/
    templates/              ProcessTemplate, one file per template
      state/                lane 1   e.g. state.raid.den.json
      commission/           lane 2
      family/               lane 3   operations, disputes, chains' spawn events
      civil/                lane 4
      world/                lane 5
      people/               lane 6   aging, careers, household
    chains/                 ChainTemplate
    rackets/                RacketType
    businesses/             BusinessType
    institutions/           InstitutionType
    archetypes/             TownArchetype
    traits/                 TraitDefinition
    facets/                 ReputationFacet
    names/                  NamePool, one file per region and kind
    scenes/                 SceneTemplate
    newspaper/              NewspaperTemplate
    codex/                  CodexEntry
    difficulty/             DifficultyPreset
    bans/                   BanDefinition
    tools/                  StateTool per Attention band
    glossary/               Glossary (the bilingual label table from the brief, section 13)
    migrations/             content migrations, see §4
  scenarios/                one scenario test per template (mirrors data/templates/)
```

Every file has a top-level `id` equal to its path-derived name and a `version` integer.

---

## 2. Schemas

Sketches in zod style. `Meter`, `SignedMeter`, `Permille`, `Per10k`, `Money` are shared branded integer schemas from `packages/shared`. `Id(kind)` is a branded string schema that the validator checks for referential integrity (§5).

### 2.1 Predicates, selectors, effects (shared by templates)

```ts
const RoleRef = z.string().regex(/^\$[a-zA-Z][a-zA-Z0-9]*$/);   // "$target"
const Path = z.string();  // dotted path into world or a role's entity, e.g. "loyalty", "family.attention"

const Predicate: z.ZodType<Predicate> = z.lazy(() => z.union([
  z.object({ all: z.array(Predicate).min(1) }),
  z.object({ any: z.array(Predicate).min(1) }),
  z.object({ not: Predicate }),
  z.object({ cmp: z.object({ role: RoleRef.optional(), path: Path, op: z.enum(["lt","lte","eq","gte","gt"]), value: z.number().int() }) }),
  z.object({ band: z.object({ role: RoleRef, gte: z.number().int().min(0).max(4) }) }),
  z.object({ has: z.object({ role: RoleRef, trait: Id("trait").optional(), tag: z.string().optional(), ban: Id("ban").optional() }) }),
  z.object({ status: z.object({ role: RoleRef, is: CharStatus }) }),
  z.object({ rank: z.object({ role: RoleRef, gte: Rank.optional(), eq: Rank.optional() }) }),
  z.object({ owns: z.object({ role: RoleRef, business: RoleRef }) }),
  z.object({ claimBy: z.object({ subject: RoleRef, holder: RoleRef }) }),
  z.object({ standing: z.object({ a: RoleRef, b: RoleRef, gte: SignedMeter }) }),
  z.object({ favor: z.object({ from: RoleRef, to: RoleRef, gte: SignedMeter }) }),
  z.object({ inTownOf: z.object({ role: RoleRef, town: RoleRef }) }),
  z.object({ recent: z.object({ fact: FactKind, role: RoleRef.optional(), within: z.number().int().positive() }) }),
  z.object({ flag: z.object({ name: z.string(), is: z.boolean() }) }),
  z.object({ fn: z.object({ name: z.string(), args: z.record(z.unknown()).optional() }) }),  // must be registered
]));

const RoleSelector = z.object({
  entity: z.enum(["character","business","family","town","block","institutionSlot","routeNode","partner","account"]),
  where: z.array(Predicate).default([]),
  pick: z.enum(["random","first"]).or(z.string().regex(/^(highest|lowest):[a-zA-Z.]+$/)).default("random"),
  stream: z.string().default("events"),
  required: z.boolean().default(true),
  boundBy: z.enum(["caller","engine"]).default("engine"),
});

const Effect = z.union([
  z.object({ fact: FactKind, /* payload fields with RoleRef or literals */ }).passthrough(),
  z.object({ schedule: Id("template"), delay: Range, probability: Per10k.default(10000), condition: Predicate.optional(), bind: z.record(RoleRef).optional() }),
  z.object({ cancel: z.object({ tag: z.string().optional(), instance: RoleRef.optional(), reason: z.string() }) }),
  z.object({ setFlag: z.object({ name: z.string(), value: z.boolean(), ttl: z.number().int().optional() }) }),
  z.object({ bindRole: z.object({ role: RoleRef, selector: RoleSelector }) }),
]);
```

The Fact payload shape for each `FactKind` is validated against the Fact catalogue in design 02 §6; role references are allowed wherever an id is expected.

### 2.2 ProcessTemplate (design 04 §1)

```ts
const ProcessTemplate = z.object({
  id: Id("template"), version: z.number().int().positive(),
  kind: z.enum(["event","scheme","operation","chain","dispute","career","regional"]),
  scope: z.enum(["town","family","district","province","island"]),
  lane: z.enum(["state","commission","families","civil","world","people"]),
  roles: z.record(RoleName, RoleSelector),
  spawn: z.object({ weight: z.number().int().positive(), perScopeMax: z.number().int().optional(), cooldown: z.number().int().optional() }).optional(),
  preconditions: z.array(Predicate),
  duration: z.object({ turns: z.union([z.number().int(), Range]), perTurn: z.array(StepRule).optional() }),
  progress: z.object({ perTurn: z.number().int(), modifiers: z.array(Modifier), resolveAt: Meter }).optional(),
  discovery: z.object({ perTurn: z.number().int(), modifiers: z.array(Modifier), signs: z.array(SignThreshold), evidenceAt: Meter.optional() }).optional(),
  decision: DecisionSpec.optional(),
  resolve: z.array(Outcome).min(1),
  followUps: z.array(FollowUp),
  crisis: z.object({ flag: CrisisFlag, ttl: z.number().int() }).optional(),
  exclusiveTag: z.string().optional(),
  priority: z.number().int().default(0),
  report: ReportSpec,
  tags: z.array(z.string()).min(1),
  codexId: Id("codex").optional(),
});

const Outcome = z.object({ id: z.string(), when: z.array(Predicate).default([]), weight: z.number().int().positive().default(1), effects: z.array(Effect), report: ReportSpec.optional() });
const FollowUp = z.object({ template: Id("template"), delay: Range, probability: Per10k, condition: Predicate.optional(), bind: z.record(RoleRef).optional() });
const DecisionSpec = z.object({
  decider: RoleRef,                                  // usually "$player" or the family head
  prompt: TextKey,
  options: z.array(z.object({ id: z.string(), label: TextKey, when: z.array(Predicate).default([]), effects: z.array(Effect), aiWeight: z.array(Modifier) })).min(2).max(5),
  timeout: z.object({ turns: z.number().int(), option: z.string() }),   // default option if the player does not answer
});
const ReportSpec = z.object({
  visibility: z.enum(["none","sign","known"]),
  channels: z.array(z.enum(["newspaper","lawyer","sponsor","town","commission","household"])),
  text: z.record(z.enum(["newspaper","lawyer","sponsor","town","commission","household","sign"]), z.array(TextKey)),  // variants
});
const Modifier = z.object({ when: Predicate, add: z.number().int() });
const StepRule = z.object({ when: Predicate.optional(), effects: z.array(Effect) });
```

### 2.3 ChainTemplate (design 03 §4)

```ts
const ChainTemplate = z.object({
  id: Id("chain"), version: z.number().int(), racket: Id("racket"),
  slots: z.record(SlotName, z.object({ entity: RoleSelector.shape.entity, required: z.boolean(), min: z.number().int().default(1), max: z.number().int().default(1), exposureWeight: z.number().int() })),
  cadence: z.enum(["turn","weekly","feasts","onEvent"]),
  run: z.object({ income: IncomeRule, evidence: z.array(z.object({ slot: SlotName, weight: z.number().int() })), heat: z.number().int(), attention: z.number().int(), spawns: z.array(FollowUp) }),
  ban: Id("ban").optional(),
  tier: z.enum(["core","release","expansion"]),
  tags: z.array(z.string()), codexId: Id("codex").optional(),
});
const IncomeRule = z.object({ base: Money, scaleBy: z.array(z.enum(["population","sentiment","compliance","slotCount","routeRisk","contractValue"])), mint: z.boolean(), fee: Permille.default(0) });
```

### 2.4 Economy types

```ts
const RacketType = z.object({ id: Id("racket"), chain: Id("chain"), attentionProfile: z.enum(["low","medium","high","extreme"]), counterPlay: z.array(z.enum(["police","state","rival","civil","commission"])), unlockedBy: z.array(Predicate), tier: Tier, codexId: Id("codex") });

const BusinessType = z.object({
  id: Id("businessType"), sizes: z.array(z.number().int().min(1).max(5)),
  tariff: z.record(z.string(), z.object({ perMonth: Money.optional(), perFeast: Money.optional(), percentOfContract: Permille.optional() })),   // keyed by size
  functions: z.object({ cleanIncomePerTurn: z.record(z.string(), Money), launderCapacity: z.record(z.string(), Money), jobs: z.record(z.string(), z.number().int()), enablerTags: z.array(z.string()), cover: z.array(z.enum(["meeting","warehouse","safehouse"])) }),
  upgrades: z.array(z.object({ to: Id("businessType"), cost: Money, requires: z.array(Predicate) })),
  archetypeWeights: z.record(Id("archetype"), z.number().int()),
  ownable: z.boolean(),
});

const InstitutionType = z.object({ id: Id("institution"), slots: z.record(SlotName, z.object({ entity: z.string(), grants: z.array(z.string()), exposureWeight: z.number().int() })), attentionActor: z.enum(["police","customs","coastguard","prefecture","magistrate"]), foundIn: z.array(Id("archetype")), tier: Tier, codexId: Id("codex") });

const TownArchetype = z.object({
  id: Id("archetype"), label: TextKey, population: Range, blocks: Range,
  businessMix: z.array(z.object({ type: Id("businessType"), size: Range, weight: z.number().int() })),
  institutions: z.array(z.object({ type: Id("institution"), probability: Per10k })),
  associateRackets: z.array(Id("racket")), chiefRackets: z.array(Id("racket")), prizeInstitution: Id("institution"),
  tutorialBeats: z.object({ latePayer: Id("businessType"), collision: z.string(), firstArrest: z.string() }),   // C13
  coastal: z.boolean(), island: z.boolean(), rural: z.boolean(),
  signatureEvents: z.array(Id("template")),
});
```

### 2.5 People types

```ts
const TraitDefinition = z.object({
  id: Id("trait"), label: TextKey, exclusiveWith: z.array(Id("trait")),
  skills: z.record(z.enum(["collecting","violence","business","discretion"]), z.number().int()),
  aiWeights: z.record(z.string(), z.number().int()),          // e.g. { "operation.kill": 200, "dispute.concede": -100 }
  loyaltyDriftPerTurn: z.number().int().default(0),
  flipModifier: z.number().int().default(0),
  careerBias: z.record(Id("career"), z.number().int()).optional(),
  reputationBias: z.record(Id("facet"), z.number().int()).optional(),
  frequency: Per10k,
});
const ReputationFacet = z.object({ id: Id("facet"), label: TextKey, decayHalfLifeTurns: z.number().int(), readBy: z.array(z.enum(["dispute","recruitment","scheme","commission","ai"])) });

const NamePool = z.object({
  id: Id("names"), region: z.enum(["palermo","trapani","agrigento","caltanissetta","catania","messina","enna","siracusa","ragusa","mainland","foreign"]),
  kind: z.enum(["surname","givenMale","givenFemale","nickname","businessName","streetName"]),
  entries: z.array(z.object({ text: z.string(), weight: z.number().int().default(1), gender: z.enum(["m","f"]).optional(), tags: z.array(z.string()).default([]) })).min(20),
});
```

### 2.6 Text-bearing types

```ts
const SceneTemplate = z.object({
  id: Id("scene"), kind: z.enum(["initiation","promotion","dispute","report","succession","commission","negotiation","household"]),
  roles: z.array(RoleName), setting: TextKey,
  lines: z.array(z.object({ speaker: RoleRef.or(z.literal("narrator")), text: z.array(TextKey), when: Predicate.optional() })),
  choices: z.array(z.object({ id: z.string(), label: TextKey, leadsTo: z.string().optional() })).optional(),
  codexId: Id("codex").optional(),
});

const NewspaperTemplate = z.object({
  id: Id("news"), forFact: FactKind.or(Id("template")), visibility: z.enum(["public","insider","state"]),
  headline: z.array(TextKey), body: z.array(TextKey), prominence: z.enum(["brief","column","front"]),
  toneByBand: z.record(z.enum(["0","1","2","3","4"]), TextKey).optional(),
});

const CodexEntry = z.object({
  id: Id("codex"), title: TextKey, body: TextKey, sources: z.array(z.string().url()),
  mechanics: z.array(z.string()),                              // requirement ids: "B6a", "E2", "D7"
  unlockedBy: z.array(z.object({ fact: FactKind.optional(), template: Id("template").optional(), band: z.number().int().optional() })),
  realVictims: z.boolean().default(false),                     // NF-7: respectful register enforced by review
});
```

### 2.7 Rules types

```ts
const DifficultyPreset = z.object({ id: Id("difficulty"), label: TextKey, attentionFloorScale: Permille, attentionHalfLifeTurns: z.number().int(), bandShift: z.number().int().min(-100).max(100), flipRateScale: Permille, complianceBaseShift: z.number().int(), aiAggression: Permille, heatPerActScale: Permille });
const BanDefinition = z.object({ id: Id("ban"), label: TextKey, covers: z.array(z.union([Id("racket"), Id("template")])), voteTemplate: Id("template"), breachTemplate: Id("template"), codexId: Id("codex") });
const StateTool = z.object({ id: Id("tool"), band: z.number().int().min(0).max(4), actor: z.enum(["police","carabinieri","customs","coastguard","magistrate","national"]), templates: z.array(Id("template")), counters: z.array(z.string()), announce: ReportSpec, codexId: Id("codex") });
const Glossary = z.array(z.object({ english: z.string(), italian: z.string(), gender: z.enum(["m","f"]), plural: z.string().optional(), codexId: Id("codex").optional() }));
```

---

## 3. Text templating

- **Keys, not strings.** Every human-visible string in a template is a `TextKey` resolved from `data/text/<locale>.json`. Templates carry arrays of keys; the engine picks a variant deterministically from the `text` stream.
- **Placeholders by role.** `{$target.name}`, `{$shop.name}`, `{$family.name}`, `{$town.name}`. Path segments are whitelisted per entity kind by the validator.
- **Bilingual labels (decision 17).** A placeholder `{term:pizzo}` renders from the glossary as `pizzo (protection tax)` until the player's codex has unlocked the entry, then `pizzo` with a tooltip. The interface, not the content author, decides which form; content always writes `{term:...}`.
- **Gender and number.** Glossary entries carry gender and plural; placeholders accept modifiers: `{term:uomo d'onore|pl}` renders `uomini d'onore (men of honor)`. Character placeholders expose `{$x.he}`, `{$x.his}` resolved by the character's gender. Italian locale text uses the same modifiers so agreement is data-driven.
- **Register.** Newspaper templates carry `toneByBand`; lawyer and sponsor channels are always in character; the `sign` channel must never name the state's tool directly (the validator rejects sign texts containing tool ids or the words in a small blocklist such as "wiretap").
- **No numbers in prose.** Money and meters are rendered by the interface from the fact payload; text templates reference `{$amount}` only where a fact carries it.

---

## 4. Versioning

- **Content version** is the semver in `packages/content/package.json`. It is stamped into every save (design 01 §6). A replay is valid only against the same content version; otherwise the loader replays from the last snapshot only.
- **Per-template version** is an integer. Active `ProcessInstance` and `ChainInstance` records store `templateVersion`.
- **Compatibility rule.** A minor content bump may add templates, outcomes, text variants and tags. A major bump may remove or reshape templates and must ship a migration.
- **Migration file** (`data/migrations/<from>__<to>.json`):

```ts
const ContentMigration = z.object({
  from: z.string(), to: z.string(),
  templates: z.array(z.object({
    id: Id("template"), fromVersion: z.number().int(), toVersion: z.number().int(),
    action: z.enum(["keep","cancel","remap"]),
    reason: TextKey.optional(),                                 // rendered in the report when instances are cancelled
    roleMap: z.record(RoleName, RoleName).optional(),          // for remap
    outcomeMap: z.record(z.string(), z.string()).optional(),
  })),
  chains: z.array(z.object({ id: Id("chain"), action: z.enum(["keep","vacateSlot","cancel"]), slot: SlotName.optional() })),
});
```

The loader applies migrations in order between the save's content version and the current one; any instance whose template is missing and has no migration entry fails the load with a named error.

---

## 5. Build-time validation

`pnpm content:check` runs on every commit and fails the build on any of:

1. Schema failure on any file.
2. Referential integrity: every `Id(kind)` resolves to an existing file of that kind; every `TextKey` exists in every shipped locale; every `codexId` exists; every `fn` predicate name is in the registry exported by `packages/sim`; every `FactKind` and payload shape matches design 02 §6.
3. Role integrity: every `$role` used in predicates, effects or text is declared in `roles`, or is a built-in (`$player`, `$family`, `$town`).
4. Scenario coverage: every `ProcessTemplate` and `ChainTemplate` has a scenario file at the mirrored path under `scenarios/`.
5. Tag coverage: every template carries at least one tag from the harness metric list (design 08); unknown tags fail.
6. Exclusivity and lanes: `kind: "operation"` templates are in lane `families`; `lane: "state"` templates never have `spawn.perScopeMax` below 1; templates with `crisis` are in lanes 1 to 3.
7. Sign hygiene: `sign` texts contain no tool ids and no blocklisted words.
8. Determinism: no template uses a `stream` name outside the registered list.

The check emits a content report (counts per type, tier and lane) that the harness stores with golden seeds.

---

## 6. Volume targets (NF-13)

Illustrative targets; the harness content report tracks actuals.

| Content type | Vertical slice | Release |
|---|---|---|
| Process templates (all lanes) | 45 (state 8, commission 2, families 15, civil 10, world 4, people 6) | 350 to 450 |
| Chain templates | 4 (protection tax, loans, gambling, laundering) + votes light | 9 core and release, plus 5 one-board expansions |
| Racket types | 3 | 12 to 15 |
| Business types | 8 | 25 to 30 |
| Institution types | 1 (market) | 8 (harbor, market, water consortium, contract table, planning office, prefecture, clinic, feast committee) |
| Town archetypes | 1 (market quarter) | 7 |
| Traits | 12 | 30 to 40 |
| Reputation facets | 4 | 6 |
| Name pool entries | 600 (one region) | 4,000 across nine regions plus mainland and foreign |
| Scene templates | 5 (initiation, promotion to soldier and chief, dispute, report) | 40 |
| Newspaper templates | 25 | 150 |
| Codex entries | 8 | 60 to 80 |
| Portrait parts (layers × variants) | 6 layers × 6 variants, aging 3 stages | 8 layers × 12 variants, aging 4 stages, both genders |
| Text keys (English) | ~900 | ~9,000 |

Process templates and newspaper templates are the largest content cost; they are estimated first in every phase plan, as the brief requires.

---

## 7. Authoring guidance for agents

- **One template per file.** File name equals `id`. Naming convention `lane.domain.action`, e.g. `state.raid.den`, `families.operation.arson`, `civil.refusal.start`, `people.career.lawStudy`, `world.election.regional`.
- **Version on every edit.** Any change to `roles`, `preconditions`, `resolve` or `followUps` increments `version`; text-only changes do not.
- **Tags are required.** At least one harness tag (`violence`, `economy`, `state`, `treason`, `politics`, `civil`, `household`, `career`, `territory`) and one tier tag (`core`, `release`, `expansion`). Templates that can end a game carry `terminal`.
- **Every template ships with its scenario** (design 08 format): a fixture world, bound roles, the expected Facts in order, and the expected visibility.
- **Codex link when historical.** If the template embodies something in the research reports, set `codexId` and cite the report section in the scenario's description.
- **No engine changes for content.** If a template needs a predicate the DSL lacks, propose an `fn` with its contract in the task report; do not add ad hoc logic.
- **Text discipline.** Write `{term:...}` for every glossary word; never hard-code the bilingual form; keep `sign` texts partial and in character.
- **Run `pnpm content:check` and the template's scenario before reporting**, and attach the content report diff.
