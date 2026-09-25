// Soldier situations, part 3 (design 10 §7-§8): the associate who is short (with its follow-up, the associate
// leaving), and the loan that went bad (with its follow-up, the loan paid off in full). Conventions (design 10's
// preamble, §12): lane `families`, scope `town`, decision role `me`, `duration: 0` (a player decision is offered
// in the same run it spawns, per design 09 §12's cadence note and `soldier.ts`'s own established pattern -- not
// `associate-week.ts`'s earlier `duration: 1`, which predates that fix), every option a `hint`, every
// state-changing outcome a report line, and `spawn.cooldownTurns` so a rare card does not return too soon
// (design 10's decision 2: 4 turns on every rare card, except §7's own literal "cooldown 3"). This file does not
// import `soldier.ts`, `associate-week.ts` or `associate-people.ts` (template files never import each other,
// design 04 §1's shared-registry convention); where a `fn` predicate one of them already registers would help,
// nothing here needs it, and this file's own new `fn` (`claims.hasClaim`, below) is registered under a name none
// of them use.
//
// Two gaps found while authoring this file, each resolved with the nearest expressible behaviour:
//
// 1. `SpawnRule.spawnFrom.field2`'s literal type (`packages/sim/src/engine/types.ts`) is `"businessId" |
//    "characterId" | "townId" | "collectorId"` and does not yet include `"lenderId"` -- needed here so
//    `soldier.loan.bad` can bind `me` (the lender) straight off the `LoanDefault` fact this task's own Part 1
//    added `businessId` to, without depending on a same-turn claim (a claim may not exist at all when the loan
//    was against a shop nobody has taken yet -- exactly the "take" option's own branch, below). At runtime,
//    `field`/`field2` are read as plain strings (`engine/scheduler.ts`'s spawn pass indexes `RecentFact.fields`
//    by them), and the content schema's own `SpawnRuleSchema` (`packages/content/src/schema.ts`) types both as
//    a bare `z.string()` with no such restriction -- only the TypeScript authoring-time literal is behind,
//    because it predates `LoanDefault` gaining `lenderId`/`businessId`. This task's file ownership does not
//    include `engine/types.ts` (two other agents are editing sibling content files against the same shared
//    engine surface in parallel), so the extra literal is asserted here (`LENDER_FIELD2`) rather than widening
//    that file's union; the runtime value really is the string "lenderId" either way.
// 2. No predicate reads "does this business have a claim on it" (`predicates.ts`'s `has` only knows
//    trait/tool/memoryTag). A role selector bound once at spawn time via the `claimHolderOf` relation would
//    freeze whatever the claim state was then, not what it is when the player actually decides -- possibly
//    turns later -- so it is the wrong tool for "take"'s "if unclaimed" gate. `claims.hasClaim`, registered
//    below, reads the live claims table at resolve time instead (design 04 §1's escape hatch), the same pattern
//    `soldier.ts`'s own header describes for its `ledger.accountAtLeast`. `claimOnSubject` (`reducers/
//    claims.ts`) is not part of `@borgata/sim`'s public surface (content may only import the package root), so
//    this re-implements its one-subject-kind lookup directly against `world.claims`, which is public (`world.ts`).

import { registerPredicateFn } from "@borgata/sim";
import type { DecisionOption, Outcome, ProcessTemplate } from "@borgata/sim";

/** This file's header, gap 1: the real runtime value is the string "lenderId"; the cast only satisfies
 * `SpawnRule.spawnFrom.field2`'s narrower authoring-time literal type (a file this task does not own). */
const LENDER_FIELD2 = "lenderId" as unknown as "businessId";

/** `{ fn: { name: "claims.hasClaim", args: { role: "shop" } } }`: this file's header, gap 2. */
registerPredicateFn("claims.hasClaim", (world, roles, args) => {
  const ref = roles[String(args["role"] ?? "shop")];
  if (!ref || ref.kind !== "business") return false;
  for (const id of world.claims.order) {
    const claim = world.claims.byId[id]!;
    if (claim.subject.kind === "business" && claim.subject.id === ref.id) return true;
  }
  return false;
});

// =================================================================================================================
// 1. `soldier.associate.short` (design 10 §7): a soldier's own associate comes up short on a collection, bound
// entirely from a `CollectionMissed` fact (design 09 §1, §7 item 4), the same `spawnFrom` shape `assoc.latePayer`
// uses (`associate-week.ts`) except only one side is bound from the fact: the collector here is the associate
// himself (`man`), an AI-controlled character, not the player, so `me` (the soldier `man` reports to) is bound
// by relation instead of by a second `spawnFrom` field.
// =================================================================================================================

