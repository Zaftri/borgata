// Disputes (design 04 §5 FR-E; brainstorm E1, E2, E5; user stories 2 and 5; the associate's first dispute,
// docs/gameplay-walkthrough.md rank 1 "around week 6": "a collector from the neighboring family's crew takes
// money on your block ... your sponsor takes it to his crew chief ... you have seen a dispute").
//
// family.poach.attempt -> dispute.claim
//
// A rival family's collector works a business already on someone else's record; the shop's crew chief is
// the arbiter and answers with one of three approaches (concede, pay, hold), exactly the walkthrough's "three
// ways in: concede, pay, hold. Rank, prior claim and how much the crew chief likes each of you decide it"
// (rank 2's dispute passage) reused here for a cross-family claim collision (rank 1's version, seen from
// the outside). Holding and losing (the arbiter's Weight falls short of the rival crew chief's) is the
// failure state: a war crisis flag, per design 04 §5's "violating an outcome spawns war".
//
// Hotspot 5 (docs/event-storming-2026-09-25.md §3, 2026-09-25): "when the player is the party, the player
// decides." `dispute.claim` used to route the decision to `arbiter` alone, even when `holder` (the soldier's own
// stall) was the player -- so he read the arbiter's answer as news instead of giving it himself. Same fix as
// civil.ts's `family.intimidation.choose`: `decision.role: ["holder", "poacher", "arbiter"]` (a priority list,
// engine/scheduler.ts's `resolveDeciderRoleName`) reaches the player whenever he is either named party, falling
// back to the arbiter exactly as before. `holder` and `poacher` are already declared roles here (prebound by
// `family.poach.attempt`'s follow-up bind), so no new role is needed, unlike civil.ts's `mine`.
//
// Every option's own effects (`CONCEDE_EFFECTS`/`PAY_EFFECTS`/`hold`'s own `[]`) are unchanged and apply
// regardless of who decided: the outcome is the same real-world event (the shop changes hands, or does not)
// whether the holder chose it for himself or his arbiter chose it for him. What hotspot 5 adds is only in
// `resolve[]`'s `conceded`/`paidOff` outcomes, which gain player-voice report variants (the same mechanism as
// civil.ts: an outcome's `when` is the only place that ever sees who decided, so the neutral, arbiter-voiced
// original is guarded to fire only when neither `holder` nor `poacher` decided, alongside two new outcomes
// naming the actual decider). Unlike civil.ts, this template carries no extra evidence/`RecordDelta` for a
// player-made choice: the original brief's brief for this template calls for the same outcomes in the player's
// voice, not an added consequence.
import type { Effect, Outcome, Predicate, ProcessTemplate } from "@borgata/sim";

// Hotspot 5: whether the deciding role resolved to `holder` or to `poacher` (both are required, non-optional
// roles here, always bound by the time `dispute.claim` spawns -- unlike civil.ts's `mine`, no `bound` check
// is needed to tell "decided" from "not decided").
const HOLDER_DECIDED: Predicate = { playerControlled: { role: "holder", is: true } };
const POACHER_DECIDED: Predicate = { playerControlled: { role: "poacher", is: true } };
const NOT_PLAYER_DECIDED: Predicate = { all: [{ not: HOLDER_DECIDED }, { not: POACHER_DECIDED }] };

/**
 * 1. `family.poach.attempt`: a rival family's man collects on a business already claimed by someone else
 * (design 02 §9 one-holder-per-subject; `holder` is bound via the new `claimHolderOf` relation,
 * engine/roles.ts). One roll per business per turn; at most one active poach dispute per town at a time
 * (`exclusiveTag: "poach"`, scoped to the bound `town` role by engine/scheduler.ts `exclusiveTagBlocked`).
 */
