// Invariants for the chains system (design 02 §6 row 11, design 03 §4), registered by importing
// this module from ./all.ts.

import { registerInvariant, type Violation } from "../invariants.js";
import type { SlotFiller } from "../world.js";

function fillerKey(f: SlotFiller): string {
  return `${f.kind}:${f.id}`;
}

registerInvariant({
  name: "chains.slotsValid",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.chains.order) {
      const chain = world.chains.byId[id]!;
      for (const [slotName, fillers] of Object.entries(chain.slots)) {
        const seen = new Set<string>();
        for (const f of fillers) {
          const key = fillerKey(f);
          if (seen.has(key)) {
            out.push({ name: "chains.slotsValid", message: `chain ${id} slot ${slotName} has a duplicate filler ${key}` });
          }
          seen.add(key);
          if (f.kind === "character") {
            if (!world.characters.byId[f.id]) {
              out.push({ name: "chains.slotsValid", message: `chain ${id} slot ${slotName} references unknown character ${f.id}` });
            }
          } else if (!world.geo.blocks.byId[f.id]) {
            out.push({ name: "chains.slotsValid", message: `chain ${id} slot ${slotName} references unknown block ${f.id}` });
          }
        }
      }
    }
    return out;
  },
});

registerInvariant({
  name: "chains.ownerValid",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.chains.order) {
      const chain = world.chains.byId[id]!;
      if (!world.characters.byId[chain.ownerId]) {
        out.push({ name: "chains.ownerValid", message: `chain ${id} owner ${chain.ownerId} does not exist` });
      }
      if (!world.families.byId[chain.familyId]) {
        out.push({ name: "chains.ownerValid", message: `chain ${id} family ${chain.familyId} does not exist` });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "chains.blocksBelongToFamily",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.chains.order) {
      const chain = world.chains.byId[id]!;
      const blockFillers = chain.slots["blocks"];
      if (!blockFillers) continue;
      for (const f of blockFillers) {
        if (f.kind !== "block") continue;
        const block = world.geo.blocks.byId[f.id];
        if (!block) continue; // caught by chains.slotsValid
        const town = world.geo.towns.byId[block.townId];
        if (!town) continue; // caught by towns.blocksConsistent
        if (town.familyId !== null && town.familyId !== chain.familyId) {
          out.push({
            name: "chains.blocksBelongToFamily",
            message: `chain ${id} block ${f.id} is in town ${town.id} owned by family ${String(town.familyId)}, not chain family ${chain.familyId}`,
          });
        }
      }
    }
    return out;
  },
});
