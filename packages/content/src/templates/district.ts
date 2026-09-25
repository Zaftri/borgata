// The two sit-downs (design 13 §3, disputes-to-the-district wave): a crew-level quarrel between two of one
// family's own men over a shop (`dispute.stall.crew`), and the district-level chain a crew-level hold escalates
// into when its loser refuses to accept it (`dispute.district.refused` -> `dispute.district.sitdown` ->,
// sometimes, `dispute.district.refusedRuling` -> `war.declare`, the last owned by war.ts, referenced by id).
//
// Two relations this wave adds to engine/roles.ts (and the schema's FromRelationSchema, packages/content/src/
// schema.ts) because no existing relation reaches them: `districtHeadOf` (family -> the district head family of
// its district, via District.districtHeadFamilyId) and `headOf` (family -> its head character, via
// Family.headId). Both are unbound rather than throwing when the family has no district, the district has no
// head, or the family has no head, the same contract as claimHolderOf/ownerOf/warWithOf.
//
// DSL gaps (see also disputes.ts's own header for the first one, `dispute.claim`'s prior-claim problem):
//
// 1. `dispute.stall.crew`'s "point to prior claim" option was specified to turn on the claim's age (`since`),
//    but a claim is not a role-bindable entity (engine/types.ts EntityKind has no "claim" kind) and `cmpRoles`/
//    `cmp` only read paths off a *bound role's* record. `relationships.favor` (chief's favor toward holder vs
//    rival) is not reachable either: the favor ledger (`world.favors`) is a top-level `Record<string, SignedMeter>`
//    keyed "from|to", not a field on Character, so no `cmp`/`cmpRoles` path expression can reach it (only a
//    registered `fn`, like `relationships.standing`, could -- and none exists for favor; adding one is outside
//    this wave's owned files, engine/predicates.ts). Resolved per the brief's own fallback chain: weighted
//    outcomes 60/40 favoring the holder.
//
// 2. `dispute.district.sitdown`'s options describe what "the decider" brings and who pays/is credited for it,
//    but the DSL has no "$decider" token -- only fixed role references ($holder, $poacher, ...). Effects that
//    cost money or add evidence (gift's `MoneyDestroy`, witness's caught-lie `EvidenceAdd`) are written against
//    `$holder` fixed, exactly the precedent `dispute.claim`'s own `PAY_EFFECTS` sets (paid from `$arbiter`
//    regardless of who actually decided). This is correct for this wave's own tests (the player always decides
//    as `holder`) but would misattribute cost/evidence in a game where `poacher` is the player deciding instead
//    -- a known gap, not fixed here.
//
// 3. The ruling (stallStays/stallGoes/split) is gated on `relationships.standing` (friendly >= 0 / hostile < 0,
//    per the brief) and on whether a refusal escalates further is gated on `cmpRoles` comparing the two heads'
//    Weight (high >= / low <), per the brief's "probability 2500 when ... at least ... else 2000 flat". Both
//    gates are static `when` predicates, not a single continuously-scaled weight (`Outcome.weight` is a fixed
//    content-time number; `schedule.probability` likewise), so each option's ruling is four outcomes (two
//    standing bands x two weight bands) plus one flat-odds `...Split`, and `witness` -- whose "the lie is
//    caught" branch (30 percent, per the brief) does not depend on standing at all -- is seven bespoke outcomes
//    rather than reusing the generator. This is more outcomes than a hand-authored template would usually carry,
//    generated below by `standardOptionOutcomes` to keep the duplication mechanical rather than copy-pasted.
//
// 4. `war.declare` (war.ts, the parallel agent's file) landed with roles `aggressor`/`defender`, both always
//    prebound by whichever schedule effect fires it (its own file header) -- `dispute.district.refusedRuling`
//    below binds `aggressor: refusingFamily, defender: otherFamily`. war.ts's own `war.declare` additionally
//    guards against a double-declaration via its `warWithOf` relation (its own addition), which this file does
//    not otherwise touch.
import type { Effect, Outcome, Predicate, ProcessTemplate, ReportSpec } from "@borgata/sim";

// ===================================================================================================================
// 1. `dispute.stall.crew`: a quarrel between two soldiers of one crew over a shop (design 13 §3 story "soldier").
// ===================================================================================================================

const CREW_HOLDER_DECIDED: Predicate = { playerControlled: { role: "holder", is: true } };

