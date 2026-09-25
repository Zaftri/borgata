// Calendar reducer (design 02 §6 row 12; design 03 §6). Owns turn, calendar, turn length and crisis flags.

import type { Fact } from "../facts.js";
import type { TurnLogBuilder } from "../log.js";
import { playerCharacter, type Rank, type TurnLength, type World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

const WEEKS_PER_YEAR = 52;

const TURN_LENGTH_BY_RANK: Record<Rank, TurnLength> = {
  civilian: 1,
  associate: 1,
  soldier: 1,
  chief: 2,
  underboss: 4,
  counselor: 4,
  head: 4,
};

/** Design 03 §6: rank sets the base; any active crisis contracts the turn to a week. */
export function computeTurnLength(world: World): TurnLength {
  if (world.meta.crises.length > 0) return 1;
  return TURN_LENGTH_BY_RANK[playerCharacter(world).rank];
}

export const calendarReducer: Reducer = {
  owner: "calendar",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "CrisisFlagSet": {
        const existing = world.meta.crises.findIndex((c) => c.flag === fact.flag);
        if (fact.active) {
          if (!Number.isSafeInteger(fact.ttl) || fact.ttl <= 0) return { reason: `crisis ttl must be positive: ${fact.ttl}` };
          const entry = { flag: fact.flag, ttl: fact.ttl, cause: fact.cause.rule };
          if (existing >= 0) world.meta.crises[existing] = entry;
          else world.meta.crises.push(entry);
        } else if (existing >= 0) {
          world.meta.crises.splice(existing, 1);
        }
        return null;
      }
      case "TurnLengthSet":
        // Informational: the calendar computes turn length itself; accept so the log carries it.
        return null;
      default:
        return { reason: `calendar does not own ${fact.kind}` };
    }
  },
};

/**
 * End-of-turn calendar advance (design 01 §3 step 8): expire crisis flags, recompute turn length,
 * advance the calendar by the *current* turn length, increment the turn.
 */
export function advanceCalendar(world: World, log: TurnLogBuilder): void {
  const elapsed = world.meta.turnLength;

  // Expire crises by the turn that just passed.
  world.meta.crises = world.meta.crises
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  let week = world.meta.calendar.week + elapsed;
  let year = world.meta.calendar.year;
  while (week > WEEKS_PER_YEAR) {
    week -= WEEKS_PER_YEAR;
    year += 1;
  }
  world.meta.calendar = { year, week };
  world.meta.turn += 1;

  const next = computeTurnLength(world);
  if (next !== world.meta.turnLength) {
    const reason = world.meta.crises.length > 0 ? `crisis: ${world.meta.crises.map((c) => c.flag).join(", ")}` : `rank: ${playerCharacter(world).rank}`;
    world.meta.turnLength = next;
    log.fact({ kind: "TurnLengthSet", weeks: next, cause: { rule: reason } });
  }
}
