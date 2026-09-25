// The first chain of consequence (design 04 §8, B6a the escalation ladder, user story 11): a shop refuses
// the collector, the crew chief decides how to answer, and (if he burns or bombs the place) the town reacts.
//
// civil.refusal.start -> family.intimidation.choose -> operation.arson | operation.bomb
//   -> civil.refusal.spread / state.squad.watch (probabilistic follow-ups)
//
// Heat and Sentiment numbers follow design 03 §2 (intimidation with damage +10 heat; a burned car +40) and
// §5 (a burned shop -40 Sentiment), scaled up for arson/bomb as noted per effect below.
//
// Two deliberate deviations from a literal reading of the brief, forced by the engine code (authoritative
// per CLAUDE.md and the task brief):
//
// 1. `family.intimidation.choose` is given `duration: 1`, not the `duration: 0` the brief describes. Reading
//    engine/scheduler.ts `trySpawnTemplate`: any template whose `resolveTurn <= turn` (i.e. duration 0) is
//    resolved immediately in the same call via `resolveInstanceNow`, which never checks `template.decision` at
//    all -- only the "due firings" pass (the scheduler's part (b), reached on a *later* turn) offers the
//    decision to a player-controlled decider or applies `aiDefault` otherwise. A duration-0 decision template
//    would therefore never actually pause for a decision; `duration: 1` is the same pattern the engine's own
//    tests use for a decision template (engine/scheduler.test.ts `decisionTemplate()`).
//
// 2. `roles.ts` `crewOf` only resolves from a `character` or `block` anchor, not from a `business` one, so
//    `from: { role: "shop", relation: "crewOf" }` (as sketched in the brief) cannot bind. There is also no
//    relation from a business to its own block. The closest available path is business -> town (`townOf`,
//    which does support a business anchor) -> town's characters (`inTown`, which gathers every crew's chief
//    and members in the town), filtered `where` to `rank in ["chief"]`. In a town held by a single crew (the
//    starter world, and every generated town at release per docs/design/05) this picks exactly that crew's
//    chief; if a town is ever split between crews this would consider all of their chiefs equally, which is
//    the documented limit of the available relations. `chief` stays `optional` per the brief for a town with
//    no crew (no chief candidate at all).
//
// A parallel limit, not worth a role workaround: `civil.refusal.spread`'s `neighbour` selector (business ->
// town's `businessesOf`) has no way to exclude the `shop` role's own id -- there is no entity-equality
// predicate in the DSL (only `cmp` on a numeric path). `neighbour` could therefore occasionally draw the
// refusing shop itself. Left as is; harmless (one more compliance hit on a shop already at stage 1).
//
// A third: `EvidenceAdd.item.crimeRef` effects below use the bare `"$instance"` reference rather than a
// prefixed form like `"arson:$instance"`. effects.ts `resolveValue` only resolves a RefValue string when the
// *entire* string is a `$`-token; there is no in-string interpolation. `"$instance"` alone still resolves to
// the process instance's id, which is already unique per firing -- exactly what crimeRef needs.
//
// Hotspot 5 (docs/event-storming-2026-09-25.md §3, 2026-09-25): "when the player is the party, the player
// decides." `family.intimidation.choose` used to route every decision to `chief`, even when the refusing shop
// was the player's own -- so the associate never got the choice the walkthrough promises him. Rather than a
// second template sharing an `exclusiveTag` (an earlier draft of this fix), the owner asked for one engine
// feature instead: `decision.role` may be a priority list (`string[]`), resolved at decision time by
// engine/scheduler.ts's `resolveDeciderRoleName` to the first role in the list bound to a player-controlled
// character, else the list's last role (the original NPC default). Two new roles make the list possible here:
// `holder` (the character on record for the shop, via the disputes wave's `claimHolderOf` -- the player himself,
// if he has claimed it, or, far more often at associate rank, his sponsor) and `mine` (a player-controlled
// subordinate of `holder`: the associate collecting here on the sponsor's behalf). `decision.role: ["holder",
// "mine", "chief"]` therefore reaches the player whenever he is either party, and falls back to the chief
// exactly as before otherwise.
//
// Every option's own effects (`DecisionOption.effects`, always applied verbatim regardless of who decided) are
// unchanged from the chief-only version -- the crew chief's own copy of the "letItGo" memory and the
// evidence naming him stay, since decision.role's fallback slot still names him as the town's nominally
// responsible party. What hotspot 5 adds sits in `resolve[]` instead: a player-made choice cannot be told apart
// from an AI one by looking at effects alone (an outcome's `when` is the only place that ever sees who or what
// decided, via the `decided` predicate plus the new `playerControlled`/`bound` checks below), so every option
// gets three mutually exclusive outcomes -- the original news-style one (now guarded to fire only when neither
// `holder` nor `mine` decided) and two mirrored player-voice ones, `...Holder` and `...Mine`, that add the extra
// participation evidence and `RecordDelta jobsDone` a hands-on choice carries and report it in the second
// person. Effects can only ever reference a role by its declared name (`"$holder"`/`"$mine"`), never "whichever
// role actually decided" -- hence two outcomes, not one, per option.
import type { Effect, Outcome, Predicate, ProcessTemplate } from "@borgata/sim";