const stallCrewQuarrel: ProcessTemplate = {
  id: "dispute.stall.crew",
  version: 1,
  kind: "dispute",
  scope: "town",
  lane: "families",
  // Weight 150 (per ten thousand) per business per turn, cooldownTurns 12 (design 13 §3's brief): a stall
  // quarrel is common enough to see within a career but not weekly on the same shop.
  spawn: { weight: 8, per: "business", cooldownTurns: 12 }, // 150 gave six quarrels a turn across a province (careers 2026-09-25)
  roles: {
    shop: { entity: "business", pick: "first" },
    holder: { entity: "character", from: { role: "shop", relation: "claimHolderOf" }, pick: "first", optional: true },
    crew: { entity: "crew", from: { role: "holder", relation: "crewOf" }, pick: "first", optional: true },
    // "another soldier of the same crew" (the brief): bound via crewOf(holder) then membersOf(crew), excluding
    // holder himself (sameEntity false), same two-step bridge dispute.claim's poacherChief uses for crewOf/chiefOf.
    rival: {
      entity: "character",
      from: { role: "crew", relation: "membersOf" },
      where: [
        { sameEntity: { a: "$candidate", b: "holder", is: false } },
        { alive: { role: "$candidate" } },
        { status: { role: "$candidate", is: "free" } },
        { rank: { role: "$candidate", in: ["soldier"] } },
      ],
      pick: "random",
    },
    chief: { entity: "character", from: { role: "crew", relation: "chiefOf" }, pick: "first", optional: true },
  },
  preconditions: [{ bound: { role: "holder", is: true } }],
  duration: 1, // not 0: the same reason as dispute.claim (disputes.ts's file header) -- a decision needs a turn to reach the player.
  decision: {
    role: ["holder", "rival", "chief"],
    prompt: "Two of our own men are pulling at the same stall. The chief wants it settled before it festers.",
    options: [
      {
        id: "priorClaim",
        label: "Point to who was there first",
        hint: "No cost, but nothing of your own to offer either -- the chief settles it by how he already reads the two of you.",
        effects: [],
      },
      {
        id: "offer",
        label: "Cut him in",
        hint: "Give him a year's share of the take to walk away. The shop stays yours; he remembers being bought in, not out.",
        effects: [
          { fact: "FavorDelta", from: "$rival", to: "$holder", delta: 30, cause: { rule: "dispute.stall.crew.offer" } },
          { fact: "MemoryAdd", characterId: "$rival", memory: { tag: "cutIn", weight: 20 }, cause: { rule: "dispute.stall.crew.offer" } },
        ],
      },
      {
        id: "favor",
        label: "Call in the chief's own favor",
        hint: "The shop stays with you outright, but it costs the chief's favor toward you -- he won't forget being asked.",
        effects: [{ fact: "FavorDelta", from: "$chief", to: "$holder", delta: -20, cause: { rule: "dispute.stall.crew.favor" } }],
      },
      {
        id: "stepBack",
        label: "Step back",
        hint: "Let him have the stall. You lose the shop, but the chief remembers you kept the peace.",
        effects: [
          { fact: "ClaimTransfer", claimId: "$shop.claim", toHolderId: "$rival", cause: { rule: "dispute.stall.crew.stepBack" } },
          { fact: "FavorDelta", from: "$chief", to: "$holder", delta: 10, cause: { rule: "dispute.stall.crew.stepBack" } },
        ],
      },
    ],
    aiDefault: "priorClaim",
    timeoutTurns: 2,
    timeoutOption: "priorClaim",
  },
  resolve: [
    // priorClaim: DSL gap 1 (file header) -- weighted 60/40 favoring the holder, the brief's own fallback.
    {
      id: "priorClaimHolderWins",
      weight: 6,
      when: [{ decided: { optionId: "priorClaim" } }, CREW_HOLDER_DECIDED],
      effects: [],
      report: { sign: "The chief reads it your way: the stall stays with you.", visibility: "sign" },
    },
    {
      id: "priorClaimHolderWinsNews",
      weight: 6,
      when: [{ decided: { optionId: "priorClaim" } }, { not: CREW_HOLDER_DECIDED }],
      effects: [],
      report: { newspaper: "The chief settles a stall quarrel between two of his own men; the shop stays as it was.", visibility: "known" },
    },
    {
      id: "priorClaimRivalWins",
      weight: 4,
      when: [{ decided: { optionId: "priorClaim" } }, CREW_HOLDER_DECIDED],
      effects: [{ fact: "ClaimTransfer", claimId: "$shop.claim", toHolderId: "$rival", cause: { rule: "dispute.stall.crew.priorClaim" } }],
      report: { sign: "The chief reads it the other way: the stall goes to him.", visibility: "sign" },
    },
    {
      id: "priorClaimRivalWinsNews",
      weight: 4,
      when: [{ decided: { optionId: "priorClaim" } }, { not: CREW_HOLDER_DECIDED }],
      effects: [{ fact: "ClaimTransfer", claimId: "$shop.claim", toHolderId: "$rival", cause: { rule: "dispute.stall.crew.priorClaim" } }],
      report: { newspaper: "The chief settles a stall quarrel between two of his own men; the shop changes hands.", visibility: "known" },
    },
    {
      id: "offerSettled",
      when: [{ decided: { optionId: "offer" } }, CREW_HOLDER_DECIDED],
      effects: [],
      report: { sign: "You cut him in on the stall's take; he backs off.", visibility: "sign" },
    },
    {
      id: "offerSettledNews",
      when: [{ decided: { optionId: "offer" } }, { not: CREW_HOLDER_DECIDED }],
      effects: [],
      report: { newspaper: "Two of one crew's men settle a stall quarrel with a cut of the take.", visibility: "known" },
    },
    {
      id: "favorSettled",
      when: [{ decided: { optionId: "favor" } }, CREW_HOLDER_DECIDED],
      effects: [],
      report: { sign: "The chief backs you on the strength of what he owes you.", visibility: "sign" },
    },
    {
      id: "favorSettledNews",
      when: [{ decided: { optionId: "favor" } }, { not: CREW_HOLDER_DECIDED }],
      effects: [],
      report: { newspaper: "The chief settles a stall quarrel by calling in his own standing with one of his men.", visibility: "known" },
    },
    {
      id: "stepBackSettled",
      when: [{ decided: { optionId: "stepBack" } }, CREW_HOLDER_DECIDED],
      effects: [],
      report: { sign: "You let it go; the chief remembers you kept the peace.", visibility: "sign" },
    },
    {
      id: "stepBackSettledNews",
      when: [{ decided: { optionId: "stepBack" } }, { not: CREW_HOLDER_DECIDED }],
      effects: [],
      report: { newspaper: "One man steps back from a stall quarrel rather than fight it out.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Two of our own are pulling at the same stall. The chief wants it settled." },
  tags: ["dispute", "crew", "decision"],
  codexId: "dispute-stall-crew",
};

// ===================================================================================================================
// 2. `dispute.district.refused`: scheduled (35 percent) from `dispute.claim`'s heldWon/heldLost (disputes.ts) when
//    the crew-level hold's loser will not accept it. StandingDelta with the district head family, then escalates
//    to the sit-down.
// ===================================================================================================================

const districtRefused: ProcessTemplate = {
  id: "dispute.district.refused",
  version: 1,
  kind: "dispute",
  scope: "district",
  lane: "commission",
  roles: {
    // All prebound by disputes.ts's heldWon/heldLost schedule effects (poachAttempt -> dispute.claim's own
    // pattern: no `spawn`, so this template is only ever created with every role already bound).
    shop: { entity: "business", pick: "first" },
    holder: { entity: "character", pick: "first" },
    poacher: { entity: "character", pick: "first" },
    holderFamily: { entity: "family", pick: "first" },
    poacherFamily: { entity: "family", pick: "first" },
    refusingFamily: { entity: "family", pick: "first" },
    // The new relation (engine/roles.ts, this wave): the district head family of the shop's own family's
    // district. Optional: a world with no districts assigned (the starter world, unless a test sets one up)
    // simply drops the StandingDelta below rather than binding to the wrong family.
    arbiterFamily: { entity: "family", from: { role: "holderFamily", relation: "districtHeadOf" }, pick: "first", optional: true },
  },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "refused",
      effects: [
        { fact: "StandingDelta", familyA: "$refusingFamily", familyB: "$arbiterFamily", delta: -150, cause: { rule: "dispute.district.refused" } },
      ],
      report: {
        newspaper: "A family refuses to let a crew-level ruling over a shop stand; the matter goes before the district head himself.",
        visibility: "known",
      },
    },
  ],
  followUps: [
    {
      templateId: "dispute.district.sitdown",
      delay: 1,
      bind: { shop: "shop", holder: "holder", poacher: "poacher", holderFamily: "holderFamily", poacherFamily: "poacherFamily", arbiterFamily: "arbiterFamily" },
    },
  ],
  report: { visibility: "known", newspaper: "A family refuses to let a crew-level ruling over a shop stand." },
  tags: ["dispute", "district"],
  codexId: "dispute-district-sitdown",
};

