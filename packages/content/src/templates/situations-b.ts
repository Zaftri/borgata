// Situations, part b (design 10 §2, §4, §5): the new owner and his report to the police, the witness who
// wants to talk, and your sponsor's arrest and his eventual return. Follows design 10's own conventions (its
// preamble, and the phase 6b conventions it points back to, design 09 §4): lane `families` unless noted,
// scope `town`, `spawn.per: "character"` bound to the player unless the row says otherwise, `duration: 0` (a
// player decision is offered in the same run it spawns -- civil.ts's file header and every associate template
// since explain why: a `duration: 0` instance resolves in the same scheduler call it spawns in, which is the
// only way a player-controlled decider sees it as `awaitingDecision` on the turn it appears), decision role
// `me`, a `hint` on every option and a report line on every state-changing outcome (content validation
// enforces both, packages/content/src/schema.ts's `referentialErrorsForTemplate`). Two other agents are adding
// situations-a.ts (the kid, the debtor, the feud) and situations-c.ts (the block feud's soldier-rank cousins)
// in parallel; this file does not import or reference either, and registers its own copies of any shared `fn`
// predicate rather than importing across template files (the established convention: associate-week.ts,
// associate-people.ts and soldier.ts all copy `relationships.memoryWithin` rather than share one module).
//
// Four gaps found while authoring this file, each resolved with the nearest expressible behaviour and
// reported here in full, per the same convention the three files above already established:
//
// 1. Design 10 §2's "wait" branch reads "refused 50%: RefusalStage shop 1 (if the fact exists; else
//    ComplianceDelta -100)" -- written against an earlier draft where `RefusalStage` (facts.ts) did not yet
//    exist. It exists now (owned by "towns", reducers/towns.ts), so "refused" emits `RefusalStage shop 1`
//    directly, alongside the compliance drop the same row also asks for ("compliance -60"); no fallback is
//    needed. The reducer already rejects (silently, per rule 7: every reducer rejects invalid facts with a
//    logged reason, never throwing) a stage that skips a rung or repeats the business's current stage, so a
//    shop already mid-dispute elsewhere simply keeps its own stage untouched by this card.
// 2. Design 10 §4's "scare" option ("Fear on his block +60") has no business bound anywhere on this card --
//    unlike `assoc.latePayer`/`assoc.shop.newOwner`, `assoc.witness.approach` is not about a shop, and
//    `FearDelta` (facts.ts) only ever targets a `businessId`. There is no fact or relation for "fear on a
//    block" in the abstract (the same shape of gap associate-week.ts's own header documents for its business-
//    owner lookups: no relation exposes a plain block or a witness's neighborhood as a target). Fabricating
//    an unrelated business as a stand-in would mislead the fear meter more than it would model the table's
//    intent, so "scare" drops the Fear effect and keeps only the evidence the row also names.
// 3. Design 10 §2's follow-up `assoc.shop.reported`'s "lieLow" option ("the late payer card does not fire for
//    it") is a real gap, not a slip: `assoc.latePayer` (associate-week.ts, a parallel task's file) spawns off
//    a bare `CollectionMissed` fact and reads no memory tag at all, so a `MemoryAdd me "lyingLow"` recorded
//    here has no mechanism anywhere that consults it. The tag is still written (this task's own instruction:
//    "use a memory tag only"), purely as a signal a later task could wire up; the four-turn suppression itself
//    does not actually happen yet.
// 4. `assoc.sponsor.arrested`/`assoc.sponsor.returns` bind `me` from the fact-bound `sponsor` role via
//    `subordinatesOf` (engine/roles.ts) -- the inverse of `soldier.detained.support`'s `superiorOf` lookup
//    (soldier.ts), since here the fact names the superior, not the subordinate. `subordinatesOf` can return
//    more than one character (any of the sponsor's soldiers or associates), so `me`'s selector filters
//    candidates with a `where: [{ playerControlled: ... }]` clause (`assoc.rival.poach`'s own idiom,
//    associate-people.ts) rather than relying on `pick: "first"` alone to land on the player.
//
// One naming note, not a gap: design 10's tables write "evidence ... testimony" for a formal statement against
// the player (§4's "station"/"talks" rows), but `EvidenceSource` (world.ts) has no "testimony" member --
// `"witness"` is the closest of its six values and every existing template already uses it for this exact
// shape of consequence (e.g. situations-a.ts's `assoc.kid.caught`'s "named" branch); this file follows suit.

