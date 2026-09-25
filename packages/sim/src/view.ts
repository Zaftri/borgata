// The player's view of the world (design 01 §7, design 07 §5): a pure projection of (world, log, content) through
// fog-of-war rules. The interface renders this and nothing else, so it can hold no game logic (build plan S8).
// Values the player owns are exact; his own men are estimates with an error band; rivals are rumors; the state is signs.

import { computeProposta } from "./systems/progression.js";
import { placesForPlayer, type PlaceOption } from "./scene.js";
import { clamp, roundHalfAway, type CharacterId } from "@borgata/shared";
import type { Content } from "./content-types.js";
import { projectReport, type TurnLog, type Report } from "./log.js";
import { claimOnSubject, claimsHeldBy } from "./reducers/claims.js";
import { initialStreamState, Stream } from "./rng.js";
import type { PlayerAction } from "./step.js";
import type { UiLayer } from "./facts.js";
import { favorKey, standingKey, LIFESTYLE_COST, type AttentionBand, type Business, type Character, type Claim, type Crew, type Rank, type CharStatus, type ToolId, type Town, type World } from "./world.js";
import { resolveDeciderRoleName } from "./engine/scheduler.js";

export type Estimate = { low: number; high: number };          // an integer band on a 0..1000 meter
export type Precision = "exact" | "estimate" | "rumor" | "hidden";

/** Design 09 §5's shopkeeper traits (docs/event-storming-2026-09-25.md §3 hotspot 1): the only ones
 *  `BusinessView.ownerTrait` ever reports, so a stray unrelated trait on an owner character never leaks. */
const SHOPKEEPER_TRAITS = ["reporter", "proud", "latePayer"] as const;

export type PersonView = {
  id: string;
  name: string;
  rank: Rank;
  status: CharStatus;
  relation: "you" | "sponsor" | "superior" | "subordinate" | "crewmate" | "family" | "rival" | "civilian";
  loyalty: { precision: Precision; value?: number; band?: Estimate };
  exposure: { precision: Precision; value?: number; band?: Estimate };
  weight: { precision: Precision; value?: number; band?: Estimate };
  detainedUntilTurn: number | null;
  notes: string[];                                              // rumors and memories the player may know
};

export type BusinessView = {
  id: string;
  blockId: string;
  type: string;
  size: number;
  holderName: string | null;
  holderId: string | null;
  /** The shop's civilian owner (docs/event-storming-2026-09-25.md §3 hotspot 1): exact only for the player's
   *  own crew's shops (design 07 §5's "exact for what you own"); null elsewhere, even when the business has an
   *  owner, and always null when it has none (most shops off the player's sponsor's crew's blocks, design 09
   *  §5: owners are generated lazily there, "later"). */
  ownerName: string | null;
  /** One of "reporter" | "proud" | "latePayer", or null (no trait, or the owner is not shown, per `ownerName`). */
  ownerTrait: string | null;
  compliance: { precision: Precision; value?: number; band?: Estimate };
  fear: { precision: Precision; value?: number; band?: Estimate };
  refusalStage: number | null;                                  // known only for businesses the player's crew works
  claimable: boolean;                                           // the player may claim it this turn (validated again by the core)
};

export type BlockView = { id: string; crewChiefName: string | null; yours: boolean; businesses: BusinessView[] };
export type TownView = { id: string; name: string; archetype: string; familyName: string | null; yours: boolean; blocks: BlockView[]; sentimentSign: string | null; heatSign: string | null };

export type DecisionView = {
  instanceId: string; templateId: string; prompt: string; options: Array<{ id: string; label: string; hint?: string }>; pendingSince: number; timeoutTurns: number;
  /** Set when this card follows directly from a choice the player made this turn (interactive turn, 2026-09-25): the week
   *  modal shows it under "E adesso (and now)" with the choice it came from. */
  followUp?: { prompt: string; optionLabel: string };
};
/** `kind`: "decision" when the instance awaits the player; "news" when it is another man's business the player only hears about. */
export type RequestView = { id: string; text: string; turn: number; instanceId: string | null; kind: "decision" | "news" };

export type ActionSpec =
  | { kind: "setShare"; subordinates: Array<{ id: string; name: string; current: { fixedPerTurn: number; percent: number } | null }> }
  | { kind: "claimBusiness"; businesses: Array<{ id: string; label: string }> }
  | { kind: "releaseClaim"; claims: Array<{ claimId: string; label: string }> }
  | { kind: "askPermission"; options: Array<"makeAssociate" | "openBook"> }
  | { kind: "setLifestyle"; current: "modest" | "ordinary" | "lavish"; costs: { modest: number; ordinary: number; lavish: number } }
  /** The loan book (design 09 §6): businesses in the family's towns the player may lend to, and the cash available. */
  | { kind: "lend"; businesses: Array<{ id: string; label: string }>; maxPrincipal: number };

/** Il libro (the book): what is under the player and what it brought last turn (owner request, 2026-09-24).
 *  Exact figures: these are the player's own men, stalls and loans (design 07 §5, "exact for what you own"). */
