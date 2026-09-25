// Design 12 §3: obligations, the treasury and lifestyle. Seven templates: `oblig.prisoner.open` (the arrest
// card, superseding `soldier.detained.support`), `oblig.due.card` (the weekly due card, any kind), `oblig.
// missed.prisoner` (the flip-relevant loyalty hit when support is missed), `oblig.funeral` (attend or stay
// away), `family.weakened.news`/`family.recovered.news` (newspaper) and `lifestyle.fallen` (a rare newspaper
// flavor line; the direct report line already exists, log.ts's own `projectReport`). Lane `families`, scope
// `town` for character-scoped cards (matching `soldier.ts`'s own convention: `spawn.per` is the binding
// contract, not `scope`), `family` for the two family-scoped news cards. Every option has a `hint`; every
// outcome that changes state or answers a decision has a report (schema.ts rules 1, 2, 2b, 2c, 3).
//
// Design change (2026-09-25): the flip roll moved off the arrest moment onto `state.detained.interrogation`
// (packages/content/src/templates/state.ts), which resolves in the second week of detention. So that a man held
// three weeks is supported before that interrogation ever runs, `oblig.prisoner.open`'s "support" and "both"
// outcomes now pay the very first week's support immediately, in the same effects list that opens the
// obligation (`MoneyMove` then `ObligationMet` on the same minted id), rather than waiting for `oblig.due.card`
// to raise and answer an `ObligationDue` on some later turn.
//
// Three gaps found while authoring this file, each resolved with the nearest expressible behaviour (this
// task's brief asked that each be checked and, if not trivial, reported rather than silently worked around):
//
// 1. `$mint:ob` DOES resolve inside a nested effect object. `oblig.prisoner.open`'s "support" outcome mints
//    `Obligation.id` two levels deep (`{ fact: "ObligationOpen", obligation: { id: "$mint:ob", ... } }`);
//    `engine/effects.ts`'s `resolveValue` recurses into every plain-object property (not just top-level effect
//    fields), and `schema.ts`'s own `walkRefValue` mirrors that recursion for referential-integrity checking,
//    so no fallback (`$instance`) was needed. Confirmed by `obligations-cards.test.ts`'s own assertions on the
//    minted id. The "both" outcome mints two obligations in one effects list: `$mint:<prefix>` memoizes per
//    *effects list*, not per template (engine/scheduler.ts's `applyEffects`, "one context per effect list"), so
//    reusing "$mint:ob" twice there would collide on the same id; it uses two distinct prefixes instead
//    ("$mint:obSupport", "$mint:obLawyer").
//
// 2. `oblig.due.card`'s "pay" cannot construct `ObligationMet { obligationId, ... }` itself, and neither the
//    amount nor the beneficiary can be read out of `ObligationDue` by an effect (design 12 §2's own contract:
//    the fact carries `obligationId`/`debtorId`/`amount`/`obligationKind`, not the beneficiary, and `Bindings`
//    has no slot for a raw scalar value like `obligationId` to travel into a `Fact` field the way a bound
//    role's id does). This is exactly the task brief's anticipated gap; `packages/sim/src/systems/
//    obligations.ts`'s header comment records the analysis and the fallback taken (a same-turn `MemoryAdd`
//    marker the system reads back), including the one known limitation it leaves (simultaneous same-turn dues
//    for one debtor cannot be told apart). Because the system does the real payment, "pay"'s own outcomes here
//    do not need per-kind amounts at all (the task brief's suggested "gate one outcome per kind with fixed
//    amounts" is unnecessary once the system, which already knows the real amount and beneficiary, does the
//    work): one "pay" outcome and one "skip" outcome cover every obligation kind.
//
// 3. The due card's prompt cannot name the beneficiary: `ObligationDue` carries no beneficiary id (design 12
//    §2's contract, `packages/sim/src/facts.ts`), and no `FromRelation` derives "the beneficiary of a debtor's
//    obligation" from the debtor role, so a `beneficiary` role cannot be bound at all (this task's file
//    ownership does not include adding one to `ObligationDue` itself). The prompt stays general, per the task
//    brief's own fallback instruction, and the hints on "pay"/"skip" carry the actual stakes in words instead.
//
import { EXTERNAL_SINK_ACCOUNT } from "@borgata/sim";
import type { ProcessTemplate } from "@borgata/sim";

