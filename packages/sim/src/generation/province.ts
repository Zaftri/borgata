// Generation stage 1 (province and towns) and stage 2 (districts), design 05 stages 2-4 simplified to
// a single full province (build plan phase 5 task 1: "for ONE province"). Draws from "generation.province"
// and "generation.districts" so a change to district grouping never perturbs town placement.

import { clamp, mintId, tableInsert, type ProvinceId } from "@borgata/shared";
import type { Content, TownArchetype } from "../content-types.js";
import { getStream } from "../rng.js";
import type { District, GameSetup, Province, ProvinceCharacter, Town, World } from "../world.js";
import { pickPlaceName } from "./names.js";

const PROVINCE_CHARACTERS: readonly ProvinceCharacter[] = ["commissionPolitics", "orthodoxBusiness", "feudProne", "businessSymbiosis", "weakSubsidy"];

const NEIGHBORHOOD_COUNT = { min: 4, max: 6 };
const PROVINCIAL_TOWN_COUNT = { min: 4, max: 8 };

function insertTown(world: World, fields: { name: string; archetype: string; provinceId: ProvinceId; isNeighborhood: boolean; population: number }): Town {
  const id = mintId<"TownId">(world.meta.ids, "town");
  const town: Town = {
    id,
    name: fields.name,
    archetype: fields.archetype,
    provinceId: fields.provinceId,
    districtId: null,
    familyId: null,
    blockIds: [],
    population: fields.population,
    isNeighborhood: fields.isNeighborhood,
  };
  tableInsert(world.geo.towns, id, town);
  tableInsert(world.towns, id, { townId: id, sentiment: 0, pettyCrime: 100 });
  return town;
}

function makeTown(world: World, content: Content, provinceId: ProvinceId, archetype: TownArchetype, streamName: string, usedNames: Set<string>): Town {
  const stream = getStream(world.rng, streamName);
  const population = stream.nextRange(archetype.population.min, archetype.population.max);
  const name = pickPlaceName(stream, content.names, archetype, usedNames);
  return insertTown(world, { name, archetype: archetype.id, provinceId, isNeighborhood: archetype.isNeighborhood, population });
}

export type ProvinceResult = { province: Province; towns: Town[] };

/** Stage 1: one province, its capital's neighborhoods and its provincial towns. */
export function buildProvince(world: World, setup: GameSetup, content: Content): ProvinceResult {
  const stream = getStream(world.rng, "generation.province");
  const usedNames = new Set<string>();

  const provinceId = mintId<"ProvinceId">(world.meta.ids, "prov");
  const character = stream.pick(PROVINCE_CHARACTERS);

  const neighborhoodPool = content.archetypes.filter((a) => a.isNeighborhood);
  const townPool = content.archetypes.filter((a) => !a.isNeighborhood);
  if (neighborhoodPool.length === 0) throw new Error("generation: content has no neighborhood archetype");
  if (townPool.length === 0) throw new Error("generation: content has no town archetype");

  const neighborhoodCount = stream.nextRange(NEIGHBORHOOD_COUNT.min, NEIGHBORHOOD_COUNT.max);
  const neighborhoods: Town[] = [];
  for (let i = 0; i < neighborhoodCount; i++) {
    const archetype = stream.pick(neighborhoodPool);
    neighborhoods.push(makeTown(world, content, provinceId, archetype, "generation.province", usedNames));
  }

  const guaranteedArchetype = setup.archetype ? content.archetypes.find((a) => a.id === setup.archetype) : undefined;
  const targetTowns = stream.nextRange(PROVINCIAL_TOWN_COUNT.min, PROVINCIAL_TOWN_COUNT.max);

  const archetypesChosen: TownArchetype[] = [];
  let islandUsed = false;
  if (guaranteedArchetype && !guaranteedArchetype.isNeighborhood) {
    archetypesChosen.push(guaranteedArchetype);
    if (guaranteedArchetype.nameStyle === "island") islandUsed = true;
  }
  const nonIslandTownPool = townPool.filter((a) => a.nameStyle !== "island");
  let guard = 0;
  while (archetypesChosen.length < targetTowns) {
    guard++;
    let candidate = stream.pick(townPool);
    if (candidate.nameStyle === "island") {
      if (islandUsed) {
        // At most one island town (design 05 stage 4): fall back to a non-island pick if one exists.
        candidate = nonIslandTownPool.length > 0 ? stream.pick(nonIslandTownPool) : candidate;
      } else {
        islandUsed = true;
      }
    }
    archetypesChosen.push(candidate);
    if (guard > 1000) break; // safety valve; unreachable with a sane content pool
  }

  const provincialTowns: Town[] = archetypesChosen.map((archetype) => makeTown(world, content, provinceId, archetype, "generation.province", usedNames));

  const capitalTownIds = neighborhoods.map((t) => t.id);
  const province: Province = {
    id: provinceId,
    name: content.names.provinceName,
    detail: "full",
    character,
    capitalTownIds,
    districtIds: [],
    attentionShared: 0,
  };
  tableInsert(world.geo.provinces, provinceId, province);

  return { province, towns: [...neighborhoods, ...provincialTowns] };
}

/** Stage 2: group the province's towns into 2 to 3 districts of 3 or more towns each, by table order
 * (contiguity is abstract in phase 5, design 05 stage 3). */
export function buildDistricts(world: World, province: Province, towns: readonly Town[]): District[] {
  const stream = getStream(world.rng, "generation.districts");
  const n = towns.length;
  const maxDistricts = Math.floor(n / 3);
  const upper = clamp(maxDistricts, 1, 3);
  const numDistricts = upper <= 2 ? Math.max(1, upper) : stream.nextRange(2, upper);

  const base = Math.floor(n / numDistricts);
  const remainder = n % numDistricts;

  const districts: District[] = [];
  let idx = 0;
  for (let d = 0; d < numDistricts; d++) {
    const size = base + (d < remainder ? 1 : 0);
    const districtTowns = towns.slice(idx, idx + size);
    idx += size;

    const id = mintId<"DistrictId">(world.meta.ids, "dist");
    const first = districtTowns[0];
    const district: District = {
      id,
      name: first ? `Mandamento di ${first.name}` : `Mandamento ${d + 1}`,
      provinceId: province.id,
      familyIds: [],
      districtHeadFamilyId: null,
    };
    tableInsert(world.geo.districts, id, district);
    for (const t of districtTowns) t.districtId = id;
    districts.push(district);
  }

  province.districtIds = districts.map((d) => d.id);
  return districts;
}
