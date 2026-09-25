// The associate's week, part 1 (design 09 §4 rows 1 to 6): the late payer, the card game (stake and raid),
// and the sponsor's three favors (drive, note, door). Templates 7 to 13 (rival, shopkeeper, patrol, sponsor's
// short week, feast, warning, dropped, the proposal) are a parallel task's file, packages/content/src/templates/
// associate-people.ts; nothing here schedules or references those ids.
//
// Every template below shares the conventions design 09 §4's preamble states for the associate's week: lane
// `families` (the two lane-`state` rows -- the raid -- are marked), scope `town`, spawn `per: "character"` with
// `maxActivePerScope: 1`, and a decision role `me` gated by `{ playerControlled: { role: "me", is: true } }` so
// only the player ever gets asked (an AI-controlled associate, if one existed, would simply never satisfy the
// precondition and never spawn one of these). A decision template needs `duration: 1`, not the `duration: 0` a
// literal reading might suggest: civil.ts's file header explains why (a duration-0 template resolves in the same
// scheduler call it spawns in, via `resolveInstanceNow`, which never reaches the "due firings" pass that offers
// a decision to a player-controlled decider -- `family.intimidation.choose` established this pattern first).
// `assoc.game.raid` has no decision at all (design 09 §4: "none (event)") and uses `duration: 0` like the state
// raid templates it borrows its shape from (packages/content/src/templates/state.ts).
//
// Six deviations from a literal reading of the design doc, forced by engine surface this task does not own
// (packages/sim/src/engine/{roles,predicates,effects}.ts) or by the six-template scope itself:
//
// 1. Sponsor-personality-conditioned spawn weights (design 09 §4: "900 (patient) / 1800 (hothead) / 600
//    (schemer) / 900 (gambler)" for `assoc.favor.drive`, similarly for `.note` and `.door`) cannot be expressed:
//    `SpawnRule.weight` is one static integer per template, and engine/scheduler.ts's spawn pass draws from
//    "events.spawn" BEFORE any role (including the sponsor) is bound, by design (2026-09-23 phase 5 perf note
//    in that file) -- there is no hook to vary the draw's probability by a bound role's trait. Splitting each
//    favor into four per-personality templates would multiply this task's "six templates" past its scope and
//    duplicate every outcome four times over, so each favor template uses its lowest listed (non-hothead,
//    non-gambler, non-schemer) weight as a single representative value instead.
// 2. The design's per-outcome weight *bonuses* ("+10 per band above 0" on `assoc.favor.drive`'s "stopped",
//    "+15 if family band >= 2" on `assoc.favor.note`'s "intercepted", the war-flag/dispute/bonesRequired
//    bonuses on `assoc.favor.drive`'s "killing") have the same problem one level down: `Outcome.weight` is a
//    fixed integer in the schema (design 04 §1's Outcome, `weight?: number`), not a formula over bound roles.
//    Every outcome below uses the table's base percentage only. `family.policy.bonesRequired` compounds this:
//    it is a plain boolean on `Family.policy`, and no predicate in the DSL reads an arbitrary boolean field
//    (`cmp` only reads *numeric* paths via `pathValue`/`numericPath`, which reject a boolean; `has` only knows
//    trait/tool/memoryTag) -- so even a `when`-gated pair of outcomes (a base branch and a bones-bonus branch,
//    the pattern state.ts's raidOutcomes uses for its own mutually-exclusive split) is not reachable here.
// 3. Continuous ranges in Facts ("MoneyMint +30..+80", "+20..+50") have no literal in the engine: `RefValue`'s
//    only numeric-scaling form is `$expr`, which scales an *already-bound role's* numeric path (engine/
//    effects.ts `resolveExpr`) -- there is nothing analogous to `FollowUp.delay`'s `{min,max}` range for a
//    Fact's own numeric fields. Every such range below is approximated by one fixed integer near its middle.
// 4. 2026-09-25 design change (superseding this item's original text): the flip roll no longer happens at the
//    moment of arrest anywhere in this file. `assoc.game.raid`'s "cooperates"/"silent" pair (the only one of
//    this file's three arrest-producing outcomes that ever rolled `state.flipRoll` here -- `assoc.favor.drive`'s
//    "stopped" and `assoc.favor.door`'s "policeArrive*" were already single arrest outcomes with no flip split)
//    is now a single "arrest" outcome, matching state.ts's own raid/patrol templates. The flip itself moved to
//    `state.detained.interrogation` (packages/content/src/templates/state.ts), which spawns off any `StatusChange
//    … arrested` fact -- including the one `assoc.game.raid`'s (and `assoc.favor.drive`'s, `assoc.favor.door`'s)
//    single arrest outcome still produces -- and resolves two turns later, in the second week of detention
//    (design 12 §1: a supported family's man resists better). Known gap, not fixed here (out of this task's file
//    ownership, which covers only the arrest outcomes' effects, not their `untilTurn`): `assoc.game.raid` detains
//    for only 3 turns (`untilTurn: { $turnPlus: 3 }`, GAME_RAID_COMMON_EFFECTS below) while the interrogation
//    needs 3 turns to land while the suspect is still held (one turn for `spawnFrom` to pick up the arrest, two
//    more for `duration: 2`) -- so a card-game arrest is, in practice, released one turn before the
//    interrogation would ever resolve, and never rolls the flip at all. `assoc.favor.drive`'s and `assoc.favor.
//    door`'s arrests both use `untilTurn: { $turnPlus: 4 }` and are not affected.
// 5. `assoc.latePayer`'s "tellSponsor" branch describes a "third time within 12 turns" trigger for a follow-up
//    template `assoc.sponsor.reassign` -- a template named nowhere else in design 09 (the §9 tally of "12
//    associate templates" does not include it, and it is not one of this task's six rows or the parallel
//    associate-people.ts task's seven). Scheduling a template id that does not exist is not a hard failure
//    (engine/scheduler.ts logs `role-bind-failed`/`precondition-failed` and moves on), but it would still be
//    dead content, so this file does not schedule it; "tellSponsor" applies its favor and record costs and
//    leaves it there.
// 6. `assoc.game.raid`'s precondition "last stake was not skip" (design 09 §4) cannot be read back from a
//    resolved instance: the only predicate that inspects history, `recent`, matches by fact kind and a bound
//    role's id (engine/predicates.ts), never by which outcome id an earlier instance resolved to. The
//    precondition here is `runsGame` plus town heat only, so a raid can in principle land on a week the player
//    moved or skipped the game; a harder-to-reach edge case, not a broken one.
//
// The shopkeeper's own trait check ("if shop has trait reporter", design 09 §4) no longer has this file's own
// gap: docs/event-storming-2026-09-25.md §3 hotspot 1 added `Business.ownerId`, the `ownerOf` role relation
// (roles.ts) and a generated civilian owner (with the reporter/proud/latePayer/none trait draw) for every shop
// on the player's sponsor's crew's blocks. `assoc.latePayer` below binds that owner as an optional role `keeper`
// and gates its reporter bonus and its sendKid botched-memory branch on whether `keeper` is bound and, for the
// reporter case, carries the trait -- see that template for both.