// `SpawnRule.spawnFrom.field`'s authoring-time literal type (`engine/types.ts`) is `"businessId" |
// "characterId" | "townId" | "collectorId"` and does not include "debtorId", "beneficiaryId" or "familyId";
// `situations-c.ts`'s own header (this same wave) establishes the fix for exactly this situation given several
// parallel content tasks editing that shared engine file at once: assert the literal through `unknown` rather
// than widen it. `SpawnRuleSchema.spawnFrom.field` (schema.ts) is a bare `z.string()`, and
// `engine/scheduler.ts`'s spawn pass reads `RecentFact.fields` by plain string key, so the runtime value is
// exactly the string named either way.
const DEBTOR_FIELD = "debtorId" as unknown as "characterId";
const BENEFICIARY_FIELD = "beneficiaryId" as unknown as "characterId";
const FAMILY_FIELD = "familyId" as unknown as "characterId";

// Mirrors `packages/sim/src/systems/obligations.ts`'s own private constants of the same name; kept in sync by
// hand rather than by import so this file does not reach into that system's internals (its two exported
// members, `paymentFacts`/`prisonerSupported`, are its only public surface).
const PAY_TAG = "obligationPay";
const SKIP_TAG = "obligationSkip";

// =================================================================================================================
// 1. `oblig.prisoner.open` (design 12 §1, §3): an associate of the player's is arrested; support his family,
// pay a lawyer, both, or nothing. Same trigger as `soldier.detained.support` (that file's own template, not
// edited here), a higher `priority` so this card is the one meant to survive integration: `soldier.ts`'s card
// should be removed once this lands (noted in the task brief; not done here since this task does not own that
// file, and removing it now would leave this task's own tests unable to demonstrate the supersession).
// =================================================================================================================