const poachAttempt: ProcessTemplate = {
  id: "family.poach.attempt",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 8, per: "business" }, // 400 put eight poaching attempts a turn on a province (2026-09-23); 60 gave 245 disputes per 100 turns once towns tripled (2026-09-25)
  roles: {
    shop: { entity: "business", pick: "first" },
    town: { entity: "town", from: { role: "shop", relation: "townOf" }, pick: "first" },
    victimFamily: { entity: "family", from: { role: "town", relation: "familyOf" }, pick: "first" },
    // The character currently on record for the shop (design 02 §9); optional in the selector so the
    // precondition below (not the missing-role drop at bind time) is what disqualifies an unclaimed shop,
    // matching the brief's "preconditions: bound holder".
    holder: { entity: "character", from: { role: "shop", relation: "claimHolderOf" }, pick: "first", optional: true },
    poacher: {
      entity: "character",
      where: [
        { rank: { role: "$candidate", in: ["soldier", "associate"] } },
        { alive: { role: "$candidate" } },
        { status: { role: "$candidate", is: "free" } },
        { playerControlled: { role: "$candidate", is: false } },
        { sameFamily: { a: "$candidate", b: "victimFamily", is: false } },
      ],
      pick: "random",
    },
  },
  preconditions: [{ bound: { role: "holder", is: true } }],
  duration: 0,
  exclusiveTag: "poach",
  resolve: [
    {
      id: "poached",
      effects: [
        {
          fact: "MoneyMint",
          to: "$poacher.account",
          amount: 20,
          money: "dirty",
          source: "poachedCollection",
          cause: { rule: "family.poach.attempt.poached" },
        },
        {
          fact: "MemoryAdd",
          characterId: "$holder",
          memory: { tag: "poached", aboutId: "$poacher", weight: 30 },
          cause: { rule: "family.poach.attempt.poached" },
        },
      ],
      report: { sign: "A collector from another family took money on your block.", visibility: "sign" },
    },
  ],
  followUps: [{ templateId: "dispute.claim", delay: 1, bind: { shop: "shop", holder: "holder", poacher: "poacher" } }],
  report: { visibility: "sign", sign: "A collector from another family took money on your block." },
  tags: ["dispute", "poach", "claim"],
  codexId: "dispute-claim",
};

const CONCEDE_EFFECTS: Effect[] = [
  { fact: "ClaimTransfer", claimId: "$shop.claim", toHolderId: "$poacher", cause: { rule: "dispute.claim.concede" } },
  { fact: "LoyaltyDelta", characterId: "$holder", delta: -40, cause: { rule: "dispute.claim.concede" } },
  { fact: "MemoryAdd", characterId: "$holder", memory: { tag: "conceded", weight: 20 }, cause: { rule: "dispute.claim.concede" } },
];

const PAY_EFFECTS: Effect[] = [
  { fact: "MoneyMove", from: "$arbiter.account", to: "$poacher.account", amount: 100, money: "dirty", cause: { rule: "dispute.claim.pay" } },
  // Skipped when `poacherChief` never bound (the brief's "skip if unbound"): effects.ts's resolveRoleRef throws
  // UnboundRoleError for an unbound role, which resolveEffect turns into "drop this one effect" (design 04 §1).
  { fact: "FavorDelta", from: "$arbiter", to: "$poacherChief", delta: 50, cause: { rule: "dispute.claim.pay" } },
  { fact: "MemoryAdd", characterId: "$holder", memory: { tag: "paidOff", weight: 10 }, cause: { rule: "dispute.claim.pay" } },
];