// ===================================================================================================================
// 3. `dispute.district.sitdown`: the district head hears both sides (design 13 §3 story "soldier, week n").
// ===================================================================================================================

type Band = "high" | "low";
type Ruling = "stallStays" | "stallGoes";
type FamilyRole = "holderFamily" | "poacherFamily";
type HeadRole = "holderHead" | "poacherHead";

const familyToHead: Record<FamilyRole, HeadRole> = { holderFamily: "holderHead", poacherFamily: "poacherHead" };

/** DSL gap 3 (file header): the refusal-escalation probability (2500 high / 2000 low, the brief's own numbers)
 * gated on whether the *refusing* family's head's Weight is at least the *other* family's head's Weight. */
function weightBandWhen(refusing: FamilyRole, band: Band): Predicate {
  const other: FamilyRole = refusing === "holderFamily" ? "poacherFamily" : "holderFamily";
  return { cmpRoles: { a: familyToHead[refusing], pathA: "weight", b: familyToHead[other], pathB: "weight", op: band === "high" ? "gte" : "lt" } };
}

/** DSL gap 3: the ruling itself gated on standing between the holder's family and the arbiter (district head)
 * family -- "friendly" (>= 0) favors the holder (stallStays), "hostile" (< 0) favors the poacher (stallGoes). */