export type BookView = {
  men: Array<{ id: string; name: string; rank: Rank; status: CharStatus; share: { fixedPerTurn: number; percent: number } | null; paidLastTurn: number; loyalty: number }>;
  stalls: Array<{ businessId: string; label: string; collectorName: string; ownerName: string | null; lastTurn: "paid" | "missed" | "quiet"; amount: number; compliance: number; refusalStage: number }>;
  loans: Array<{ id: string; borrowerLabel: string; principal: number; points: number; weeklyInterest: number; weeksLate: number; weeksToDefault: number; lastTurn: "paid" | "missed" | "quiet" }>;
  debts: Array<{ lenderName: string; principal: number; points: number; paidLastTurn: number }>;
  /** I miei doveri (my duties), design 12: open obligations with what they cost, when they fall due, and their record. */
  duties: Array<{ id: string; kind: string; beneficiaryName: string; amount: number; dueIn: number; recurring: boolean; met: number; missed: number; lastResult: "met" | "missed" | null }>;
};

export type PlayerView = {
  /** Il libro (the book): the player's men, stalls, loans and debts with last turn's figures. */
  book: BookView;
  turn: number;
  calendar: { year: number; week: number };
  turnLength: number;
  crises: string[];
  you: {
    id: string; name: string; rank: Rank; weight: number; dirty: number; clean: number; loyalty: number; sponsorName: string | null; familyName: string | null; townName: string | null; layers: UiLayer[];
    /** False once the player is dead: the run is over (first-ranks §3). */
    alive: boolean;
    /** Design 12: visible wealth. */
    lifestyle: "modest" | "ordinary" | "lavish";
    /** True once the sponsor dropped the player and nobody took them on (memory tag `dropped`, no sponsor): the run is over. */
    dropped: boolean;
  };
  report: Report;
  requests: RequestView[];
  decisions: DecisionView[];
  actions: ActionSpec[];                                        // what the player may do this turn, by rank and layer
  people: PersonView[];                                         // family first, then rivals the player has heard of
  towns: TownView[];                                            // the player's town in full; neighbors as rumors
  /** Design 13: the district as the player knows it: its families, the district head, standing as bands. */
  district: { name: string; headFamilyName: string | null; families: Array<{ id: string; name: string; yours: boolean; state: string; standing: Estimate | null; atWar: boolean }> } | null;
  stateSigns: string[];                                         // "what the state may know", signs only (design 07 §5, I3)
  attentionBandName: string | null;                             // shown once the "territory" layer is unlocked
  /** Design 12: the family's health and its common fund. The treasury is exact for the head, a band below. */
  family: { name: string; state: string; treasury: { precision: Precision; value?: number; band?: Estimate } } | null;
  /** La proposta (design 09 §3): how close the associate is to being made, as a band and three sign sentences. Null once made. */
  proposta: { band: 0 | 1 | 2 | 3; label: string; signs: string[] } | null;
  /** The sponsor's mood toward the player as a sentence, from favor and personality (design 09 §3). */
  sponsorMood: string | null;
  /** The newspaper's lines this turn (design 07 §5): outcome texts on the `newspaper` channel, public news. */
  newspaper: string[];
  /** Places the animated turn may show (design 07 §2.2); the first is the default. */
  places: PlaceOption[];
};

// ---------------------------------------------------------------------------------------------------------------
// Fog-of-war helpers (design 07 §5). Error is drawn once per (viewer, subject, turn) from a fresh `fog` stream so
// the same estimate re-renders identically within a turn and the world's own streams are never touched.
// ---------------------------------------------------------------------------------------------------------------

/** A band around `trueValue` of half-width `band`, its center nudged by a deterministic fog error of
 * roughly two thirds of the band (matching design 07 §5's "the estimate error is drawn once per (viewer,
 * subject, turn)"), clamped to the meter's 0..1000 range throughout. */
function fogBand(world: World, subjectId: string, trueValue: number, band: number): Estimate {
  const viewer = world.player.characterId;
  const stream = new Stream(initialStreamState(world.meta.seed, `fog:${viewer}:${subjectId}:${world.meta.turn}`));
  const errorRange = roundHalfAway(band * 2, 3);
  const error = errorRange > 0 ? stream.nextRange(-errorRange, errorRange) : 0;
  const center = clamp(trueValue + error, 0, 1000);
  return { low: clamp(center - band, 0, 1000), high: clamp(center + band, 0, 1000) };
}

function exactField(value: number): { precision: "exact"; value: number } {
  return { precision: "exact", value };
}
function estimateField(band: Estimate): { precision: "estimate"; band: Estimate } {
  return { precision: "estimate", band };
}
function rumorField(band: Estimate): { precision: "rumor"; band: Estimate } {
  return { precision: "rumor", band };
}
function hiddenField(): { precision: "hidden" } {
  return { precision: "hidden" };
}

const RECENT_FACT_WINDOW = 26;

const NOTE_TAGS: Record<string, string> = {
  arrested: "was arrested",
  poached: "was poached from a rival",
  conceded: "conceded a claim",
  paidOff: "was paid off in a dispute",
};