// Hotspot 5: whether the deciding role resolved to `holder` or to `mine` (`resolveDeciderRoleName`'s own rule).
// `mine`'s role selector below only ever binds a player-controlled character, so `bound: { role: "mine" }` alone
// already means "mine decided, and mine is the player" -- no separate `playerControlled` check is needed for it.
const HOLDER_DECIDED: Predicate = { playerControlled: { role: "holder", is: true } };
const MINE_DECIDED: Predicate = { bound: { role: "mine", is: true } };
const NOT_PLAYER_DECIDED: Predicate = { all: [{ not: HOLDER_DECIDED }, { not: MINE_DECIDED }] };

// Shared by operation.arson's "success" and "witnessed" outcomes (the witnessed outcome is success plus
// extra evidence and extra heat, design 04 §8 step 3).
const ARSON_SUCCESS_EFFECTS: Effect[] = [
  { fact: "FearDelta", businessId: "$shop", delta: 300, cause: { rule: "operation.arson.success" } },
  { fact: "ComplianceDelta", businessId: "$shop", delta: 300, cause: { rule: "operation.arson.success" } },
  { fact: "RefusalStage", businessId: "$shop", stage: 0, cause: { rule: "operation.arson.success" } },
  { fact: "HeatDelta", townId: "$shop.town", delta: 40, cause: { rule: "operation.arson.success" } },
  { fact: "SentimentDelta", townId: "$shop.town", delta: -40, cause: { rule: "operation.arson.success" } },
  {
    fact: "EvidenceAdd",
    characterId: "$chief",
    item: { crimeRef: "$instance", weight: 20, source: "participation" },
    cause: { rule: "operation.arson.success" },
  },
];

const ARSON_FOLLOW_UPS = [
  {
    templateId: "civil.refusal.spread",
    delay: 26,
    probability: 3000,
    bind: { shop: "shop" },
    when: [{ cmp: { role: "shop", path: "refusalStage", op: "gte" as const, value: 1 } }],
  },
  {
    templateId: "state.squad.watch",
    delay: 2,
    probability: 5000,
    bind: { shop: "shop" },
    when: [{ heat: { role: "shop", gte: 300 } }],
  },
];