import { registerPredicateFn } from "@borgata/sim";
import type { DecisionOption, Effect, Outcome, ProcessTemplate, RoleSelector } from "@borgata/sim";

// ---------------------------------------------------------------------------------------------------------------
// `fn` predicates (design 04 §1's escape hatch), registered here the way associate-week.ts/associate-people.ts/
// soldier.ts each register their own copy: a side effect of this module loading, which `templates/index.ts`
// always triggers in production; re-registering the same name twice across files is harmless (identical body).
// ---------------------------------------------------------------------------------------------------------------

/** `{ fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "sawSomething", within: 6 } } }`: has
 * the role gained a memory of this tag within the last `within` turns. Copy of associate-week.ts's own
 * registration (that file's header: "a copy of associate-people.ts's relationships.memoryWithin ... a test
 * that loads this file alone must still find the fn"), needed here for `assoc.witness.approach`'s own trigger
 * (design 10 §4: "when me has memory sawSomething ... within 6 turns"). */
registerPredicateFn("relationships.memoryWithin", (world, roles, args) => {
  const ref = roles[String(args["role"] ?? "me")];
  if (!ref || ref.kind !== "character") return false;
  const c = world.characters.byId[ref.id];
  if (!c) return false;
  const tag = String(args["tag"] ?? "");
  const within = Number(args["within"] ?? 8);
  return c.memory.some((m) => m.tag === tag && world.meta.turn - m.turn <= within);
});

// ---------------------------------------------------------------------------------------------------------------
// Shared role fragments.
// ---------------------------------------------------------------------------------------------------------------

const ME_ROLE: RoleSelector = { entity: "character", pick: "first" };
const PLAYER_FREE: ProcessTemplate["preconditions"][number] = { playerControlled: { role: "me", is: true } };

/** `me` plus the sponsor/crew/town chain (design 09 §4's own preamble, copied by every associate template
 * file so far): an associate's `crewId` stays null for the life of the rank (he is never a crew member
 * himself), so `town` (needed for HeatDelta/SentimentDelta) has to route through the sponsor's crew, not `me`
 * directly. All three are optional: an effect referencing an unbound optional role is skipped rather than
 * failing the whole outcome (engine/effects.ts). */
function sponsorChainRoles(meRole: string): Record<string, RoleSelector> {
  return {
    sponsor: { entity: "character", from: { role: meRole, relation: "superiorOf" }, pick: "first", optional: true },
    crew: { entity: "crew", from: { role: "sponsor", relation: "crewOf" }, pick: "first", optional: true },
    town: { entity: "town", from: { role: "crew", relation: "townOf" }, pick: "first", optional: true },
  };
}

/** `me`, bound from an already-prebound `sponsorRole` via the inverse relation (this file's header, gap 4):
 * the fact names the sponsor, so `me` has to be found FROM him, filtered down to the one subordinate who is
 * actually the player. Required (not optional): with no player-controlled subordinate, the card has no one to
 * decide it, so the spawn simply does not happen (design 04 §3 step 2) -- the same idiom `PLAYER_FREE` gives
 * every other card, expressed as a role filter instead of a separate precondition here since `me` itself does
 * not exist as a role until this selector resolves it. */
function meFromSponsor(sponsorRole: string): RoleSelector {
  return {
    entity: "character",
    from: { role: sponsorRole, relation: "subordinatesOf" },
    where: [{ playerControlled: { role: "$candidate", is: true } }],
    pick: "first",
  };
}

// =================================================================================================================
// 1. `assoc.shop.newOwner` (design 10 §2) and its follow-up `assoc.shop.reported`.
// =================================================================================================================