const BAND_NAMES: Record<AttentionBand, string> = { 0: "Quiet", 1: "Noticed", 2: "Watched", 3: "Targeted", 4: "Besieged" };

const TOOL_SIGN_TEXT: Record<ToolId, string> = {
  patrols: "Patrols pass more often than they used to.",
  informants: "Someone in the neighborhood may be whispering to the police.",
  squad: "A dedicated squad has taken an interest in the family.",
  magistrate: "A magistrate has been assigned to the territory.",
  wiretaps: "A friend warns that phones and cars may not be safe.",
  seizures: "Officials have started asking who really owns what.",
  collaboratorProgram: "The state is offering deals to anyone willing to talk.",
  army: "Soldiers have appeared in the streets.",
  hardPrison: "Word from inside says the regime has hardened.",
};

/** The relation of `c` to the player `p`, by structure only (design 07 §5's "sponsor" reads either the
 * onRecordWith field, for an associate's mentor, or the superior field for later ranks). */
function relationOf(p: Character, c: Character): PersonView["relation"] {
  if (c.id === p.id) return "you";
  if (c.id === p.onRecordWith || c.id === p.superiorId) return "sponsor";
  if (c.superiorId === p.id) return "subordinate";
  if (p.crewId !== null && c.crewId === p.crewId) return "crewmate";
  return "family";
}

function buildPerson(world: World, p: Character, c: Character): PersonView {
  const relation = relationOf(p, c);
  let loyalty: PersonView["loyalty"];
  let exposure: PersonView["exposure"];
  let weight: PersonView["weight"];
  let notes: string[] = [];

  if (relation === "you") {
    loyalty = exactField(c.loyalty);
    exposure = exactField(c.exposure);
    weight = exactField(c.weight);
  } else {
    weight = estimateField(fogBand(world, c.id, c.weight, 50));
    if (relation === "subordinate" || relation === "crewmate") {
      loyalty = estimateField(fogBand(world, c.id, c.loyalty, 60));
      exposure = relation === "subordinate" ? estimateField(fogBand(world, c.id, c.exposure, 100)) : hiddenField();
      notes = c.memory.filter((m) => m.tag in NOTE_TAGS).map((m) => NOTE_TAGS[m.tag]!);
    } else {
      loyalty = rumorField(fogBand(world, c.id, c.loyalty, 150));
      exposure = hiddenField();
    }
  }

  return {
    id: c.id,
    name: c.name,
    rank: c.rank,
    status: c.status,
    relation,
    loyalty,
    exposure,
    weight,
    detainedUntilTurn: c.detainedUntilTurn,
    notes,
  };
}

function buildRival(c: Character): PersonView {
  return {
    id: c.id,
    name: c.name,
    rank: c.rank,
    status: c.status,
    relation: "rival",
    loyalty: hiddenField(),
    exposure: hiddenField(),
    weight: hiddenField(),
    detainedUntilTurn: null,
    notes: [],
  };
}

function buildPeople(world: World, p: Character): PersonView[] {
  const people: PersonView[] = [];
  const familyIds = new Set<string>();

  if (p.familyId !== null) {
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      if (!c.alive || c.familyId !== p.familyId) continue;
      familyIds.add(c.id);
      people.push(buildPerson(world, p, c));
    }
  }

  const rivalIds = new Set<string>();
  for (const rf of world.history.recentFacts) {
    if (rf.turn <= world.meta.turn - RECENT_FACT_WINDOW) continue;
    for (const subjectId of rf.subjects) {
      if (familyIds.has(subjectId) || rivalIds.has(subjectId)) continue;
      if (world.characters.byId[subjectId]) rivalIds.add(subjectId);
    }
  }
  for (const id of rivalIds) people.push(buildRival(world.characters.byId[id]!));

  return people;
}

// ---------------------------------------------------------------------------------------------------------------
// Actions (mirrors systems/player-actions.ts's ingestPlayerActions rules; design 07 §1).
// ---------------------------------------------------------------------------------------------------------------

function claimLabel(world: World, claim: Claim): string {
  if (claim.subject.kind === "business") {
    const business = world.geo.businesses.byId[claim.subject.id];
    if (!business) return `business ${claim.subject.id}`;
    return `${business.type} ${business.size} on ${business.blockId}`;
  }
  const associate = world.characters.byId[claim.subject.id];
  return `associate ${associate?.name ?? claim.subject.id}`;
}

function isClaimable(world: World, p: Character, business: Business, playerCrew: Crew | undefined): boolean {
  if (p.rank === "civilian" || p.rank === "associate") return false;
  if (claimOnSubject(world, { kind: "business", id: business.id })) return false;
  if (!playerCrew || !playerCrew.blockIds.includes(business.blockId)) return false;
  return true;
}

