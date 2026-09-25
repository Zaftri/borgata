// Test fixtures for building geography (design 02 §3): towns, blocks and businesses.
// Shared across system test suites so each one does not reinvent world-building boilerplate.

import { mintId, tableInsert, type BlockId, type BusinessId, type FamilyId, type TownId } from "@borgata/shared";
import type { Block, Business, BusinessType, Town, World } from "./world.js";

/** Insert a town with an empty TownState (design 03 §5 defaults: sentiment 0, petty crime 100). */
export function addTown(
  world: World,
  fields: { name: string; archetype: string; familyId?: FamilyId | null; population?: number },
): Town {
  const id = mintId<"TownId">(world.meta.ids, "town");
  const town: Town = {
    id,
    name: fields.name,
    archetype: fields.archetype,
    familyId: fields.familyId ?? null,
    blockIds: [],
    provinceId: null,
    districtId: null,
    isNeighborhood: false,
    population: fields.population ?? 1000,
  };
  tableInsert(world.geo.towns, id, town);
  tableInsert(world.towns, id, { townId: id, sentiment: 0, pettyCrime: 100 });
  return town;
}

/** Insert a block into a town. */
export function addBlock(world: World, townId: TownId): Block {
  const id = mintId<"BlockId">(world.meta.ids, "blk");
  const block: Block = { id, townId, crewId: null, businessIds: [] };
  tableInsert(world.geo.blocks, id, block);
  const town = world.geo.towns.byId[townId];
  if (town) town.blockIds.push(id);
  return block;
}

/** Insert a business into a block, defaulting compliance 700 and fear 300 (design 03 §5). */
export function addBusiness(
  world: World,
  blockId: BlockId,
  fields: { type: BusinessType; size: 1 | 2 | 3 | 4 | 5; compliance?: number; fear?: number },
): Business {
  const id = mintId<"BusinessId">(world.meta.ids, "biz");
  const business: Business = {
    id,
    blockId,
    type: fields.type,
    size: fields.size,
    ownerId: null,
    compliance: fields.compliance ?? 700,
    fear: fields.fear ?? 300,
    refusalStage: 0,
  };
  tableInsert(world.geo.businesses, id, business);
  const block = world.geo.blocks.byId[blockId];
  if (block) block.businessIds.push(id as BusinessId);
  return business;
}
