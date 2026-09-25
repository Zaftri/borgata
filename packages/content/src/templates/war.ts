// War (design 13 §3, docs/design/13-disputes-to-the-district.md §1's war row; brainstorm FR-E). A family that
// refuses the district's ruling (the sit-down agent's `dispute.district.refusedRuling`, not this file's own)
// schedules `war.declare` against the family it refused. From there the war runs itself: `war.week` fires every
// turn either side is at war (a body some weeks, quiet most of them -- collections are already halved by
// systems/chains.ts and heat already climbs on both towns via systems/exposure-sources.ts, design 13 §2, so
// this file adds neither), `war.meeting` offers peace every four turns, `war.exhaustion` tips the scales once a
// family is weakened, and `war.return` brings hiding men back once their own family's war has ended.
//
// Two deliberate deviations from a literal reading of the brief, both forced by engine code (authoritative per
// CLAUDE.md and the task brief):
//
// 1. `family.warWith` being set is not a numeric field `cmp` can read (`engine/predicates.ts`'s `cmp` only
//    reads numeric paths via `pathValue`/`numericPath`; a `FamilyId | null` is neither). The brief's own
//    fallback is used instead: a new relation `warWithOf` (family -> the family it is at war with, added to
//    `engine/roles.ts`'s `candidates()` switch and `engine/types.ts`'s `FromRelation`/`packages/content/src/
//    schema.ts`'s `FromRelationSchema`, this file's one owned addition to those two files) binds an `enemy`
//    role that is only ever bound when `warWith` is non-null and still names a real family; every template
//    below that needs "this family is at war" gates on `{ bound: { role: "enemy", is: true } }`.
//
// 2. `war.meeting`'s "AI default: accept when the family is weakened, else refuse with probability 5000" cannot
//    be expressed through `DecisionSpec.aiDefault`: it is a single fixed option id for the whole template (design
//    04 §1), not a per-instance predicate, so it cannot itself vary by `Family.state` (also a non-numeric field,
//    same problem as (1), and `has` only reads character traits/tools/memory, not a family field either). The
//    fix used here is the one `war.exhaustion` already sets up: it tags the family's head's own memory with
//    "suesForPeace" the moment his family goes `weakened` (a character memory tag, which `has` *can* read), and
//    `war.meeting`'s `resolve[]` reads that tag directly rather than routing AI behaviour through `aiDefault` at
//    all -- both decision options carry empty `effects`, and every real consequence (peace or standoff, for the
//    player's own deliberate choice as much as the AI's) lives in `resolve[]`, gated by whether a player-
//    controlled role decided (`decided: { optionId }`) or not (a weighted, probability-6000 draw, since the
//    weakened-or-not split the brief asks for "else" is answered by the memory tag instead; the flat 6000/4000
//    left for the *un*-tagged AI case is this deviation's own fallback, per the brief's "if impossible, accept
//    with probability 6000 and note it" -- noted here).
//
// A third, smaller note: `arbiter` ("the district head's head") binds via `districtHeadOf` (family -> its
// district's head family) then `headOf` (family -> its head character), both added to `engine/roles.ts`/
// `engine/types.ts`/`packages/content/src/schema.ts` by the parallel sit-down agent (design 13 §3's other
// file) after this file was first drafted against neither relation existing. Both stay `optional`: a starter
// or hand-built world with no district assigned (`Family.districtId` null) or a family between heads
// (`Family.headId` null) leaves `arbiter` unbound, and `war.meeting` still happens -- exactly the "if absent
// ... write the meeting so the arbiter role is optional and the meeting still happens" the task brief asked
// for, now satisfied by the relations resolving to nothing rather than by the relations not existing at all.
import type { Effect, Outcome, Predicate, ProcessTemplate } from "@borgata/sim";

// `SpawnRule.spawnFrom.field`'s type is `"businessId" | "characterId" | "townId" | "collectorId"` (engine/
// types.ts); the runtime code (engine/scheduler.ts's spawn pass, step.ts's `fieldsOf`) reads it as a bare string
// key, so "familyId" works identically at runtime. Mirrors packages/content/src/templates/obligations.ts's own
// `FAMILY_FIELD` constant, kept in sync by hand rather than import (obligations.ts is a different domain file).
const FAMILY_FIELD = "familyId" as unknown as "characterId";

const AT_WAR: Predicate = { bound: { role: "enemy", is: true } };