const shopNewOwner: ProcessTemplate = {
  id: "assoc.shop.newOwner",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 900, per: "character", maxActivePerScope: 1, cooldownTurns: 8 },
  roles: {
    me: ME_ROLE,
    ...sponsorChainRoles("me"),
    // Required: with no business on the sponsor's crew's blocks, there is no shop to hand a new owner, so the
    // spawn simply does not happen (design 04 §3 step 2) -- `assoc.civil.help`'s own idiom for its `shop` role.
    shop: { entity: "business", from: { role: "crew", relation: "businessesOf" }, pick: "random" },
  },
  preconditions: [PLAYER_FREE],
  duration: 0, // a player decision is offered in the same run it spawns (phase 6b)
  decision: {
    role: "me",
    prompt: "The bar on the corner changed hands. The new man does not know the arrangement.",
    options: [
      {
        id: "explain",
        label: "Spiegare con calma (explain it yourself, gently)",
        hint: "Usually he understands: compliance rises sharply. One time in four he takes it to the police instead, and that becomes a card next week.",
        effects: [],
      },
      {
        id: "sponsor",
        label: "Far parlare il tuo padrino (let your sponsor introduce himself)",
        hint: "Done properly, no risk to you: compliance rises further still. Costs you favor -- your sponsor reads it as you not handling your own corner.",
        effects: [],
      },
      {
        id: "wait",
        label: "Aspettare (wait and see)",
        hint: "Nothing now. Half the time he pays when the collector comes; half the time he refuses outright, and compliance falls hard.",
        effects: [],
      },
    ],
    aiDefault: "sponsor",
    timeoutTurns: 1,
    timeoutOption: "sponsor",
  },
  resolve: [
    {
      id: "understood",
      when: [{ decided: { optionId: "explain" } }],
      weight: 75,
      effects: [{ fact: "ComplianceDelta", businessId: "$shop", delta: 80, cause: { rule: "assoc.shop.newOwner.explain" } }],
      report: { newspaper: "A new owner takes over a business in the district; all is understood.", sign: "The new owner understood the arrangement.", visibility: "sign" },
    },
    {
      id: "reported",
      when: [{ decided: { optionId: "explain" } }],
      weight: 25,
      effects: [
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 15, source: "witness" }, cause: { rule: "assoc.shop.newOwner.reported" } },
        { schedule: { templateId: "assoc.shop.reported", delay: 0, /* same week's modal */ bind: { shop: "shop", me: "me", sponsor: "sponsor", crew: "crew", town: "town" } } },
      ],
      report: { newspaper: "A new business owner reported a threat to the police.", sign: "The new owner went to the police instead of hearing you out.", visibility: "sign" },
    },
    {
      id: "introduced",
      when: [{ decided: { optionId: "sponsor" } }],
      effects: [
        { fact: "ComplianceDelta", businessId: "$shop", delta: 120, cause: { rule: "assoc.shop.newOwner.sponsor" } },
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -10, cause: { rule: "assoc.shop.newOwner.sponsor" } },
      ],
      report: { newspaper: "A new owner takes over a business; the arrangement is settled.", sign: "Your sponsor introduced himself properly; the new owner understood at once.", visibility: "sign" },
    },
    { id: "paid", when: [{ decided: { optionId: "wait" } }], weight: 50, effects: [], report: { newspaper: "A new owner pays the local trade.", sign: "The new owner paid when the collector came around.", visibility: "sign" } },
    {
      id: "refused",
      when: [{ decided: { optionId: "wait" } }],
      weight: 50,
      // This file's header, gap 1: RefusalStage now exists, so no ComplianceDelta-only fallback is needed.
      effects: [
        { fact: "RefusalStage", businessId: "$shop", stage: 1, cause: { rule: "assoc.shop.newOwner.wait.refused" } },
        { fact: "ComplianceDelta", businessId: "$shop", delta: -60, cause: { rule: "assoc.shop.newOwner.wait.refused" } },
      ],
      report: { newspaper: "A new owner of a shop refuses to pay the local trade.", sign: "The new owner refused the collector outright.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sign: "The bar on the corner changed hands." },
  tags: ["associate", "shop", "decision"],
};

const shopReported: ProcessTemplate = {
  id: "assoc.shop.reported",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: {
    shop: { entity: "business", pick: "first" },
    me: { entity: "character", pick: "first" },
    sponsor: { entity: "character", pick: "first", optional: true },
    crew: { entity: "crew", pick: "first", optional: true },
    town: { entity: "town", pick: "first", optional: true },
  },
  preconditions: [],
  duration: 0,
  decision: {
    role: "me",
    prompt: "The new owner went to the station. A patrolman asked about you by name.",
    options: [
      {
        id: "lieLow",
        label: "Restare basso (lie low a month)",
        // This file's header, gap 3: the tag is written, but nothing reads it yet.
        hint: "No collections from that shop for a month, in principle -- heat on the town drops. Nothing in the ledger actually skips that shop yet; the family's word is all that is holding for now.",
        effects: [],
      },
      {
        id: "lean",
        label: "Fare pressione su di lui (lean on him)",
        hint: "Fear rises hard on the shop. One time in three he becomes a witness against you as well; one in ten the police pick you up on the spot.",
        effects: [],
      },
      {
        id: "tell",
        label: "Dirlo al padrino (tell your sponsor)",
        hint: "Costs you favor, but it is handled properly: compliance rises, and your sponsor carries the evidence instead of you.",
        effects: [],
      },
    ],
    aiDefault: "tell",
    timeoutTurns: 1,
    timeoutOption: "tell",
  },
  resolve: [
    {
      id: "quiet",
      when: [{ decided: { optionId: "lieLow" } }],
      effects: [
        { fact: "HeatDelta", townId: "$town", delta: -10, cause: { rule: "assoc.shop.reported.lieLow" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "lyingLow", weight: 10 }, cause: { rule: "assoc.shop.reported.lieLow" } },
      ],
      report: { sign: "You keep clear of that shop for a while.", visibility: "sign" },
    },
    {
      id: "scared",
      when: [{ decided: { optionId: "lean" } }],
      weight: 57,
      effects: [{ fact: "FearDelta", businessId: "$shop", delta: 100, cause: { rule: "assoc.shop.reported.lean" } }],
      report: { sign: "You leaned on him, and word of it spreads.", visibility: "sign" },
    },
    {
      id: "witness",
      when: [{ decided: { optionId: "lean" } }],
      weight: 33,
      effects: [
        { fact: "FearDelta", businessId: "$shop", delta: 100, cause: { rule: "assoc.shop.reported.lean" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 40, source: "witness" }, cause: { rule: "assoc.shop.reported.lean.witness" } },
      ],
      report: { newspaper: "A shopkeeper says he was threatened over his own protection money.", visibility: "known" },
    },
    {
      id: "arrested",
      when: [{ decided: { optionId: "lean" } }],
      weight: 10,
      effects: [
        { fact: "FearDelta", businessId: "$shop", delta: 100, cause: { rule: "assoc.shop.reported.lean" } },
        { fact: "StatusChange", characterId: "$me", status: "arrested", untilTurn: { $turnPlus: 3 }, cause: { rule: "assoc.shop.reported.lean.arrested" } },
        { fact: "RecordDelta", characterId: "$me", field: "arrests", delta: 1, cause: { rule: "assoc.shop.reported.lean.arrested" } },
      ],
      report: { newspaper: "A young man was taken in after a shopkeeper's complaint.", visibility: "known" },
    },
    {
      id: "handled",
      when: [{ decided: { optionId: "tell" } }],
      effects: [
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -15, cause: { rule: "assoc.shop.reported.tell" } },
        { fact: "ComplianceDelta", businessId: "$shop", delta: 150, cause: { rule: "assoc.shop.reported.tell" } },
        { fact: "EvidenceAdd", characterId: "$sponsor", item: { crimeRef: "$instance", weight: 10, source: "participation" }, cause: { rule: "assoc.shop.reported.tell" } },
      ],
      report: { sign: "Your sponsor handles it properly; the shop falls in line.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sign: "A patrolman has been asking about you by name." },
  tags: ["associate", "shop", "followup", "decision"],
};

// =================================================================================================================
// 2. `assoc.witness.approach` (design 10 §4, lane `state`) and its no-decision follow-up `assoc.witness.talks`.
// =================================================================================================================

const witnessApproach: ProcessTemplate = {
  id: "assoc.witness.approach",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  spawn: { weight: 10_000, per: "character", maxActivePerScope: 1, cooldownTurns: 12 },
  roles: { me: ME_ROLE, ...sponsorChainRoles("me") },
  // Design 10 §4: "when me has memory sawSomething ... within 6 turns" -- the only tag any content leaves
  // that fits ("a witnessed-style memory if the favor templates leave one"): `assoc.favor.door`'s
  // "somethingHappened" outcome (associate-week.ts) is the sole place any template adds this exact tag.
  preconditions: [PLAYER_FREE, { fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "sawSomething", within: 6 } } }],
  duration: 0, // a player decision is offered in the same run it spawns (phase 6b)
  decision: {
    role: "me",
    prompt: "A man who was there that night wants a word. He says he has not decided what he saw.",
    options: [
      {
        id: "pay",
        label: "Pagarlo (pay him)",
        hint: "30 kL now. Mostly he takes it and forgets you. One time in five he comes back in a couple of months wanting more.",
        effects: [],
      },
      {
        id: "scare",
        label: "Spaventarlo (scare him)",
        hint: "Evidence against you either way, from having been the one to scare him. One in five he goes straight to the station instead of staying quiet.",
        effects: [],
      },
      {
        id: "ignore",
        label: "Ignorarlo (ignore him)",
        hint: "Nothing spent now. One in four he testifies within a month regardless of what you do today.",
        effects: [],
      },
    ],
    aiDefault: "pay",
    timeoutTurns: 1,
    timeoutOption: "pay",
  },
  resolve: [
    {
      id: "forgot",
      when: [{ decided: { optionId: "pay" } }],
      weight: 80,
      effects: [
        { fact: "MoneyDestroy", from: "$me.account", amount: 30, money: "dirty", sink: "paidWitness", cause: { rule: "assoc.witness.approach.pay" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "paidWitness", weight: 20 }, cause: { rule: "assoc.witness.approach.pay" } },
      ],
      report: { sign: "He takes the money and forgets what he saw.", visibility: "sign" },
    },
    {
      id: "returns",
      when: [{ decided: { optionId: "pay" } }],
      weight: 20,
      effects: [
        { fact: "MoneyDestroy", from: "$me.account", amount: 30, money: "dirty", sink: "paidWitness", cause: { rule: "assoc.witness.approach.pay" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "paidWitness", weight: 20 }, cause: { rule: "assoc.witness.approach.pay" } },
        { schedule: { templateId: "assoc.witness.approach", delay: 8, bind: { me: "me" } } },
      ],
      report: { sign: "He takes the money, but you have not seen the last of him.", visibility: "sign" },
    },
    {
      id: "scared",
      when: [{ decided: { optionId: "scare" } }],
      weight: 80,
      // This file's header, gap 2: no business is bound on this card, so "fear on his block" is dropped.
      effects: [{ fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 15, source: "participation" }, cause: { rule: "assoc.witness.approach.scare" } }],
      report: { sign: "You put a scare into him.", visibility: "sign" },
    },
    {
      id: "station",
      when: [{ decided: { optionId: "scare" } }],
      weight: 20,
      effects: [
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 15, source: "participation" }, cause: { rule: "assoc.witness.approach.scare" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 40, source: "witness" }, cause: { rule: "assoc.witness.approach.scare.station" } },
      ],
      report: { newspaper: "A man has come forward with a statement about a job on the block.", visibility: "known" },
    },
    {
      id: "waited",
      when: [{ decided: { optionId: "ignore" } }],
      effects: [
        { schedule: { templateId: "assoc.witness.talks", delay: { min: 2, max: 4 }, probability: 2500, bind: { me: "me", sponsor: "sponsor", crew: "crew", town: "town" } } },
      ],
      report: { sign: "You let him be, for now.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sign: "A man who was there that night wants a word." },
  tags: ["associate", "witness", "state", "decision"],
};

/** `assoc.witness.talks` (design 10 §4, no decision): the quiet threat behind "ignore" landing anyway. */
const witnessTalks: ProcessTemplate = {
  id: "assoc.witness.talks",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  roles: {
    me: { entity: "character", pick: "first" },
    town: { entity: "town", pick: "first", optional: true },
  },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "talked",
      effects: [
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 40, source: "witness" }, cause: { rule: "assoc.witness.talks" } },
        { fact: "HeatDelta", townId: "$town", delta: 10, cause: { rule: "assoc.witness.talks" } },
      ],
      report: { newspaper: "Police are following a new lead in a case on the block.", sign: "A statement with your name in it is on a desk at the station.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sign: "A statement with your name in it is on a desk at the station." },
  tags: ["associate", "witness", "state", "followup"],
};

