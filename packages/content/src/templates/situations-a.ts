// Situations, wave A (design 10 §1 the kid's errand with its follow-up, §3 the debtor with its follow-ups,
// §6 the block feud): three new decision chains for the associate. Conventions per design 10's own preamble
// and design 09 §4/§12 (this file's sibling tasks, associate-week.ts and associate-people.ts, already
// establish the pattern in code): lane `families`, scope `town`, `spawn.per: "character"` with
// `maxActivePerScope: 1`, decision role `me` gated by `{ playerControlled: { role: "me", is: true } }`,
// `duration: 0` (design 09 §12's "Cadence" note: a duration-0 decision template is offered in the SAME
// scheduler run it spawns in -- both for the ordinary spawn pass and for a `schedule` effect's fire, since
// both paths call the same `trySpawnTemplate`, engine/scheduler.ts line ~479 -- not the `duration: 1` civil.ts's
// own, earlier header describes; every current decision template in associate-week.ts/associate-people.ts
// already uses `duration: 0`, and this file follows that, the up-to-date convention). Every option carries a
// `hint` and every state-changing `resolve` outcome carries a `report` (content validation enforces both,
// packages/content/src/schema.ts rules 1 and 2). `spawn.cooldownTurns` (engine/types.ts, added 2026-09-25) is
// used directly per the task brief, not the memory-tag cooldown pattern the favor templates use.
//
// Three deviations from a literal reading of design 10, forced by engine/world surface this task does not own:
//
// 1. `EvidenceSource` (world.ts) is `"witness" | "wire" | "collaborator" | "seizure" | "document" |
//    "participation"` -- there is no `"testimony"` value, though design 10 §1's `assoc.kid.caught` ("named"
//    branch) and §3's table both describe the evidence as "testimony". The nearest existing source is
//    `"witness"` (the kid, or the debtor's associates, telling the police what they saw/did), used throughout
//    below in place of the undeclared "testimony" tag.
// 2. `assoc.debtor.ran`'s "chase" option describes an "always" cost (Heat +10, evidence 10) layered under two
//    probabilistic branches that each add their own further cost. `Outcome.effects` has no way to express
//    "these effects apply on every branch, plus these further ones on this one" other than duplicating the
//    baseline into every weighted outcome (design 09 §4's own header calls out the identical shape, deviation
//    2: no formula/bonus layering over a plain weighted `resolve`). Rather than duplicate, each of "caught" and
//    "hospital" below carries its own total figures read directly off design 10's table (10 heat/10 evidence
//    for the clean catch, 30 heat/40 evidence including the beating gone wrong), which already differ in the
//    intended direction (worse when it goes to hospital) without needing the two effects lists to share a
//    literal baseline array.
// 3. The kid is found via `subordinatesOf` (engine/roles.ts), not a direct "on record with me" relation --
//    there isn't one. Generation sets the kid's `superiorId` to the player alongside `onRecordWith`
//    (packages/sim/src/generation/player.ts), so `{ role: "me", relation: "subordinatesOf" }` filtered to
//    `trait: "kid"` reaches exactly him, the same trick `associate-people.ts`'s `assoc.rival.poach` already
//    uses to find the rival off the sponsor.

import type { DecisionOption, Effect, Outcome, ProcessTemplate, RoleSelector } from "@borgata/sim";

/** The scope role every template below starts with, so `scheduler.ts`'s `scopeRoleName` (the first role whose
 * `entity` matches `spawn.per`) finds it and not a later character role (associate-week.ts's own note). */
const ME_ROLE: RoleSelector = { entity: "character", pick: "first" };

const PLAYER_FREE = { playerControlled: { role: "me", is: true } } as const;

/** `me`'s sponsor/crew/town chain (associate-week.ts's `sponsorChainRoles`, copied here rather than imported:
 * template files do not import each other, so a test that loads this file alone must still find every role it
 * needs). All three are optional: an effect that only reaches `$sponsor`/`$town` is silently skipped if the
 * chain does not resolve (engine/effects.ts's `UnboundRoleError` path), which is the documented, accepted
 * behaviour for an associate whose sponsor's crew happens to hold no blocks yet. */