function buildActions(world: World, p: Character): ActionSpec[] {
  const actions: ActionSpec[] = [];

  const subordinates = world.characters.order
    .map((id) => world.characters.byId[id]!)
    .filter((c) => c.superiorId === p.id)
    .map((c) => {
      const rule = p.shareRules[c.id];
      return { id: c.id, name: c.name, current: rule ? { fixedPerTurn: rule.fixedPerTurn, percent: rule.percent } : null };
    });
  if (subordinates.length > 0) actions.push({ kind: "setShare", subordinates });

  if (p.rank !== "civilian" && p.rank !== "associate") {
    const playerCrew = p.crewId ? world.crews.byId[p.crewId] : undefined;
    const businesses: Array<{ id: string; label: string }> = [];
    if (playerCrew) {
      for (const blockId of playerCrew.blockIds) {
        const block = world.geo.blocks.byId[blockId];
        if (!block) continue;
        for (const businessId of block.businessIds) {
          const business = world.geo.businesses.byId[businessId];
          if (!business) continue;
          if (claimOnSubject(world, { kind: "business", id: businessId })) continue;
          businesses.push({ id: business.id, label: `${business.type} ${business.size} on ${block.id}` });
        }
      }
    }
    actions.push({ kind: "claimBusiness", businesses });
  }

  if (p.rank !== "civilian" && p.rank !== "associate" && p.memory.some((m) => m.tag === "bookOpen")) {
    const family = p.familyId ? world.families.byId[p.familyId] : undefined;
    const lendable: Array<{ id: string; label: string }> = [];
    for (const townId of family?.townIds ?? []) {
      const town = world.geo.towns.byId[townId];
      for (const blockId of town?.blockIds ?? []) {
        const block = world.geo.blocks.byId[blockId];
        for (const businessId of block?.businessIds ?? []) {
          const business = world.geo.businesses.byId[businessId];
          if (business && !p.loans.some((l) => l.borrower.kind === "business" && l.borrower.id === businessId)) lendable.push({ id: business.id, label: `${business.type} ${business.size} on ${blockId}` });
        }
      }
    }
    const account = world.ledger.accounts.byId[p.accounts.personal];
    actions.push({ kind: "lend", businesses: lendable, maxPrincipal: Math.min(500, account?.dirty ?? 0) });
  }

  actions.push({ kind: "setLifestyle", current: p.lifestyle, costs: { ...LIFESTYLE_COST } });
  // An associate holds only the kid's record (design 09 §5), which is not his to give up; claims are a made man's orders.
  const claims = p.rank === "associate" || p.rank === "civilian" ? [] : claimsHeldBy(world, p.id).map((c) => ({ claimId: c.id, label: claimLabel(world, c) }));
  actions.push({ kind: "releaseClaim", claims });

  if (p.rank === "soldier") {
    // An associate asks nothing of the chief (player-actions rejects it); the book is asked for once.
    const options: Array<"makeAssociate" | "openBook"> = p.memory.some((m) => m.tag === "bookOpen") ? ["makeAssociate"] : ["makeAssociate", "openBook"];
    actions.push({ kind: "askPermission", options });
  }

  return actions;
}

// ---------------------------------------------------------------------------------------------------------------
// Decisions: instances awaitingDecision whose template's decision.role resolves to a player-controlled character
// (engine/scheduler.ts's own rule for routing a decision to the player rather than to an AI default).
// ---------------------------------------------------------------------------------------------------------------

function buildDecisions(world: World, content: Content, log: TurnLog | null): DecisionView[] {
  const decisions: DecisionView[] = [];
  const templatesById = new Map(content.templates.map((t) => [t.id, t]));
  // The choices the player made this turn, by instance: a card whose parent is one of them is a follow-up.
  const decidedThisTurn = new Map<string, { prompt: string; optionLabel: string }>();
  for (const e of log?.entries ?? []) {
    if (e.kind !== "fact") continue;
    const f = e.fact;
    if (f.kind !== "ProcessDecide") continue;
    const t = f.cause.templateId ? templatesById.get(f.cause.templateId) : undefined;
    const option = t?.decision?.options.find((o) => o.id === f.optionId);
    if (t?.decision && option) decidedThisTurn.set(f.instanceId, { prompt: t.decision.prompt, optionLabel: option.label });
  }

  for (const id of world.processes.order) {
    const inst = world.processes.byId[id]!;
    if (inst.state !== "awaitingDecision" || !inst.decision) continue;
    const template = templatesById.get(inst.templateId);
    if (!template?.decision) continue;
    const deciderRoleName = resolveDeciderRoleName(world, template.decision.role, inst.roles);
    const deciderRef = inst.roles[deciderRoleName];
    if (!deciderRef || deciderRef.kind !== "character") continue;
    const decider = world.characters.byId[deciderRef.id];
    if (!decider?.playerControlled) continue;

    const options = inst.decision.options
      .map((optionId) => template.decision!.options.find((o) => o.id === optionId))
      .filter((o): o is NonNullable<typeof o> => o !== undefined)
      .map((o) => (o.hint === undefined ? { id: o.id, label: o.label } : { id: o.id, label: o.label, hint: o.hint }));

    const parent = inst.parentId ? decidedThisTurn.get(inst.parentId) : undefined;
    decisions.push({
      instanceId: inst.id,
      templateId: inst.templateId,
      prompt: template.decision.prompt,
      options,
      pendingSince: inst.decision.pendingSince,
      timeoutTurns: template.decision.timeoutTurns,
      ...(parent ? { followUp: parent } : {}),
    });
  }

  return decisions;
}