// ===================================================================================================================
// 1. `war.declare`: scheduled only, by the sit-down agent's `dispute.district.refusedRuling` (not owned here).
// `aggressor`/`defender` are always prebound by that template's `schedule` effect `bind` (the same pattern
// `dispute.claim`'s `shop`/`holder`/`poacher` use, packages/content/src/templates/disputes.ts): `bindRoles`
// (engine/roles.ts) skips a role selector entirely once the role is already in the prebound bindings, so the
// `pick: "first"` below is never actually exercised -- it exists only to satisfy the schema's `RoleSelector`
// shape.
// ===================================================================================================================
const warDeclare: ProcessTemplate = {
  id: "war.declare",
  version: 1,
  kind: "event",
  scope: "family",
  lane: "families",
  roles: {
    aggressor: { entity: "family", pick: "first" },
    defender: { entity: "family", pick: "first" },
    // A light guard against a stray double-declaration (two `dispute.district.refusedRuling` firings against
    // the same aggressor before the first `war.declare` even matters): skip if the aggressor is already at war
    // with someone. Reuses `warWithOf` rather than adding a second mechanism for the same question.
    existingEnemy: { entity: "family", from: { role: "aggressor", relation: "warWithOf" }, pick: "first", optional: true },
  },
  preconditions: [{ bound: { role: "existingEnemy", is: false } }],
  duration: 0,
  // Scope `family`: `engine/scheduler.ts`'s `scopeRefForTemplate` takes the first bound role whose kind matches
  // `template.scope`, in `Object.values(roles)` order -- since `aggressor`/`defender` are both prebound by the
  // *other* template's own `bind` map, this file cannot guarantee `aggressor` is first (the brief's "district"
  // alternative would need a role of kind `district`, which no existing relation can bind from a family with no
  // `districtOf` relation defined; the brief's own fallback, "else the aggressor family", is used instead, on a
  // best-effort basis given the above).
  exclusiveTag: "war",
  resolve: [
    {
      id: "declared",
      effects: [
        { fact: "WarStateSet", familyId: "$aggressor", enemyFamilyId: "$defender", cause: { rule: "war.declare" } },
        { fact: "WarStateSet", familyId: "$defender", enemyFamilyId: "$aggressor", cause: { rule: "war.declare" } },
        { fact: "StandingDelta", familyA: "$aggressor", familyB: "$defender", delta: -100, cause: { rule: "war.declare" } },
        // Gated on player involvement by the scheduler itself (`applyEffects`'s "crisis" case, engine/
        // scheduler.ts): a war between two other families is news, not a crisis for the player (design 03 §6).
        { crisis: { flag: "war", ttl: 4, active: true } },
      ],
      report: {
        newspaper: "Two families of the district are at war; men are sleeping away from home.",
        visibility: "known",
      },
    },
  ],
  followUps: [],
  report: { visibility: "known", newspaper: "Two families of the district are at war; men are sleeping away from home." },
  tags: ["war", "declare"],
  codexId: "war",
};

// ===================================================================================================================
// 2. `war.week`: every turn either family of a war is at war, a chance of a hit on the enemy or a retreat of our
// own. Collections at half and the towns' heat already come from systems/chains.ts and systems/exposure-
// sources.ts (design 13 §2); this template adds neither.
// ===================================================================================================================
const SOLDIER_OR_CHIEF: Predicate = { rank: { role: "$candidate", in: ["soldier", "chief"] } };
const FREE_AND_ALIVE: Predicate[] = [{ alive: { role: "$candidate" } }, { status: { role: "$candidate", is: "free" } }];