import type { DecisionOption, Effect, Outcome, Predicate, ProcessTemplate, RoleSelector } from "@borgata/sim";
import { registerPredicateFn } from "@borgata/sim";

/** Copy of associate-people.ts's `relationships.memoryWithin` (template files do not import each other; a test
 * that loads this file alone must still find the fn). */
registerPredicateFn("relationships.memoryWithin", (world, roles, args) => {
  const ref = roles[String(args["role"] ?? "me")];
  if (!ref || ref.kind !== "character") return false;
  const c = world.characters.byId[ref.id];
  if (!c) return false;
  const tag = String(args["tag"] ?? "");
  const within = Number(args["within"] ?? 1);
  return c.memory.some((m) => m.tag === tag && world.meta.turn - m.turn <= within);
});

/** `me` plus the sponsor/crew/town chain a few templates need (design 09 §4's "the sponsor is `me`'s
 * onRecordWith"). There is no `sponsorOf` relation (engine/roles.ts); `superiorOf` reaches the same character
 * because generation sets `superiorId` to the sponsor for every associate (packages/sim/src/starter.ts,
 * generation/player.ts both do this alongside `onRecordWith`). `crew`/`town` chain off the sponsor rather than
 * `me` directly because an associate (unlike a soldier) is never a crew member -- `me.crewId` stays null for
 * the life of the rank -- so `townOf`/`heat` on `me` itself would never resolve. All three are optional: the
 * templates that need `town` (for `heat`) already fail their own precondition if it stays unbound, and the
 * ones that only reference `$sponsor` in an effect simply skip that effect if it is ever unbound (design 04
 * §1, engine/effects.ts's UnboundRoleError path) rather than dropping the whole outcome.
 */
function sponsorChainRoles(meRole: string): Record<string, RoleSelector> {
  return {
    sponsor: { entity: "character", from: { role: meRole, relation: "superiorOf" }, pick: "first", optional: true },
    crew: { entity: "crew", from: { role: "sponsor", relation: "crewOf" }, pick: "first", optional: true },
    town: { entity: "town", from: { role: "crew", relation: "townOf" }, pick: "first", optional: true },
  };
}

/** Every favor template's cooldown (design 09 §4: "not within 6 turns of another favor"). `MemoryAdd` is not in
 * step.ts's `RECENT_FACT_EXCLUDED` list, so every favor's accept/decline effects add a `recentFavor` memory tag
 * purely so `recent` can see it later; `recent` matches by fact kind and role only, never by tag, so this also
 * (harmlessly, conservatively) cools down on any other memory the player happens to pick up in the meantime --
 * documented deviation (1)'s sibling: there is no predicate that reads a memory entry's own recency, only
 * `has.memoryTag`'s presence-forever check or `recent`'s kind-and-subject check, and combining the two exactly
 * is not expressible. */
const FAVOR_COOLDOWN_TURNS = 1; // design 09 said 6; at 6 a yes-man reached 3 jobs in 45 weeks (probe 2026-09-24)
function notRecentFavor(meRole: string) {
  return { not: { recent: { factKind: "MemoryAdd" as const, role: meRole, withinTurns: FAVOR_COOLDOWN_TURNS } } };
}
const RECENT_FAVOR_TAG: Effect = { fact: "MemoryAdd", characterId: "$me", memory: { tag: "recentFavor", weight: 1 }, cause: { rule: "assoc.favor.cooldown" } };

/** Shared decline effects for all three favor templates (design 09 §4: "decline: FavorDelta −40, RecordDelta
 * jobsRefused, MemoryAdd sponsor 'saidNo' aboutId me"). */
