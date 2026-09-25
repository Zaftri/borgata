// Invariants for the towns system (design 02 §3, §6 row 7; design 03 §5), registered by importing
// this module from ./all.ts.

import { registerInvariant, type Violation } from "../invariants.js";

registerInvariant({
  name: "towns.stateForEveryTown",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.geo.towns.order) {
      if (!world.towns.byId[id]) out.push({ name: "towns.stateForEveryTown", message: `town ${id} has no TownState` });
    }
    for (const id of world.towns.order) {
      if (!world.geo.towns.byId[id]) out.push({ name: "towns.stateForEveryTown", message: `TownState ${id} has no town in geo.towns` });
    }
    return out;
  },
});

registerInvariant({
  name: "towns.metersInRange",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.towns.order) {
      const t = world.towns.byId[id]!;
      if (!Number.isInteger(t.sentiment) || t.sentiment < -1000 || t.sentiment > 1000) {
        out.push({ name: "towns.metersInRange", message: `town ${id} sentiment out of range: ${t.sentiment}` });
      }
      if (!Number.isInteger(t.pettyCrime) || t.pettyCrime < 0 || t.pettyCrime > 1000) {
        out.push({ name: "towns.metersInRange", message: `town ${id} pettyCrime out of range: ${t.pettyCrime}` });
      }
    }
    for (const id of world.geo.businesses.order) {
      const b = world.geo.businesses.byId[id]!;
      if (!Number.isInteger(b.compliance) || b.compliance < 0 || b.compliance > 1000) {
        out.push({ name: "towns.metersInRange", message: `business ${id} compliance out of range: ${b.compliance}` });
      }
      if (!Number.isInteger(b.fear) || b.fear < 0 || b.fear > 1000) {
        out.push({ name: "towns.metersInRange", message: `business ${id} fear out of range: ${b.fear}` });
      }
      if (!Number.isInteger(b.refusalStage) || b.refusalStage < 0 || b.refusalStage > 4) {
        out.push({ name: "towns.metersInRange", message: `business ${id} refusalStage out of range: ${b.refusalStage}` });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "towns.blocksConsistent",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.geo.blocks.order) {
      const block = world.geo.blocks.byId[id]!;
      const town = world.geo.towns.byId[block.townId];
      if (!town) {
        out.push({ name: "towns.blocksConsistent", message: `block ${id} references unknown town ${block.townId}` });
      } else if (!(town.blockIds as readonly string[]).includes(id)) {
        out.push({ name: "towns.blocksConsistent", message: `town ${block.townId} does not list block ${id}` });
      }
    }
    for (const id of world.geo.businesses.order) {
      const biz = world.geo.businesses.byId[id]!;
      const block = world.geo.blocks.byId[biz.blockId];
      if (!block) {
        out.push({ name: "towns.blocksConsistent", message: `business ${id} references unknown block ${biz.blockId}` });
      } else if (!(block.businessIds as readonly string[]).includes(id)) {
        out.push({ name: "towns.blocksConsistent", message: `block ${biz.blockId} does not list business ${id}` });
      }
    }
    return out;
  },
});