// =================================================================================================================
// 3. `assoc.sponsor.arrested` (design 10 §5, spawnFrom StatusChange arrested on the sponsor) and its follow-up
// `assoc.sponsor.returns` (spawnFrom StatusChange free on the same sponsor -- reducers/characters.ts emits
// this with cause rule "detention.ended" once `detainedUntilTurn` passes; `match` only ever filters on the
// fact's own fields, per `fieldsOf`/step.ts, so it reads `status`, not the cause rule).
// =================================================================================================================

const sponsorArrested: ProcessTemplate = {
  id: "assoc.sponsor.arrested",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "StatusChange", role: "sponsor", field: "characterId", match: { status: "arrested" } },
  },
  roles: {
    // `sponsor` first (soldier.ts's `soldier.detained.support` note, copied): `spawnFrom` prebinds `sponsor`,
    // not `me`, so `sponsor` must be the role `scopeRoleName` finds for `maxActivePerScope` to see it prebound.
    sponsor: { entity: "character", pick: "first" },
    me: meFromSponsor("sponsor"),
    crew: { entity: "crew", from: { role: "sponsor", relation: "crewOf" }, pick: "first", optional: true },
    town: { entity: "town", from: { role: "crew", relation: "townOf" }, pick: "first", optional: true },
  },
  preconditions: [PLAYER_FREE],
  duration: 0, // a player decision is offered in the same run it spawns (phase 6b)
  decision: {
    role: "me",
    prompt: "They took your sponsor last night. His stalls need collecting and his wife needs telling.",
    options: [
      {
        id: "collect",
        label: "Tenere le buste per lui (keep collecting for him)",
        hint: "Nothing today. Favor rises sharply once he's out and learns you held his envelopes honestly for him.",
        effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: "heldTheLine", weight: 40 }, cause: { rule: "assoc.sponsor.arrested.collect" } }],
      },
      {
        id: "skim",
        label: "Tenerti le buste (keep the envelopes)",
        hint: "40 kL for you right now. Two times in five he finds out once he's free, and it costs you dearly when he does.",
        effects: [
          { fact: "MoneyMint", to: "$me.account", amount: 40, money: "dirty", source: "sponsorAbsent", cause: { rule: "assoc.sponsor.arrested.skim" } },
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "skimmed", weight: 40 }, cause: { rule: "assoc.sponsor.arrested.skim" } },
        ],
      },
      {
        id: "wife",
        label: "Portare parola alla moglie (bring word to his wife and money for the lawyer)",
        hint: "20 kL out of your pocket. Favor rises today, and the crew thinks better of you for standing up.",
        effects: [
          { fact: "MoneyDestroy", from: "$me.account", amount: 20, money: "dirty", sink: "lawyer", cause: { rule: "assoc.sponsor.arrested.wife" } },
          { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 20, cause: { rule: "assoc.sponsor.arrested.wife" } },
          { fact: "SentimentDelta", townId: "$town", delta: 5, cause: { rule: "assoc.sponsor.arrested.wife" } },
        ],
      },
    ],
    aiDefault: "wife",
    timeoutTurns: 1,
    timeoutOption: "wife",
  },
  resolve: [
    { id: "held", when: [{ decided: { optionId: "collect" } }], effects: [], report: { newspaper: "A well-known man of the quarter was taken in for questioning.", sign: "You hold your sponsor's envelopes honestly, waiting for him to come home.", visibility: "sign" } },
    { id: "skimmedNow", when: [{ decided: { optionId: "skim" } }], effects: [], report: { newspaper: "A well-known man of the quarter was taken in for questioning.", sign: "You keep the envelopes for yourself while he's away.", visibility: "sign" } },
    { id: "carried", when: [{ decided: { optionId: "wife" } }], effects: [], report: { newspaper: "A well-known man of the quarter was taken in for questioning.", sign: "You bring word to his wife, and money enough for the lawyer.", visibility: "sign" } },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "They took your sponsor last night. His stalls need collecting and his wife needs telling." },
  tags: ["associate", "sponsor", "arrested", "decision"],
};