function favorDeclineEffects(rule: string): Effect[] {
  return [
    { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -15, cause: { rule } }, // -40 in design 09; at -40 a careful man was dropped by week 20, at -20 half were dropped by week 45 (2026-09-24)
    { fact: "RecordDelta", characterId: "$me", field: "jobsRefused", delta: 1, cause: { rule } },
    { fact: "RecordDelta", characterId: "$me", field: "streakRefused", delta: 1, cause: { rule } }, // refusals in a row (first-ranks §8 story 5)
    { fact: "MemoryAdd", characterId: "$sponsor", memory: { tag: "saidNo", aboutId: "$me", weight: 20 }, cause: { rule } },
    RECENT_FAVOR_TAG,
  ];
}

const declineOption = (rule: string): DecisionOption => ({
  id: "decline",
  label: "Say no",
  hint: "You stay clean. Your sponsor marks it: less favor, and three in a row earn a warning, five and he drops you.",
  effects: favorDeclineEffects(rule),
});

// The outcome id only needs to be unique within its own template's `resolve` list (design 06 §5's
// `duplicate outcome id` check is per template), so every favor template reuses this same literal.
const declinedCatchAll: Outcome = {
  id: "declined",
  when: [{ decided: { optionId: "decline" } }],
  effects: [],
  report: { sign: "You told your sponsor no.", visibility: "sign" },
};

// ---------------------------------------------------------------------------------------------------------------
// 1. `assoc.latePayer` (design 09 §4 row 1): a shop the player collects from missed its payment this week.
// Bound entirely from a `CollectionMissed` fact (design 09 §1, §7 item 4) rather than iterated: `shop` from
// `businessId`, `me` from `collectorId` -- the new `spawnFrom` engine extension this task also implements
// (engine/scheduler.ts spawn pass). `{ playerControlled: { role: "me", is: true } }` keeps this from also
// spawning for an AI collector's own missed weeks (the fact says nothing about who the collector reports to).
// ---------------------------------------------------------------------------------------------------------------

/** Design 09 §3: a missed collection breaks the streak and counts as a missed week regardless of what the
 * player does about it, so every option below shares this pair (only the response itself differs). */
// No RecordDelta here: systems/record.ts counts a paid or missed week from the associate's income, and a shop
// that pays after being leaned on makes the week a paid one (tuning 2026-09-24).
const LATE_PAYER_COMMON_EFFECTS: Effect[] = [];

/** Gates `assoc.latePayer`'s "leanedReporter" outcome (design 09 §4's "if shop has trait reporter" branch):
 * the shop's owner (`keeper`) must be bound at all (a business off the sponsor's crew's blocks has none, per
 * design 09 §5) and carry the `reporter` trait. */
const REPORTER_GATE: Predicate[] = [{ bound: { role: "keeper", is: true } }, { has: { role: "keeper", trait: "reporter" } }];

/** design 09 §4 "lean": FearDelta +60 shop, +20 neighbors, HeatDelta +8, EvidenceAdd me 4. The "if shop has
 * trait reporter" branch (extra EvidenceAdd 30 witness, 20 percent `state.patrol.stop` follow-up) is layered on
 * top of this shared base by the `latePayer` template's own "leaned"/"leanedReporter" outcome split below, now
 * that `keeper` (the shop's owner, bound via the `ownerOf` relation) exists to carry the trait. `neighbor`
 * (every other business in `shop`'s town) reuses civil.ts's `civil.refusal.spread` pattern but, unlike that
 * template, CAN exclude `shop` itself here: `each`'s `where` is evaluated against named roles (`shop`, freshly-
 * bound `neighbor`), where `sameEntity` works, unlike a role selector's `where`, which only ever sees
 * `$candidate` against roles bound before the selector runs. */
function leanEffects(scale: 1 | 0.5): Effect[] {
  const fear = scale === 1 ? 60 : 30;
  const neighborFear = scale === 1 ? 20 : 10;
  const heat = scale === 1 ? 8 : 4;
  const evidence = scale === 1 ? 4 : 2;
  return [
    // design 09 §2.1 "he probably pays": the week's tariff arrives late, minted like a chain collection.
    { fact: "MoneyMint", to: "$me.account", amount: scale === 1 ? 10 : 6, money: "dirty", source: "protection.late", cause: { rule: "assoc.latePayer.lean" } },
    { fact: "FearDelta", businessId: "$shop", delta: fear, cause: { rule: "assoc.latePayer.lean" } },
    { fact: "HeatDelta", townId: "$town", delta: heat, cause: { rule: "assoc.latePayer.lean" } },
    { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: evidence, source: "participation" }, cause: { rule: "assoc.latePayer.lean" } },
    {
      each: {
        from: "town",
        relation: "businessesOf",
        as: "neighbor",
        where: [{ sameEntity: { a: "neighbor", b: "shop", is: false } }],
        effects: [{ fact: "FearDelta", businessId: "$neighbor", delta: neighborFear, cause: { rule: "assoc.latePayer.lean.neighbor" } }],
      },
    },
  ];
}

/** design 09 §4 "sendKid": "same as lean at half strength; 15 percent botched (MemoryAdd shop 'laughed',
 * ComplianceDelta −40)". Now that `keeper` (the shop's owner) can be bound via `ownerOf`, the botched outcome
 * below is split in two: `sendKidBotchedKeeper` puts the "laughed" memory on the keeper himself (about `me`)
 * when he is bound; this fallback (`sendKidBotchedNoKeeper`, for the shops this generator addition does not
 * reach -- other towns' blocks, "lazy, later" per design 09 §5) keeps the original behaviour of putting the
 * embarrassment on the collector instead, since there is still no shopkeeper character to hang it on there. */