// ---------------------------------------------------------------------------------------------------------------
// Towns (design 07 §5): the player's own town in full; same-district neighbors as rumor-class signs only.
// ---------------------------------------------------------------------------------------------------------------

function buildOwnTownView(world: World, p: Character, town: Town): TownView {
  const playerCrew = p.crewId ? world.crews.byId[p.crewId] : undefined;
  const blocks: BlockView[] = [];

  for (const blockId of town.blockIds) {
    const block = world.geo.blocks.byId[blockId];
    if (!block) continue;
    const chiefCrew = block.crewId ? world.crews.byId[block.crewId] : undefined;
    const chiefChar = chiefCrew ? world.characters.byId[chiefCrew.chiefId] : undefined;
    const yours = !!playerCrew && playerCrew.blockIds.includes(block.id);

    const businesses: BusinessView[] = [];
    for (const businessId of block.businessIds) {
      const business = world.geo.businesses.byId[businessId];
      if (!business) continue;
      const claim = claimOnSubject(world, { kind: "business", id: businessId });
      const holder = claim ? world.characters.byId[claim.holderId] : undefined;
      const exact = yours || claim?.holderId === p.id;
      // The owner (docs/event-storming-2026-09-25.md §3 hotspot 1) is shown exact only for the player's own
      // crew's shops (design 07 §5); `holder`/`exact` above answer a different question (who collects it) and
      // are exact for a shop the player personally holds even outside his crew's blocks, which owner visibility
      // does not follow.
      const owner = yours && business.ownerId ? world.characters.byId[business.ownerId] : undefined;
      const ownerTrait = owner?.traits.find((t) => SHOPKEEPER_TRAITS.includes(t as (typeof SHOPKEEPER_TRAITS)[number])) ?? null;

      businesses.push({
        id: business.id,
        blockId: block.id,
        type: business.type,
        size: business.size,
        holderName: holder ? holder.name : null,
        holderId: holder ? holder.id : null,
        ownerName: owner ? owner.name : null,
        ownerTrait,
        compliance: exact ? exactField(business.compliance) : estimateField(fogBand(world, business.id, business.compliance, 80)),
        fear: exact ? exactField(business.fear) : estimateField(fogBand(world, business.id, business.fear, 80)),
        refusalStage: yours ? business.refusalStage : null,
        claimable: isClaimable(world, p, business, playerCrew),
      });
    }

    blocks.push({ id: block.id, crewChiefName: chiefChar ? chiefChar.name : null, yours, businesses });
  }

  const familyName = town.familyId ? (world.families.byId[town.familyId]?.name ?? null) : null;
  return { id: town.id, name: town.name, archetype: town.archetype, familyName, yours: true, blocks, sentimentSign: null, heatSign: null };
}

function buildNeighborTownView(world: World, town: Town): TownView {
  const familyName = town.familyId ? (world.families.byId[town.familyId]?.name ?? null) : null;
  const state = world.towns.byId[town.id];
  let sentimentSign: string | null = null;
  if (state) {
    if (state.sentiment > 300) sentimentSign = "Word is that town speaks well of its family.";
    else if (state.sentiment < -300) sentimentSign = "Word is that town has turned against its family.";
  }
  const heat = world.pressure.heatByTown[town.id] ?? 0;
  const heatSign = heat >= 150 ? "There is talk of unusual trouble over there." : null;
  return { id: town.id, name: town.name, archetype: town.archetype, familyName, yours: false, blocks: [], sentimentSign, heatSign };
}

function buildTowns(world: World, p: Character): TownView[] {
  if (p.familyId === null) return [];
  const family = world.families.byId[p.familyId];
  const playerTownId = family?.townIds[0];
  if (!playerTownId) return [];
  const playerTown = world.geo.towns.byId[playerTownId];
  if (!playerTown) return [];

  const towns: TownView[] = [buildOwnTownView(world, p, playerTown)];

  if (playerTown.districtId) {
    for (const townId of world.geo.towns.order) {
      if (townId === playerTownId) continue;
      const town = world.geo.towns.byId[townId]!;
      if (town.districtId === playerTown.districtId) towns.push(buildNeighborTownView(world, town));
    }
  }

  return towns;
}

// ---------------------------------------------------------------------------------------------------------------
// State signs (I3, design 07 §5's "sign" class): sentences only, no numbers.
// ---------------------------------------------------------------------------------------------------------------

