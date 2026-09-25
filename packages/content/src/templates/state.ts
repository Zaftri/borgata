// The state's lane-1 raid and patrol templates (design 04 §4 lane 1; design 03 §2, §3; brainstorm D4, user
// story 3), migrated off `packages/sim/src/systems/state-actions.ts` onto the event engine (docs/NOW.md phase 4
// task 1). `state-actions.ts` is reduced to the constants the harness still reads (`RAID_HEAT_THRESHOLD`,
// `PATROL_HEAT_THRESHOLD`, `flipOdds`); everything else below reproduces its behaviour as data, with three
// intentional, documented changes forced or invited by moving onto templates (golden hashes will diverge; see
// docs/NOW.md's report for this task, not this file, for that):
//
// 1. The random draws now come from the engine's own streams (`events.roles` for candidate binding via
//    `pick: "random"`, `events.spawn` for the per-town roll) rather than a single `state.raids` stream, plus
//    `state.flip` for the flip roll itself (unchanged name/formula). Same shape of randomness, different draw
//    order and stream names, so replays taken before this migration will not reproduce bit-for-bit.
// 2. A patrol arrest now discharges only -100 heat (not the raid's -150), per this task's brief; the old code
//    discharged -150 for every arrest regardless of patrol vs. raid. This is a deliberate retune, not a porting
//    slip: a patrol arrest is a smaller event than a raid and should cool the street off by less.
// 3. Design change (2026-09-25): the flip roll no longer happens at the moment of arrest. It moves to
//    `state.detained.interrogation` below, which spawns off the very same `StatusChange … arrested` fact every
//    arrest template in this file (and `assoc.game.raid`, associate-week.ts) produces, and resolves two turns
//    later -- the second week of detention -- so that supporting a jailed man's family (design 12) has a turn
//    to matter before the state leans on him. `state.flipRoll` (engine/predicates.ts) is unchanged: still a
//    `fn` predicate, the DSL's documented escape hatch (design 04 §1) for "the few cases the DSL cannot
//    express", still memoized per resolution (`flipRollMemo`) so its two `when` guards (`cooperates`, `silent`)
//    never disagree with themselves. It still reads `roles["suspect"]` by name, so the interrogation template
//    below binds its own subject under that same name.
//
// Every raid/patrol outcome that arrests someone -- `arrest`, never `empty` -- shares the same base effects
// (`heatDischarge` differs between the patrol and the four raid templates; the rest do not), matching the
// brief's "the arrest outcome emits StatusChange arrested ... HeatDelta ... AttentionDelta +10". The flip
// roll's own consequences (`COOPERATE_EFFECTS` below) now live only on `state.detained.interrogation`.

import type { Effect, Outcome, Predicate, ProcessTemplate, RoleSelector } from "@borgata/sim";

/** `town` is the spawn scope role (prebound by the scheduler's spawn pass, design 04 §3 step 1); the rest are
 * resolved from it. `suspect` mirrors the old `raidCandidates` (design 03 §3): a living, free soldier or
 * associate whose crew holds a block in the town -- exactly what the `inTown` relation gathers for a town
 * anchor (engine/roles.ts), filtered to rank. Optional throughout: a town can have no family, and a family with
 * no eligible man still fires the "empty" outcome (see `bound`, engine/types.ts extension 6). */
function raidRoles(): Record<string, RoleSelector> {
  return {
    town: { entity: "town", pick: "first" },
    suspect: {
      entity: "character",
      from: { role: "town", relation: "inTown" },
      where: [
        { rank: { role: "$candidate", in: ["soldier", "associate"] } },
        { status: { role: "$candidate", is: "free" } },
        { alive: { role: "$candidate" } },
      ],
      pick: "random",
      optional: true,
    },
    family: { entity: "family", from: { role: "town", relation: "familyOf" }, pick: "first", optional: true },
    // Only meaningful once a suspect is bound; unbound (no suspect, or a suspect with no crew) leaves the
    // "cooperates" outcome's `each` with nothing to iterate (engine/roles.ts eachCandidates on an unbound anchor).
    crew: { entity: "crew", from: { role: "suspect", relation: "crewOf" }, pick: "first", optional: true },
  };
}