const sendKidBotchedNoKeeperEffects: Effect[] = [
  { fact: "ComplianceDelta", businessId: "$shop", delta: -40, cause: { rule: "assoc.latePayer.sendKid.botched" } },
  { fact: "MemoryAdd", characterId: "$me", memory: { tag: "kidLaughedAt", weight: 10 }, cause: { rule: "assoc.latePayer.sendKid.botched" } },
];
const sendKidBotchedKeeperEffects: Effect[] = [
  { fact: "ComplianceDelta", businessId: "$shop", delta: -40, cause: { rule: "assoc.latePayer.sendKid.botched" } },
  { fact: "MemoryAdd", characterId: "$keeper", memory: { tag: "laughed", aboutId: "$me", weight: 10 }, cause: { rule: "assoc.latePayer.sendKid.botched" } },
];

const latePayer: ProcessTemplate = {
  id: "assoc.latePayer",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "CollectionMissed", role: "shop", field: "businessId", role2: "me", field2: "collectorId", withinTurns: 1 },
  },
  roles: {
    shop: { entity: "business", pick: "first" },
    me: { entity: "character", pick: "first" },
    town: { entity: "town", from: { role: "shop", relation: "townOf" }, pick: "first" },
    sponsor: { entity: "character", from: { role: "me", relation: "superiorOf" }, pick: "first", optional: true },
    // The shop's owner (docs/event-storming-2026-09-25.md §3 hotspot 1): optional, since only shops on the
    // player's sponsor's crew's blocks are given one at generation (design 09 §5); other blocks' shops stay
    // ownerless for now, and "lean"/"sendKid" fall back to their pre-hotspot behaviour when unbound.
    keeper: { entity: "character", from: { role: "shop", relation: "ownerOf" }, pick: "first", optional: true },
  },
  preconditions: [{ playerControlled: { role: "me", is: true } }],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "A shop on your block missed its payment this week. What do you do?",
    options: [
      { id: "slide", label: "Let it slide", hint: "No money this week and no risk. The block hears he got away with it, and your envelope is short.", effects: [...LATE_PAYER_COMMON_EFFECTS] },
      {
        id: "lean",
        label: "Fare pressione (lean on him)",
        hint: "He pays, late. Fear rises on the block, the town gets a little hotter, and a line lands in your own dossier.",
        effects: [...LATE_PAYER_COMMON_EFFECTS],
      },
      {
        id: "tellSponsor",
        label: "Avvertire il padrino (tell your sponsor)",
        hint: "Handled properly, no risk to you, but it costs you favor: he expects you to hold your own stall.",
        effects: [
          ...LATE_PAYER_COMMON_EFFECTS,
          { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -15, cause: { rule: "assoc.latePayer.tellSponsor" } },
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "toldSponsor", weight: 10 }, cause: { rule: "assoc.latePayer.tellSponsor" } },
        ],
      },
      {
        id: "sendKid",
        label: "Mandare il ragazzo (send the kid)",
        hint: "Half the fear, none of the evidence on you. One time in seven he botches it and the shop laughs at you both.",
        effects: [...LATE_PAYER_COMMON_EFFECTS],
      },
    ],
    aiDefault: "slide",
    timeoutTurns: 1,
    timeoutOption: "slide",
  },
  resolve: [
    { id: "slid", when: [{ decided: { optionId: "slide" } }], effects: [], report: { sign: "You let the shop slide this week.", visibility: "sign" } },
    // "leaned"/"leanedReporter" are mutually exclusive by the keeper's binding and trait, not by chance: at
    // most one of the two `when` arrays ever holds for a given resolution, so the weighted draw (default
    // weight 1 on both) always has exactly one candidate.
    {
      id: "leaned",
      when: [{ decided: { optionId: "lean" } }, { not: { all: REPORTER_GATE } }],
      effects: leanEffects(1),
      report: { sign: "You leaned on the shop that came up short.", visibility: "sign" },
    },
    {
      id: "leanedReporter",
      when: [{ decided: { optionId: "lean" } }, ...REPORTER_GATE],
      effects: [
        ...leanEffects(1),
        // design 09 §4: "if shop has trait reporter: extra EvidenceAdd 30 witness, 20 percent state.patrol.stop follow-up".
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 30, source: "witness" }, cause: { rule: "assoc.latePayer.lean.reporter" } },
        { schedule: { templateId: "state.patrol.stop", delay: 1, probability: 2000, bind: { me: "me", sponsor: "sponsor" } } },
      ],
      report: { sign: "You leaned on the shop that came up short; this one has reported men before.", visibility: "sign" },
    },
    {
      id: "toldSponsor",
      when: [{ decided: { optionId: "tellSponsor" } }],
      effects: [],
      report: { sign: "You told your sponsor about the shop that came up short.", visibility: "sign" },
    },
    {
      id: "sendKidOk",
      when: [{ decided: { optionId: "sendKid" } }],
      weight: 85,
      effects: leanEffects(0.5),
      report: { sign: "You sent the kid to lean on the shop.", visibility: "sign" },
    },
    // Split the same way as "leaned"/"leanedReporter" above: mutually exclusive on `keeper`'s binding, not on
    // an independent draw, so the shared weight 15 (against "sendKidOk"'s 85) is unaffected either way.
    {
      id: "sendKidBotchedKeeper",
      when: [{ decided: { optionId: "sendKid" } }, { bound: { role: "keeper", is: true } }],
      weight: 15,
      effects: sendKidBotchedKeeperEffects,
      report: { sign: "The kid botched it; the shopkeeper laughed him off.", visibility: "sign" },
    },
    {
      id: "sendKidBotchedNoKeeper",
      when: [{ decided: { optionId: "sendKid" } }, { bound: { role: "keeper", is: false } }],
      weight: 15,
      effects: sendKidBotchedNoKeeperEffects,
      report: { sign: "The kid botched it; the shop laughed him off.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "A shop on your block missed its payment this week. What do you do?" },
  tags: ["associate", "latePayer", "decision"],
  codexId: "associate-week",
};

// ---------------------------------------------------------------------------------------------------------------
// Stake retuned 2026-09-24 (story 6): with 6 to 18 shops per block a normal week collects about 55 kL, so the bad
// week must cost more than that to be a swing. EV stays modest: 0.55*70 - 0.35*90 + 0.10*200 = +27 a week.
// 2. `assoc.game.stake` (design 09 §4 row 2): the weekly card game needs a stake covered, while `me` runs one
// (memory tag `runsGame`, generation gives every player character this per design 09 §5).
// ---------------------------------------------------------------------------------------------------------------

const gameStake: ProcessTemplate = {
  id: "assoc.game.stake",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 10_000, per: "character", maxActivePerScope: 1 },
  roles: { me: { entity: "character", pick: "first" }, ...sponsorChainRoles("me") },
  preconditions: [{ playerControlled: { role: "me", is: true } }, { has: { role: "me", memoryTag: "runsGame" } }],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "The weekly card game needs a stake covered. How do you cover it?",
    options: [
      { id: "bankSelf", label: "Fare il banco (bank it yourself)", hint: "You put up 90 kL. Most weeks you win 70, one in three you lose the 90, one in ten it is a big night: 200.", effects: [] },
      { id: "borrow", label: "Chiedere il capitale (borrow the stake)", hint: "He covers the bank. A good week pays you 35, a bad one costs you no money but favor, and you owe him.", effects: [] },
      {
        id: "skip",
        label: "Saltare (skip this week)",
        hint: "Nothing risked, nothing earned. Skip too often and the regulars find another table.",
        effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: "gameSkipped", weight: 5 }, cause: { rule: "assoc.game.stake.skip" } }],
      },
      {
        id: "move",
        label: "Spostare il tavolo (move the game)",
        hint: "No take this week. Heat on the table drops sharply; a raid takes the bank and arrests the man holding it, which is you.",
        effects: [{ fact: "HeatDelta", townId: "$town", delta: -30, cause: { rule: "assoc.game.stake.move" } }],
      },
    ],
    aiDefault: "borrow",
    timeoutTurns: 1,
    timeoutOption: "borrow",
  },
  resolve: [
    {
      id: "bankGood",
      when: [{ not: { fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "cutInDeal", within: 8 } } } }, { decided: { optionId: "bankSelf" } }],
      weight: 55,
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 70, money: "dirty", source: "cardGame", cause: { rule: "assoc.game.stake.bankGood" } },
        { fact: "HeatDelta", townId: "$town", delta: 3, cause: { rule: "assoc.game.stake.heat" } },
      ],
      report: { sign: "A good night at the table.", visibility: "sign" },
    },
    {
      id: "bankGoodCut",
      when: [{ fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "cutInDeal", within: 8 } } }, { decided: { optionId: "bankSelf" } }],
      weight: 55,
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 49, money: "dirty", source: "cardGame", cause: { rule: "assoc.game.stake.bankGood" } },
        { fact: "HeatDelta", townId: "$town", delta: 3, cause: { rule: "assoc.game.stake.heat" } },
      ],
      report: { sign: "A good night at the table.", visibility: "sign" },
    },
    {
      id: "bankBad",
      when: [{ decided: { optionId: "bankSelf" } }],
      weight: 35,
      effects: [
        { fact: "MoneyDestroy", from: "$me.account", amount: 90, money: "dirty", sink: "gamblers", cause: { rule: "assoc.game.stake.bankBad" } },
        { fact: "HeatDelta", townId: "$town", delta: 3, cause: { rule: "assoc.game.stake.heat" } },
      ],
      report: { sign: "A bad night at the table.", visibility: "sign" },
    },
    {
      id: "bankBigNight",
      when: [{ not: { fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "cutInDeal", within: 8 } } } }, { decided: { optionId: "bankSelf" } }],
      weight: 10,
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 200, money: "dirty", source: "cardGame", cause: { rule: "assoc.game.stake.bankBigNight" } },
        { fact: "HeatDelta", townId: "$town", delta: 3, cause: { rule: "assoc.game.stake.heat" } },
      ],
      report: { sign: "A very good night at the table.", visibility: "sign" },
    },
    {
      id: "bankBigNightCut",
      when: [{ fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "cutInDeal", within: 8 } } }, { decided: { optionId: "bankSelf" } }],
      weight: 10,
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 140, money: "dirty", source: "cardGame", cause: { rule: "assoc.game.stake.bankBigNight" } },
        { fact: "HeatDelta", townId: "$town", delta: 3, cause: { rule: "assoc.game.stake.heat" } },
      ],
      report: { sign: "A very good night at the table.", visibility: "sign" },
    },
    {
      id: "borrowGood",
      when: [{ not: { fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "cutInDeal", within: 8 } } } }, { decided: { optionId: "borrow" } }],
      weight: 70,
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 35, money: "dirty", source: "cardGame", cause: { rule: "assoc.game.stake.borrowGood" } },
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -3, cause: { rule: "assoc.game.stake.borrowGood" } },
        { fact: "HeatDelta", townId: "$town", delta: 3, cause: { rule: "assoc.game.stake.heat" } },
      ],
      report: { sign: "The stake paid off.", visibility: "sign" },
    },
    {
      id: "borrowGoodCut",
      when: [{ fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "cutInDeal", within: 8 } } }, { decided: { optionId: "borrow" } }],
      weight: 70,
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 25, money: "dirty", source: "cardGame", cause: { rule: "assoc.game.stake.borrowGood" } },
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -3, cause: { rule: "assoc.game.stake.borrowGood" } },
        { fact: "HeatDelta", townId: "$town", delta: 3, cause: { rule: "assoc.game.stake.heat" } },
      ],
      report: { sign: "The stake paid off.", visibility: "sign" },
    },
    {
      id: "borrowBad",
      when: [{ decided: { optionId: "borrow" } }],
      weight: 30,
      effects: [
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -10, cause: { rule: "assoc.game.stake.borrowBad" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "owesSponsor", weight: 30 }, cause: { rule: "assoc.game.stake.borrowBad" } },
        { fact: "HeatDelta", townId: "$town", delta: 3, cause: { rule: "assoc.game.stake.heat" } },
      ],
      report: { sign: "A bad week; you owe your sponsor for it.", visibility: "sign" },
    },
    { id: "skipped", when: [{ decided: { optionId: "skip" } }], effects: [], report: { sign: "No game this week.", visibility: "sign" } },
    { id: "moved", when: [{ decided: { optionId: "move" } }], effects: [], report: { sign: "You moved the game to another block.", visibility: "sign" } },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "The weekly card game needs a stake covered." },
  tags: ["associate", "game", "decision"],
  codexId: "associate-week",
};

