// Weight (design 03 §1), promotion (G2, G3) and UI layer unlocks, as Facts.
// Weight is computed, never stored as truth (design 03 §1): this module recomputes it for every living
// character in a family each turn and emits WeightSet only when the value changed. Promotion is checked
// for the player only in phase 4; AI promotions are a later phase.

import { applyPermille, clampMeter, lnScaled120, mintId, roundHalfAway, type CharacterId, type CrewId, type FamilyId, type Meter } from "@borgata/shared";
import type { Content } from "../content-types.js";
import { registerPredicateFn } from "../engine/predicates.js";
import type { Cause, Fact, UiLayer } from "../facts.js";
import { claimsHeldBy } from "../reducers/claims.js";
import { favorKey, playerCharacter, LIFESTYLE_WEIGHT, type Character, type Rank, type World } from "../world.js";

/** Rank eligibility thresholds on Weight (design 03 §1, illustrative; brainstorm G2/G3). Rank is never an input to Weight itself. */
export const RANK_THRESHOLDS: { soldier: number; chief: number; underboss: number; head: number } = {
  soldier: 100,
  chief: 250,
  underboss: 450,
  head: 600,
};

/**
 * UI layers unlocked at each rank (design 07 §1), narrowed to the `UiLayer` kinds the engine has today
 * (associates/dispute-scene/exposure/rumor layers from design 07 arrive with later phases).
 */
export const UI_LAYERS_BY_RANK: Record<Exclude<Rank, "civilian">, readonly UiLayer[]> = {
  associate: ["block"],
  soldier: ["loanBook"],
  chief: ["crew", "territory"],
  underboss: ["family", "district"],
  counselor: ["family", "district"],
  head: ["commission", "politics"],
};

/**
 * Rank tiers in order, for cumulative "has every layer up to their rank" checks (design 07 §1: a layer
 * never disappears). Underboss and counselor share the administration tier.
 */
export const RANK_TIER_ORDER: readonly (readonly Exclude<Rank, "civilian">[])[] = [
  ["associate"],
  ["soldier"],
  ["chief"],
  ["underboss", "counselor"],
  ["head"],
];

/** Direct subordinates by superior, built once per call site (design 03 §1; O(n) instead of O(n^2) per turn). */
export type SubordinateIndex = Map<CharacterId, CharacterId[]>;
export function buildSubordinateIndex(world: World): SubordinateIndex {
  const index: SubordinateIndex = new Map();
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.superiorId) continue;
    const list = index.get(c.superiorId);
    if (list) list.push(c.id);
    else index.set(c.superiorId, [c.id]);
  }
  return index;
}

/** Subordinates whose superior chain ends at `rootId`, recursively. Cycles cannot loop (visited set). */
function subordinatesOf(world: World, rootId: CharacterId, index: SubordinateIndex = buildSubordinateIndex(world)): Set<CharacterId> {
  const out = new Set<CharacterId>();
  const queue: CharacterId[] = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const id of index.get(cur) ?? []) {
      if (!out.has(id)) {
        out.add(id);
        queue.push(id);
      }
    }
  }
  return out;
}

function sumBusinessSizesOnBlocks(world: World, blockIds: readonly string[]): number {
  let total = 0;
  for (const blockId of blockIds) {
    const block = world.geo.blocks.byId[blockId];
    if (!block) continue;
    for (const businessId of block.businessIds) {
      const business = world.geo.businesses.byId[businessId];
      if (business) total += business.size;
    }
  }
  return total;
}

/**
 * Territory value (design 03 §1): a chief's own crew's blocks, a head's whole family, everyone else
 * (soldiers, associates, administration without a crew of their own) only the businesses they hold a
 * claim on directly.
 */
function territoryValueFor(world: World, character: Character): number {
  for (const id of world.crews.order) {
    const crew = world.crews.byId[id]!;
    if (crew.chiefId === character.id) return sumBusinessSizesOnBlocks(world, crew.blockIds);
  }
  for (const id of world.families.order) {
    const family = world.families.byId[id]!;
    if (family.headId === character.id) {
      const blockIds: string[] = [];
      for (const townId of family.townIds) {
        const town = world.geo.towns.byId[townId];
        if (town) blockIds.push(...town.blockIds);
      }
      return sumBusinessSizesOnBlocks(world, blockIds);
    }
  }
  let total = 0;
  for (const claim of claimsHeldBy(world, character.id)) {
    if (claim.subject.kind !== "business") continue;
    const business = world.geo.businesses.byId[claim.subject.id];
    if (business) total += business.size;
  }
  return total;
}

/** Tribute per turn (design 03 §1): what this turn's income from direct subordinates paid up, by their share rule. */
function tributePerTurnFor(world: World, character: Character, index: SubordinateIndex = buildSubordinateIndex(world)): number {
  let total = 0;
  for (const id of index.get(character.id) ?? []) {
    const sub = world.characters.byId[id]!;
    const rule = character.shareRules[sub.id];
    if (!rule) continue;
    const income = world.ledger.turnIncome[sub.accounts.personal] ?? 0;
    total += rule.fixedPerTurn + applyPermille(income, rule.percent);
  }
  return total;
}

