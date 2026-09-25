// Generation stage 4 (design 05 stage 7): one family per town, sized by archetype, with 1 to 3 crews,
// a chief and soldiers each (design 05 targets 2 to 6), associates on record, blocks split among crews
// and business claims round-robin among the crew's soldiers. Draws from "generation.families" only.
//
// Crew count is derived from the size target (about one crew per five made members, capped at 3) rather
// than drawn independently, so soldier counts stay near the "2 to 6" guidance even for the largest
// families; a pure independent draw could otherwise land a 30-member neighborhood on a single crew of
// ~28 soldiers. No invariant depends on the exact soldier count; generation.test.ts checks family size.

import { clamp, mintId, tableInsert, type ClaimId, type FamilyId } from "@borgata/shared";
import type { Content, TownArchetype } from "../content-types.js";
import { getStream, type Stream } from "../rng.js";
import { addCharacter, addCrew, addFamily, type Block, type Character, type Town, type World } from "../world.js";
import { pickFamilyName, pickManName } from "./names.js";

/** A town whose archetype's population reaches this size is "capital-adjacent": its family runs bigger
 * than a plain town's (design 05 stage 7). Matches the provincial-capital tier of design 05's table. */
const BIG_TOWN_POPULATION_THRESHOLD = 20_000;

const NEIGHBORHOOD_SIZE = { min: 12, max: 30 };
const BIG_TOWN_SIZE = { min: 15, max: 30 };
const TOWN_SIZE = { min: 6, max: 15 };

export function familySizeRange(archetype: TownArchetype): { min: number; max: number } {
  if (archetype.isNeighborhood) return NEIGHBORHOOD_SIZE;
  if (archetype.population.max >= BIG_TOWN_POPULATION_THRESHOLD) return BIG_TOWN_SIZE;
  return TOWN_SIZE;
}

/** Round-robin the town's blocks across `numCrews` crews by table order (abstract contiguity, phase 5). */
function blocksForCrew(world: World, town: Town, crewIndex: number, numCrews: number): Block[] {
  return town.blockIds.filter((_, idx) => idx % numCrews === crewIndex).map((id) => world.geo.blocks.byId[id]!);
}

/** Round-robin the businesses on a set of blocks across a crew's soldiers, one claim each. Exported so
 * the re-roll policy (stage 6) can redo this after regenerating a town's businesses. */
export function assignBusinessClaims(world: World, blocks: readonly Block[], soldiers: readonly Character[]): void {
  if (soldiers.length === 0) return;
  const businessIds: string[] = [];
  for (const block of blocks) businessIds.push(...block.businessIds);
  businessIds.forEach((businessId, idx) => {
    const soldier = soldiers[idx % soldiers.length]!;
    const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
    tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "business", id: businessId }, holderId: soldier.id, since: world.meta.turn });
  });
}