// Shared by operation.bomb's "success" and "witnessed" outcomes.
const BOMB_SUCCESS_EFFECTS: Effect[] = [
  { fact: "FearDelta", businessId: "$shop", delta: 300, cause: { rule: "operation.bomb.success" } },
  { fact: "ComplianceDelta", businessId: "$shop", delta: 300, cause: { rule: "operation.bomb.success" } },
  { fact: "RefusalStage", businessId: "$shop", stage: 0, cause: { rule: "operation.bomb.success" } },
  { fact: "HeatDelta", townId: "$shop.town", delta: 250, cause: { rule: "operation.bomb.success" } },
  { fact: "SentimentDelta", townId: "$shop.town", delta: -120, cause: { rule: "operation.bomb.success" } },
  {
    fact: "EvidenceAdd",
    characterId: "$chief",
    item: { crimeRef: "$instance", weight: 60, source: "participation" },
    cause: { rule: "operation.bomb.success" },
  },
];

const OPERATION_ROLES = {
  // Always prebound by the schedule entry's `bind` (from the decision option's `schedule` effect); the
  // selectors below are placeholders satisfying the template contract and are only ever exercised if a
  // `family.intimidation.choose` instance somehow resolved with `chief` unbound (see the file header).
  shop: { entity: "business" as const, pick: "first" as const },
  chief: { entity: "character" as const, pick: "first" as const },
};

/**
 * 1. `civil.refusal.start`: the collector is turned away (design 04 §8 step 1, B6a rung 0 -> 1).
 */
const refusalStart: ProcessTemplate = {
  id: "civil.refusal.start",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "civil",
  spawn: { weight: 1500, per: "business", maxActivePerScope: 1 },
  roles: {
    shop: { entity: "business", pick: "first" },
  },
  // `activeTemplate` exclusion is redundant with `maxActivePerScope: 1` above (design 04 §1), so it is
  // left out here.
  preconditions: [
    { cmp: { role: "shop", path: "compliance", op: "lt", value: 400 } },
    { cmp: { role: "shop", path: "refusalStage", op: "eq", value: 0 } },
  ],
  duration: 0,
  resolve: [
    {
      id: "refused",
      effects: [
        { fact: "RefusalStage", businessId: "$shop", stage: 1, cause: { rule: "civil.refusal.start.refused" } },
        { fact: "ComplianceDelta", businessId: "$shop", delta: -50, cause: { rule: "civil.refusal.start.refused" } },
      ],
      report: { visibility: "sign", sign: "A shop on your block sent the collector away empty-handed." },
    },
  ],
  followUps: [{ templateId: "family.intimidation.choose", delay: 1, bind: { shop: "shop" } }],
  report: { visibility: "sign", sign: "A shop on your block sent the collector away empty-handed." },
  tags: ["civil", "refusal", "chain"],
  codexId: "escalation-ladder",
};

/**
 * 2. `family.intimidation.choose`: the decision on the escalation ladder (B6a, design 04 §8 step 2), routed to
 * the player when he is either party (hotspot 5, file header) and to the crew chief otherwise.
 * See the file header for why `duration` is 1, not the 0 the brief describes.
 */