/** Shared by `cooperates` and `silent` (design 03 §3: an arrest happens whether or not the man talks).
 * `heatDischarge` is the one difference between the patrol template and the four raid templates. */
function arrestEffects(heatDischarge: number): Effect[] {
  return [
    { fact: "StatusChange", characterId: "$suspect", status: "arrested", untilTurn: { $turnPlus: 4 }, cause: { rule: "state.raid.arrest" } },
    { fact: "HeatDelta", townId: "$town", delta: heatDischarge, cause: { rule: "state.raid.discharge" } },
    { fact: "AttentionDelta", familyId: "$family", delta: 10, cause: { rule: "state.arrest.noticed" } },
  ];
}

/** `cooperates`-only effects (design 03 §3 `flipRoll`'s cooperate branch): testimony against every other crew
 * member (the `each` extension, excluding the suspect himself via `sameEntity`) and the superior, the superior's
 * betrayal memory, and the family's Attention rise. `crimeRef: "$instance"` per civil.ts's documented convention
 * (no string interpolation in effect references; the instance id is already unique per firing). Used only by
 * `state.detained.interrogation` below (2026-09-25 design change: the flip no longer happens at arrest, so
 * these effects no longer live on the raid/patrol outcomes themselves). */
const COOPERATE_EFFECTS: Effect[] = [
  { fact: "CooperationSet", characterId: "$suspect", cause: { rule: "state.flip.cooperate" } },
  {
    each: {
      from: "crew",
      relation: "membersOf",
      as: "member",
      where: [{ sameEntity: { a: "member", b: "suspect", is: false } }],
      effects: [
        {
          fact: "EvidenceAdd",
          characterId: "$member",
          item: { crimeRef: "$instance", weight: 90, source: "collaborator" },
          cause: { rule: "state.flip.testimony" },
        },
        { fact: "LoyaltyDelta", characterId: "$member", delta: -60, cause: { rule: "state.flip.fear" } },
      ],
    },
  },
  {
    fact: "EvidenceAdd",
    characterId: "$suspect.superior",
    item: { crimeRef: "$instance", weight: 90, source: "collaborator" },
    cause: { rule: "state.flip.testimony" },
  },
  {
    fact: "MemoryAdd",
    characterId: "$suspect.superior",
    memory: { tag: "betrayedBy", aboutId: "$suspect", weight: 200 },
    cause: { rule: "state.flip.betrayed" },
  },
  { fact: "AttentionDelta", familyId: "$family", delta: 40, cause: { rule: "state.flip" } },
];

/** The two outcomes shared by every raid/patrol template (only `heatDischarge` differs). `empty`/`arrest` are
 * mutually exclusive by construction (`bound: { role: "suspect", ... }`): exactly one of the two `when` arrays
 * holds for any given resolution, so `resolveInstanceNow`'s filter-then-weighted-pick (engine/scheduler.ts)
 * never has more than one candidate to choose from. The flip roll (cooperate or stay silent) no longer happens
 * here (2026-09-25 design change, this file's header item 3): an arrest is just an arrest until
 * `state.detained.interrogation` (below) resolves, a turn or more later. */
function raidOutcomes(heatDischarge: number): Outcome[] {
  return [
    {
      id: "empty",
      when: [{ bound: { role: "suspect", is: false } }],
      effects: [{ fact: "HeatDelta", townId: "$town", delta: -100, cause: { rule: "state.raid.empty" } }],
      report: { newspaper: "Police swept the block but found no one to arrest.", sign: "The police swept the block and found no one to hold.", visibility: "sign" },
    },
    {
      id: "arrest",
      when: [{ bound: { role: "suspect", is: true } }],
      effects: [
        ...arrestEffects(heatDischarge),
        { fact: "MemoryAdd", characterId: "$suspect", memory: { tag: "arrested", weight: 40 }, cause: { rule: "state.arrest.memory" } },
      ],
      report: { newspaper: "Police arrested {suspect.name} on the block.", visibility: "known" },
    },
  ];
}

