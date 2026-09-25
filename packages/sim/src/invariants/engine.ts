// Invariants for the event engine (design 04 §4, design 08 §4): valid schedule refs, valid instance roles,
// one operation per locked subject, awaitingDecision instances have options, no past fireTurn.
// Registered by importing this module from ./all.ts.

import { registerInvariant, type Violation } from "../invariants.js";
import type { EntityRef } from "../engine/types.js";
import type { World } from "../world.js";

function entityExists(world: World, ref: EntityRef): boolean {
  switch (ref.kind) {
    case "character":
      return !!world.characters.byId[ref.id];
    case "family":
      return !!world.families.byId[ref.id];
    case "crew":
      return !!world.crews.byId[ref.id];
    case "town":
      return !!world.geo.towns.byId[ref.id];
    case "block":
      return !!world.geo.blocks.byId[ref.id];
    case "business":
      return !!world.geo.businesses.byId[ref.id];
    default:
      return false;
  }
}

function scheduleSortKey(a: { fireTurn: number; priority: number; createdTurn: number; id: string }, b: typeof a): number {
  return a.fireTurn - b.fireTurn || b.priority - a.priority || a.createdTurn - b.createdTurn || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

registerInvariant({
  name: "engine.scheduleValid",
  check(world): Violation[] {
    const out: Violation[] = [];
    const seen = new Set<string>();
    for (const entry of world.schedule) {
      if (seen.has(entry.id)) out.push({ name: "engine.scheduleValid", message: `duplicate schedule entry id ${entry.id}` });
      seen.add(entry.id);
      // Invariants run after advanceCalendar, so meta.turn is already the NEXT turn; an entry due on that turn is valid.
      // (ScheduleAdd rejects fireTurn <= turn at apply time, before the advance.) Fixed 2026-09-23 after an off-by-one.
      if (entry.fireTurn < world.meta.turn) {
        out.push({ name: "engine.scheduleValid", message: `entry ${entry.id} fireTurn ${entry.fireTurn} is before current turn ${world.meta.turn}` });
      }
    }
    const sorted = [...world.schedule].sort(scheduleSortKey);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]!.id !== world.schedule[i]!.id) {
        out.push({ name: "engine.scheduleValid", message: "schedule is not sorted as the reducer sorts it" });
        break;
      }
    }
    return out;
  },
});

registerInvariant({
  name: "engine.instancesValid",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.processes.order) {
      const inst = world.processes.byId[id]!;
      if (inst.state !== "active" && inst.state !== "awaitingDecision") {
        out.push({ name: "engine.instancesValid", message: `process ${id} has state ${inst.state}, expected active or awaitingDecision` });
      }
      if (inst.state === "awaitingDecision" && (!inst.decision || inst.decision.options.length === 0)) {
        out.push({ name: "engine.instancesValid", message: `process ${id} is awaitingDecision without options` });
      }
      for (const [role, ref] of Object.entries(inst.roles)) {
        if (!entityExists(world, ref)) {
          out.push({ name: "engine.instancesValid", message: `process ${id} role ${role} refers to missing ${ref.kind} ${ref.id}` });
        }
      }
    }
    return out;
  },
});

registerInvariant({
  name: "engine.locksExclusive",
  check(world): Violation[] {
    const out: Violation[] = [];
    const heldBy = new Map<string, string>();
    for (const id of world.processes.order) {
      const inst = world.processes.byId[id]!;
      for (const ref of inst.locks) {
        const key = `${ref.kind}:${ref.id}`;
        const holder = heldBy.get(key);
        if (holder && holder !== id) {
          out.push({ name: "engine.locksExclusive", message: `${key} is locked by both process ${holder} and ${id}` });
        } else {
          heldBy.set(key, id);
        }
      }
    }
    return out;
  },
});

registerInvariant({
  name: "engine.requestsValid",
  check(world): Violation[] {
    const out: Violation[] = [];
    const seen = new Set<string>();
    for (const r of [...world.player.requestQueue, ...world.player.deferred]) {
      if (seen.has(r.id)) out.push({ name: "engine.requestsValid", message: `duplicate request id ${r.id}` });
      seen.add(r.id);
      if (r.instanceId !== null && !world.processes.byId[r.instanceId]) {
        out.push({ name: "engine.requestsValid", message: `request ${r.id} instanceId ${r.instanceId} does not exist` });
      }
    }
    return out;
  },
});