const intimidationChoose: ProcessTemplate = {
  id: "family.intimidation.choose",
  version: 1,
  kind: "dispute",
  scope: "town",
  lane: "families",
  roles: {
    // Prebound by civil.refusal.start's follow-up bind.
    shop: { entity: "business", pick: "first" },
    town: { entity: "town", from: { role: "shop", relation: "townOf" }, pick: "first" },
    // Hotspot 5: the character on record for the shop (disputes wave's claimHolderOf) -- the player himself if
    // he has claimed it, or, at associate rank, his sponsor.
    holder: { entity: "character", from: { role: "shop", relation: "claimHolderOf" }, pick: "first", optional: true },
    // Hotspot 5: a player-controlled subordinate of `holder` -- the associate collecting here on the sponsor's
    // behalf. Declared after `holder` so `bindRoles` (engine/roles.ts) has it bound before resolving `from`.
    mine: {
      entity: "character",
      from: { role: "holder", relation: "subordinatesOf" },
      where: [{ playerControlled: { role: "$candidate", is: true } }],
      pick: "first",
      optional: true,
    },
    // See the file header: closest available path to "the crew chief of the shop's block".
    chief: {
      entity: "character",
      from: { role: "town", relation: "inTown" },
      where: [{ rank: { role: "$candidate", in: ["chief"] } }],
      pick: "random",
      optional: true,
    },
  },
  preconditions: [],
  duration: 1,
  decision: {
    // Hotspot 5: a priority list (engine/scheduler.ts resolveDeciderRoleName) -- the player decides if he is
    // `holder` or the player-controlled `mine`, else the town's crew chief decides exactly as before.
    role: ["holder", "mine", "chief"],
    prompt: "The shopkeeper refuses to pay. What do we do?",
    options: [
      {
        id: "none",
        label: "Let it go",
        // Neutral hint (hotspot 5): readable whether the chief or the player himself is deciding.
        hint: "Nothing happens to the shop tonight. Compliance slips further on the block, and whoever let it go remembers it.",
        effects: [
          { fact: "ComplianceDelta", businessId: "$shop", delta: -20, cause: { rule: "family.intimidation.choose.none" } },
          {
            fact: "MemoryAdd",
            characterId: "$chief",
            memory: { tag: "letItGo", weight: 10 },
            cause: { rule: "family.intimidation.choose.none" },
          },
        ],
      },
      {
        id: "glue",
        label: "Glue the locks",
        hint: "A quiet message at his door: fear rises on the shop, the town gets a little hotter, and it leaves evidence on whoever orders it.",
        effects: [
          { fact: "FearDelta", businessId: "$shop", delta: 80, cause: { rule: "family.intimidation.choose.glue" } },
          { fact: "HeatDelta", townId: "$shop.town", delta: 10, cause: { rule: "family.intimidation.choose.glue" } },
          { fact: "SentimentDelta", townId: "$shop.town", delta: -10, cause: { rule: "family.intimidation.choose.glue" } },
          {
            fact: "EvidenceAdd",
            characterId: "$chief",
            item: { crimeRef: "$instance", weight: 5, source: "participation" },
            cause: { rule: "family.intimidation.choose.glue" },
          },
        ],
      },
      {
        id: "arson",
        label: "Burn it down",
        hint: "The place burns. Seven times in ten it reads as an accident, two in ten the neighbours notice the men who did it, and one time in ten the fire never catches; either way it costs heat and leaves evidence on whoever orders it.",
        effects: [{ schedule: { templateId: "operation.arson", delay: 1, bind: { shop: "shop", chief: "chief" } } }],
      },
      {
        id: "bomb",
        label: "Plant a bomb at the shutter",
        hint: "Louder than fire. Seven times in ten it passes as a stray bomb, two in ten the neighbours see the men who planted it, and one time in ten it never goes off; either way it costs heat and evidence on whoever orders it, and it is the kind of job that draws the Commission's eye.",
        effects: [{ schedule: { templateId: "operation.bomb", delay: 1, bind: { shop: "shop", chief: "chief" } } }],
      },
    ],
    aiDefault: "glue",
    timeoutTurns: 2,
    timeoutOption: "glue",
  },
  // Rule 2c (schema.ts, 2026-09-25): every option needs its own answering outcome the player reads. Hotspot 5
  // splits each of the four into up to three mutually exclusive outcomes below (the file header explains why):
  // the original news-of-the-block line (now guarded to fire only when neither `holder` nor `mine` decided),
  // and two player-voice ones -- `...Holder`/`...Mine` -- adding the extra participation evidence and
  // `RecordDelta jobsDone` a hands-on choice carries. `arson`/`bomb` already schedule `operation.arson`/
  // `operation.bomb` (their own report lines fire later, when those resolve); the extra evidence below is for
  // the act of ordering it, not its execution.
  resolve: [
    { id: "letGo", when: [{ decided: { optionId: "none" } }, NOT_PLAYER_DECIDED], effects: [], report: { sign: "The chief let the shop be.", visibility: "sign" } },
    {
      id: "letGoHolder",
      when: [{ decided: { optionId: "none" } }, HOLDER_DECIDED],
      effects: [],
      report: { sign: "You let the shop be, for now.", visibility: "sign" },
    },
    {
      id: "letGoMine",
      when: [{ decided: { optionId: "none" } }, MINE_DECIDED],
      effects: [],
      report: { sign: "You let the shop be, for now.", visibility: "sign" },
    },

    { id: "glued", when: [{ decided: { optionId: "glue" } }, NOT_PLAYER_DECIDED], effects: [], report: { sign: "The shutter was glued overnight.", visibility: "sign" } },
    {
      id: "gluedHolder",
      when: [{ decided: { optionId: "glue" } }, HOLDER_DECIDED],
      effects: [
        { fact: "EvidenceAdd", characterId: "$holder", item: { crimeRef: "$instance", weight: 10, source: "participation" }, cause: { rule: "family.intimidation.choose.mine.glue" } },
        { fact: "RecordDelta", characterId: "$holder", field: "jobsDone", delta: 1, cause: { rule: "family.intimidation.choose.mine.glue" } },
      ],
      report: { sign: "You glue his locks yourself: the shutter is stuck fast, and it costs you a little heat.", visibility: "sign" },
    },
    {
      id: "gluedMine",
      when: [{ decided: { optionId: "glue" } }, MINE_DECIDED],
      effects: [
        { fact: "EvidenceAdd", characterId: "$mine", item: { crimeRef: "$instance", weight: 10, source: "participation" }, cause: { rule: "family.intimidation.choose.mine.glue" } },
        { fact: "RecordDelta", characterId: "$mine", field: "jobsDone", delta: 1, cause: { rule: "family.intimidation.choose.mine.glue" } },
      ],
      report: { sign: "You glue his locks yourself: the shutter is stuck fast, and it costs you a little heat.", visibility: "sign" },
    },

    { id: "burned", when: [{ decided: { optionId: "arson" } }, NOT_PLAYER_DECIDED], effects: [], report: { sign: "The chief ordered the shop burned.", visibility: "sign" } },
    {
      id: "burnedHolder",
      when: [{ decided: { optionId: "arson" } }, HOLDER_DECIDED],
      effects: [
        { fact: "EvidenceAdd", characterId: "$holder", item: { crimeRef: "$instance", weight: 30, source: "participation" }, cause: { rule: "family.intimidation.choose.mine.arson" } },
        { fact: "RecordDelta", characterId: "$holder", field: "jobsDone", delta: 1, cause: { rule: "family.intimidation.choose.mine.arson" } },
      ],
      report: { sign: "You give the order yourself: the shop will burn.", visibility: "sign" },
    },
    {
      id: "burnedMine",
      when: [{ decided: { optionId: "arson" } }, MINE_DECIDED],
      effects: [
        { fact: "EvidenceAdd", characterId: "$mine", item: { crimeRef: "$instance", weight: 30, source: "participation" }, cause: { rule: "family.intimidation.choose.mine.arson" } },
        { fact: "RecordDelta", characterId: "$mine", field: "jobsDone", delta: 1, cause: { rule: "family.intimidation.choose.mine.arson" } },
      ],
      report: { sign: "You give the order yourself: the shop will burn.", visibility: "sign" },
    },

    { id: "bombed", when: [{ decided: { optionId: "bomb" } }, NOT_PLAYER_DECIDED], effects: [], report: { sign: "The chief ordered a bomb planted at the shutter.", visibility: "sign" } },
    {
      id: "bombedHolder",
      when: [{ decided: { optionId: "bomb" } }, HOLDER_DECIDED],
      effects: [
        { fact: "EvidenceAdd", characterId: "$holder", item: { crimeRef: "$instance", weight: 40, source: "participation" }, cause: { rule: "family.intimidation.choose.mine.bomb" } },
        { fact: "RecordDelta", characterId: "$holder", field: "jobsDone", delta: 1, cause: { rule: "family.intimidation.choose.mine.bomb" } },
      ],
      report: { sign: "You give the order yourself: a bomb, this time.", visibility: "sign" },
    },
    {
      id: "bombedMine",
      when: [{ decided: { optionId: "bomb" } }, MINE_DECIDED],
      effects: [
        { fact: "EvidenceAdd", characterId: "$mine", item: { crimeRef: "$instance", weight: 40, source: "participation" }, cause: { rule: "family.intimidation.choose.mine.bomb" } },
        { fact: "RecordDelta", characterId: "$mine", field: "jobsDone", delta: 1, cause: { rule: "family.intimidation.choose.mine.bomb" } },
      ],
      report: { sign: "You give the order yourself: a bomb, this time.", visibility: "sign" },
    },
  ],
  followUps: [],
  // Neutral (hotspot 5): the card is shown before the decider is known.
  report: { visibility: "known", sponsor: "A decision is needed on the shop that refused." },
  tags: ["refusal", "intimidation", "decision"],
  codexId: "escalation-ladder",
};

