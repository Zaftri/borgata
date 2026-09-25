// Relationships reducer (design 02 §4, design 03 §5). Owns loyalty, favors and memory.
// Loyalty is per character toward its direct superior; favors are a signed ledger between characters;
// memory is a bounded per-character list of slights, favors and deaths.

import { clampMeter, clampSigned, decayToward } from "@borgata/shared";
import type { Fact } from "../facts.js";
import { favorKey, standingKey, type Character, type MemoryEntry, type World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

/** Bound on how many memories a character keeps (design 02 §4, A6). */
const MEMORY_LIMIT = 32;

function character(world: World, id: string): Character | undefined {
  return world.characters.byId[id];
}

/**
 * Drop entries over the memory limit, lowest weight first; ties keep the later (more recent) entry,
 * i.e. the earliest entry in the array is dropped first.
 */
function pruneMemory(memory: MemoryEntry[]): void {
  while (memory.length > MEMORY_LIMIT) {
    let minIndex = 0;
    for (let i = 1; i < memory.length; i++) {
      if (memory[i]!.weight < memory[minIndex]!.weight) minIndex = i;
    }
    memory.splice(minIndex, 1);
  }
}

export const relationshipsReducer: Reducer = {
  owner: "relationships",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "LoyaltyDelta": {
        const c = character(world, fact.characterId);
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (!c.alive) return { reason: `character ${fact.characterId} is dead` };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `delta is not an integer: ${fact.delta}` };
        if (fact.delta === 0) return { reason: "delta must be nonzero" };
        c.loyalty = clampMeter(c.loyalty + fact.delta);
        return null;
      }
      case "StandingDelta": {
        if (!world.families.byId[fact.familyA] || !world.families.byId[fact.familyB]) return { reason: "unknown family" };
        if (fact.familyA === fact.familyB) return { reason: "standing needs two families" };
        if (!Number.isSafeInteger(fact.delta) || fact.delta === 0) return { reason: "delta must be a nonzero integer" };
        const key = standingKey(fact.familyA, fact.familyB);
        const next = clampSigned((world.standing[key] ?? 0) + fact.delta);
        if (next === 0) delete world.standing[key];
        else world.standing[key] = next;
        return null;
      }
      case "FavorDelta": {
        const from = character(world, fact.from);
        const to = character(world, fact.to);
        if (!from) return { reason: `unknown character ${fact.from}` };
        if (!to) return { reason: `unknown character ${fact.to}` };
        if (fact.from === fact.to) return { reason: "favor from and to must differ" };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `delta is not an integer: ${fact.delta}` };
        if (fact.delta === 0) return { reason: "delta must be nonzero" };
        const key = favorKey(fact.from, fact.to);
        const next = clampSigned((world.favors[key] ?? 0) + fact.delta);
        if (next === 0) delete world.favors[key];
        else world.favors[key] = next;
        return null;
      }
      case "MemoryAdd": {
        const c = character(world, fact.characterId);
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        const { tag, aboutId, weight } = fact.memory;
        if (!Number.isSafeInteger(weight) || weight <= 0) return { reason: `memory weight must be a positive integer: ${weight}` };
        if (tag.length === 0) return { reason: "memory tag must not be empty" };
        const entry: MemoryEntry = aboutId === undefined ? { tag, weight, turn: world.meta.turn } : { tag, aboutId, weight, turn: world.meta.turn };
        c.memory.push(entry);
        pruneMemory(c.memory);
        return null;
      }
      default:
        return { reason: `relationships does not own ${fact.kind}` };
    }
  },
};

/**
 * Per-turn loyalty decay toward the baseline 500, half-life 104 weeks (design 03 §5).
 * Not wired into `step` yet; another task owns that.
 */
/** Favors fade (design 03 §5, tuned 2026-09-25): a favor ledger entry moves toward zero with a half-life of 52
 *  weeks, so an old refusal or an old favor stops counting after a year. Without this the careful man was dropped
 *  in half of careers by the slow drip of small refusals (careers 2026-09-24). */
/** Standing between families fades toward zero over two years (design 13 §2). */
export function decayStanding(world: World, elapsedWeeks: number): void {
  for (const key of Object.keys(world.standing)) {
    const next = decayToward(world.standing[key]!, 0, 104, elapsedWeeks);
    if (next === 0) delete world.standing[key];
    else world.standing[key] = next;
  }
}

export function decayFavors(world: World, elapsedWeeks: number): void {
  for (const key of Object.keys(world.favors)) {
    const next = decayToward(world.favors[key]!, 0, 52, elapsedWeeks);
    if (next === 0) delete world.favors[key];
    else world.favors[key] = next;
  }
}

export function decayLoyalty(world: World, elapsedWeeks: number): void {
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.alive) continue;
    c.loyalty = clampMeter(decayToward(c.loyalty, 500, 104, elapsedWeeks));
  }
}