function buildStateSigns(world: World, p: Character, playerTownId: string | undefined): string[] {
  if (p.familyId === null) return [];
  const signs: string[] = [];

  const tools = world.pressure.toolsByFamily[p.familyId] ?? [];
  for (const tool of tools) signs.push(TOOL_SIGN_TEXT[tool]);

  const townHeat = playerTownId ? (world.pressure.heatByTown[playerTownId] ?? 0) : 0;
  if (townHeat >= 100) signs.push("There is more attention on your streets than usual.");

  const anyDetained = world.characters.order.some((id) => {
    const c = world.characters.byId[id]!;
    return c.familyId === p.familyId && c.alive && c.detainedUntilTurn !== null;
  });
  if (anyDetained) signs.push("One of your own is being held.");

  const talking = world.history.recentFacts.some(
    (rf) =>
      rf.kind === "CooperationSet" &&
      rf.turn > world.meta.turn - RECENT_FACT_WINDOW &&
      rf.subjects.some((sid) => world.characters.byId[sid]?.familyId === p.familyId),
  );
  if (talking) signs.push("Word is that someone is talking.");

  return signs;
}

/** Build the player's view. Pure: same inputs, same view. Error bands are drawn deterministically from the `fog`
 *  stream seeded per (viewer, subject, turn) so an estimate does not flicker within a turn but does drift between
 *  turns. */
export function projectView(world: World, log: TurnLog | null, content: Content): PlayerView {
  const p = world.characters.byId[world.player.characterId]!;
  const account = world.ledger.accounts.byId[p.accounts.personal];
  const family = p.familyId !== null ? world.families.byId[p.familyId] : undefined;
  const firstTownId = family?.townIds[0];
  const firstTown = firstTownId ? world.geo.towns.byId[firstTownId] : undefined;
  const sponsor = p.superiorId ? world.characters.byId[p.superiorId] : undefined;

  const report: Report = log
    ? projectReport(world, log)
    : { turn: world.meta.turn, calendar: { ...world.meta.calendar }, turnLength: world.meta.turnLength, lines: [] };

  const attentionBandName =
    world.player.uiLayersUnlocked.includes("territory") && family ? BAND_NAMES[family.attentionBand] : null;

  return {
    book: buildBook(world, log, p),
    turn: world.meta.turn,
    calendar: { ...world.meta.calendar },
    turnLength: world.meta.turnLength,
    crises: world.meta.crises.map((c) => c.flag),
    you: {
      id: p.id,
      name: p.name,
      alive: p.alive,
      lifestyle: p.lifestyle,
      dropped: !p.onRecordWith && p.rank === "associate" && p.memory.some((m) => m.tag === "dropped"),
      rank: p.rank,
      weight: p.weight,
      dirty: account?.dirty ?? 0,
      clean: account?.clean ?? 0,
      loyalty: p.loyalty,
      sponsorName: sponsor ? sponsor.name : null,
      familyName: family ? family.name : null,
      townName: firstTown ? firstTown.name : null,
      layers: [...world.player.uiLayersUnlocked] as UiLayer[],
    },
    report,
    requests: world.player.requestQueue.map((r) => ({ id: r.id, text: r.text, turn: r.turn, instanceId: r.instanceId, kind: requestKind(world, content, r.instanceId) })),
    decisions: buildDecisions(world, content, log),
    actions: buildActions(world, p),
    people: buildPeople(world, p),
    towns: buildTowns(world, p),
    district: buildDistrict(world, p),
    stateSigns: buildStateSigns(world, p, firstTownId),
    proposta: propostaView(world),
    sponsorMood: sponsor ? sponsorMoodText(world, sponsor, p) : null,
    newspaper: (log?.entries ?? []).flatMap((e) => (e.kind === "fact" && e.visibility === "player" && e.fact.kind === "ReportNote" && e.fact.channel === "newspaper" ? [e.fact.text] : [])),
    places: placesForPlayer(world),
    attentionBandName,
    family: family
      ? {
          name: family.name,
          state: family.state,
          treasury: p.rank === "head"
            ? { precision: "exact", value: world.ledger.accounts.byId[family.treasury]?.dirty ?? 0 }
            : { precision: "estimate", band: treasuryBand(world.ledger.accounts.byId[family.treasury]?.dirty ?? 0) },
        }
      : null,
  };
}

/** Validate an action against the view (cheap client-side check; the core re-validates in ingestPlayerActions). */
export function actionAllowed(view: PlayerView, action: PlayerAction): boolean {
  switch (action.kind) {
    case "noop":
      return true;
    case "decide": {
      const decision = view.decisions.find((d) => d.instanceId === action.instanceId);
      return !!decision?.options.some((o) => o.id === action.optionId);
    }
    case "setShare": {
      const spec = view.actions.find((a): a is Extract<ActionSpec, { kind: "setShare" }> => a.kind === "setShare");
      return !!spec?.subordinates.some((s) => s.id === action.subordinateId);
    }
    case "claimBusiness": {
      const spec = view.actions.find((a): a is Extract<ActionSpec, { kind: "claimBusiness" }> => a.kind === "claimBusiness");
      return !!spec?.businesses.some((b) => b.id === action.businessId);
    }
    case "releaseClaim": {
      const spec = view.actions.find((a): a is Extract<ActionSpec, { kind: "releaseClaim" }> => a.kind === "releaseClaim");
      return !!spec?.claims.some((c) => c.claimId === action.claimId);
    }
    case "askPermission": {
      const spec = view.actions.find((a): a is Extract<ActionSpec, { kind: "askPermission" }> => a.kind === "askPermission");
      return !!spec?.options.includes(action.what);
    }
    default:
      return false;
  }
}