// ---------------------------------------------------------------------------------------------------------------
// 3. `assoc.game.raid` (design 09 §4 row 3): lane `state`, no decision. Role stays named "suspect", not "me"
// (see this file's header, deviation 4, and its 2026-09-25 note): `state.detained.interrogation` (state.ts)
// spawns off the `StatusChange … arrested` fact this template's own single outcome still produces, binding its
// own "suspect" role independently -- this template's role name no longer has to match anything for the flip
// to work, but there is no reason to rename it either.
// ---------------------------------------------------------------------------------------------------------------

/** Shared by the (single) arrest outcome (design 09 §4: "StatusChange me arrested untilTurn +3, MoneyDestroy
 * bank (last stake), RecordDelta arrests +1, HeatDelta −80"). The stake amount raided is not tracked anywhere as state
 * (only as a one-off Fact from `assoc.game.stake`'s own resolution), so the destroyed amount here is a fixed
 * stand-in (documented deviation 3: no numeric-range/lookup literal for a Fact field). */
const GAME_RAID_COMMON_EFFECTS: Effect[] = [
  { fact: "StatusChange", characterId: "$suspect", status: "arrested", untilTurn: { $turnPlus: 4 }, cause: { rule: "assoc.game.raid.arrest" } }, // four, so the week-two interrogation lands while he is held (2026-09-25)
  { fact: "MoneyDestroy", from: "$suspect.account", amount: 80, money: "dirty", sink: "gameRaid", cause: { rule: "assoc.game.raid.arrest" } },
  { fact: "RecordDelta", characterId: "$suspect", field: "arrests", delta: 1, cause: { rule: "assoc.game.raid.arrest" } },
  { fact: "HeatDelta", townId: "$town", delta: -80, cause: { rule: "assoc.game.raid.discharge" } },
  { fact: "MemoryAdd", characterId: "$suspect", memory: { tag: "gameRaided", weight: 60 }, cause: { rule: "assoc.game.raid.arrest" } },
];