const arsonWitnessedEffects: Effect[] = [
  ...ARSON_SUCCESS_EFFECTS,
  { fact: "EvidenceAdd", characterId: "$chief", item: { crimeRef: "$instance", weight: 40, source: "witness" }, cause: { rule: "operation.arson.witnessed" } },
  { fact: "HeatDelta", townId: "$shop.town", delta: 80, cause: { rule: "operation.arson.witnessed" } },
];

const arsonOutcomes: Outcome[] = [
  {
    id: "success",
    weight: 70,
    effects: ARSON_SUCCESS_EFFECTS,
    report: { newspaper: "Fire at a shop in the night; the owner blames a faulty stove.", visibility: "known" },
  },
  {
    id: "witnessed",
    weight: 20,
    effects: arsonWitnessedEffects,
    report: { newspaper: "Neighbours saw men near the shop before the fire.", visibility: "known" },
  },
  {
    id: "failed",
    weight: 10,
    effects: [
      { fact: "HeatDelta", townId: "$shop.town", delta: 20, cause: { rule: "operation.arson.failed" } },
      { fact: "MemoryAdd", characterId: "$chief", memory: { tag: "botched", weight: 30 }, cause: { rule: "operation.arson.failed" } },
    ],
    report: { newspaper: "A fire of unknown origin failed to take at a shop overnight.", sign: "The fire did not take.", visibility: "sign" },
  },
];

