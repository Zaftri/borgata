// Pressure reducer (design 02 §6 row 6, design 03 §2). Owns local heat by town, family Attention and
// its band, and the state tools unlocked against each family.

import { clampMeter } from "@borgata/shared";
import type { Fact } from "../facts.js";
import type { World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

export const pressureReducer: Reducer = {
  owner: "pressure",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "HeatDelta": {
        const town = world.towns.byId[fact.townId];
        if (!town) return { reason: `unknown town ${fact.townId}` };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `delta is not an integer: ${fact.delta}` };
        if (fact.delta === 0) return { reason: "delta must be nonzero" };
        const next = clampMeter((world.pressure.heatByTown[fact.townId] ?? 0) + fact.delta);
        // Canonical: a town with no heat has no key at all (design 03 §2).
        if (next === 0) delete world.pressure.heatByTown[fact.townId];
        else world.pressure.heatByTown[fact.townId] = next;
        return null;
      }
      case "AttentionDelta": {
        const family = world.families.byId[fact.familyId];
        if (!family) return { reason: `unknown family ${fact.familyId}` };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `delta is not an integer: ${fact.delta}` };
        if (fact.delta === 0) return { reason: "delta must be nonzero" };
        family.attention = clampMeter(family.attention + fact.delta);
        return null;
      }
      case "BandChange": {
        const family = world.families.byId[fact.familyId];
        if (!family) return { reason: `unknown family ${fact.familyId}` };
        if (fact.from !== family.attentionBand) {
          return { reason: `family ${fact.familyId} band is ${family.attentionBand}, not ${fact.from}` };
        }
        if (fact.to === fact.from) return { reason: "to must differ from from" };
        family.attentionBand = fact.to;
        return null;
      }
      case "ToolUnlock": {
        const family = world.families.byId[fact.familyId];
        if (!family) return { reason: `unknown family ${fact.familyId}` };
        const tools = world.pressure.toolsByFamily[fact.familyId] ?? (world.pressure.toolsByFamily[fact.familyId] = []);
        if (!tools.includes(fact.tool)) tools.push(fact.tool);
        return null;
      }
      default:
        return { reason: `pressure does not own ${fact.kind}` };
    }
  },
};