function standingWhen(band: "friendly" | "hostile"): Predicate {
  return {
    fn: {
      name: "relationships.standing",
      args: { a: "holderFamily", b: "arbiterFamily", op: band === "friendly" ? "gte" : "lte", value: band === "friendly" ? 0 : -1 },
    },
  };
}

function refusalScheduleEffect(refusing: FamilyRole, band: Band): Effect {
  const other: FamilyRole = refusing === "holderFamily" ? "poacherFamily" : "holderFamily";
  return {
    schedule: {
      templateId: "dispute.district.refusedRuling",
      delay: 2,
      probability: band === "high" ? 2500 : 2000,
      bind: { shop: "shop", holder: "holder", poacher: "poacher", refusingFamily: refusing, otherFamily: other, districtFamily: "arbiterFamily" },
    },
  };
}

function rulingBaseEffects(ruling: Ruling, rule: string): Effect[] {
  const claimEffect: Effect[] =
    ruling === "stallGoes" ? [{ fact: "ClaimTransfer", claimId: "$shop.claim", toHolderId: "$poacher", cause: { rule } }] : [];
  return [
    ...claimEffect,
    { fact: "StandingDelta", familyA: "$holderFamily", familyB: "$poacherFamily", delta: ruling === "stallGoes" ? -60 : 60, cause: { rule } },
    // DSL gap 2 (file header): "decider" fixed to $holder.
    { fact: "FavorDelta", from: "$arbiterHead", to: "$holder", delta: 20, cause: { rule } },
  ];
}

function rulingReport(ruling: Ruling): ReportSpec {
  const line =
    ruling === "stallStays"
      ? "The district head rules the stall stays with {holder.name}."
      : "The district head rules the stall goes to {poacher.name}.";
  return { newspaper: line, sponsor: line, visibility: "known" };
}

const SPLIT_REPORT: ReportSpec = {
  newspaper: "The district head splits the stall's take between the two families.",
  sponsor: "The district head splits the take between you rather than rule outright.",
  visibility: "known",
};

/** design 13 §3: "split (keep the claim, MemoryAdd both 'splitStall'; note the gap that the chain does not read
 * it)" -- no template anywhere reads the "splitStall" memory tag; it is a marker for a later wave, same as the
 * brief's own note. No claim transfer: the shop stays exactly as it was. */
function splitEffects(rule: string): Effect[] {
  return [
    { fact: "MemoryAdd", characterId: "$holder", memory: { tag: "splitStall", weight: 20 }, cause: { rule } },
    { fact: "MemoryAdd", characterId: "$poacher", memory: { tag: "splitStall", weight: 20 }, cause: { rule } },
    { fact: "StandingDelta", familyA: "$holderFamily", familyB: "$poacherFamily", delta: 20, cause: { rule } },
    { fact: "FavorDelta", from: "$arbiterHead", to: "$holder", delta: 10, cause: { rule } },
  ];
}