/** A request is a decision when its instance awaits the player; otherwise it is news the player hears about. */
function requestKind(world: World, content: Content, instanceId: string | null): "decision" | "news" {
  if (!instanceId) return "news";
  const inst = world.processes.byId[instanceId];
  if (!inst || inst.state !== "awaitingDecision") return "news";
  const template = content.templates.find((t) => t.id === inst.templateId);
  const ref = template?.decision ? inst.roles[resolveDeciderRoleName(world, template.decision.role, inst.roles)] : undefined;
  return ref?.kind === "character" && world.characters.byId[ref.id]?.playerControlled ? "decision" : "news";
}

function propostaView(world: World): PlayerView["proposta"] {
  const p = computeProposta(world);
  return p ? { band: p.band, label: p.label, signs: p.signs } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Sponsor mood (design 09 §3): a sentence from the favor ledger, sponsor -> player, personality-flavored.
// ---------------------------------------------------------------------------------------------------------------

/** Five bands on `favor(sponsor -> player)`, worst to best (design 09 §3). */
const SPONSOR_MOOD_BAND_TEXT: readonly string[] = [
  "Your padrino (sponsor) has had enough of you.",
  "Your padrino (sponsor) is unhappy with you.",
  "Your padrino (sponsor) has no strong opinion of you either way.",
  "Your padrino (sponsor) is glad to have you.",
  "Your padrino (sponsor) speaks well of you to others.",
];

const SPONSOR_MOOD_TRAITS = ["patient", "hothead", "schemer", "gambler"] as const;
type SponsorMoodTrait = (typeof SPONSOR_MOOD_TRAITS)[number];

/** A trailing clause for the sponsor's known personality trait, added to the band sentence. */
const SPONSOR_MOOD_TRAIT_TEXT: Record<SponsorMoodTrait, string> = {
  patient: "He does not act on a feeling; he waits.",
  hothead: "He does not hide what he feels.",
  schemer: "He shows you nothing of what he is thinking.",
  gambler: "To him, you are still a bet he has not settled.",
};

function sponsorMoodBand(favor: number): 0 | 1 | 2 | 3 | 4 {
  if (favor <= -150) return 0;
  if (favor <= -50) return 1;
  if (favor <= 49) return 2;
  if (favor <= 149) return 3;
  return 4;
}

function sponsorMoodText(world: World, sponsor: Character, player: Character): string {
  const favor = world.favors[favorKey(sponsor.id, player.id)] ?? 0;
  const base = SPONSOR_MOOD_BAND_TEXT[sponsorMoodBand(favor)]!;
  const trait = SPONSOR_MOOD_TRAITS.find((t) => sponsor.traits.includes(t));
  return trait ? `${base} ${SPONSOR_MOOD_TRAIT_TEXT[trait]}` : base;
}

// ---------------------------------------------------------------------------------------------------------------
// Il libro (the book): the player's men, stalls, loans and debts, with what each did last turn from the log.
// ---------------------------------------------------------------------------------------------------------------

function buildBook(world: World, log: TurnLog | null, p: Character): BookView {
  const facts = log ? log.entries.flatMap((e) => (e.kind === "fact" ? [e.fact] : [])) : [];
  const myAccount = p.accounts.personal;
  const accountOwner = new Map<string, CharacterId>();
  for (const id of world.characters.order) accountOwner.set(world.characters.byId[id]!.accounts.personal, id as CharacterId);

  const paidToMe = new Map<string, number>();
  const collected = new Map<string, number>(); // businessId -> amount collected last turn (any collector)
  const missed = new Set<string>();
  const loanPaid = new Map<string, boolean>();
  const debtPaid = new Map<string, number>();
  for (const f of facts) {
    if (f.kind === "MoneyMove" && f.to === myAccount && f.cause.rule === "share") {
      const from = accountOwner.get(f.from);
      if (from) paidToMe.set(from, (paidToMe.get(from) ?? 0) + f.amount);
    }
    if (f.kind === "MoneyMint" && f.source === "protectionTax" && f.cause.subjectId) collected.set(f.cause.subjectId, (collected.get(f.cause.subjectId) ?? 0) + f.amount);
    if (f.kind === "CollectionMissed") missed.add(f.businessId);
    if (f.kind === "LoanPayment") {
      if (f.lenderId === p.id) loanPaid.set(f.loanId, f.paid);
      else if (f.paid) debtPaid.set(f.loanId, f.amount + (f.principalPaid ?? 0));
    }
  }

  const men: BookView["men"] = [];
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.alive || (c.superiorId !== p.id && c.onRecordWith !== p.id)) continue;
    const rule = p.shareRules[c.id];
    men.push({ id: c.id, name: c.name, rank: c.rank, status: c.status, share: rule ? { fixedPerTurn: rule.fixedPerTurn, percent: rule.percent } : null, paidLastTurn: paidToMe.get(c.id) ?? 0, loyalty: c.loyalty });
  }

  const myMen = new Set(men.map((m) => m.id));
  const stalls: BookView["stalls"] = [];
  for (const claim of claimsHeldBy(world, p.id)) {
    if (claim.subject.kind !== "business") continue;
    const b = world.geo.businesses.byId[claim.subject.id];
    if (!b) continue;
    // Who collects it: one of my associates when I have any (chains.ts), else me.
    const collector = men.find((m) => m.rank === "associate" && myMen.has(m.id));
    const amount = collected.get(b.id) ?? 0;
    // A stall the player himself holds is "exact for what you own" (design 07 §5), same as everything else
    // in the book, regardless of whose crew's blocks generated the owner (docs/event-storming-2026-09-25.md
    // §3 hotspot 1).
    const owner = b.ownerId ? world.characters.byId[b.ownerId] : undefined;
    stalls.push({
      businessId: b.id,
      label: `${b.type} ${b.size} on ${b.blockId}`,
      collectorName: collector ? collector.name : p.name,
      ownerName: owner ? owner.name : null,
      lastTurn: amount > 0 ? "paid" : missed.has(b.id) ? "missed" : "quiet",
      amount,
      compliance: b.compliance,
      refusalStage: b.refusalStage,
    });
  }

  const loans: BookView["loans"] = p.loans.map((l) => {
    const label = l.borrower.kind === "business"
      ? (() => { const b = world.geo.businesses.byId[l.borrower.id]; return b ? `${b.type} ${b.size} on ${b.blockId}` : l.borrower.id; })()
      : (world.characters.byId[l.borrower.id]?.name ?? l.borrower.id);
    const paid = loanPaid.get(l.id);
    return {
      id: l.id,
      borrowerLabel: label,
      principal: l.principal,
      points: l.points,
      weeklyInterest: roundHalfAway(l.principal * l.points, 100),
      weeksLate: l.weeksLate,
      weeksToDefault: Math.max(0, 4 - l.weeksLate),
      lastTurn: paid === true ? "paid" : paid === false ? "missed" : "quiet",
    };
  });

  const debts: BookView["debts"] = [];
  for (const id of world.characters.order) {
    const lender = world.characters.byId[id]!;
    for (const l of lender.loans) {
      if (l.borrower.kind !== "character" || l.borrower.id !== p.id) continue;
      debts.push({ lenderName: lender.name, principal: l.principal, points: l.points, paidLastTurn: debtPaid.get(l.id) ?? 0 });
    }
  }

  const duties: BookView["duties"] = world.obligations.order
    .map((id) => world.obligations.byId[id]!)
    .filter((o) => o.status === "open" && o.debtorId === p.id)
    .map((o) => ({
      id: o.id,
      kind: o.kind,
      beneficiaryName: o.beneficiary.kind === "character" ? (world.characters.byId[o.beneficiary.id]?.name ?? "someone") : o.beneficiary.kind === "family" ? (world.families.byId[o.beneficiary.id]?.name ?? "the family") : "the account",
      amount: o.amount,
      dueIn: Math.max(0, o.nextDueTurn - world.meta.turn),
      recurring: o.everyTurns !== null,
      met: o.met,
      missed: o.missed,
      lastResult: o.lastResult,
    }));
  return { men, stalls, loans, debts, duties };
}