const prisonerOpen: ProcessTemplate = {
  id: "oblig.prisoner.open",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "StatusChange", role: "man", field: "characterId", match: { status: "arrested" } },
  },
  roles: {
    // `man` first: `spawnFrom` prebinds `man`, not `me`, so `man` must be the role `scopeRoleName` finds for
    // `maxActivePerScope` to see it as prebound (soldier.ts's `detainedSupport` establishes this ordering).
    man: { entity: "character", pick: "first" },
    me: { entity: "character", from: { role: "man", relation: "superiorOf" }, pick: "first" },
  },
  preconditions: [{ playerControlled: { role: "me", is: true } }],
  duration: 0, // a player decision is offered in the same run it spawns (soldier.ts's own established pattern)
  decision: {
    role: "me",
    prompt: "One of your men has been picked up. His family has nothing coming in while he's inside.",
    options: [
      { id: "support", label: "Support his family (aiutare la famiglia)", hint: "15 kL a week while he's held; his family holds together, and it is what the flip roll reads if the police lean on him.", effects: [] },
      { id: "lawyer", label: "Pay a lawyer (pagare l'avvocato)", hint: "30 kL once; he thinks better of you for it, and it works toward getting him out sooner.", effects: [] },
      { id: "both", label: "Do both (fare tutte e due)", hint: "15 kL a week and 30 kL once: the full cost, the full protection.", effects: [] },
      { id: "nothing", label: "Do nothing (niente)", hint: "Costs you nothing now, but he'll remember it, and no one is looking after his family.", effects: [] },
    ],
    aiDefault: "nothing",
    timeoutTurns: 1,
    timeoutOption: "nothing",
  },
  resolve: [
    {
      id: "support",
      when: [{ decided: { optionId: "support" } }],
      effects: [
        {
          fact: "ObligationOpen",
          obligation: {
            id: "$mint:ob",
            kind: "prisonerSupport",
            debtorId: "$me",
            beneficiary: { kind: "character", id: "$man" },
            amount: 15,
            everyTurns: 1,
            nextDueTurn: "$turn",
            untilTurn: null,
            met: 0,
            missed: 0,
            lastResult: null,
            status: "open",
          },
          cause: { rule: "oblig.prisoner.open.support" },
        },
        // Pays the first week immediately, in the same effects list, rather than waiting for `oblig.due.card`
        // to raise and answer an `ObligationDue` on some later turn (design 12 §1's "his family holds together"
        // reads on the very decision that opens the obligation, not two turns after it): `reducers/obligations.ts`
        // (owner `obligations`) and `reducers/index.ts`'s `applyFacts` apply every owner's facts in the order
        // they appear in the turn's effects list, so `ObligationOpen` mints and inserts the obligation before
        // this `ObligationMet` looks it up by the same `$mint:ob` id (memoized per effects list, engine/
        // effects.ts) -- confirmed by `obligations-cards.test.ts`'s "pays the first week immediately" case. A man
        // held three weeks is therefore supported (`systems/obligations.ts`'s `prisonerSupported`) before
        // `state.detained.interrogation` (state.ts) ever rolls the flip in his second week.
        { fact: "MoneyMove", from: "$me.account", to: "$man.account", amount: 15, money: "dirty", cause: { rule: "oblig.prisoner.open.support.firstWeek" } },
        { fact: "ObligationMet", obligationId: "$mint:ob", paidBy: "debtor", cause: { rule: "oblig.prisoner.open.support.firstWeek" } },
      ],
      report: { sign: "You send word that his family will be looked after.", visibility: "sign" },
    },
    {
      id: "lawyer",
      when: [{ decided: { optionId: "lawyer" } }],
      effects: [
        {
          fact: "ObligationOpen",
          obligation: {
            id: "$mint:ob",
            kind: "lawyer",
            debtorId: "$me",
            beneficiary: { kind: "external", id: EXTERNAL_SINK_ACCOUNT },
            amount: 30,
            everyTurns: null,
            nextDueTurn: "$turn",
            untilTurn: null,
            met: 0,
            missed: 0,
            lastResult: null,
            status: "open",
          },
          cause: { rule: "oblig.prisoner.open.lawyer" },
        },
        { fact: "LoyaltyDelta", characterId: "$man", delta: 20, cause: { rule: "oblig.prisoner.open.lawyer" } },
        { fact: "MemoryAdd", characterId: "$man", memory: { tag: "lawyered", weight: 20 }, cause: { rule: "oblig.prisoner.open.lawyer" } },
      ],
      report: { sign: "You send word for a lawyer.", visibility: "sign" },
    },
    {
      id: "both",
      when: [{ decided: { optionId: "both" } }],
      effects: [
        {
          fact: "ObligationOpen",
          obligation: {
            id: "$mint:obSupport",
            kind: "prisonerSupport",
            debtorId: "$me",
            beneficiary: { kind: "character", id: "$man" },
            amount: 15,
            everyTurns: 1,
            nextDueTurn: "$turn",
            untilTurn: null,
            met: 0,
            missed: 0,
            lastResult: null,
            status: "open",
          },
          cause: { rule: "oblig.prisoner.open.both" },
        },
        // The first week's support, paid immediately: same reasoning as "support" above.
        { fact: "MoneyMove", from: "$me.account", to: "$man.account", amount: 15, money: "dirty", cause: { rule: "oblig.prisoner.open.both.firstWeek" } },
        { fact: "ObligationMet", obligationId: "$mint:obSupport", paidBy: "debtor", cause: { rule: "oblig.prisoner.open.both.firstWeek" } },
        {
          fact: "ObligationOpen",
          obligation: {
            id: "$mint:obLawyer",
            kind: "lawyer",
            debtorId: "$me",
            beneficiary: { kind: "external", id: EXTERNAL_SINK_ACCOUNT },
            amount: 30,
            everyTurns: null,
            nextDueTurn: "$turn",
            untilTurn: null,
            met: 0,
            missed: 0,
            lastResult: null,
            status: "open",
          },
          cause: { rule: "oblig.prisoner.open.both" },
        },
        { fact: "LoyaltyDelta", characterId: "$man", delta: 20, cause: { rule: "oblig.prisoner.open.both" } },
        { fact: "MemoryAdd", characterId: "$man", memory: { tag: "lawyered", weight: 20 }, cause: { rule: "oblig.prisoner.open.both" } },
      ],
      report: { sign: "You do everything you can for him.", visibility: "sign" },
    },
    {
      id: "nothing",
      when: [{ decided: { optionId: "nothing" } }],
      effects: [{ fact: "LoyaltyDelta", characterId: "$man", delta: -30, cause: { rule: "oblig.prisoner.open.nothing" } }],
      report: { sign: "You do nothing for him.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "One of your men has been picked up." },
  // Above `soldier.detained.support` (unset, default 0): design 12 §3's own instruction, "a higher priority
  // and the same trigger" so this card is the one integration keeps.
  priority: 5,
  tags: ["obligations", "prisoner", "decision"],
  codexId: "obligations-treasury",
};

// =================================================================================================================
// 2. `oblig.due.card` (design 12 §2, §3): any obligation of the player's comes due. See this file's header,
// gap 2, for why "pay" leaves a marker instead of paying directly.
// =================================================================================================================

const dueCard: ProcessTemplate = {
  id: "oblig.due.card",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "ObligationDue", role: "me", field: DEBTOR_FIELD },
  },
  roles: {
    me: { entity: "character", pick: "first" },
  },
  preconditions: [{ playerControlled: { role: "me", is: true } }],
  duration: 0,
  decision: {
    role: "me",
    // General, not "{beneficiary.name} is owed...": this file's header, gap 3 -- no beneficiary role can be
    // bound off `ObligationDue`, so the hints below carry the stakes instead.
    prompt: "A duty of yours comes due this week.",
    options: [
      { id: "pay", label: "Pay what is owed (pagare)", hint: "The money leaves you (or is spent on your behalf), but whoever depends on you is looked after and your name holds.", effects: [] },
      { id: "skip", label: "Let it go (lasciar perdere)", hint: "You keep the money, but whoever depends on you goes without this week, and it will be remembered.", effects: [] },
    ],
    aiDefault: "pay",
    timeoutTurns: 1,
    timeoutOption: "skip",
  },
  resolve: [
    {
      id: "pay",
      when: [{ decided: { optionId: "pay" } }],
      effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: PAY_TAG, weight: 1 } }],
      report: { sign: "You send word to pay what you owe this week.", visibility: "sign" },
    },
    {
      id: "skip",
      when: [{ decided: { optionId: "skip" } }],
      effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: SKIP_TAG, weight: 1 } }],
      report: { sign: "You let it go this week.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "What you owe comes due this week." },
  priority: 2, // above the weekly cards (associate-week.ts/associate-people.ts default to priority 0)
  tags: ["obligations", "due", "decision"],
  codexId: "obligations-treasury",
};