/**
 * 1. `state.patrol.arrest`: band-1 street arrests under an informant network, below raid heat (design 03 §2:
 * "the informant network turns routine visible activity into occasional street arrests").
 */
const patrolArrest: ProcessTemplate = {
  id: "state.patrol.arrest",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  spawn: { weight: 200, per: "town" },
  roles: raidRoles(),
  preconditions: [
    { heat: { role: "town", gte: 20 } }, // PATROL_HEAT_THRESHOLD: lowered from 40 on 2026-09-23 with per-town heat,
    { heat: { role: "town", lte: 299 } },
    { has: { role: "family", tool: "informants" } },
  ],
  duration: 0,
  exclusiveTag: "state.raid",
  resolve: raidOutcomes(-30),
  followUps: [],
  tags: ["state", "patrol", "arrest"],
  codexId: "state-response",
};

/** `state.raid.low`: heat 300..599, no squad (design 03 §2 RAID_PROB_LOW). */
const raidLow: ProcessTemplate = {
  id: "state.raid.low",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  spawn: { weight: 1500, per: "town" },
  roles: raidRoles(),
  preconditions: [
    { heat: { role: "town", gte: 300 } },
    { heat: { role: "town", lte: 599 } },
    { not: { has: { role: "family", tool: "squad" } } },
  ],
  duration: 0,
  exclusiveTag: "state.raid",
  resolve: raidOutcomes(-150),
  followUps: [],
  tags: ["state", "raid", "arrest"],
  codexId: "state-response",
};

/** `state.raid.lowSquad`: heat 300..599 with a squad (design 03 §2: the squad tool doubles the raid roll). */
const raidLowSquad: ProcessTemplate = {
  id: "state.raid.lowSquad",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  spawn: { weight: 3000, per: "town" },
  roles: raidRoles(),
  preconditions: [
    { heat: { role: "town", gte: 300 } },
    { heat: { role: "town", lte: 599 } },
    { has: { role: "family", tool: "squad" } },
  ],
  duration: 0,
  exclusiveTag: "state.raid",
  resolve: raidOutcomes(-150),
  followUps: [],
  tags: ["state", "raid", "arrest", "squad"],
  codexId: "state-response",
};

/** `state.raid.high`: heat >= 600, no squad (design 03 §2 RAID_PROB_HIGH). */
const raidHigh: ProcessTemplate = {
  id: "state.raid.high",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  spawn: { weight: 4000, per: "town" },
  roles: raidRoles(),
  preconditions: [{ heat: { role: "town", gte: 600 } }, { not: { has: { role: "family", tool: "squad" } } }],
  duration: 0,
  exclusiveTag: "state.raid",
  resolve: raidOutcomes(-150),
  followUps: [],
  tags: ["state", "raid", "arrest"],
  codexId: "state-response",
};

/** `state.raid.highSquad`: heat >= 600 with a squad. */
const raidHighSquad: ProcessTemplate = {
  id: "state.raid.highSquad",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  spawn: { weight: 8000, per: "town" },
  roles: raidRoles(),
  preconditions: [{ heat: { role: "town", gte: 600 } }, { has: { role: "family", tool: "squad" } }],
  duration: 0,
  exclusiveTag: "state.raid",
  resolve: raidOutcomes(-150),
  followUps: [],
  tags: ["state", "raid", "arrest", "squad"],
  codexId: "state-response",
};