/** record/gift/nothing: five outcomes each (two standing bands x two weight bands for the ruling that could be
 * refused, plus one flat-odds split) -- see DSL gap 3. `weight: 8` for each ruling variant against `weight: 2`
 * for split gives an 80/20 ruling-vs-compromise split within whichever standing band actually matches. */
function standardOptionOutcomes(optionId: string): Outcome[] {
  const rule = `dispute.district.sitdown.${optionId}`;
  const bands: Band[] = ["high", "low"];
  const out: Outcome[] = [];
  for (const band of bands) {
    out.push({
      id: `${optionId}StallStays${band === "high" ? "High" : "Low"}`,
      weight: 8,
      when: [{ decided: { optionId } }, standingWhen("friendly"), weightBandWhen("poacherFamily", band)],
      effects: [...rulingBaseEffects("stallStays", rule), refusalScheduleEffect("poacherFamily", band)],
      report: rulingReport("stallStays"),
    });
    out.push({
      id: `${optionId}StallGoes${band === "high" ? "High" : "Low"}`,
      weight: 8,
      when: [{ decided: { optionId } }, standingWhen("hostile"), weightBandWhen("holderFamily", band)],
      effects: [...rulingBaseEffects("stallGoes", rule), refusalScheduleEffect("holderFamily", band)],
      report: rulingReport("stallGoes"),
    });
  }
  out.push({
    id: `${optionId}Split`,
    weight: 2,
    when: [{ decided: { optionId } }],
    effects: splitEffects(rule),
    report: SPLIT_REPORT,
  });
  return out;
}

const WITNESS_RULE = "dispute.district.sitdown.witness";

/** witness: bespoke, not `standardOptionOutcomes` (DSL gap 3) -- "the lie is found" (30 percent, the brief's own
 * number) does not depend on standing at all, so it is its own weight (3) competing against the standing-gated
 * clean branch (7) and the flat split (1): roughly 3/11, 7/11, 1/11 within whichever standing band applies. */
const witnessOutcomes: Outcome[] = (["high", "low"] as const).flatMap((band) => [
  {
    id: `witnessCaught${band === "high" ? "High" : "Low"}`,
    weight: 3,
    when: [{ decided: { optionId: "witness" } }, weightBandWhen("holderFamily", band)],
    effects: [
      // DSL gap 2: EvidenceAdd targets $holder fixed (the "decider").
      { fact: "EvidenceAdd", characterId: "$holder", item: { crimeRef: "$instance", weight: 20, source: "witness" }, cause: { rule: WITNESS_RULE } },
      ...rulingBaseEffects("stallGoes", WITNESS_RULE),
      refusalScheduleEffect("holderFamily", band),
    ],
    report: {
      newspaper: "A false witness story falls apart before the district head; the ruling goes against {holder.name}.",
      sponsor: "Your witness story falls apart. The district head rules against you.",
      visibility: "known",
    },
  },
  {
    id: `witnessCleanFriendly${band === "high" ? "High" : "Low"}`,
    weight: 7,
    when: [{ decided: { optionId: "witness" } }, standingWhen("friendly"), weightBandWhen("poacherFamily", band)],
    effects: [...rulingBaseEffects("stallStays", WITNESS_RULE), refusalScheduleEffect("poacherFamily", band)],
    report: rulingReport("stallStays"),
  },
  {
    id: `witnessCleanHostile${band === "high" ? "High" : "Low"}`,
    weight: 7,
    when: [{ decided: { optionId: "witness" } }, standingWhen("hostile"), weightBandWhen("holderFamily", band)],
    effects: [...rulingBaseEffects("stallGoes", WITNESS_RULE), refusalScheduleEffect("holderFamily", band)],
    report: rulingReport("stallGoes"),
  },
]);
witnessOutcomes.push({
  id: "witnessSplit",
  weight: 1,
  when: [{ decided: { optionId: "witness" } }],
  effects: splitEffects(WITNESS_RULE),
  report: SPLIT_REPORT,
});

