// Invariants for the pressure system (design 02 §6 row 6, design 03 §2), registered by importing
// this module from ./all.ts.

import { registerInvariant, type Violation } from "../invariants.js";
import { bandFor, TOOLS_BY_BAND } from "../systems/pressure.js";
import type { AttentionBand, ToolId } from "../world.js";

/** Reverse of TOOLS_BY_BAND: the band each tool belongs to. */
const BAND_OF_TOOL = ((): Record<ToolId, AttentionBand> => {
  const out = {} as Record<ToolId, AttentionBand>;
  for (const key of Object.keys(TOOLS_BY_BAND)) {
    const band = Number(key) as AttentionBand;
    for (const tool of TOOLS_BY_BAND[band]) out[tool] = band;
  }
  return out;
})();

registerInvariant({
  name: "pressure.metersInRange",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const [townId, heat] of Object.entries(world.pressure.heatByTown)) {
      if (!Number.isInteger(heat) || heat < 0 || heat > 1000) {
        out.push({ name: "pressure.metersInRange", message: `town ${townId} heat out of range: ${heat}` });
      }
      if (heat === 0) {
        out.push({ name: "pressure.metersInRange", message: `town ${townId} has a zero-valued heat key, should have been deleted` });
      }
    }
    for (const id of world.families.order) {
      const family = world.families.byId[id]!;
      if (!Number.isInteger(family.attention) || family.attention < 0 || family.attention > 1000) {
        out.push({ name: "pressure.metersInRange", message: `family ${id} attention out of range: ${family.attention}` });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "pressure.bandConsistent",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.families.order) {
      const family = world.families.byId[id]!;
      const expected = bandFor(family.attention, family.attentionBand);
      if (family.attentionBand !== expected) {
        out.push({
          name: "pressure.bandConsistent",
          message: `family ${id} attentionBand ${family.attentionBand} does not match bandFor(attention ${family.attention}) = ${expected}`,
        });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "pressure.toolsMatchBand",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const [familyId, tools] of Object.entries(world.pressure.toolsByFamily)) {
      const family = world.families.byId[familyId];
      const band = family ? family.attentionBand : 0;
      for (const tool of tools) {
        const toolBand = BAND_OF_TOOL[tool];
        if (toolBand > band) {
          out.push({
            name: "pressure.toolsMatchBand",
            message: `family ${familyId} has tool ${tool} (band ${toolBand}) above its band ${band}`,
          });
        }
      }
    }
    return out;
  },
});

registerInvariant({
  name: "pressure.heatTownsExist",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const townId of Object.keys(world.pressure.heatByTown)) {
      if (!world.towns.byId[townId]) {
        out.push({ name: "pressure.heatTownsExist", message: `heat recorded for unknown town ${townId}` });
      }
    }
    return out;
  },
});