/** The suspect must still be held and alive for the flip to make sense; used both as `preconditions` (spawn
 * time) and duplicated into each flip outcome's own `when` (resolve time, two turns later): `preconditions` is
 * only re-evaluated by the scheduler at spawn (and at a scheduled-entry or reaction fire), never when a due,
 * no-decision instance like this one resolves after its `duration` elapses (engine/scheduler.ts's due-firings
 * pass calls `resolveInstanceNow`, which filters outcomes by their own `when` only) -- so a suspect released or
 * killed in the meantime must be caught here too, or the engine's "no outcome matched" fallback (the full
 * `resolve` pool, unfiltered) would let `cooperates`/`silent` fire on him anyway. */
const SUSPECT_STILL_HELD: Predicate[] = [{ status: { role: "suspect", is: "arrested" } }, { alive: { role: "suspect" } }];

/**
 * `state.detained.interrogation` (design 12, 2026-09-25): the flip roll itself, moved off the arrest moment so
 * that a jailed man's supported (or abandoned) family has a turn to matter first (design 03 §3, design 12 §1
 * -- see the addendum in docs/design/03-metrics-and-economy.md §3). Spawns off any `StatusChange … arrested`
 * fact -- the state's own raid/patrol templates above, and `assoc.game.raid`/`assoc.favor.drive`/`assoc.favor.
 * door` in associate-week.ts, all produce that same fact shape -- and resolves two turns later, the second week
 * of detention. No decision: the state does the leaning, not the player. `state.flipRoll` requires the role
 * name "suspect" (engine/predicates.ts); `family`/`crew` are bound the same way `raidRoles()` binds them (off
 * the suspect rather than off a town anchor) so `COOPERATE_EFFECTS`'s `each` (crew testimony) and family
 * Attention rise resolve exactly as they did when they lived on the arrest outcome itself.
 */
const detainedInterrogation: ProcessTemplate = {
  id: "state.detained.interrogation",
  version: 1,
  kind: "event",
  scope: "town", // spawn.per is the binding contract, not scope (obligations.ts's own established convention)
  lane: "state",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "StatusChange", role: "suspect", field: "characterId", match: { status: "arrested" } },
  },
  roles: {
    suspect: { entity: "character", pick: "first" },
    family: { entity: "family", from: { role: "suspect", relation: "familyOf" }, pick: "first", optional: true },
    crew: { entity: "crew", from: { role: "suspect", relation: "crewOf" }, pick: "first", optional: true },
  },
  preconditions: SUSPECT_STILL_HELD,
  duration: 2,
  resolve: [
    {
      id: "cooperates",
      when: [...SUSPECT_STILL_HELD, { fn: { name: "state.flipRoll" } }],
      effects: [...COOPERATE_EFFECTS],
      report: {
        newspaper: "Word from the cells is that {suspect.name} is talking.",
        sign: "Word is that someone inside is talking.",
        visibility: "known",
      },
    },
    {
      id: "silent",
      when: [...SUSPECT_STILL_HELD, { not: { fn: { name: "state.flipRoll" } } }],
      effects: [
        { fact: "LoyaltyDelta", characterId: "$suspect", delta: 10, cause: { rule: "state.interrogation.heldUp" } },
        { fact: "MemoryAdd", characterId: "$suspect", memory: { tag: "heldUp", weight: 40 }, cause: { rule: "state.interrogation.heldUp" } },
      ],
      report: { newspaper: "{suspect.name} said nothing through his second week inside.", visibility: "known" },
    },
    {
      // Not a real narrative beat, just the fallback that keeps `cooperates`/`silent` from firing on a suspect
      // who was released or died before the interrogation came due (see `SUSPECT_STILL_HELD`'s own comment).
      id: "notHeld",
      when: [{ any: [{ not: { status: { role: "suspect", is: "arrested" } } }, { not: { alive: { role: "suspect" } } }] }],
      effects: [],
    },
  ],
  followUps: [],
  tags: ["state", "interrogation", "flip"],
  codexId: "state-response",
};

export const STATE_TEMPLATES: ProcessTemplate[] = [patrolArrest, raidLow, raidLowSquad, raidHigh, raidHighSquad, detainedInterrogation];
