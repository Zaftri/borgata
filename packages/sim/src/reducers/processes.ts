// Processes reducer (design 02 §6 row 11). Phase 1: chain instances as slot boards (design 03 §4, B13).
// The event engine (design 04) joins this reducer in phase 3.

import { tableInsert, tableRemove } from "@borgata/shared";
import type { Fact } from "../facts.js";
import type { SlotFiller, World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

function sameFiller(a: SlotFiller, b: SlotFiller): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function fillerExists(world: World, f: SlotFiller): boolean {
  return f.kind === "character" ? !!world.characters.byId[f.id] : !!world.geo.blocks.byId[f.id];
}

export const processesReducer: Reducer = {
  owner: "processes",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "ChainCreate": {
        if (world.chains.byId[fact.chainId]) return { reason: `chain ${fact.chainId} exists` };
        if (!world.families.byId[fact.familyId]) return { reason: `unknown family ${fact.familyId}` };
        const owner = world.characters.byId[fact.ownerId];
        if (!owner || !owner.alive) return { reason: `owner ${fact.ownerId} missing or dead` };
        if (fact.slotNames.length === 0) return { reason: "a chain needs at least one slot" };
        const slots: Record<string, SlotFiller[]> = {};
        for (const s of fact.slotNames) slots[s] = [];
        tableInsert(world.chains, fact.chainId, { id: fact.chainId, templateId: fact.templateId, familyId: fact.familyId, ownerId: fact.ownerId, slots, lastRunTurn: -1 });
        return null;
      }
      case "ChainSlotFill": {
        const chain = world.chains.byId[fact.chainId];
        if (!chain) return { reason: `unknown chain ${fact.chainId}` };
        const slot = chain.slots[fact.slot];
        if (!slot) return { reason: `chain has no slot ${fact.slot}` };
        if (!fillerExists(world, fact.filler)) return { reason: `filler ${fact.filler.kind} ${fact.filler.id} does not exist` };
        if (slot.some((f) => sameFiller(f, fact.filler))) return { reason: "filler already in slot" };
        slot.push(fact.filler);
        return null;
      }
      case "ChainSlotVacate": {
        const chain = world.chains.byId[fact.chainId];
        if (!chain) return { reason: `unknown chain ${fact.chainId}` };
        const slot = chain.slots[fact.slot];
        if (!slot) return { reason: `chain has no slot ${fact.slot}` };
        const i = slot.findIndex((f) => sameFiller(f, fact.filler));
        if (i < 0) return { reason: "filler not in slot" };
        slot.splice(i, 1);
        return null;
      }
      case "ChainRemove": {
        if (!world.chains.byId[fact.chainId]) return { reason: `unknown chain ${fact.chainId}` };
        tableRemove(world.chains, fact.chainId);
        return null;
      }
      case "ProcessSpawn": {
        const inst = fact.instance;
        if (world.processes.byId[inst.id]) return { reason: `process ${inst.id} exists` };
        if (inst.state !== "active" && inst.state !== "awaitingDecision") return { reason: `spawned instance must be active` };
        tableInsert(world.processes, inst.id, structuredClone(inst));
        return null;
      }
      case "ProcessProgress": {
        const inst = world.processes.byId[fact.instanceId];
        if (!inst) return { reason: `unknown process ${fact.instanceId}` };
        if (inst.state !== "active") return { reason: `process ${fact.instanceId} is ${inst.state}` };
        if (!Number.isSafeInteger(fact.progress) || fact.progress < 0 || fact.progress > 1000) return { reason: `progress out of range` };
        inst.progress = fact.progress;
        return null;
      }
      case "ProcessAwaitDecision": {
        const inst = world.processes.byId[fact.instanceId];
        if (!inst) return { reason: `unknown process ${fact.instanceId}` };
        if (inst.state !== "active") return { reason: `process ${fact.instanceId} is ${inst.state}` };
        if (fact.options.length === 0) return { reason: "a decision needs options" };
        inst.state = "awaitingDecision";
        inst.decision = { pendingSince: world.meta.turn, options: [...fact.options] };
        return null;
      }
      case "ProcessDecide": {
        const inst = world.processes.byId[fact.instanceId];
        if (!inst) return { reason: `unknown process ${fact.instanceId}` };
        if (inst.state !== "awaitingDecision" || !inst.decision) return { reason: `process ${fact.instanceId} is not awaiting a decision` };
        if (!inst.decision.options.includes(fact.optionId)) return { reason: `option ${fact.optionId} not offered` };
        inst.state = "active";
        inst.decision = { pendingSince: inst.decision.pendingSince, options: [fact.optionId] }; // the chosen option, read by the scheduler at resolve
        return null;
      }
      case "ProcessResolve": {
        const inst = world.processes.byId[fact.instanceId];
        if (!inst) return { reason: `unknown process ${fact.instanceId}` };
        if (inst.state === "resolved" || inst.state === "cancelled") return { reason: `process already ${inst.state}` };
        tableRemove(world.processes, fact.instanceId); // resolved instances leave the table; the log keeps them
        return null;
      }
      case "ProcessCancel": {
        const inst = world.processes.byId[fact.instanceId];
        if (!inst) return { reason: `unknown process ${fact.instanceId}` };
        tableRemove(world.processes, fact.instanceId);
        return null;
      }
      case "ScheduleAdd": {
        if (world.schedule.some((e) => e.id === fact.entry.id)) return { reason: `schedule entry ${fact.entry.id} exists` };
        if (!Number.isSafeInteger(fact.entry.fireTurn) || fact.entry.fireTurn <= world.meta.turn) return { reason: `fireTurn must be after the current turn` };
        world.schedule.push(structuredClone(fact.entry));
        // Keep the schedule sorted by (fireTurn, priority desc, createdTurn, id) so iteration is deterministic.
        world.schedule.sort((a, b) => a.fireTurn - b.fireTurn || b.priority - a.priority || a.createdTurn - b.createdTurn || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return null;
      }
      case "ScheduleRemove": {
        const i = world.schedule.findIndex((e) => e.id === fact.entryId);
        if (i < 0) return { reason: `unknown schedule entry ${fact.entryId}` };
        world.schedule.splice(i, 1);
        return null;
      }
      default:
        return { reason: `processes does not own ${fact.kind}` };
    }
  },
};
