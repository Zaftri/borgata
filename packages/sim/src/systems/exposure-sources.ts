// Evidence and heat produced by ordinary, visible activity (design 03 §2, §3; B13: every slot is an
// exposure point). Phase 2: the protection-tax chain is the only source. Systems never mutate World;
// the step applies the returned Facts through the owner reducers.

import type { Content } from "../content-types.js";
import type { Cause, Fact } from "../facts.js";
import { LIFESTYLE_HEAT, type World } from "../world.js";

const PROTECTION_TAX_TEMPLATE = "chain.protectionTax";

/** Evidence weight for a collector's own participation this turn (design 03 §3 item weights, illustrative). */
const COLLECTOR_WEIGHT = 3;
/** Evidence weight for the chain owner, who ordered it through one buffer (design 03 §3 buffer discount). */
const OWNER_WEIGHT = 1;
/** Heat added to the block's town per turn-week the collection was visible in (design 03 §2 direct adds). */
const HEAT_PER_WEEK = 5;

export function exposureFromActivity(world: World, _content: Content): Fact[] {
  const facts: Fact[] = [];
  // Design 13: a war is loud. Both families' towns heat every week it lasts.
  for (const fid of world.families.order) {
    const f = world.families.byId[fid]!;
    if (!f.warWith) continue;
    for (const townId of f.townIds) facts.push({ kind: "HeatDelta", townId, delta: 5 * world.meta.turnLength, cause: { rule: "activity.war" } });
  }
  // Design 12: visible wealth. A lavish man draws the state's eye to his town every week (design 03 §4).
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    const heat = LIFESTYLE_HEAT[c.lifestyle];
    if (!c.alive || heat === 0 || !c.familyId) continue;
    const townId = world.families.byId[c.familyId]?.townIds[0];
    if (townId) facts.push({ kind: "HeatDelta", townId, delta: heat * world.meta.turnLength, cause: { rule: "activity.lifestyle", actorId: c.id } });
  }

  const heatedTowns = new Set<string>();

  for (const chainId of world.chains.order) {
    const chain = world.chains.byId[chainId]!;
    if (chain.templateId !== PROTECTION_TAX_TEMPLATE) continue;

    const collectorFillers = chain.slots["collectors"];
    const blockFillers = chain.slots["blocks"];
    if (!collectorFillers || collectorFillers.length === 0) continue;
    if (!blockFillers || blockFillers.length === 0) continue;

    const collectionCause: Cause = { rule: "activity.collection", instanceId: chain.id };

    for (const filler of collectorFillers) {
      if (filler.kind !== "character") continue;
      const collector = world.characters.byId[filler.id];
      if (!collector || !collector.alive || collector.status !== "free") continue;
      facts.push({
        kind: "EvidenceAdd",
        characterId: collector.id,
        item: { crimeRef: `extortion:${chain.id}`, weight: COLLECTOR_WEIGHT, source: "participation" }, // one item per chain, weight grows each turn
        cause: collectionCause,
      });
    }

    // Routine collection is visible once per town per turn, whatever the number of blocks or crews: heat measures
    // that "the family collects here", not the size of the operation (2026-09-23; per-block heat put four-block
    // towns in band 2 and drifting to 3 from collections alone).
    for (const filler of blockFillers) {
      if (filler.kind !== "block") continue;
      const block = world.geo.blocks.byId[filler.id];
      if (!block) continue;
      if (heatedTowns.has(block.townId)) continue;
      heatedTowns.add(block.townId);
      facts.push({
        kind: "HeatDelta",
        townId: block.townId,
        delta: HEAT_PER_WEEK * world.meta.turnLength,
        cause: { rule: "activity.collection.visible", instanceId: chain.id },
      });
    }

    // The chain owner ordered the collection through one buffer: a lighter, discounted item (design 03 §3).
    facts.push({
      kind: "EvidenceAdd",
      characterId: chain.ownerId,
      item: { crimeRef: `extortion:${chain.id}:ordered`, weight: OWNER_WEIGHT, source: "participation" },
      cause: { rule: "activity.collection.ordered", instanceId: chain.id },
    });
  }

  return facts;
}