const gameRaid: ProcessTemplate = {
  id: "assoc.game.raid",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  spawn: { weight: 1500, per: "character", maxActivePerScope: 1 },
  roles: { suspect: { entity: "character", pick: "first" }, ...sponsorChainRoles("suspect"), family: { entity: "family", from: { role: "suspect", relation: "familyOf" }, pick: "first", optional: true } },
  preconditions: [
    { playerControlled: { role: "suspect", is: true } },
    { has: { role: "suspect", memoryTag: "runsGame" } },
    { heat: { role: "town", gte: 60 } },
  ],
  duration: 0,
  resolve: [
    {
      id: "arrest",
      effects: [...GAME_RAID_COMMON_EFFECTS, { fact: "MemoryAdd", characterId: "$suspect", memory: { tag: "arrested", weight: 40 }, cause: { rule: "assoc.game.raid.arrest" } }],
      report: { newspaper: "Police broke up a card game running out of the neighborhood; a man was taken in.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sign: "The police have their eye on the card game." },
  tags: ["associate", "game", "state", "raid"],
  codexId: "associate-week",
};

// ---------------------------------------------------------------------------------------------------------------
// 4, 5, 6. The sponsor's favors (design 09 §4 rows 4 to 6): drive, note, door. Each is `me`'s answer to a
// request from `$sponsor`; `decline` (shared, `favorDeclineEffects`/`declineOption` above) always costs favor
// and counts against the player, `accept`'s consequences vary by outcome (design 09 §4's per-favor pools).
// Death (design 09 §4's closing paragraph): "the killing and police arrive outcomes carry a 3 percent
// StatusChange dead branch" -- modeled as the 3-percent tail of `assoc.favor.drive`'s "killing" weight and
// `assoc.favor.door`'s "police arrive" weight (each split into a *Survive/*Dead pair at 97/3 of the table's own
// percentage, scaled by 100 so the split is exact integers within `pickWeighted`'s relative-weight pool,
// engine/scheduler.ts). The "always preceded by a sign... a follow-up that spawns the favor at higher risk one
// turn later" mechanism is not implemented: it names no template of its own among design 09's rows, and
// approximating it would mean inventing a seventh template outside this task's six.
// ---------------------------------------------------------------------------------------------------------------

/**
 * 4. `assoc.favor.drive` (design 09 §4 row 4).
 */
const favorDrive: ProcessTemplate = {
  id: "assoc.favor.drive",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 3500, per: "character", maxActivePerScope: 1, cooldownTurns: 2 }, // tuned from 900 (probe 2026-09-24); cooldown so a favor offered and decided across two turns does not respawn in the deciding turn (story 1, 2026-09-25)
  roles: { me: { entity: "character", pick: "first" }, ...sponsorChainRoles("me") },
  preconditions: [{ playerControlled: { role: "me", is: true } }, notRecentFavor("me")],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Your sponsor needs a driver. Are you in?",
    options: [
      {
        id: "accept",
        label: "Say yes",
        hint: "Usually a pickup: favor and a job on your record. Sometimes it is a killing, which makes your bones and marks you for life. About one drive in six ends stopped by a patrol or seen by a witness; being stopped means arrest.",
        effects: [RECENT_FAVOR_TAG],
      },
      declineOption("assoc.favor.drive.decline"),
    ],
    aiDefault: "decline",
    timeoutTurns: 1,
    timeoutOption: "decline",
  },
  resolve: [
    {
      id: "pickup",
      when: [{ decided: { optionId: "accept" } }],
      weight: 8000, // tuned from 6000: careers showed 25% bad favors against a 5-15% band (2026-09-24)
      effects: [
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 40, cause: { rule: "assoc.favor.drive.pickup" } },
        { fact: "RecordDelta", characterId: "$me", field: "jobsDone", delta: 1, cause: { rule: "assoc.favor.drive.pickup" } },
        { fact: "RecordDelta", characterId: "$me", field: "streakRefused", delta: 0, set: true, cause: { rule: "assoc.favor.accepted" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 5, source: "participation" }, cause: { rule: "assoc.favor.drive.pickup" } },
      ],
      report: { sign: "You drove for the family; it was a straight pickup.", visibility: "sign" },
    },
    {
      id: "killingSurvives",
      when: [{ decided: { optionId: "accept" } }],
      weight: 776, // 8% base * 97% survive (tuned from 15% base) // 15% base * 97% survive, scaled x100 (deviation 2 and the death note above)
      effects: [
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "murder", weight: 300 }, cause: { rule: "assoc.favor.drive.killing" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 120, source: "participation" }, cause: { rule: "assoc.favor.drive.killing" } },
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 80, cause: { rule: "assoc.favor.drive.killing" } },
        { fact: "RecordDelta", characterId: "$me", field: "jobsDone", delta: 1, cause: { rule: "assoc.favor.drive.killing" } },
        { fact: "RecordDelta", characterId: "$me", field: "streakRefused", delta: 0, set: true, cause: { rule: "assoc.favor.accepted" } },
      ],
      report: { newspaper: "A body was found on the provincial road.", sign: "You drove for the family; it was not a pickup.", visibility: "sign" },
    },
    {
      id: "killingDead",
      when: [{ decided: { optionId: "accept" } }],
      weight: 24, // 8% base * 3% // 15% base * 3% (design 09 §4's death note)
      effects: [
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "murder", weight: 300 }, cause: { rule: "assoc.favor.drive.killing" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 120, source: "participation" }, cause: { rule: "assoc.favor.drive.killing" } },
        { fact: "StatusChange", characterId: "$me", status: "dead", cause: { rule: "assoc.favor.drive.killing.dead" } },
      ],
      report: { newspaper: "A young man was found dead after a job went wrong.", visibility: "known" },
    },
    {
      id: "stopped",
      when: [{ decided: { optionId: "accept" } }],
      weight: 700, // tuned 2026-09-25
      effects: [
        { fact: "StatusChange", characterId: "$me", status: "arrested", untilTurn: { $turnPlus: 4 }, cause: { rule: "assoc.favor.drive.stopped" } },
        { fact: "RecordDelta", characterId: "$me", field: "arrests", delta: 1, cause: { rule: "assoc.favor.drive.stopped" } },
      ],
      report: { newspaper: "A car was stopped and a young man taken in.", visibility: "known" },
    },
    {
      id: "witnessed",
      when: [{ decided: { optionId: "accept" } }],
      weight: 500, // tuned 2026-09-25 (bad favors 19% against 5 to 15)
      effects: [{ fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 30, source: "witness" }, cause: { rule: "assoc.favor.drive.witnessed" } }],
      report: { sign: "Someone saw the car.", visibility: "sign" },
    },
    declinedCatchAll,
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Your sponsor needs a driver. Are you in?" },
  tags: ["associate", "favor", "drive", "decision"],
  codexId: "associate-week",
};