/** Weight (design 03 §1): computed, never stored as truth. Integer math throughout. */
export function computeWeight(world: World, characterId: CharacterId, index: SubordinateIndex = buildSubordinateIndex(world)): Meter {
  const character = world.characters.byId[characterId];
  if (!character) return 0;

  const menOnRecord = subordinatesOf(world, characterId, index);
  for (const claim of claimsHeldBy(world, characterId)) {
    if (claim.subject.kind === "associate") menOnRecord.add(claim.subject.id);
  }

  const territoryValue = territoryValueFor(world, character);
  const tributePerTurn = tributePerTurnFor(world, character, index);
  // institutionsControlled, ownedAssetValue, votesDeliverable and standingBonus are 0 until later phases (design 03 §1).

  const base = lnScaled120(menOnRecord.size) + roundHalfAway(territoryValue, 2) + roundHalfAway(tributePerTurn, 10);
  // An associate has no men on record, territory or tribute of his own, so Weight would sit at zero without
  // the record (design 09 §3): the same inputs behind la proposta, at a lower scale, so Weight and la proposta
  // agree and the soldier threshold is reachable from the record alone. Integer division, floor (design 09 §3).
  const recordBonus = character.rank === "associate" ? lnScaled120(character.record.jobsDone) + character.record.streakPaid + Math.floor(character.record.weeksPaid / 2) : 0;

  return clampMeter(base + recordBonus + LIFESTYLE_WEIGHT[character.lifestyle]); // design 12: visible wealth is respect
}

function unlockLayers(world: World, rank: Exclude<Rank, "civilian">, cause: Cause): Fact[] {
  const facts: Fact[] = [];
  for (const layer of UI_LAYERS_BY_RANK[rank]) {
    if (!world.player.uiLayersUnlocked.includes(layer)) facts.push({ kind: "UiLayerUnlock", layer, cause });
  }
  return facts;
}

/** The first crew of the family whose chief is missing, dead or not free (design 03 §1: "a vacancy"), or
 * undefined if every crew has a free, living chief. Table order, deterministic. */
function findVacantCrew(world: World, familyId: FamilyId): CrewId | undefined {
  for (const id of world.crews.order) {
    const crew = world.crews.byId[id]!;
    if (crew.familyId !== familyId) continue;
    const chief = world.characters.byId[crew.chiefId];
    if (!chief || !chief.alive || chief.status !== "free") return crew.id;
  }
  return undefined;
}

/**
 * Promotion for the player only (phase 4; AI promotions arrive later). Two steps of the ladder are
 * reachable today: associate to soldier ("made"), and soldier to crew chief on a vacancy.
 */
function checkPlayerPromotion(world: World, content: Content): Fact[] {
  const player = playerCharacter(world);
  if (!player.alive) return [];
  const weight = computeWeight(world, player.id);

  if (player.rank === "associate") {
    // Phase 6b (design 09 §3, §4): an associate is made by the `assoc.proposal` template on la proposta, not by Weight.
    // The Weight path stays only for content without that template (fixtures and old tests).
    if (content.templates.some((t) => t.id === "assoc.proposal")) return [];
    if (weight < RANK_THRESHOLDS.soldier) return [];
    if (!player.superiorId) return [];
    const superior = world.characters.byId[player.superiorId];
    if (!superior || !superior.alive) return [];
    const family = player.familyId ? world.families.byId[player.familyId] : undefined;
    if (!family || !family.policy.intakeOpen) return [];
    // No loyalty-toward-the-player meter exists yet (design 03 §5 tracks the other direction); stand in
    // with the favor ledger, which disputes and cooperation actions already write (design 03 §5).
    if ((world.favors[favorKey(superior.id, player.id)] ?? 0) < 0) return [];

    const cause: Cause = { rule: "progression.promotion.soldier", actorId: player.id };
    const facts: Fact[] = [{ kind: "RankChange", characterId: player.id, rank: "soldier", cause }];
    if (superior.crewId) {
      const crew = world.crews.byId[superior.crewId];
      if (crew) {
        facts.push({ kind: "CrewMemberAdd", crewId: crew.id, characterId: player.id, cause });
        facts.push({ kind: "SuperiorSet", characterId: player.id, superiorId: crew.chiefId, cause });
      }
    }
    facts.push({
      kind: "RequestPush",
      request: { id: mintId<string>(world.meta.ids, "req"), turn: world.meta.turn, text: "You were made.", instanceId: null, priority: 0 },
      cause,
    });
    facts.push(...unlockLayers(world, "soldier", cause));
    return facts;
  }

  if (player.rank === "soldier") {
    if (weight < RANK_THRESHOLDS.chief) return [];
    if (!player.familyId) return [];
    const vacantCrewId = findVacantCrew(world, player.familyId);
    if (!vacantCrewId) return [];

    const cause: Cause = { rule: "progression.promotion.chief", actorId: player.id };
    // RankChange then CrewChiefSet: facts apply in owner order (characters before territory, design 02 §6),
    // so the player already holds rank chief by the time the territory reducer checks it (reducers/territory.ts
    // CrewChiefSet: "new chief must hold rank chief").
    const facts: Fact[] = [
      { kind: "RankChange", characterId: player.id, rank: "chief", cause },
      { kind: "CrewChiefSet", crewId: vacantCrewId, chiefId: player.id, cause },
    ];
    facts.push({
      kind: "RequestPush",
      request: { id: mintId<string>(world.meta.ids, "req"), turn: world.meta.turn, text: "A crew is yours.", instanceId: null, priority: 0 },
      cause,
    });
    facts.push(...unlockLayers(world, "chief", cause));
    return facts;
  }

  return [];
}