/**
 * 3. `operation.arson`: the family answers the refusal by fire (design 04 §8 step 3).
 */
const operationArson: ProcessTemplate = {
  id: "operation.arson",
  version: 1,
  kind: "operation",
  scope: "town",
  lane: "families",
  roles: OPERATION_ROLES,
  preconditions: [],
  duration: 1,
  locks: ["shop"],
  resolve: arsonOutcomes,
  followUps: ARSON_FOLLOW_UPS,
  tags: ["operation", "arson", "refusal"],
  codexId: "escalation-ladder",
};

const bombWitnessedEffects: Effect[] = [
  ...BOMB_SUCCESS_EFFECTS,
  { fact: "EvidenceAdd", characterId: "$chief", item: { crimeRef: "$instance", weight: 40, source: "witness" }, cause: { rule: "operation.bomb.witnessed" } },
  { fact: "HeatDelta", townId: "$shop.town", delta: 80, cause: { rule: "operation.bomb.witnessed" } },
];

const bombOutcomes: Outcome[] = [
  {
    id: "success",
    weight: 70,
    effects: BOMB_SUCCESS_EFFECTS,
    report: { newspaper: "A bomb tears the shutter off a shop before dawn.", visibility: "known" },
  },
  {
    id: "witnessed",
    weight: 20,
    effects: bombWitnessedEffects,
    report: { newspaper: "Neighbours saw the men who planted the bomb.", visibility: "known" },
  },
  {
    id: "failed",
    weight: 10,
    effects: [
      { fact: "HeatDelta", townId: "$shop.town", delta: 20, cause: { rule: "operation.bomb.failed" } },
      { fact: "MemoryAdd", characterId: "$chief", memory: { tag: "botched", weight: 30 }, cause: { rule: "operation.bomb.failed" } },
    ],
    report: { newspaper: "An explosion damaged a shop shutter overnight; it failed to fully detonate.", sign: "The bomb did not go off.", visibility: "sign" },
  },
];