const warWeek: ProcessTemplate = {
  id: "war.week",
  version: 1,
  kind: "event",
  scope: "family",
  lane: "families",
  spawn: { weight: 10_000, per: "family", cooldownTurns: 1 },
  roles: {
    family: { entity: "family", pick: "first" },
    enemy: { entity: "family", from: { role: "family", relation: "warWithOf" }, pick: "first", optional: true },
    // The brief sketches `membersOf` on "the enemy's crews", but `membersOf` needs a *crew* anchor (engine/
    // roles.ts), not a family one, and there is no single relation from a family to all its crews' members in
    // one step. `inFamily` (family -> every character with that `familyId`, any rank) already exists and is
    // exactly as cheap; the rank filter below narrows it to soldiers and chiefs, same candidate set either way.
    victim: {
      entity: "character",
      from: { role: "enemy", relation: "inFamily" },
      where: [SOLDIER_OR_CHIEF, ...FREE_AND_ALIVE],
      pick: "random",
      optional: true,
    },
    ourMan: {
      entity: "character",
      from: { role: "family", relation: "inFamily" },
      where: [SOLDIER_OR_CHIEF, ...FREE_AND_ALIVE],
      pick: "random",
      optional: true,
    },
  },
  preconditions: [AT_WAR],
  duration: 0,
  resolve: [
    {
      id: "quiet",
      weight: 5500,
      effects: [],
      report: { newspaper: "The war holds its breath for a week.", visibility: "known" },
    },
    {
      id: "hitDead",
      weight: 1800,
      // Excludes a chief victim (the brief's own "soldier or chief"): killing a crew's own chief leaves that
      // crew with no head at all, and `families.crewsConsistent` (invariants) then fails permanently, since
      // succession.ts's own header comment says chief replacement "is a later phase" -- not yet implemented.
      // Found by running `pnpm harness replay --golden` per CLAUDE.md rule 8 before reporting this file: a
      // golden seed's own natural war killed a chief at turn 95 and crashed the harness outright, not merely
      // diverged a hash. A chief can still be hit (see `hitHiding` below, unaffected -- hiding leaves the crew
      // structurally intact) and can still go into hiding as `ourMan` on our own side; only a chief's death is
      // excluded, and only until crew succession exists.
      when: [{ bound: { role: "victim", is: true } }], // chiefs can die now: succession replaces a dead chief the same turn (systems/succession.ts, 2026-09-25)
      effects: [
        { fact: "StatusChange", characterId: "$victim", status: "dead", cause: { rule: "war.week.hit" } },
        // "LoyaltyDelta across the victim's crew is not expressible per crew" (no per-crew Fact exists, design
        // 13 §3's own brief): applied to the victim's direct superior only.
        { fact: "LoyaltyDelta", characterId: "$victim.superior", delta: -20, cause: { rule: "war.week.hit" } },
      ],
      report: { newspaper: "A man of the district was found dead; the war between the two families goes on.", sign: "One of ours did not come home.", visibility: "known" },
    },
    {
      id: "hitHiding",
      weight: 1200,
      when: [{ bound: { role: "victim", is: true } }],
      effects: [
        { fact: "StatusChange", characterId: "$victim", status: "hiding", cause: { rule: "war.week.hit" } },
        { fact: "LoyaltyDelta", characterId: "$victim.superior", delta: -20, cause: { rule: "war.week.hit" } },
      ],
      report: { newspaper: "A man of the district has gone to ground after a close call.", sign: "One of ours is lying low after a close call.", visibility: "known" },
    },
    {
      id: "retreat",
      weight: 1500,
      when: [{ bound: { role: "ourMan", is: true } }],
      effects: [{ fact: "StatusChange", characterId: "$ourMan", status: "hiding", cause: { rule: "war.week.retreat" } }],
      report: { sign: "One of our own has gone to ground until this settles.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known", newspaper: "The war between the two families continues." },
  tags: ["war", "week"],
  codexId: "war",
};

// ===================================================================================================================
// 3. `war.meeting`: every four turns, the district offers peace. See this file's header comment (deviation 2)
// for why the AI branch does not route through `aiDefault`.
// ===================================================================================================================
const PLAYER_DECIDED: Predicate = { any: [{ playerControlled: { role: "ourHead", is: true } }, { bound: { role: "me", is: true } }] };
const NOT_PLAYER_DECIDED: Predicate = { not: PLAYER_DECIDED };
const HEAD_SUES_FOR_PEACE: Predicate = { has: { role: "ourHead", memoryTag: "suesForPeace" } };
const DECIDED_ACCEPT: Predicate = { decided: { optionId: "accept" } };
const DECIDED_REFUSE: Predicate = { decided: { optionId: "refuse" } };

// "StandingDelta +40/-80 with the district head family when bound" (the brief): `arbiter` is a character role
// (the district head's head himself, header comment), so the district head's FAMILY is `$arbiter.family`, not
// `$arbiter` (which would resolve to his own character id -- StandingDelta's two ends are both FamilyIds,
// reducers/relationships.ts). Drops silently (effects.ts's UnboundRoleError path) whenever `arbiter` -- or, for
// a character with no family somehow, `$arbiter.family` itself -- is unbound, per "when bound" in the brief.
const PEACE_EFFECTS: Effect[] = [
  { fact: "WarStateSet", familyId: "$family", enemyFamilyId: null, cause: { rule: "war.meeting.accept" } },
  { fact: "WarStateSet", familyId: "$enemy", enemyFamilyId: null, cause: { rule: "war.meeting.accept" } },
  { fact: "StandingDelta", familyA: "$family", familyB: "$arbiter.family", delta: 40, cause: { rule: "war.meeting.accept" } },
  { crisis: { flag: "war", ttl: 0, active: false } },
];
const REFUSE_EFFECTS: Effect[] = [
  { fact: "StandingDelta", familyA: "$family", familyB: "$arbiter.family", delta: -80, cause: { rule: "war.meeting.refuse" } },
];

const warMeetingOutcomes: Outcome[] = [
  {
    id: "acceptedByPlayer",
    when: [DECIDED_ACCEPT, PLAYER_DECIDED],
    effects: PEACE_EFFECTS,
    report: { newspaper: "Peace in the district.", sign: "You take the district head's offer: the war is over.", visibility: "known" },
  },
  {
    id: "refusedByPlayer",
    when: [DECIDED_REFUSE, PLAYER_DECIDED],
    effects: REFUSE_EFFECTS,
    report: { sign: "You turn down the peace; the war goes on.", visibility: "known" },
  },
  // The AI head's own memory forces peace once his family has sued for it (war.exhaustion below) -- guaranteed,
  // not a weighted draw, since a man who is suing for peace does not gamble on the meeting going his way.
  {
    id: "peaceForced",
    when: [NOT_PLAYER_DECIDED, HEAD_SUES_FOR_PEACE],
    effects: PEACE_EFFECTS,
    report: { newspaper: "Peace in the district.", visibility: "known" },
  },
  // Deviation 2 (header comment): no per-instance read of `Family.state` is possible, so this is a flat
  // probability-6000 accept for every other AI-decided meeting, per the brief's own authorized fallback.
  {
    id: "peaceOffered",
    weight: 6000,
    when: [NOT_PLAYER_DECIDED, { not: HEAD_SUES_FOR_PEACE }],
    effects: PEACE_EFFECTS,
    report: { newspaper: "Peace in the district.", visibility: "known" },
  },
  {
    id: "standoff",
    weight: 4000,
    when: [NOT_PLAYER_DECIDED, { not: HEAD_SUES_FOR_PEACE }],
    effects: REFUSE_EFFECTS,
    report: { newspaper: "The district's offer of peace was turned down; the war goes on.", visibility: "known" },
  },
];

const warMeeting: ProcessTemplate = {
  id: "war.meeting",
  version: 1,
  kind: "dispute",
  scope: "family",
  lane: "families",
  spawn: { weight: 10_000, per: "family", cooldownTurns: 4 },
  roles: {
    family: { entity: "family", pick: "first" },
    enemy: { entity: "family", from: { role: "family", relation: "warWithOf" }, pick: "first", optional: true },
    // Not `optional`: `headOf` (engine/roles.ts) unbinds only when `Family.headId` is null, a family between
    // heads (succession is a later phase, per systems/succession.ts's own header comment) -- true of no family
    // in the starter world or any world this game currently generates, so a missing head here would rather
    // skip the whole meeting (bindRoles returns null for a required role with no candidate) than run one with
    // no one to answer for the family, which `optional` would silently allow.
    ourHead: { entity: "character", from: { role: "family", relation: "headOf" }, pick: "first" },
    // The player, when he himself is this family's head or underboss (the brief). `family`'s own `inFamily`
    // relation keeps the candidate scan to this one family, same pattern as `victim`/`ourMan` above.
    me: {
      entity: "character",
      from: { role: "family", relation: "inFamily" },
      where: [{ playerControlled: { role: "$candidate", is: true } }, { rank: { role: "$candidate", in: ["head", "underboss"] } }],
      pick: "first",
      optional: true,
    },
    // "The district head's head" (the brief): a two-hop chain, `districtHeadOf` (family -> its district's head
    // family) then `headOf` (that family -> its head character) -- the same intermediate-role pattern
    // disputes.ts's `dispute.claim` uses for `poacherChief` (poacher -> `poacherCrew` -> `poacherChief`, that
    // file's own header comment). Both optional (header comment, deviation 3): unbound whenever the family has
    // no district, the district has no head assigned, or that head family is itself between heads.
    districtHeadFamily: { entity: "family", from: { role: "family", relation: "districtHeadOf" }, pick: "first", optional: true },
    arbiter: { entity: "character", from: { role: "districtHeadFamily", relation: "headOf" }, pick: "first", optional: true },
  },
  // `cooldownTurns: 4` alone only paces spawn #2 onward (it compares against the template's OWN last spawn on
  // this family, engine/scheduler.ts's `onCooldown`; a first-ever spawn has no such prior spawn to compare
  // against and fires the very next turn the family is at war). The "every four turns" cadence the brief and
  // design 13 §1's table both call for ("a meeting offered by the district head every four weeks") needs the
  // FIRST meeting delayed too: found the hard way, by this file's own story test putting a war's first meeting
  // (and 60 percent chance of an immediate accept) two turns after declaration instead of the intended six.
  // `recent` reads `WarStateSet` off `world.history.recentFacts` (the fact both `war.declare` and a peace
  // both emit), so this also naturally re-arms for any later war between the same two families.
  preconditions: [AT_WAR, { not: { recent: { factKind: "WarStateSet", role: "family", withinTurns: 3 } } }],
  // `duration: 1`, not 0, for the same reason `dispute.claim`/`family.intimidation.choose` use it (those files'
  // own header comments): a duration-0 decision template resolves the instant it spawns, through
  // `resolveInstanceNow`, which never offers a decision at all -- only a later turn's "due firings" pass does.
  duration: 1,
  decision: {
    role: ["ourHead", "me", "arbiter"],
    prompt: "The district head offers to broker a peace. Do we take it?",
    options: [
      { id: "accept", label: "Accept peace", hint: "The war ends: both sides stand down, and the crisis lifts.", effects: [] },
      { id: "refuse", label: "Refuse", hint: "The war goes on, and the district holds it against us.", effects: [] },
    ],
    // Nominal only: the AI branch of `warMeetingOutcomes` above never reads `decided` (it cannot, since a
    // single `aiDefault` can't vary by family state -- header comment, deviation 2), so this value never
    // actually drives AI behaviour; kept as "accept" for a sane default on any code path this file did not
    // anticipate.
    aiDefault: "accept",
    timeoutTurns: 2,
    timeoutOption: "refuse",
  },
  resolve: warMeetingOutcomes,
  followUps: [],
  report: { visibility: "known", sponsor: "The district head offers to broker a peace. Do we take it?" },
  tags: ["war", "meeting", "decision"],
  codexId: "war",
};

// ===================================================================================================================
// 4. `war.exhaustion`: the moment a family at war goes `weakened` (design 12), its head starts suing for peace --
// a memory tag `war.meeting`'s own resolve[] reads (HEAD_SUES_FOR_PEACE above), since `Family.state` itself is
// not a field any predicate here can read (header comment, deviation 2).
// ===================================================================================================================
const warExhaustion: ProcessTemplate = {
  id: "war.exhaustion",
  version: 1,
  kind: "event",
  scope: "family",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "family",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "FamilyStateSet", role: "family", field: FAMILY_FIELD, match: { state: "weakened" } },
  },
  roles: {
    family: { entity: "family", pick: "first" },
    enemy: { entity: "family", from: { role: "family", relation: "warWithOf" }, pick: "first", optional: true },
    ourHead: { entity: "character", from: { role: "family", relation: "headOf" }, pick: "first" },
  },
  preconditions: [AT_WAR],
  duration: 0,
  resolve: [
    {
      id: "suesForPeace",
      effects: [{ fact: "MemoryAdd", characterId: "$ourHead", memory: { tag: "suesForPeace", weight: 100 }, cause: { rule: "war.exhaustion" } }],
      report: { sign: "Word is the head is ready to sue for peace.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sign: "Word is the head is ready to sue for peace." },
  tags: ["war", "exhaustion"],
  codexId: "war",
};

// ===================================================================================================================
// 5. `war.return`: a hiding man returns once his own family is no longer at war.
// ===================================================================================================================
const warReturn: ProcessTemplate = {
  id: "war.return",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 10_000, per: "character", cooldownTurns: 2 },
  roles: {
    character: { entity: "character", pick: "first" },
    family: { entity: "family", from: { role: "character", relation: "familyOf" }, pick: "first", optional: true },
    enemy: { entity: "family", from: { role: "family", relation: "warWithOf" }, pick: "first", optional: true },
  },
  preconditions: [{ status: { role: "character", is: "hiding" } }, { alive: { role: "character" } }, { bound: { role: "enemy", is: false } }],
  duration: 0,
  resolve: [
    {
      id: "returned",
      effects: [{ fact: "StatusChange", characterId: "$character", status: "free", cause: { rule: "war.return" } }],
      report: { sign: "One of ours, who had gone to ground, has come home.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sign: "One of ours, who had gone to ground, has come home." },
  tags: ["war", "return"],
  codexId: "war",
};

export const WAR_TEMPLATES: ProcessTemplate[] = [warDeclare, warWeek, warMeeting, warExhaustion, warReturn];
