// A hand-built starter world standing in for the generator (design 05) until phase 5 (build plan next task 2).
// One town, one family, one crew, the player as an associate on record with the first soldier.
// Every id comes from mintId so the world is deterministic for a given seed; no randomness is needed here.

import { mintId, tableInsert, type ClaimId } from "@borgata/shared";
import type { Content } from "./content-types.js";
import { addBlock, addBusiness, addTown } from "./fixtures.js";
import { addCharacter, addCrew, addFamily, createEmptyWorld, playerCharacter, type GameSetup, type World } from "./world.js";

export function buildStarterWorld(seed: string, setup: GameSetup, content: Content): World {
  const world = createEmptyWorld(seed, setup, content.version);

  // Geography: one town, two blocks (design 02 §3).
  const town = addTown(world, { name: "Borgo", archetype: setup.archetype ?? "market-quarter", population: 9000 });
  const blockA = addBlock(world, town.id);
  const blockB = addBlock(world, town.id);

  addBusiness(world, blockA.id, { type: "stall", size: 1, compliance: 700, fear: 300 });
  addBusiness(world, blockA.id, { type: "stall", size: 1, compliance: 700, fear: 300 });
  addBusiness(world, blockA.id, { type: "stall", size: 1, compliance: 700, fear: 300 });
  addBusiness(world, blockA.id, { type: "stall", size: 1, compliance: 700, fear: 300 });
  addBusiness(world, blockA.id, { type: "shop", size: 2, compliance: 700, fear: 300 });
  addBusiness(world, blockA.id, { type: "shop", size: 2, compliance: 700, fear: 300 });

  addBusiness(world, blockB.id, { type: "shop", size: 2 });
  addBusiness(world, blockB.id, { type: "shop", size: 2 });
  addBusiness(world, blockB.id, { type: "shop", size: 2 });
  addBusiness(world, blockB.id, { type: "restaurant", size: 3 });
  addBusiness(world, blockB.id, { type: "bar", size: 3 });

  // People (design 02 §4). The head must exist before addFamily so addCrew can wire the chief's superior.
  const head = addCharacter(world, { name: "Don Calogero Ferrante", rank: "head", age: 58, traits: [] });
  const family = addFamily(world, { name: "Famiglia del Borgo", townIds: [town.id], headId: head.id, treasuryCut: 100 });

  const chief = addCharacter(world, { name: "Turi Lo Cascio", rank: "chief", age: 45, traits: [] });
  const soldier1 = addCharacter(world, { name: "Nino Bracco", rank: "soldier", age: 34, traits: [] });
  const soldier2 = addCharacter(world, { name: "Pino Randazzo", rank: "soldier", age: 29, traits: [] });

  addCrew(world, family.id, chief.id, [soldier1.id, soldier2.id], [blockA.id, blockB.id]);

  // The player: an associate on record with soldier1 (design 02 §4). Generation, not a system: set fields directly.
  const player = playerCharacter(world);
  player.superiorId = soldier1.id;
  // As the generator does (design 09 §5): the player runs the card game and starts with 20 kL.
  player.memory.push({ tag: "runsGame", weight: 100, turn: 0 });
  player.familyId = family.id;
  player.onRecordWith = soldier1.id;

  const playerClaimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, playerClaimId, { id: playerClaimId, subject: { kind: "associate", id: player.id }, holderId: soldier1.id, since: 0 });

  for (const businessId of blockA.businessIds) {
    const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
    tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "business", id: businessId }, holderId: soldier1.id, since: 0 });
  }
  for (const businessId of blockB.businessIds) {
    const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
    tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "business", id: businessId }, holderId: soldier2.id, since: 0 });
  }

  // Share rules (design 03 §4): set directly, as generation, not through the ShareRuleSet reducer.
  soldier1.shareRules[player.id] = { fixedPerTurn: 0, percent: 500 };
  chief.shareRules[soldier1.id] = { fixedPerTurn: 0, percent: 400 };
  chief.shareRules[soldier2.id] = { fixedPerTurn: 0, percent: 400 };
  head.shareRules[chief.id] = { fixedPerTurn: 0, percent: 300 };

  // A second family (phase 4 disputes, docs/NOW.md phase 4 task 2): a rival with its own town, so
  // family.poach.attempt (packages/content/src/templates/disputes.ts) has someone to poach from and be
  // poached by (its `sameFamily` role exclusion needs at least two families in the world).
  const town2 = addTown(world, { name: "Contrada", archetype: "agricultural-town", population: 4000 });
  const block2 = addBlock(world, town2.id);

  addBusiness(world, block2.id, { type: "stall", size: 1, compliance: 700, fear: 300 });
  addBusiness(world, block2.id, { type: "stall", size: 1, compliance: 700, fear: 300 });
  addBusiness(world, block2.id, { type: "shop", size: 2, compliance: 700, fear: 300 });
  addBusiness(world, block2.id, { type: "shop", size: 2, compliance: 700, fear: 300 });

  const head2 = addCharacter(world, { name: "Don Pietro Vassallo", rank: "head", age: 61, traits: [] });
  const family2 = addFamily(world, { name: "Famiglia della Contrada", townIds: [town2.id], headId: head2.id, treasuryCut: 100 });

  const chief2 = addCharacter(world, { name: "Rosario Cascino", rank: "chief", age: 42, traits: [] });
  const soldier3 = addCharacter(world, { name: "Gaspare Butera", rank: "soldier", age: 31, traits: [] });

  addCrew(world, family2.id, chief2.id, [soldier3.id], [block2.id]);

  for (const businessId of block2.businessIds) {
    const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
    tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "business", id: businessId }, holderId: soldier3.id, since: 0 });
  }

  chief2.shareRules[soldier3.id] = { fixedPerTurn: 0, percent: 400 };
  head2.shareRules[chief2.id] = { fixedPerTurn: 0, percent: 300 };

  return world;
}