function sponsorChainRoles(): Record<string, RoleSelector> {
  return {
    sponsor: { entity: "character", from: { role: "me", relation: "superiorOf" }, pick: "first", optional: true },
    crew: { entity: "crew", from: { role: "sponsor", relation: "crewOf" }, pick: "first", optional: true },
    town: { entity: "town", from: { role: "crew", relation: "townOf" }, pick: "first", optional: true },
  };
}

// =================================================================================================================
// 1. `assoc.kid.errand` (design 10 §1): weekly, weight 6000, cooldown 1. Follow-up `assoc.kid.caught`
// (scheduled next turn, bound `kid`, a decision by `me`).
// =================================================================================================================

const kidErrand: ProcessTemplate = {
  id: "assoc.kid.errand",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 8500, per: "character", maxActivePerScope: 1, cooldownTurns: 1 }, // 6000 in design 10; 8500 for two cards in nine weeks of ten (careers 2026-09-25)
  roles: {
    me: ME_ROLE,
    kid: {
      entity: "character",
      from: { role: "me", relation: "subordinatesOf" },
      where: [{ has: { role: "$candidate", trait: "kid" } }],
      pick: "first",
    },
    ...sponsorChainRoles(),
  },
  preconditions: [PLAYER_FREE],
  duration: 0, // a player decision is offered in the same run it spawns (design 09 §12, scheduler phase 6b)
  decision: {
    role: "me",
    prompt: "The kid needs telling what to do this week.",
    options: [
      {
        id: "collect",
        label: "Send him for the small debts",
        hint: "He brings back 8 to 12 kL. One time in eight a patrol picks him up, and that is a card next week.",
        effects: [],
      },
      {
        id: "messages",
        label: "Keep him running messages",
        hint: "Nothing today; your sponsor notices a boy who is useful, one week in three.",
        effects: [],
      },
      { id: "nightOff", label: "Give him the night off", hint: "He remembers it. Nothing earned.", effects: [] },
    ],
    aiDefault: "collect",
    timeoutTurns: 1,
    timeoutOption: "collect",
  },
  resolve: [
    {
      id: "brought",
      when: [{ decided: { optionId: "collect" } }],
      weight: 87,
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 10, money: "dirty", source: "kidErrand", cause: { rule: "assoc.kid.errand.collect" } },
        { fact: "LoyaltyDelta", characterId: "$kid", delta: 5, cause: { rule: "assoc.kid.errand.collect" } },
      ],
      report: { sign: "The kid brought back the week's small debts.", visibility: "sign" },
    },
    {
      id: "caught",
      when: [{ decided: { optionId: "collect" } }],
      weight: 13,
      effects: [
        { fact: "StatusChange", characterId: "$kid", status: "arrested", untilTurn: { $turnPlus: 2 }, cause: { rule: "assoc.kid.errand.caught" } },
        { schedule: { templateId: "assoc.kid.caught", delay: 0, bind: { me: "me", kid: "kid" } } } /* delay 0: the card comes up in the same week's modal (interactive turn, 2026-09-25) */,
      ],
      report: { newspaper: "A boy was picked up by a patrol on his rounds.", sign: "A patrol picked up the kid.", visibility: "known" },
    },
    {
      id: "useful",
      when: [{ decided: { optionId: "messages" } }],
      weight: 33,
      effects: [{ fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 5, cause: { rule: "assoc.kid.errand.useful" } }],
      report: { sign: "Your sponsor notices what a useful boy he is.", visibility: "sign" },
    },
    {
      id: "quiet",
      when: [{ decided: { optionId: "messages" } }],
      weight: 67,
      effects: [],
      report: { sign: "The kid ran his messages.", visibility: "sign" },
    },
    {
      id: "rested",
      when: [{ decided: { optionId: "nightOff" } }],
      effects: [{ fact: "LoyaltyDelta", characterId: "$kid", delta: 15, cause: { rule: "assoc.kid.errand.nightOff" } }],
      report: { sign: "You gave the kid the night off.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "The kid needs telling what to do this week." },
  tags: ["associate", "kid", "decision"],
  codexId: "situations-a",
};

/** Follow-up of `assoc.kid.errand`'s "caught" outcome: no `spawn`, reached only via that `schedule` effect
 * (same shape as `assoc.sponsor.repay`/`assoc.sponsor.takenOn`, associate-people.ts). */
const kidCaught: ProcessTemplate = {
  id: "assoc.kid.caught",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: {
    me: ME_ROLE,
    kid: { entity: "character", pick: "first" },
    sponsor: { entity: "character", from: { role: "me", relation: "superiorOf" }, pick: "first", optional: true },
  },
  preconditions: [],
  duration: 0,
  decision: {
    role: "me",
    prompt: "The patrol has the kid at the station. He has not said a word yet.",
    options: [
      { id: "fine", label: "Pay the fine", hint: "15 kL, and he is out tonight, loyal.", effects: [] },
      {
        id: "lawyer",
        label: "Ask your sponsor's lawyer",
        hint: "Costs favor with your sponsor (-10); he learns the kid was collecting for you.",
        effects: [],
      },
      {
        id: "sit",
        label: "Let him sit",
        hint: "Free. Two nights in the cell: loyalty -40, and one time in five he names you.",
        effects: [],
      },
    ],
    aiDefault: "fine",
    timeoutTurns: 1,
    timeoutOption: "fine",
  },
  resolve: [
    {
      id: "finePaid",
      when: [{ decided: { optionId: "fine" } }],
      effects: [
        { fact: "MoneyDestroy", from: "$me.account", amount: 15, money: "dirty", sink: "kidFine", cause: { rule: "assoc.kid.caught.fine" } },
        { fact: "StatusChange", characterId: "$kid", status: "free", cause: { rule: "assoc.kid.caught.fine" } },
        { fact: "LoyaltyDelta", characterId: "$kid", delta: 30, cause: { rule: "assoc.kid.caught.fine" } },
      ],
      report: { sign: "You paid the kid's fine; he's out tonight and loyal.", visibility: "sign" },
    },
    {
      id: "lawyered",
      when: [{ decided: { optionId: "lawyer" } }],
      effects: [
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -10, cause: { rule: "assoc.kid.caught.lawyer" } },
        { fact: "StatusChange", characterId: "$kid", status: "free", cause: { rule: "assoc.kid.caught.lawyer" } },
        { fact: "MemoryAdd", characterId: "$sponsor", memory: { tag: "kidCollects", aboutId: "$me", weight: 20 }, cause: { rule: "assoc.kid.caught.lawyer" } },
      ],
      report: { sign: "Your sponsor's lawyer got the kid out; now he knows the boy was collecting for you.", visibility: "sign" },
    },
    {
      id: "sat",
      when: [{ decided: { optionId: "sit" } }],
      weight: 80,
      effects: [{ fact: "LoyaltyDelta", characterId: "$kid", delta: -40, cause: { rule: "assoc.kid.caught.sit" } }],
      report: { newspaper: "A minor was held overnight at the station and released.", sign: "You let the kid sit it out; he's furious with you.", visibility: "sign" },
    },
    {
      id: "named",
      when: [{ decided: { optionId: "sit" } }],
      weight: 20,
      effects: [
        { fact: "LoyaltyDelta", characterId: "$kid", delta: -40, cause: { rule: "assoc.kid.caught.sit" } },
        // "testimony" is not an EvidenceSource (world.ts); "witness" is the nearest existing value (file header, deviation 1).
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 20, source: "witness" }, cause: { rule: "assoc.kid.caught.sit.named" } },
      ],
      report: { newspaper: "A boy told police what he'd been doing, and for whom.", sign: "The kid named you.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "The patrol has the kid at the station." },
  tags: ["associate", "kid", "followup", "decision"],
  codexId: "situations-a",
};

// =================================================================================================================
// 2. `assoc.debtor.plea` (design 10 §3): weight 700, cooldown 6, needs `runsGame`. Split into two follow-ups
// per the task brief (a single follow-up cannot both roll an outcome and then offer a decision): `assoc.debtor
// .week2` (no decision: `paid` 60%, or schedule `assoc.debtor.ran` 40%) and `assoc.debtor.ran` (the decision).
// =================================================================================================================

const debtorPlea: ProcessTemplate = {
  id: "assoc.debtor.plea",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 700, per: "character", maxActivePerScope: 1, cooldownTurns: 6 },
  roles: { me: ME_ROLE, ...sponsorChainRoles() },
  preconditions: [PLAYER_FREE, { has: { role: "me", memoryTag: "runsGame" } }],
  duration: 0,
  decision: {
    role: "me",
    prompt: "A regular at your table is into you for 40 kL and cannot pay.",
    options: [
      {
        id: "week",
        label: "Give him a week",
        hint: "Nothing now. Next week he pays, six times in ten, or he has run, and that is a card.",
        effects: [],
      },
      { id: "watch", label: "Take his watch", hint: "25 kL now; the table hears you take watches.", effects: [] },
      { id: "forgive", label: "Forgive it", hint: "Nothing now; the regulars like you for it.", effects: [] },
    ],
    aiDefault: "week",
    timeoutTurns: 1,
    timeoutOption: "week",
  },
  resolve: [
    {
      id: "wait",
      when: [{ decided: { optionId: "week" } }],
      effects: [{ schedule: { templateId: "assoc.debtor.week2", delay: 1, bind: { me: "me" } } }],
      report: { sign: "You gave the regular a week to come up with what he owes.", visibility: "sign" },
    },
    {
      id: "taken",
      when: [{ decided: { optionId: "watch" } }],
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 25, money: "dirty", source: "debtorWatch", cause: { rule: "assoc.debtor.plea.watch" } },
        { fact: "SentimentDelta", townId: "$town", delta: -10, cause: { rule: "assoc.debtor.plea.watch" } },
      ],
      report: { sign: "You took his watch to cover the debt; the table noticed.", visibility: "sign" },
    },
    {
      id: "forgiven",
      when: [{ decided: { optionId: "forgive" } }],
      effects: [
        { fact: "SentimentDelta", townId: "$town", delta: 10, cause: { rule: "assoc.debtor.plea.forgive" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "generous", weight: 10 }, cause: { rule: "assoc.debtor.plea.forgive" } },
      ],
      report: { sign: "You forgave the debt; the regulars think well of you for it.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "A regular at your table is into you for 40 kL and cannot pay." },
  tags: ["associate", "debtor", "decision"],
  codexId: "situations-a",
};

/** Follow-up 1 of 2: no decision. "A week has passed"; either he pays, or he has run and `assoc.debtor.ran`
 * (the decision) is scheduled in turn (task brief: a follow-up cannot both roll an outcome and offer a decision). */
const debtorWeek2: ProcessTemplate = {
  id: "assoc.debtor.week2",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: { me: ME_ROLE },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "paid",
      weight: 60,
      effects: [{ fact: "MoneyMint", to: "$me.account", amount: 40, money: "dirty", source: "debtorPaid", cause: { rule: "assoc.debtor.week2.paid" } }],
      report: { sign: "The regular paid up after all.", visibility: "sign" },
    },
    {
      id: "ranAway",
      weight: 40,
      effects: [{ schedule: { templateId: "assoc.debtor.ran", delay: 0, bind: { me: "me" } } }], // delay 0: same week's modal
      report: { sign: "Word is the regular has run; he owes you still.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "sign", sign: "A week has passed on the debt you let ride." },
  tags: ["associate", "debtor", "followup"],
  codexId: "situations-a",
};

/** Follow-up 2 of 2: the decision, once the regular has run. See the file header, deviation 2, for why "chase"'s
 * two branches each carry their own total heat/evidence figures rather than a shared "always" baseline. */
const debtorRan: ProcessTemplate = {
  id: "assoc.debtor.ran",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: { me: ME_ROLE, ...sponsorChainRoles() },
  preconditions: [],
  duration: 0,
  decision: {
    role: "me",
    prompt: "The regular who owes you has run. What now?",
    options: [
      {
        id: "chase",
        label: "Chase him",
        hint: "Heat and a line of evidence either way; seven times in ten you get your 40 back, three times in ten a beating goes wrong and he ends in hospital.",
        effects: [],
      },
      { id: "writeOff", label: "Write it off", hint: "Nothing; the table learns debts can be walked from.", effects: [] },
      { id: "tellSponsor", label: "Tell your sponsor", hint: "Favor -10; his men find him: you get 20, he gets 20.", effects: [] },
    ],
    aiDefault: "writeOff",
    timeoutTurns: 1,
    timeoutOption: "writeOff",
  },
  resolve: [
    {
      id: "caught",
      when: [{ decided: { optionId: "chase" } }],
      weight: 70,
      effects: [
        { fact: "HeatDelta", townId: "$town", delta: 10, cause: { rule: "assoc.debtor.ran.chase" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 10, source: "participation" }, cause: { rule: "assoc.debtor.ran.chase" } },
        { fact: "MoneyMint", to: "$me.account", amount: 40, money: "dirty", source: "debtorChase", cause: { rule: "assoc.debtor.ran.chase" } },
      ],
      report: { sign: "You caught up with him and got your money.", visibility: "sign" },
    },
    {
      id: "hospital",
      when: [{ decided: { optionId: "chase" } }],
      weight: 30,
      effects: [
        { fact: "HeatDelta", townId: "$town", delta: 30, cause: { rule: "assoc.debtor.ran.chase.hospital" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 40, source: "participation" }, cause: { rule: "assoc.debtor.ran.chase.hospital" } },
      ],
      report: { newspaper: "A man was beaten badly over a gambling debt and is in the hospital.", sign: "The beating went wrong; he's in the hospital.", visibility: "known" },
    },
    {
      id: "written",
      when: [{ decided: { optionId: "writeOff" } }],
      effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: "soft", weight: 10 }, cause: { rule: "assoc.debtor.ran.writeOff" } }],
      report: { sign: "You wrote off the debt.", visibility: "sign" },
    },
    {
      id: "found",
      when: [{ decided: { optionId: "tellSponsor" } }],
      effects: [
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -10, cause: { rule: "assoc.debtor.ran.tellSponsor" } },
        { fact: "MoneyMint", to: "$me.account", amount: 20, money: "dirty", source: "debtorFound", cause: { rule: "assoc.debtor.ran.tellSponsor" } },
      ],
      report: { sign: "Your sponsor's men found him; you both got paid.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "The regular who owes you has run." },
  tags: ["associate", "debtor", "followup", "decision"],
  codexId: "situations-a",
};

// =================================================================================================================
// 3. `assoc.feud.neighbor` (design 10 §6): weight 500, cooldown 10. Two shops bound from the businesses on
// the sponsor's crew's blocks (`sameEntity` false), no follow-up.
// =================================================================================================================

const feudNeighbor: ProcessTemplate = {
  id: "assoc.feud.neighbor",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 500, per: "character", maxActivePerScope: 1, cooldownTurns: 10 },
  roles: {
    me: ME_ROLE,
    sponsor: { entity: "character", from: { role: "me", relation: "superiorOf" }, pick: "first", optional: true },
    crew: { entity: "crew", from: { role: "sponsor", relation: "crewOf" }, pick: "first", optional: true },
    // Required (not optional): with fewer than two businesses on the sponsor's crew's blocks the scene has no
    // subject, so the spawn simply does not happen (design 04 §3 step 2), the same idiom `assoc.civil.help`'s
    // required `shop` uses in associate-people.ts.
    shopA: { entity: "business", from: { role: "crew", relation: "businessesOf" }, pick: "random" },
    shopB: {
      entity: "business",
      from: { role: "crew", relation: "businessesOf" },
      where: [{ sameEntity: { a: "$candidate", b: "shopA", is: false } }],
      pick: "random",
    },
    town: { entity: "town", from: { role: "shopA", relation: "townOf" }, pick: "first", optional: true },
  },
  preconditions: [PLAYER_FREE],
  duration: 0,
  decision: {
    role: "me",
    prompt: "Two shopkeepers on your block are at each other's throats over a wall. Both want you to settle it.",
    options: [
      {
        id: "sideA",
        label: "Side with the first",
        hint: "He pays early for a month: compliance up on his shop. The other sulks, compliance down, and three times in ten refuses outright.",
        effects: [],
      },
      {
        id: "sideB",
        label: "Side with the second",
        hint: "Mirror: the second pays early, compliance up. The first sulks, compliance down, three times in ten refuses outright.",
        effects: [],
      },
      {
        id: "split",
        label: "Make them split the cost",
        hint: "Both grumble, both pay: the block sees the family keep order, and your sponsor hears about it.",
        effects: [],
      },
      {
        id: "ignore",
        label: "Not your problem",
        hint: "Nothing spent, nothing gained. The block learns the family only takes.",
        effects: [],
      },
    ],
    aiDefault: "split",
    timeoutTurns: 1,
    timeoutOption: "split",
  },
  resolve: [
    {
      id: "sideAClean",
      when: [{ decided: { optionId: "sideA" } }],
      weight: 70,
      effects: [
        { fact: "ComplianceDelta", businessId: "$shopA", delta: 100, cause: { rule: "assoc.feud.neighbor.sideA" } },
        { fact: "ComplianceDelta", businessId: "$shopB", delta: -60, cause: { rule: "assoc.feud.neighbor.sideA" } },
      ],
      report: { sign: "You sided with the first shop; the other is sulking, but paying.", visibility: "sign" },
    },
    {
      id: "sideARefused",
      when: [{ decided: { optionId: "sideA" } }],
      weight: 30,
      effects: [
        { fact: "ComplianceDelta", businessId: "$shopA", delta: 100, cause: { rule: "assoc.feud.neighbor.sideA" } },
        { fact: "ComplianceDelta", businessId: "$shopB", delta: -60, cause: { rule: "assoc.feud.neighbor.sideA" } },
        { fact: "RefusalStage", businessId: "$shopB", stage: 1, cause: { rule: "assoc.feud.neighbor.sideA.refused" } },
      ],
      report: { sign: "You sided with the first shop; the other refuses to pay at all now.", visibility: "sign" },
    },
    {
      id: "sideBClean",
      when: [{ decided: { optionId: "sideB" } }],
      weight: 70,
      effects: [
        { fact: "ComplianceDelta", businessId: "$shopB", delta: 100, cause: { rule: "assoc.feud.neighbor.sideB" } },
        { fact: "ComplianceDelta", businessId: "$shopA", delta: -60, cause: { rule: "assoc.feud.neighbor.sideB" } },
      ],
      report: { sign: "You sided with the second shop; the first is sulking, but paying.", visibility: "sign" },
    },
    {
      id: "sideBRefused",
      when: [{ decided: { optionId: "sideB" } }],
      weight: 30,
      effects: [
        { fact: "ComplianceDelta", businessId: "$shopB", delta: 100, cause: { rule: "assoc.feud.neighbor.sideB" } },
        { fact: "ComplianceDelta", businessId: "$shopA", delta: -60, cause: { rule: "assoc.feud.neighbor.sideB" } },
        { fact: "RefusalStage", businessId: "$shopA", stage: 1, cause: { rule: "assoc.feud.neighbor.sideB.refused" } },
      ],
      report: { sign: "You sided with the second shop; the first refuses to pay at all now.", visibility: "sign" },
    },
    {
      id: "splitDecided",
      when: [{ decided: { optionId: "split" } }],
      effects: [
        { fact: "SentimentDelta", townId: "$town", delta: 15, cause: { rule: "assoc.feud.neighbor.split" } },
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 10, cause: { rule: "assoc.feud.neighbor.split" } },
      ],
      report: { sign: "You made them split the cost; the block sees the family keeping order.", visibility: "sign" },
    },
    {
      id: "ignored",
      when: [{ decided: { optionId: "ignore" } }],
      effects: [{ fact: "SentimentDelta", townId: "$town", delta: -10, cause: { rule: "assoc.feud.neighbor.ignore" } }],
      report: { sign: "You told them it wasn't your problem; the block noticed.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Two shopkeepers on your block are at each other's throats." },
  tags: ["associate", "feud", "decision"],
  codexId: "situations-a",
};

export const SITUATIONS_A_TEMPLATES: ProcessTemplate[] = [kidErrand, kidCaught, debtorPlea, debtorWeek2, debtorRan, feudNeighbor];

// Re-exported only so the file typechecks even if a future test helper narrowly imports these effect/outcome
// shapes; not otherwise used here (associate-people.ts's own file-closing convention).
export type { DecisionOption, Effect, Outcome };