/**
 * 5. `assoc.favor.note` (design 09 §4 row 5).
 */
const favorNote: ProcessTemplate = {
  id: "assoc.favor.note",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 2500, per: "character", maxActivePerScope: 1, cooldownTurns: 2 }, // tuned from 700 (probe 2026-09-24); cooldown as on drive
  roles: { me: { entity: "character", pick: "first" }, ...sponsorChainRoles("me") },
  preconditions: [{ playerControlled: { role: "me", is: true } }, notRecentFavor("me")],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Your sponsor needs a note carried across town. Will you carry it?",
    options: [
      { id: "accept", label: "Say yes", hint: "The quiet favor: a smaller step up in favor. One note in ten is intercepted, and then it is a document against your sponsor with your name as courier.", effects: [RECENT_FAVOR_TAG] },
      declineOption("assoc.favor.note.decline"),
    ],
    aiDefault: "decline",
    timeoutTurns: 1,
    timeoutOption: "decline",
  },
  resolve: [
    {
      id: "delivered",
      when: [{ decided: { optionId: "accept" } }],
      weight: 9000, // tuned from 8500 (2026-09-24)
      effects: [
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 25, cause: { rule: "assoc.favor.note.delivered" } },
        { fact: "RecordDelta", characterId: "$me", field: "jobsDone", delta: 1, cause: { rule: "assoc.favor.note.delivered" } },
        { fact: "RecordDelta", characterId: "$me", field: "streakRefused", delta: 0, set: true, cause: { rule: "assoc.favor.accepted" } },
      ],
      report: { sign: "You carried the note without trouble.", visibility: "sign" },
    },
    {
      id: "intercepted",
      when: [{ decided: { optionId: "accept" } }],
      weight: 1000,
      effects: [
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 20, source: "document" }, cause: { rule: "assoc.favor.note.intercepted" } },
        { fact: "EvidenceAdd", characterId: "$sponsor", item: { crimeRef: "$instance", weight: 50, source: "document" }, cause: { rule: "assoc.favor.note.intercepted" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "knownCourier", weight: 40 }, cause: { rule: "assoc.favor.note.intercepted" } },
      ],
      report: { sign: "The note was read by eyes it was not meant for.", visibility: "sign" },
    },
    declinedCatchAll,
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Your sponsor needs a note carried across town." },
  tags: ["associate", "favor", "note", "decision"],
  codexId: "associate-week",
};