const heldOutcomes: Outcome[] = [
  {
    id: "heldWon",
    when: [
      { decided: { optionId: "hold" } },
      { bound: { role: "poacherChief", is: true } },
      { cmpRoles: { a: "arbiter", pathA: "weight", b: "poacherChief", pathB: "weight", op: "gte" } },
    ],
    effects: [
      { fact: "FavorDelta", from: "$poacherChief", to: "$arbiter", delta: -60, cause: { rule: "dispute.claim.heldWon" } },
      { fact: "MemoryAdd", characterId: "$poacher", memory: { tag: "backedDown", weight: 20 }, cause: { rule: "dispute.claim.heldWon" } },
      { fact: "LoyaltyDelta", characterId: "$holder", delta: 30, cause: { rule: "dispute.claim.heldWon" } },
      // Design 13 §3: the poacher's family, having just been backed down, may refuse to let it drop -- a new
      // weighted refusal (35 percent, per district.ts's `dispute.district.refused`), escalating a crew-level
      // hold to a district sit-down. `dispute.district.refused` itself owns the standing hit; here it is just
      // scheduled with the two families and the shop's parties bound.
      {
        schedule: {
          templateId: "dispute.district.refused",
          delay: 1,
          probability: 2000, // refusal of the family ruling; 3500 sent 37 percent of sit-downs to war (2026-09-25)
          bind: { shop: "shop", holder: "holder", poacher: "poacher", holderFamily: "holderFamily", poacherFamily: "poacherFamily", refusingFamily: "poacherFamily" },
        },
      },
    ],
    report: { sign: "The rival crew backed down; the shop stays on our side.", visibility: "sign" },
  },
  {
    id: "heldLost",
    when: [
      { decided: { optionId: "hold" } },
      { bound: { role: "poacherChief", is: true } },
      { cmpRoles: { a: "arbiter", pathA: "weight", b: "poacherChief", pathB: "weight", op: "lt" } },
    ],
    effects: [
      { crisis: { flag: "war", ttl: 4, active: true } },
      { fact: "LoyaltyDelta", characterId: "$holder", delta: -20, cause: { rule: "dispute.claim.heldLost" } },
      { fact: "MemoryAdd", characterId: "$arbiter", memory: { tag: "humiliated", weight: 80 }, cause: { rule: "dispute.claim.heldLost" } },
      // Design 13 §3: the same 35 percent escalation as heldWon, from the other side -- here the holder's own
      // family, having just lost the shop, may refuse to accept it.
      {
        schedule: {
          templateId: "dispute.district.refused",
          delay: 1,
          probability: 2000, // refusal of the family ruling; 3500 sent 37 percent of sit-downs to war (2026-09-25)
          bind: { shop: "shop", holder: "holder", poacher: "poacher", holderFamily: "holderFamily", poacherFamily: "poacherFamily", refusingFamily: "holderFamily" },
        },
      },
    ],
    report: {
      newspaper: "Tension between two families over a shop; men are said to be sleeping away from home.",
      visibility: "known",
    },
  },
  {
    // The one edge the DSL's cmpRoles cannot itself resolve: "hold" with no rival crew chief to weigh against.
    // Narrowed to that case alone (2026-09-25, schema rule 2c): this outcome used to also stand in for
    // "concede"/"pay" via `not { decided: { optionId: "hold" } }`, but that guard is invisible to the schema's
    // (and the harness catalogue's) literal `"decided"` check -- neither recognized this as an answer to
    // "concede" or "pay" -- so those two options now get their own outcomes below instead, and this one is
    // narrowed to just the case it alone still covers, to avoid the two competing for the same weighted draw.
    id: "settled",
    when: [{ decided: { optionId: "hold" } }, { bound: { role: "poacherChief", is: false } }],
    effects: [],
    report: { newspaper: "A dispute over a shop in the quarter has been settled between two families.", visibility: "known" },
  },
  // Rule 2c: "concede" and "pay" already applied their real consequences on the `DecisionOption` itself
  // (`CONCEDE_EFFECTS`/`PAY_EFFECTS` above), but neither had an outcome of its own to report what happened.
  // Hotspot 5: three report variants each -- the original arbiter's-eye news line (guarded off when the
  // player himself decided) and two player-voice ones naming the actual decider.
  {
    id: "conceded",
    when: [{ decided: { optionId: "concede" } }, NOT_PLAYER_DECIDED],
    effects: [],
    report: { sign: "The shop was handed to the other family without a fight.", visibility: "sign" },
  },
  {
    id: "concededHolder",
    when: [{ decided: { optionId: "concede" } }, HOLDER_DECIDED],
    effects: [],
    report: { sign: "You hand the shop to the other family without a fight.", visibility: "sign" },
  },
  {
    id: "concededPoacher",
    when: [{ decided: { optionId: "concede" } }, POACHER_DECIDED],
    effects: [],
    report: { sign: "You back off; the shop stays with the man already on it.", visibility: "sign" },
  },
  {
    id: "paidOff",
    when: [{ decided: { optionId: "pay" } }, NOT_PLAYER_DECIDED],
    effects: [],
    report: { sign: "The rival was paid off, and the shop stays on our side for now.", visibility: "sign" },
  },
  {
    id: "paidOffHolder",
    when: [{ decided: { optionId: "pay" } }, HOLDER_DECIDED],
    effects: [],
    report: { sign: "You pay him off; the shop stays on your side for now.", visibility: "sign" },
  },
  {
    id: "paidOffPoacher",
    when: [{ decided: { optionId: "pay" } }, POACHER_DECIDED],
    effects: [],
    report: { sign: "You take the money and back off.", visibility: "sign" },
  },
];

