// Generation stage 3 (design 05 stage 5): blocks and businesses per town, drawn from the archetype's
// ranges and weighted business mix. Exposed as a function of an explicit stream so the re-roll policy
// (stage 6) can redraw one town's businesses from a separate "generation.reroll" stream without
// perturbing every other town's draws.

import { tableRemove } from "@borgata/shared";
import { addBlock, addBusiness } from "../fixtures.js";
import { getStream, type Stream } from "../rng.js";
import type { Content, TownArchetype } from "../content-types.js";
import type { Business, Town, World } from "../world.js";
import { claimOnSubject } from "../reducers/claims.js";

/** Weighted pick over items carrying an integer `weight`. Deterministic: consumes exactly one draw. */
function pickWeighted<T extends { weight: number }>(stream: Stream, items: readonly T[]): T {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let r = stream.nextInt(total);
  for (const it of items) {
    r -= it.weight;
    if (r < 0) return it;
  }
  return items[items.length - 1]!;
}

function drawBusiness(stream: Stream, archetype: TownArchetype): { type: Business["type"]; size: Business["size"]; compliance: number; fear: number } {
  const entry = pickWeighted(stream, archetype.businessMix);
  const size = stream.pick(entry.sizes);
  // One business in about seven is troubled: below the archetype's range, so a refuser exists somewhere without
  // the K5 relaxation having to force one (2026-09-23; before this every generated world relaxed).
  const compliance = stream.chance(1500) ? stream.nextRange(300, 480) : stream.nextRange(archetype.compliance.min, archetype.compliance.max);
  const fear = stream.nextRange(archetype.fear.min, archetype.fear.max);
  return { type: entry.type, size, compliance, fear };
}

/** Add fresh blocks and businesses to a town that currently has none (used on first generation). */
export function generateTownContent(world: World, town: Town, archetype: TownArchetype, stream: Stream): void {
  const blockCount = stream.nextRange(archetype.blocks.min, archetype.blocks.max);
  for (let b = 0; b < blockCount; b++) {
    const block = addBlock(world, town.id);
    const businessCount = stream.nextRange(archetype.businessesPerBlock.min, archetype.businessesPerBlock.max);
    for (let i = 0; i < businessCount; i++) {
      const draw = drawBusiness(stream, archetype);
      addBusiness(world, block.id, draw);
    }
  }
}

/** Stage 3: blocks and businesses for every town in the province, from "generation.blocks" only. Must
 * run before stage 4 (families.ts), which splits each town's blocks among its crews. */
export function buildTownContent(world: World, content: Content, towns: readonly Town[]): void {
  const stream = getStream(world.rng, "generation.blocks");
  const archetypesById = new Map(content.archetypes.map((a) => [a.id, a]));
  for (const town of towns) {
    const archetype = archetypesById.get(town.archetype);
    if (!archetype) throw new Error(`generation: unknown archetype ${town.archetype} for town ${town.id}`);
    generateTownContent(world, town, archetype, stream);
  }
}

/** Remove every business (and its claim) currently on a town's blocks, keeping the blocks themselves,
 * then redraw fresh businesses from the given stream. Used by the re-roll policy (stage 6, design 05
 * stage 11) so re-rolling never changes the town's block count or crew territory split. */
export function regenerateTownBusinesses(world: World, town: Town, archetype: TownArchetype, stream: Stream): void {
  for (const blockId of town.blockIds) {
    const block = world.geo.blocks.byId[blockId];
    if (!block) continue;
    for (const businessId of [...block.businessIds]) {
      const claim = claimOnSubject(world, { kind: "business", id: businessId });
      if (claim) tableRemove(world.claims, claim.id);
      tableRemove(world.geo.businesses, businessId);
    }
    block.businessIds = [];

    const businessCount = stream.nextRange(archetype.businessesPerBlock.min, archetype.businessesPerBlock.max);
    for (let i = 0; i < businessCount; i++) {
      const draw = drawBusiness(stream, archetype);
      addBusiness(world, block.id, draw);
    }
  }
}