const sponsorReturns: ProcessTemplate = {
  id: "assoc.sponsor.returns",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "StatusChange", role: "sponsor", field: "characterId", match: { status: "free" } },
  },
  roles: {
    sponsor: { entity: "character", pick: "first" },
    me: meFromSponsor("sponsor"),
  },
  preconditions: [PLAYER_FREE],
  duration: 0,
  // No decision (design 10 §5's follow-up table has none): the outcome is read off `me`'s own memory tags
  // from the earlier `assoc.sponsor.arrested` decision, not a fresh choice.
  resolve: [
    {
      id: "grateful",
      when: [{ has: { role: "me", memoryTag: "heldTheLine" } }],
      effects: [{ fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 30, cause: { rule: "assoc.sponsor.returns.grateful" } }],
      report: { newspaper: "A man known to the police was released after questioning.", sign: "Your sponsor is home, and grateful you held the line for him.", visibility: "sign" },
    },
    {
      id: "caught",
      when: [{ has: { role: "me", memoryTag: "skimmed" } }],
      weight: 4000, // 40 percent (design 10 §5), the two "skimmed" outcomes drawn against each other
      effects: [
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -60, cause: { rule: "assoc.sponsor.returns.caught" } },
        { fact: "MemoryAdd", characterId: "$sponsor", memory: { tag: "skimmedMe", aboutId: "$me", weight: 60 }, cause: { rule: "assoc.sponsor.returns.caught" } },
      ],
      report: { newspaper: "A man known to the police was released after questioning.", sign: "Your sponsor finds out you skimmed his envelopes while he was inside.", visibility: "sign" },
    },
    {
      id: "unnoticedSkim",
      when: [{ has: { role: "me", memoryTag: "skimmed" } }],
      weight: 6000, // the remaining 60 percent
      effects: [],
      report: { sign: "Your sponsor never learns you skimmed while he was away.", visibility: "sign" },
    },
    {
      id: "unnoticed",
      when: [{ not: { any: [{ has: { role: "me", memoryTag: "heldTheLine" } }, { has: { role: "me", memoryTag: "skimmed" } }] } }],
      effects: [],
      report: { sign: "Your sponsor is home. Nothing more comes of it.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Your sponsor is home." },
  tags: ["associate", "sponsor", "followup"],
};

export const SITUATIONS_B_TEMPLATES: ProcessTemplate[] = [shopNewOwner, shopReported, witnessApproach, witnessTalks, sponsorArrested, sponsorReturns];

// Re-exported only so the file typechecks even if a narrow future test helper reads an option's `hint`/`effects`
// or an outcome's shape directly; not otherwise used here (associate-people.ts's own file-final comment).
export type { DecisionOption, Effect, Outcome };