/**
 * 2. `dispute.claim`: the shop's crew chief answers the poach (design 04 §5, user stories 2 and 5). `duration`
 * is 1, not 0, for the same reason as `family.intimidation.choose` (packages/content/src/templates/civil.ts's
 * file header): a duration-0 template resolves in the same call it spawns and never reaches the "due firings"
 * pass that offers a decision to a player-controlled decider.
 */
const claimDispute: ProcessTemplate = {
  id: "dispute.claim",
  version: 1,
  kind: "dispute",
  scope: "town",
  lane: "commission",
  roles: {
    // Prebound by family.poach.attempt's follow-up bind.
    shop: { entity: "business", pick: "first" },
    holder: { entity: "character", pick: "first" },
    poacher: { entity: "character", pick: "first" },
    arbiter: { entity: "character", from: { role: "shop", relation: "chiefOf" }, pick: "first", optional: true },
    // "poacherChief: from poacher crewOf then chiefOf" (the brief): no single relation does this in one step,
    // so an intermediate crew role bridges the two chained `from` relations (engine/roles.ts crewOf, chiefOf).
    poacherCrew: { entity: "crew", from: { role: "poacher", relation: "crewOf" }, pick: "first", optional: true },
    poacherChief: { entity: "character", from: { role: "poacherCrew", relation: "chiefOf" }, pick: "first", optional: true },
    // Design 13 §3 (disputes-to-the-district wave): the two families, needed only to `bind` them onward into
    // `dispute.district.refused` (district.ts) when a hold's loser refuses to accept it -- effects.ts's
    // "$role.family" suffix resolves a family id without a role, but a `schedule` effect's own `bind` map only
    // ever renames an *already-declared role* (schema.ts's referential check), so these two roles exist purely
    // to be that source.
    holderFamily: { entity: "family", from: { role: "holder", relation: "familyOf" }, pick: "first", optional: true },
    poacherFamily: { entity: "family", from: { role: "poacher", relation: "familyOf" }, pick: "first", optional: true },
  },
  preconditions: [],
  duration: 1,
  decision: {
    // Hotspot 5: a priority list (engine/scheduler.ts resolveDeciderRoleName) -- the player decides if he is
    // `holder` or `poacher`, else the arbiter decides exactly as before.
    role: ["holder", "poacher", "arbiter"],
    prompt: "A man from another family collected on our block. How do we answer?",
    // Order matters for the harness AI (ai-player.ts): `hold` is declared before `pay` so yesMan's own
    // pre-existing "pay" preference (added for an unrelated card, situations-b.ts) cannot pre-empt yesMan's new
    // "hold" preference -- makeAiPlayer picks the first offered option (in this array's order) that matches any
    // preference, not the first matching preference.
    options: [
      {
        id: "concede",
        label: "Concede the shop",
        // Neutral hints (hotspot 5): readable whether the arbiter or a named party himself is deciding.
        hint: "The shop goes to the other family's man outright, no fight. It costs the holder's own loyalty and marks him as someone who folded.",
        effects: CONCEDE_EFFECTS,
      },
      {
        id: "hold",
        label: "Hold the line",
        hint: "Refuse to give ground. Whichever side outweighs the other backs down, and loses favor for it; losing can start a war and leaves the arbiter humiliated.",
        effects: [],
      },
      {
        id: "pay",
        label: "Pay him off",
        hint: "Buy him off: 100 kL out of the arbiter's own account, favor earned with his crew chief, and the holder remembers being bought out rather than defended.",
        effects: PAY_EFFECTS,
      },
    ],
    aiDefault: "hold",
    timeoutTurns: 2,
    timeoutOption: "hold",
  },
  resolve: heldOutcomes,
  followUps: [],
  // Neutral (hotspot 5): the card is shown before the decider is known.
  report: { visibility: "known", sponsor: "A rival collector has been taking money on your block. A decision is needed." },
  tags: ["dispute", "claim", "decision"],
  codexId: "dispute-claim",
};

export const DISPUTE_TEMPLATES: ProcessTemplate[] = [poachAttempt, claimDispute];
