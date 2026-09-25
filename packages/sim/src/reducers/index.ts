// Owner reducers and the apply loop (design 01 §3 step 4, §4; design 02 §6).
// Systems emit Facts; this module hands each Fact to its owner in the fixed order. Reducers never throw on data:
// an invalid Fact is rejected with a reason that goes to the log.

import { OWNER_OF_FACT, OWNER_ORDER, type Fact, type OwnerName } from "../facts.js";
import type { TurnLogBuilder } from "../log.js";
import type { World } from "../world.js";
import { ledgerReducer } from "./ledger.js";
import { obligationsReducer } from "./obligations.js";
import { charactersReducer } from "./characters.js";
import { calendarReducer } from "./calendar.js";
import { claimsReducer } from "./claims.js";
import { relationshipsReducer } from "./relationships.js";
import { townsReducer } from "./towns.js";
import { territoryReducer } from "./territory.js";
import { processesReducer } from "./processes.js";
import { evidenceReducer } from "./evidence.js";
import { pressureReducer } from "./pressure.js";
import { progressionReducer } from "./progression.js";

export type Rejection = { reason: string };

export type Reducer = {
  owner: OwnerName;
  /** Apply one fact to the world draft. Return null on success or a rejection. Must not throw on bad data. */
  apply(world: World, fact: Fact): Rejection | null;
};

const REDUCERS: Partial<Record<OwnerName, Reducer>> = {
  ledger: ledgerReducer,
  obligations: obligationsReducer,
  claims: claimsReducer,
  characters: charactersReducer,
  relationships: relationshipsReducer,
  evidence: evidenceReducer,
  pressure: pressureReducer,
  towns: townsReducer,
  territory: territoryReducer,
  processes: processesReducer,
  progression: progressionReducer,
  calendar: calendarReducer,
};

export function reducerFor(owner: OwnerName): Reducer | undefined {
  return REDUCERS[owner];
}

/**
 * Apply facts in owner order. Facts for the same owner keep their emission order.
 * Returns the number of facts applied.
 */
export function applyFacts(world: World, facts: readonly Fact[], log: TurnLogBuilder): number {
  let applied = 0;
  for (const owner of OWNER_ORDER) {
    const reducer = REDUCERS[owner];
    for (const fact of facts) {
      if (OWNER_OF_FACT[fact.kind] !== owner) continue;
      if (!reducer) {
        log.rejected(fact, `no reducer for owner ${owner} yet`);
        continue;
      }
      const rejection = reducer.apply(world, fact);
      if (rejection) log.rejected(fact, rejection.reason);
      else {
        log.fact(fact);
        applied++;
      }
    }
  }
  return applied;
}
