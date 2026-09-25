// Progression reducer (design 02 §6 row 10). Phase 3: the player's request queue and deferrals (design 04 §4).
// Weight and UI layers arrive in phase 4.

import type { Fact } from "../facts.js";
import type { World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

export const progressionReducer: Reducer = {
  owner: "progression",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "ReportNote": {
        if (!fact.text) return { reason: "a report note needs text" };
        return null; // no state: projectReport prints it
      }
      case "PermissionAsked": {
        if (!world.characters.byId[fact.characterId]) return { reason: `unknown character ${fact.characterId}` };
        return null; // no state: the fact exists for `spawnFrom` (design 09 §6)
      }
      case "RecordDelta": {
        const c = world.characters.byId[fact.characterId];
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `record delta must be an integer` };
        const next = fact.set ? fact.delta : c.record[fact.field] + fact.delta;
        if (next < 0) return { reason: `record ${fact.field} cannot go below zero` };
        c.record[fact.field] = next;
        return null;
      }
      case "WeightSet": {
        const c = world.characters.byId[fact.characterId];
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (!Number.isSafeInteger(fact.value) || fact.value < 0 || fact.value > 1000) return { reason: `weight out of range: ${fact.value}` };
        c.weight = fact.value;
        return null;
      }
      case "UiLayerUnlock": {
        if (world.player.uiLayersUnlocked.includes(fact.layer)) return { reason: `layer ${fact.layer} already unlocked` };
        world.player.uiLayersUnlocked.push(fact.layer);
        return null;
      }
      case "RequestPush": {
        if (world.player.requestQueue.some((r) => r.id === fact.request.id)) return { reason: `request ${fact.request.id} exists` };
        world.player.requestQueue.push({ ...fact.request });
        world.player.deferred = world.player.deferred.filter((r) => r.id !== fact.request.id);
        return null;
      }
      case "RequestResolve": {
        const i = world.player.requestQueue.findIndex((r) => r.id === fact.requestId);
        if (i < 0) return { reason: `unknown request ${fact.requestId}` };
        world.player.requestQueue.splice(i, 1);
        return null;
      }
      case "RequestDefer": {
        const existing = world.player.deferred.findIndex((r) => r.id === fact.request.id);
        if (existing >= 0) world.player.deferred[existing] = { ...fact.request };
        else world.player.deferred.push({ ...fact.request });
        return null;
      }
      default:
        return { reason: `progression does not own ${fact.kind}` };
    }
  },
};

/**
 * End-of-turn sweep (owner: progression): a request tied to a process that has resolved or been cancelled leaves
 * the queue, so the player never sees a decision that no longer exists (design 07). Returns Facts for the log.
 * Added 2026-09-23 after the refusal chain exposed dangling requests.
 */
export function sweepRequests(world: World): Fact[] {
  const out: Fact[] = [];
  for (const r of world.player.requestQueue) {
    if (r.instanceId !== null && !world.processes.byId[r.instanceId]) {
      out.push({ kind: "RequestResolve", requestId: r.id, cause: { rule: "request.instanceGone", instanceId: r.instanceId } });
    }
  }
  return out;
}