/** The treasury as a band a made man below the head might guess: 30 percent either way, rounded to hundreds (design 12). */
function treasuryBand(value: number): Estimate {
  const low = Math.floor((value * 7) / 1000) * 100;
  const high = Math.ceil((value * 13) / 1000) * 100;
  return { low, high: Math.max(high, low + 100) };
}

// ---------------------------------------------------------------------------------------------------------------
// The district (design 13): who sits in it, who heads it, how each family stands with the player's own.
// ---------------------------------------------------------------------------------------------------------------

function buildDistrict(world: World, p: Character): PlayerView["district"] {
  const family = p.familyId ? world.families.byId[p.familyId] : undefined;
  const district = family?.districtId ? world.geo.districts.byId[family.districtId] : undefined;
  if (!family || !district) return null;
  const head = district.districtHeadFamilyId ? world.families.byId[district.districtHeadFamilyId] : undefined;
  const families = district.familyIds.map((fid) => {
    const f = world.families.byId[fid]!;
    const yours = f.id === family.id;
    const raw = yours ? null : (world.standing[standingKey(family.id, f.id)] ?? 0);
    // A band of ±150 around the truth, the width a made man's rumors allow (design 07 §3).
    const standing = raw === null ? null : { low: Math.max(-1000, raw - 150), high: Math.min(1000, raw + 150) };
    return { id: f.id, name: f.name, yours, state: f.state, standing, atWar: f.warWith !== null };
  });
  return { name: district.name, headFamilyName: head ? head.name : null, families };
}