/**
 * 6. `assoc.favor.door` (design 09 §4 row 6).
 */
const favorDoor: ProcessTemplate = {
  id: "assoc.favor.door",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 2500, per: "character", maxActivePerScope: 1, cooldownTurns: 2 }, // tuned from 700 (probe 2026-09-24); cooldown as on drive
  roles: { me: { entity: "character", pick: "first" }, ...sponsorChainRoles("me") },
  preconditions: [{ playerControlled: { role: "me", is: true } }, notRecentFavor("me")],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Your sponsor needs a man at the door tonight. Will you stand it?",
    options: [
      {
        id: "accept",
        label: "Say yes",
        hint: "Favor and a job done. Most nights nothing happens. Some nights something does inside, and you carry the memory; one in twelve the police arrive and take you.",
        effects: [
          { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 30, cause: { rule: "assoc.favor.door.accept" } },
          { fact: "RecordDelta", characterId: "$me", field: "jobsDone", delta: 1, cause: { rule: "assoc.favor.door.accept" } },
          { fact: "RecordDelta", characterId: "$me", field: "streakRefused", delta: 0, set: true, cause: { rule: "assoc.favor.accepted" } },
          RECENT_FAVOR_TAG,
        ],
      },
      declineOption("assoc.favor.door.decline"),
    ],
    aiDefault: "decline",
    timeoutTurns: 1,
    timeoutOption: "decline",
  },
  resolve: [
    { id: "nothing", when: [{ decided: { optionId: "accept" } }], weight: 6300, effects: [], report: { sign: "A quiet night at the door.", visibility: "sign" } },
    {
      id: "somethingHappened",
      when: [{ decided: { optionId: "accept" } }],
      weight: 2500,
      effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: "sawSomething", weight: 120 }, cause: { rule: "assoc.favor.door.somethingHappened" } }],
      report: { sign: "Something happened behind that door.", visibility: "sign" },
    },
    {
      id: "policeArriveSurvives",
      when: [{ decided: { optionId: "accept" } }],
      weight: 776, // 8% base * 97% survive (tuned from 10% base) // 10% base * 97% survive, scaled x100
      effects: [
        { fact: "StatusChange", characterId: "$me", status: "arrested", untilTurn: { $turnPlus: 4 }, cause: { rule: "assoc.favor.door.policeArrive" } },
        { fact: "RecordDelta", characterId: "$me", field: "arrests", delta: 1, cause: { rule: "assoc.favor.door.policeArrive" } },
      ],
      report: { newspaper: "Police raided a door on a quiet street.", visibility: "known" },
    },
    {
      id: "policeArriveDead",
      when: [{ decided: { optionId: "accept" } }],
      weight: 24, // 8% base * 3% // 10% base * 3% (design 09 §4's death note)
      effects: [{ fact: "StatusChange", characterId: "$me", status: "dead", cause: { rule: "assoc.favor.door.policeArrive.dead" } }],
      report: { newspaper: "A man was killed when police raided a door on a quiet street.", visibility: "known" },
    },
    {
      id: "witnessed",
      when: [{ decided: { optionId: "accept" } }],
      weight: 400, // tuned 2026-09-25
      effects: [{ fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 30, source: "witness" }, cause: { rule: "assoc.favor.door.witnessed" } }],
      report: { sign: "Someone saw who was at the door.", visibility: "sign" },
    },
    declinedCatchAll,
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Your sponsor needs a man at the door tonight." },
  tags: ["associate", "favor", "door", "decision"],
  codexId: "associate-week",
};

export const ASSOCIATE_WEEK_TEMPLATES: ProcessTemplate[] = [latePayer, gameStake, gameRaid, favorDrive, favorNote, favorDoor];