function buildFamilyForTown(world: World, content: Content, town: Town, archetype: TownArchetype, stream: Stream, usedNames: Set<string>): { familyId: FamilyId; headSurname: string } {
  const range = familySizeRange(archetype);
  const targetSize = stream.nextRange(range.min, range.max);

  const headAge = stream.nextRange(50, 70);
  const headName = pickManName(stream, content.names, usedNames);
  const head = addCharacter(world, { name: headName.full, rank: "head", age: headAge, traits: [] });

  const familyName = pickFamilyName(stream, content.names, town.name);
  const family = addFamily(world, { name: familyName, townIds: [town.id], headId: head.id, treasuryCut: 100 });
  family.districtId = town.districtId;
  if (town.districtId) {
    const district = world.geo.districts.byId[town.districtId];
    if (district) district.familyIds.push(family.id);
  }

  // Crews hold 2 to 6 soldiers (design 05 stage 7). Members beyond what the crews can take are not generated:
  // a crew of nine men on one block left every made man after the fourth with nothing to collect (2026-09-24).
  const MAX_SOLDIERS_PER_CREW = 6;
  const remainingWanted = targetSize - 1; // minus the head
  const maxCrewsBySize = Math.max(1, Math.floor(remainingWanted / 3));
  // Bias crew count toward keeping each crew near the "2 to 6 soldiers" guidance (design 05 stage 7):
  // one crew per ~5 remaining made members, capped at 3. A pure `nextRange(1,3)` draw would let a
  // 30-member neighborhood land on a single crew of ~28 soldiers, which both looks wrong and makes the
  // neighbourWeakBorder guarantee (beats.ts) potentially inflate the player's own crew just as far.
  const preferredCrews = Math.ceil(remainingWanted / 5);
  // Never more crews than blocks: a crew with no block runs an empty chain and its associates never collect
  // (2026-09-24, phase 6b probe: the player's sponsor sat in such a crew in 2 of 12 seeds).
  const numCrews = clamp(preferredCrews, 1, Math.max(1, Math.min(3, maxCrewsBySize, town.blockIds.length)));
  const remaining = Math.min(remainingWanted, numCrews * (MAX_SOLDIERS_PER_CREW + 1));
  const base = Math.floor(remaining / numCrews);
  const rem = remaining % numCrews;

  for (let i = 0; i < numCrews; i++) {
    const crewTotal = base + (i < rem ? 1 : 0); // chief + soldiers
    const crewBlocks = blocksForCrew(world, town, i, numCrews);
    // A crew has at most one soldier per one and a half shops on its blocks (economy.shopsPerSoldier, build plan
    // §5b): a made man without a round is the defect of 2026-09-24. Two soldiers minimum keeps a crew a crew.
    const shopsOnBlocks = crewBlocks.reduce((n, b) => n + b.businessIds.length, 0);
    const soldierCount = Math.max(2, Math.min(crewTotal - 1, Math.floor((shopsOnBlocks * 2) / 3)));

    const chiefAge = stream.nextRange(40, 60);
    const chiefName = pickManName(stream, content.names, usedNames);
    const chief = addCharacter(world, { name: chiefName.full, rank: "chief", age: chiefAge, traits: [] });

    const soldiers: Character[] = [];
    for (let s = 0; s < soldierCount; s++) {
      const soldierAge = stream.nextRange(25, 50);
      const soldierName = pickManName(stream, content.names, usedNames);
      soldiers.push(addCharacter(world, { name: soldierName.full, rank: "soldier", age: soldierAge, traits: [] }));
    }

    addCrew(world, family.id, chief.id, soldiers.map((s) => s.id), crewBlocks.map((b) => b.id));

    head.shareRules[chief.id] = { fixedPerTurn: 0, percent: 300 };
    for (const soldier of soldiers) chief.shareRules[soldier.id] = { fixedPerTurn: 0, percent: 400 };

    assignBusinessClaims(world, crewBlocks, soldiers);

    for (const soldier of soldiers) {
      const associateCount = stream.nextRange(0, 2);
      for (let a = 0; a < associateCount; a++) {
        const age = stream.nextRange(18, 30);
        const name = pickManName(stream, content.names, usedNames);
        const associate = addCharacter(world, {
          name: name.full,
          rank: "associate",
          age,
          familyId: family.id,
          superiorId: soldier.id,
          onRecordWith: soldier.id,
          traits: [],
        });
        const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
        tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: associate.id }, holderId: soldier.id, since: world.meta.turn });
        soldier.shareRules[associate.id] = { fixedPerTurn: 0, percent: 500 };
      }
    }
  }

  return { familyId: family.id, headSurname: headName.surname };
}

/** Stage 4: one family per town (phase 5: a family owns exactly one town), sized by archetype. Returns
 * each family's head's surname, keyed by family id, for the player's "family" background (stage 5). */
export function buildFamilies(world: World, content: Content, towns: readonly Town[]): Map<FamilyId, string> {
  const stream = getStream(world.rng, "generation.families");
  const archetypesById = new Map(content.archetypes.map((a) => [a.id, a]));
  const usedNames = new Set<string>();
  const headSurnames = new Map<FamilyId, string>();

  for (const town of towns) {
    const archetype = archetypesById.get(town.archetype);
    if (!archetype) throw new Error(`generation: unknown archetype ${town.archetype} for town ${town.id}`);
    const { familyId, headSurname } = buildFamilyForTown(world, content, town, archetype, stream, usedNames);
    headSurnames.set(familyId, headSurname);
  }

  return headSurnames;
}