const associateShort: ProcessTemplate = {
  id: "soldier.associate.short",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    cooldownTurns: 3, // design 10 §7's own literal ("cooldown 3")
    spawnFrom: { factKind: "CollectionMissed", role: "man", field: "collectorId" },
  },
  roles: {
    // `man` first, not `me`: `spawnFrom` prebinds `man`, so `man` must be the role `scopeRoleName`
    // (engine/scheduler.ts) finds for `maxActivePerScope`/`cooldownTurns` to see it as prebound (soldier.ts's
    // own `detainedSupport` establishes this ordering for the identical reason).
    man: { entity: "character", pick: "first" },
    me: { entity: "character", from: { role: "man", relation: "superiorOf" }, pick: "first" },
  },
  preconditions: [
    { rank: { role: "man", in: ["associate"] } },
    { playerControlled: { role: "me", is: true } },
    { rank: { role: "me", in: ["soldier"] } },
  ],
  duration: 0, // a player decision is offered in the same run it spawns (design 09 §12)
  decision: {
    role: "me",
    prompt: "Your man came up short again this week.",
    options: [
      {
        id: "confront",
        label: "Fargli una ramanzina (have a word)",
        hint: "Costs you nothing but his loyalty; he won't come up short again soon, though one time in ten he asks the chief for another sponsor over it.",
        effects: [],
      },
      {
        id: "letGo",
        label: "Lasciar perdere (let it go)",
        hint: "Free. The broken streak is his to answer for, not yours.",
        effects: [],
      },
      {
        id: "squeeze",
        label: "Alzargli la quota al 60 percento (raise his share to 60 percent)",
        hint: "More money for you while he lasts; he'll know exactly why his cut got smaller, and he won't thank you for it.",
        effects: [],
      },
    ],
    aiDefault: "letGo",
    timeoutTurns: 1,
    timeoutOption: "letGo",
  },
  resolve: [
    {
      id: "confronted",
      when: [{ decided: { optionId: "confront" } }],
      effects: [
        { fact: "LoyaltyDelta", characterId: "$man", delta: -20, cause: { rule: "soldier.associate.short.confront" } },
        { fact: "MemoryAdd", characterId: "$man", memory: { tag: "warnedByBoss", weight: 20 }, cause: { rule: "soldier.associate.short.confront" } },
        { schedule: { templateId: "soldier.associate.leaves", delay: 2, probability: 1000, bind: { man: "man" } } },
      ],
      report: { sign: "You had a word with your man about coming up short.", visibility: "sign" },
    },
    {
      id: "letWent",
      when: [{ decided: { optionId: "letGo" } }],
      effects: [],
      report: { sign: "You let it go.", visibility: "sign" },
    },
    {
      id: "squeezed",
      when: [{ decided: { optionId: "squeeze" } }],
      effects: [
        {
          fact: "ShareRuleSet",
          superiorId: "$me",
          subordinateId: "$man",
          rule: { fixedPerTurn: 0, percent: 600 },
          cause: { rule: "soldier.associate.short.squeeze" },
        },
        { fact: "LoyaltyDelta", characterId: "$man", delta: -40, cause: { rule: "soldier.associate.short.squeeze" } },
      ],
      report: { sign: "You raised his share to 60 percent. He felt it.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Your man came up short again this week." },
  tags: ["soldier", "associate", "decision"],
};

/** Follow-up `soldier.associate.leaves` (design 10 §7): schedule-only (no `spawn`), bound `man` by the parent's
 * own `schedule` effect above; no decision (design 10 §7: "ClaimRelease of the man, SuperiorSet null"). */
const associateLeaves: ProcessTemplate = {
  id: "soldier.associate.leaves",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: { man: { entity: "character", pick: "first" } },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "left",
      effects: [
        { fact: "ClaimRelease", claimId: "$man.claim", cause: { rule: "soldier.associate.leaves" } },
        { fact: "SuperiorSet", characterId: "$man", superiorId: null, cause: { rule: "soldier.associate.leaves" } },
      ],
      report: { sign: "Your man asked the chief for another sponsor and got one.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { sign: "Your man asked the chief for another sponsor and got one.", visibility: "sign" },
  tags: ["soldier", "associate", "followup"],
};

// =================================================================================================================
// 2. `soldier.loan.bad` (design 10 §8): a business on the soldier's own loan book defaults, bound entirely from
// the `LoanDefault` fact (this task's own Part 1: `businessId`, set by `systems/loans.ts` only for a business
// borrower) -- this file's header, gap 1, for why `field2` needs a cast to bind `me` (the lender) from it.
// =================================================================================================================

const loanBad: ProcessTemplate = {
  id: "soldier.loan.bad",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "business",
    maxActivePerScope: 1,
    cooldownTurns: 4, // design 10's decision 2: every rare card gets a four-turn cooldown
    spawnFrom: { factKind: "LoanDefault", role: "shop", field: "businessId", role2: "me", field2: LENDER_FIELD2 },
  },
  roles: {
    shop: { entity: "business", pick: "first" },
    me: { entity: "character", pick: "first" },
    town: { entity: "town", from: { role: "shop", relation: "townOf" }, pick: "first" },
  },
  preconditions: [{ playerControlled: { role: "me", is: true } }],
  duration: 0, // a player decision is offered in the same run it spawns (design 09 §12)
  decision: {
    role: "me",
    prompt: "The bakery cannot pay. Its owner is asking what you want.",
    options: [
      {
        id: "take",
        label: "Prendersi il negozio (take the shop)",
        hint: "Free, if nobody already holds the claim on him; the town won't love you for it either way.",
        effects: [],
      },
      {
        id: "stock",
        label: "Prendersi la merce (take his stock)",
        hint: "60 lire now; fear rises on the block, and he limps on.",
        effects: [],
      },
      {
        id: "extend",
        label: "Concedergli un mese (extend him a month)",
        hint: "Nothing today; seven times in ten he pays back the rest over the next month.",
        effects: [],
      },
    ],
    aiDefault: "extend",
    timeoutTurns: 1,
    timeoutOption: "extend",
  },
  resolve: [
    {
      id: "claimedFresh",
      when: [{ decided: { optionId: "take" } }, { not: { fn: { name: "claims.hasClaim", args: { role: "shop" } } } }],
      effects: [
        { fact: "ClaimSet", claimId: "$mint:clm", subject: { kind: "business", id: "$shop" }, holderId: "$me", cause: { rule: "soldier.loan.bad.take" } },
        { fact: "SentimentDelta", townId: "$town", delta: -20, cause: { rule: "soldier.loan.bad.take" } },
      ],
      report: { newspaper: "A bakery changes hands following an unpaid debt.", sign: "You took the bakery for what it owed you.", visibility: "sign" },
    },
    {
      id: "alreadyClaimed",
      when: [{ decided: { optionId: "take" } }, { fn: { name: "claims.hasClaim", args: { role: "shop" } } }],
      effects: [{ fact: "SentimentDelta", townId: "$town", delta: -20, cause: { rule: "soldier.loan.bad.take" } }],
      report: { sign: "Someone already holds the bakery; you let it be known you tried.", visibility: "sign" },
    },
    {
      id: "stocked",
      when: [{ decided: { optionId: "stock" } }],
      effects: [
        { fact: "MoneyMint", to: "$me.account", amount: 60, money: "dirty", source: "loan.stock", cause: { rule: "soldier.loan.bad.stock" } },
        { fact: "FearDelta", businessId: "$shop", delta: 80, cause: { rule: "soldier.loan.bad.stock" } },
      ],
      report: { newspaper: "A creditor has seized the stock from a shop to settle an unpaid debt.", sign: "You stripped the bakery's shelves. He'll limp on.", visibility: "sign" },
    },
    {
      id: "extended",
      when: [{ decided: { optionId: "extend" } }],
      effects: [{ schedule: { templateId: "soldier.loan.extended", delay: 4, probability: 7000, bind: { me: "me" } } }],
      report: { sign: "You gave him another month to make it right.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "The bakery cannot pay. Its owner is asking what you want." },
  tags: ["soldier", "loanBook", "decision"],
};

/** Follow-up `soldier.loan.extended` (design 10 §8): schedule-only, no decision -- the shop pays back the rest
 * of the principal over the month it was given. */
const loanExtended: ProcessTemplate = {
  id: "soldier.loan.extended",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: { me: { entity: "character", pick: "first" } },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "paidBack",
      effects: [{ fact: "MoneyMint", to: "$me.account", amount: 25, money: "dirty", source: "loan.extended", cause: { rule: "soldier.loan.extended" } }],
      report: { sign: "The bakery paid back the rest of what it owed you.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { sign: "The bakery paid back the rest of what it owed you.", visibility: "sign" },
  tags: ["soldier", "loanBook", "followup"],
};

export const SITUATIONS_C_TEMPLATES: ProcessTemplate[] = [associateShort, associateLeaves, loanBad, loanExtended];

// Re-exported only so the file typechecks even if a narrow future test helper reads an option's `hint`/`effects`
// or an outcome's shape directly; not otherwise used here (soldier.ts's own file-final comment).
export type { DecisionOption, Outcome };