/**
 * 4. `operation.bomb`: like arson but louder (design 04 §8 step 3). The Commission's ban on bombs is a
 * later template (a precondition checking `politics.bans`); `tags` already marks it "banned" for that.
 */
const operationBomb: ProcessTemplate = {
  id: "operation.bomb",
  version: 1,
  kind: "operation",
  scope: "town",
  lane: "families",
  roles: OPERATION_ROLES,
  preconditions: [],
  duration: 1,
  locks: ["shop"],
  crisis: { flag: "operationPending", ttl: 1 },
  resolve: bombOutcomes,
  followUps: ARSON_FOLLOW_UPS,
  tags: ["operation", "bomb", "refusal", "banned"],
  codexId: "escalation-ladder",
};

/**
 * 5. `civil.refusal.spread`: other shopkeepers notice the refuser is still in business (design 04 §8 step 4).
 * See the file header for the `neighbour` self-selection limit.
 */
const refusalSpread: ProcessTemplate = {
  id: "civil.refusal.spread",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "civil",
  roles: {
    // Prebound by operation.arson/bomb's follow-up bind.
    shop: { entity: "business", pick: "first" },
    town: { entity: "town", from: { role: "shop", relation: "townOf" }, pick: "first" },
    neighbour: {
      entity: "business",
      from: { role: "town", relation: "businessesOf" },
      where: [{ cmp: { role: "$candidate", path: "compliance", op: "gt", value: 0 } }],
      pick: "random",
    },
  },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "spread",
      effects: [
        { fact: "ComplianceDelta", businessId: "$neighbour", delta: -100, cause: { rule: "civil.refusal.spread" } },
        { fact: "SentimentDelta", townId: "$town", delta: -30, cause: { rule: "civil.refusal.spread" } },
      ],
      report: { newspaper: "Shopkeepers in the quarter are talking; a refusing business still stands.", sign: "Other shopkeepers have noticed that the refuser is still in business.", visibility: "sign" },
    },
  ],
  followUps: [],
  tags: ["civil", "refusal", "spread"],
  codexId: "escalation-ladder",
};

/**
 * 6. `state.squad.watch`: the state answers the fire (design 04 §8 step 4).
 */
const squadWatch: ProcessTemplate = {
  id: "state.squad.watch",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  roles: {
    // Prebound by operation.arson/bomb's follow-up bind.
    shop: { entity: "business", pick: "first" },
    town: { entity: "town", from: { role: "shop", relation: "townOf" }, pick: "first" },
    family: { entity: "family", from: { role: "town", relation: "familyOf" }, pick: "first", optional: true },
  },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "assigned",
      effects: [
        { fact: "HeatDelta", townId: "$town", delta: -50, cause: { rule: "state.squad.watch" } },
        { fact: "AttentionDelta", familyId: "$family", delta: 30, cause: { rule: "state.squad.watch" } },
      ],
      report: { newspaper: "A police squad has been assigned to the neighbourhood after the fire.", visibility: "known" },
    },
  ],
  followUps: [],
  tags: ["state", "squad", "pressure"],
  codexId: "escalation-ladder",
};

export const CIVIL_TEMPLATES: ProcessTemplate[] = [
  refusalStart,
  intimidationChoose,
  operationArson,
  operationBomb,
  refusalSpread,
  squadWatch,
];