// =================================================================================================================
// 3. `oblig.missed.prisoner` (design 12 §1, §3): a missed prisonerSupport costs the prisoner loyalty and marks
// him remembered as left alone; the flip roll itself already reads `prisonerSupported` directly
// (engine/predicates.ts's `state.flipRoll`), so this card is the loyalty/memory/report side effect only.
// =================================================================================================================

const missedPrisoner: ProcessTemplate = {
  id: "oblig.missed.prisoner",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "ObligationMissed", role: "prisoner", field: BENEFICIARY_FIELD, match: { obligationKind: "prisonerSupport" } },
  },
  roles: {
    prisoner: { entity: "character", pick: "first" },
    // Bound so `isPlayerFacing` (engine/scheduler.ts) sees this as the player's own family's business and the
    // report actually reaches the player, per design 12 §1's story ("the flip... against a man whose family
    // was left alone" is the player's own crew).
    // `optional`: the loyalty/memory effects below only need `$prisoner` and must fire regardless (design 12's
    // flip roll reads the miss either way); an unbound `family` only loses the report, never the state change.
    family: { entity: "family", from: { role: "prisoner", relation: "familyOf" }, pick: "first", optional: true },
  },
  preconditions: [{ alive: { role: "prisoner" } }],
  duration: 0,
  resolve: [
    {
      id: "familyLeftAlone",
      effects: [
        { fact: "LoyaltyDelta", characterId: "$prisoner", delta: -40, cause: { rule: "oblig.missed.prisoner" } },
        { fact: "MemoryAdd", characterId: "$prisoner", memory: { tag: "familyLeftAlone", weight: 40 }, cause: { rule: "oblig.missed.prisoner" } },
      ],
      report: { sign: "His family went without again this week; he takes it hard.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known" },
  tags: ["obligations", "prisoner", "missed"],
  codexId: "obligations-treasury",
};

// =================================================================================================================
// 4. `oblig.funeral` (design 12 §1, §3): a crewmate or family member dies; attend and open the funeral due, or
// stay away and pay in favor instead. `me` is bound with a `sameFamily` predicate (no relation runs from an
// arbitrary dead character to the specific player), exactly the pattern `disputes.ts`'s own `victimFamily`
// exclusion establishes for `$candidate` plus a role bound earlier. `chief` (the player's own crew chief, for
// the "stay away" favor hit) is bound two hops out (`me` -> crew -> chief) and left `optional`: many players at
// this point have no crewId of their own (associates/soldiers report to a superior, not a crew of their own),
// so the favor effect simply skips (an unbound role's effect is skipped, engine/effects.ts) when there is none;
// the memory and report still land either way.
// =================================================================================================================

const funeral: ProcessTemplate = {
  id: "oblig.funeral",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    cooldownTurns: 1,
    spawnFrom: { factKind: "StatusChange", role: "dead", field: "characterId", match: { status: "dead" } },
  },
  roles: {
    dead: { entity: "character", pick: "first" },
    me: {
      entity: "character",
      where: [{ playerControlled: { role: "$candidate", is: true } }, { sameFamily: { a: "$candidate", b: "dead", is: true } }],
      pick: "first",
    },
    crew: { entity: "crew", from: { role: "me", relation: "crewOf" }, pick: "first", optional: true },
    chief: { entity: "character", from: { role: "crew", relation: "chiefOf" }, pick: "first", optional: true },
  },
  preconditions: [{ playerControlled: { role: "me", is: true } }],
  duration: 0,
  decision: {
    role: "me",
    prompt: "One of your own has died. Do you go to the funeral?",
    options: [
      { id: "attend", label: "Attend and pay a share (partecipare)", hint: "30 kL, due this week; the crew remembers who came.", effects: [] },
      { id: "stayAway", label: "Stay away (restare lontano)", hint: "Costs nothing now, but the chief and the crew will remember the insult.", effects: [] },
    ],
    aiDefault: "attend",
    timeoutTurns: 1,
    timeoutOption: "stayAway",
  },
  resolve: [
    {
      id: "attend",
      when: [{ decided: { optionId: "attend" } }],
      effects: [
        {
          fact: "ObligationOpen",
          obligation: {
            id: "$mint:ob",
            kind: "funeral",
            debtorId: "$me",
            beneficiary: { kind: "external", id: EXTERNAL_SINK_ACCOUNT },
            amount: 30,
            everyTurns: null,
            nextDueTurn: "$turn",
            untilTurn: null,
            met: 0,
            missed: 0,
            lastResult: null,
            status: "open",
          },
          cause: { rule: "oblig.funeral.attend" },
        },
      ],
      report: { sign: "You go to the funeral and pay your share.", visibility: "sign" },
    },
    {
      id: "stayAway",
      when: [{ decided: { optionId: "stayAway" } }],
      effects: [
        { fact: "FavorDelta", from: "$chief", to: "$me", delta: -20, cause: { rule: "oblig.funeral.stayAway" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "missedFuneral", weight: 20 }, cause: { rule: "oblig.funeral.stayAway" } },
      ],
      report: { sign: "You stay away. It will be remembered.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "One of your own has died." },
  tags: ["obligations", "funeral", "decision"],
  codexId: "obligations-treasury",
};

// =================================================================================================================
// 5, 6. `family.weakened.news` / `family.recovered.news` (design 12 §1, §2): the newspaper announces the
// player's own family's health once `systems/obligations.ts` flips `Family.state`.
// =================================================================================================================

const familyWeakenedNews: ProcessTemplate = {
  id: "family.weakened.news",
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
  roles: { family: { entity: "family", pick: "first" } },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "weakened",
      effects: [],
      report: { newspaper: "Word passes that a family's purse has run thin, and its men are feeling it.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known" },
  tags: ["obligations", "family", "news"],
  codexId: "obligations-treasury",
};

const familyRecoveredNews: ProcessTemplate = {
  id: "family.recovered.news",
  version: 1,
  kind: "event",
  scope: "family",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "family",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "FamilyStateSet", role: "family", field: FAMILY_FIELD, match: { state: "healthy" } },
  },
  roles: { family: { entity: "family", pick: "first" } },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "recovered",
      effects: [],
      report: { newspaper: "Word passes that a family has settled its debts and is on its feet again.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known" },
  tags: ["obligations", "family", "news"],
  codexId: "obligations-treasury",
};

// =================================================================================================================
// 7. `lifestyle.fallen` (design 12 §2, §3): a rare newspaper flavor line when the player falls to modest. The
// direct report line ("You could not keep up...") already exists (log.ts's own `projectReport`); this is only
// the social color the task brief asks for, kept rare with `cooldownTurns: 8`.
// =================================================================================================================

const lifestyleFallen: ProcessTemplate = {
  id: "lifestyle.fallen",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    cooldownTurns: 8,
    spawnFrom: { factKind: "LifestyleSet", role: "me", field: "characterId", match: { lifestyle: "modest" } },
  },
  roles: { me: { entity: "character", pick: "first" } },
  preconditions: [{ playerControlled: { role: "me", is: true } }],
  duration: 0,
  resolve: [
    {
      id: "fallen",
      effects: [],
      report: { newspaper: "A man of the quarter is seen less at the bar these days.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known" },
  tags: ["obligations", "lifestyle", "news"],
  codexId: "obligations-treasury",
};

export const OBLIGATION_TEMPLATES: ProcessTemplate[] = [
  prisonerOpen,
  dueCard,
  missedPrisoner,
  funeral,
  familyWeakenedNews,
  familyRecoveredNews,
  lifestyleFallen,
];
