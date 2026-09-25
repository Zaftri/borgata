// Generation stage 6 (design 05 stage 11, K5): the guaranteed tutorial beats and the re-roll/relax
// policy. `earlyCollisionPlausible` is guaranteed by regenerating the start town's businesses (stage 3,
// this town only) up to 8 times from "generation.reroll", then relaxing by forcing one business's
// compliance down; `neighbourWeakBorder` is guaranteed additively (grow the player's crew, never shrink
// a neighbor's) so no character is ever removed after the invariants it participates in were satisfied;
// `publicWorksReachable` and `earlyArrestPlausible` are read from the generated world and content only.

import type { ProvinceId } from "@borgata/shared";
import { getStream } from "../rng.js";
import type { Content } from "../content-types.js";
import { addCharacter, type Crew, type District, type World } from "../world.js";
import { assignBusinessClaims } from "./families.js";
import { pickManName } from "./names.js";
import type { PlayerPlacement } from "./player.js";
import { regenerateTownBusinesses } from "./town-content.js";

export type Beats = {
  neighbourWeakBorder: boolean;
  publicWorksReachable: boolean;
  earlyCollisionPlausible: boolean;
  earlyArrestPlausible: boolean;
};

const MAX_REROLLS = 8;

/** The businesses on the player's own crew's blocks; if that crew was dealt no blocks at all (possible
 * when a small town has fewer blocks than crews), fall back to the whole start town so the collision
 * beat and its relaxation always have something to check and, if needed, force. */
function sponsorCrewBusinessIds(world: World, placement: PlayerPlacement): string[] {
  const crew = world.crews.byId[placement.crewId]!;
  const ids: string[] = [];
  for (const blockId of crew.blockIds) {
    const block = world.geo.blocks.byId[blockId];
    if (block) ids.push(...block.businessIds);
  }
  if (ids.length > 0) return ids;
  for (const blockId of placement.startTown.blockIds) {
    const block = world.geo.blocks.byId[blockId];
    if (block) ids.push(...block.businessIds);
  }
  return ids;
}

function earlyCollisionPlausible(world: World, placement: PlayerPlacement): boolean {
  return sponsorCrewBusinessIds(world, placement).some((id) => {
    const business = world.geo.businesses.byId[id];
    return !!business && business.compliance < 500;
  });
}

function otherCrewSoldierCounts(world: World, district: District, playerFamilyId: PlayerPlacement["familyId"]): number[] {
  const counts: number[] = [];
  for (const familyId of district.familyIds) {
    if (familyId === playerFamilyId) continue;
    const family = world.families.byId[familyId];
    if (!family) continue;
    for (const crewId of family.crewIds) {
      const crew = world.crews.byId[crewId];
      if (crew) counts.push(crew.memberIds.length);
    }
  }
  return counts;
}

function neighbourWeakBorder(world: World, district: District | undefined, placement: PlayerPlacement): boolean {
  if (!district) return false;
  const playerCrew = world.crews.byId[placement.crewId]!;
  return otherCrewSoldierCounts(world, district, placement.familyId).some((n) => n < playerCrew.memberIds.length);
}

function publicWorksReachable(world: World, content: Content, provinceId: ProvinceId): boolean {
  const archetypesById = new Map(content.archetypes.map((a) => [a.id, a]));
  for (const id of world.geo.towns.order) {
    const town = world.geo.towns.byId[id]!;
    if (town.provinceId !== provinceId) continue;
    const archetype = archetypesById.get(town.archetype);
    if (archetype?.institutions.includes("contractTable") || archetype?.institutions.includes("procurement")) return true;
  }
  return false;
}

/** Guarantee `neighbourWeakBorder` additively: never remove a neighbor's soldier (that would orphan
 * claims and violate invariants already satisfied for that family); instead grow the player's own crew
 * with fresh soldiers until at least one neighboring crew in the district has fewer. */
function ensureNeighbourWeakBorder(world: World, content: Content, district: District | undefined, placement: PlayerPlacement): void {
  if (!district) return;
  const counts = otherCrewSoldierCounts(world, district, placement.familyId);
  if (counts.length === 0) return;
  const minOther = Math.min(...counts);
  const playerCrew = world.crews.byId[placement.crewId]!;
  const stream = getStream(world.rng, "generation.beats");
  const usedNames = new Set<string>();
  while (playerCrew.memberIds.length <= minOther) {
    const age = stream.nextRange(25, 50);
    const name = pickManName(stream, content.names, usedNames);
    const soldier = addCharacter(world, {
      name: name.full,
      rank: "soldier",
      age,
      familyId: placement.familyId,
      superiorId: playerCrew.chiefId,
      crewId: playerCrew.id,
      traits: [],
    });
    playerCrew.memberIds.push(soldier.id);
    const chief = world.characters.byId[playerCrew.chiefId];
    if (chief) chief.shareRules[soldier.id] = { fixedPerTurn: 0, percent: 400 };
  }
}

/** Guarantee `earlyCollisionPlausible`: regenerate the start town's businesses up to 8 times, then
 * relax by forcing one business on the player's own block down to compliance 350. */
function ensureEarlyCollision(world: World, content: Content, placement: PlayerPlacement): { rerolls: number; relaxations: string[] } {
  const relaxations: string[] = [];
  let rerolls = 0;
  if (earlyCollisionPlausible(world, placement)) return { rerolls, relaxations };

  const archetype = content.archetypes.find((a) => a.id === placement.startTown.archetype);
  if (!archetype) return { rerolls, relaxations };
  const rerollStream = getStream(world.rng, "generation.reroll");
  const family = world.families.byId[placement.familyId]!;

  while (rerolls < MAX_REROLLS && !earlyCollisionPlausible(world, placement)) {
    rerolls++;
    regenerateTownBusinesses(world, placement.startTown, archetype, rerollStream);
    for (const crewId of family.crewIds) {
      const crew: Crew = world.crews.byId[crewId]!;
      const blocks = crew.blockIds.map((id) => world.geo.blocks.byId[id]!).filter(Boolean);
      const soldiers = crew.memberIds.map((id) => world.characters.byId[id]!).filter(Boolean);
      assignBusinessClaims(world, blocks, soldiers);
    }
  }

  if (!earlyCollisionPlausible(world, placement)) {
    const targetId = sponsorCrewBusinessIds(world, placement)[0];
    const business = targetId ? world.geo.businesses.byId[targetId] : undefined;
    if (business) {
      business.compliance = 350;
      relaxations.push(
        "generation: forced one business on the player's block to compliance 350 (K5 early-collision relaxation, design 05 stage 11 order 3)",
      );
    }
  }

  return { rerolls, relaxations };
}

export type BeatsResult = { beats: Beats; rerolls: number; relaxations: string[] };

/** Stage 6: guarantee what can be guaranteed, then record every beat as it stands. */
export function resolveBeats(world: World, content: Content, provinceId: ProvinceId, placement: PlayerPlacement): BeatsResult {
  const district = placement.startTown.districtId ? world.geo.districts.byId[placement.startTown.districtId] : undefined;

  ensureNeighbourWeakBorder(world, content, district, placement);
  const { rerolls, relaxations } = ensureEarlyCollision(world, content, placement);

  const beats: Beats = {
    neighbourWeakBorder: neighbourWeakBorder(world, district, placement),
    publicWorksReachable: publicWorksReachable(world, content, provinceId),
    earlyCollisionPlausible: earlyCollisionPlausible(world, placement),
    earlyArrestPlausible: true, // design 05 stage 11 / build plan phase 5 item 2: always true in phase 5.
  };

  return { beats, rerolls, relaxations };
}