export function progressionStep(world: World, content: Content): Fact[] {
  const facts: Fact[] = [];
  const index = buildSubordinateIndex(world);
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.alive || c.familyId === null) continue;
    const computed = computeWeight(world, c.id, index);
    if (computed !== c.weight) {
      facts.push({ kind: "WeightSet", characterId: c.id, value: computed, cause: { rule: "progression.weight" } });
    }
  }

  facts.push(...checkPlayerPromotion(world, content));
  return facts;
}

/**
 * La proposta (design 09 §3): standing to be made, 0..1000, shown as a band with readable signs.
 * Null when the player is not an associate. Pure: read by the view each turn and by the `progression.proposta` fn.
 */
export type Proposta = { value: number; band: 0 | 1 | 2 | 3; label: string; signs: string[] };

const PROPOSTA_LABELS: readonly string[] = [
  "Il tuo padrino sa appena come ti chiami (your sponsor barely knows your name)",
  "Il tuo padrino è contento (your sponsor is pleased)",
  "Si parla di te (you are spoken of)",
  "Decidono i libri (the books decide)",
];

export function computeProposta(world: World, characterId: CharacterId = world.player.characterId): Proposta | null {
  const me = world.characters.byId[characterId];
  if (!me || me.rank !== "associate") return null;
  const r = me.record;
  const sponsor = me.onRecordWith ? world.characters.byId[me.onRecordWith] : undefined;
  const family = me.familyId ? world.families.byId[me.familyId] : undefined;
  const favor = sponsor ? (world.favors[favorKey(sponsor.id, me.id)] ?? 0) : 0;
  const hasBones = me.memory.some((m) => m.tag === "murder");
  // -200, not the design's -400: at -400 the proposal (750) was unreachable without bones, so the ceremony could never
  // send the player on the killing that makes them (design 09 §4, `assoc.proposal`). Tuned 2026-09-24.
  const bones = family?.policy.bonesRequired ? (hasBones ? 150 : -200) : 0;
  // Each term with its sign text; the three largest by magnitude become the signs (design 09 §3).
  const terms: Array<{ value: number; sign: string }> = [
    { value: 15 * Math.min(r.weeksPaid, 30), sign: r.weeksPaid >= 8 ? "Hai pagato ogni settimana (you have paid, week after week)." : "Poche settimane pagate finora (few envelopes paid so far)." },
    { value: 4 * Math.min(r.streakPaid, 30), sign: "Non manchi una busta da tempo (you have not missed an envelope in a while)." },
    { value: 45 * Math.min(r.jobsDone, 6), sign: r.jobsDone >= 2 ? "Ti sei reso utile (you have made yourself useful)." : "Hai fatto un favore (you have done a favor)." },
    { value: -60 * r.jobsRefused, sign: r.jobsRefused >= 2 ? "Hai detto di no più di una volta (you said no more than once)." : "Hai detto di no (you said no)." },
    { value: -90 * r.arrests, sign: "Il tuo nome è in questura (your name is at the police station)." },
    { value: Math.trunc(favor / 4), sign: favor >= 0 ? "Il tuo padrino ti deve qualcosa (your sponsor owes you)." : "Il tuo padrino non ha dimenticato (your sponsor has not forgotten)." },
    { value: bones, sign: hasBones ? "Hai fatto quello che andava fatto (you did what had to be done)." : "Questa famiglia vuole che un uomo abbia fatto qualcosa, prima (this family wants a man to have done something first)." },
  ];
  const value = clampMeter(terms.reduce((a, t) => a + t.value, 0));
  const band = value >= 750 ? 3 : value >= 500 ? 2 : value >= 250 ? 1 : 0;
  const signs = terms
    .filter((t) => t.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.sign.localeCompare(b.sign))
    .slice(0, 3)
    .map((t) => t.sign);
  return { value, band, label: PROPOSTA_LABELS[band]!, signs };
}

/** `{ fn: { name: "progression.proposta", args: { role: "me", min: 750 } } }`: the role's proposta is at least `min`. */
registerPredicateFn("progression.proposta", (world, roles, args) => {
  const ref = roles[String(args["role"] ?? "me")];
  if (!ref || ref.kind !== "character") return false;
  const p = computeProposta(world, ref.id as CharacterId);
  return p !== null && p.value >= Number(args["min"] ?? 750);
});