const districtSitdown: ProcessTemplate = {
  id: "dispute.district.sitdown",
  version: 1,
  kind: "dispute",
  scope: "district",
  lane: "commission",
  roles: {
    // Prebound by dispute.district.refused's followUp (the only way this template is ever created; no `spawn`).
    shop: { entity: "business", pick: "first" },
    holder: { entity: "character", pick: "first" },
    poacher: { entity: "character", pick: "first" },
    holderFamily: { entity: "family", pick: "first" },
    poacherFamily: { entity: "family", pick: "first" },
    arbiterFamily: { entity: "family", pick: "first" },
    // headOf (this wave): the district head's own head-of-family character, and the two disputing families'
    // heads, needed only for FavorDelta/cmpRoles (DSL gap 3) below.
    arbiterHead: { entity: "character", from: { role: "arbiterFamily", relation: "headOf" }, pick: "first", optional: true },
    holderHead: { entity: "character", from: { role: "holderFamily", relation: "headOf" }, pick: "first", optional: true },
    poacherHead: { entity: "character", from: { role: "poacherFamily", relation: "headOf" }, pick: "first", optional: true },
  },
  preconditions: [],
  duration: 1,
  decision: {
    role: ["holder", "poacher", "arbiterHead"],
    prompt: "The district head will hear both sides before he rules on the stall.",
    options: [
      {
        id: "record",
        label: "Show the claim record",
        hint: "Costs nothing, but proves nothing the district head didn't already know -- the ruling turns on how he already reads your two families.",
        effects: [],
      },
      {
        id: "witness",
        label: "Bring a witness",
        hint: "Say the other man came armed. It can tip the ruling your way, but there's a real chance the district head catches the lie -- costing you standing and marking you with evidence.",
        effects: [],
      },
      {
        id: "gift",
        label: "Send a gift",
        hint: "60 kL from your own account, straight to the district head's family. Buys goodwill with the district, not proof of anything.",
        effects: [
          { fact: "MoneyDestroy", from: "$holder.account", amount: 60, money: "dirty", sink: "gift", cause: { rule: "dispute.district.sitdown.gift" } },
          { fact: "StandingDelta", familyA: "$holderFamily", familyB: "$arbiterFamily", delta: 40, cause: { rule: "dispute.district.sitdown.gift" } },
        ],
      },
      {
        id: "nothing",
        label: "Bring nothing",
        hint: "Say nothing and let the district head read the two of you on his own.",
        effects: [],
      },
    ],
    aiDefault: "record",
    timeoutTurns: 2,
    timeoutOption: "record",
  },
  resolve: [...standardOptionOutcomes("record"), ...witnessOutcomes, ...standardOptionOutcomes("gift"), ...standardOptionOutcomes("nothing")],
  followUps: [],
  report: { visibility: "known", sponsor: "The district head has called both families before him to settle a stall." },
  tags: ["dispute", "district", "decision"],
  codexId: "dispute-district-sitdown",
};

// ===================================================================================================================
// 4. `dispute.district.refusedRuling`: when the losing family refuses the sit-down's own ruling (scheduled, at a
//    weight-shaped probability, from `dispute.district.sitdown`'s own ruling outcomes above). StandingDelta with
//    the district, then `war.declare` (war.ts, referenced by id -- DSL gap 4).
// ===================================================================================================================

const districtRefusedRuling: ProcessTemplate = {
  id: "dispute.district.refusedRuling",
  version: 1,
  kind: "dispute",
  scope: "district",
  lane: "commission",
  roles: {
    // Prebound by dispute.district.sitdown's own ruling outcomes above (refusalScheduleEffect); no `spawn`.
    shop: { entity: "business", pick: "first" },
    holder: { entity: "character", pick: "first" },
    poacher: { entity: "character", pick: "first" },
    refusingFamily: { entity: "family", pick: "first" },
    otherFamily: { entity: "family", pick: "first" },
    districtFamily: { entity: "family", pick: "first" },
  },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "refusedRuling",
      effects: [
        { fact: "StandingDelta", familyA: "$refusingFamily", familyB: "$districtFamily", delta: -200, cause: { rule: "dispute.district.refusedRuling" } },
        // war.ts (the parallel agent's file, landed after this was first drafted): war.declare's roles are
        // `aggressor`/`defender`, both always prebound by this very schedule effect (war.ts's own file header).
        { schedule: { templateId: "war.declare", delay: 1, bind: { aggressor: "refusingFamily", defender: "otherFamily" } } },
      ],
      report: {
        newspaper: "The district's own ruling is thrown back in its face; the two families are said to be arming.",
        visibility: "known",
      },
    },
  ],
  followUps: [],
  report: { visibility: "known", newspaper: "A district ruling is refused outright." },
  tags: ["dispute", "district", "war"],
  codexId: "dispute-district-sitdown",
};

export const DISTRICT_TEMPLATES: ProcessTemplate[] = [stallCrewQuarrel, districtRefused, districtSitdown, districtRefusedRuling];
