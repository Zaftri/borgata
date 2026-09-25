// Towns reducer (design 02 §6 row 7, design 03 §5). Owns per-town Sentiment and petty crime, and
// per-business compliance, fear and the refusal ladder.

import { clampMeter, clampSigned, decayToward, type PerTenThousand } from "@borgata/shared";
import type { Fact } from "../facts.js";
import type { Business, BusinessType, TownState, World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

function townState(world: World, id: string): TownState | undefined {
  return world.towns.byId[id];
}

function business(world: World, id: string): Business | undefined {
  return world.geo.businesses.byId[id];
}

export const townsReducer: Reducer = {
  owner: "towns",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "SentimentDelta": {
        const t = townState(world, fact.townId);
        if (!t) return { reason: `unknown town ${fact.townId}` };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `delta is not an integer: ${fact.delta}` };
        if (fact.delta === 0) return { reason: "delta must be nonzero" };
        t.sentiment = clampSigned(t.sentiment + fact.delta);
        return null;
      }
      case "PettyCrimeDelta": {
        const t = townState(world, fact.townId);
        if (!t) return { reason: `unknown town ${fact.townId}` };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `delta is not an integer: ${fact.delta}` };
        if (fact.delta === 0) return { reason: "delta must be nonzero" };
        t.pettyCrime = clampMeter(t.pettyCrime + fact.delta);
        return null;
      }
      case "ComplianceDelta": {
        const b = business(world, fact.businessId);
        if (!b) return { reason: `unknown business ${fact.businessId}` };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `delta is not an integer: ${fact.delta}` };
        if (fact.delta === 0) return { reason: "delta must be nonzero" };
        b.compliance = clampMeter(b.compliance + fact.delta);
        return null;
      }
      case "FearDelta": {
        const b = business(world, fact.businessId);
        if (!b) return { reason: `unknown business ${fact.businessId}` };
        if (!Number.isSafeInteger(fact.delta)) return { reason: `delta is not an integer: ${fact.delta}` };
        if (fact.delta === 0) return { reason: "delta must be nonzero" };
        b.fear = clampMeter(b.fear + fact.delta);
        return null;
      }
      case "RefusalStage": {
        const b = business(world, fact.businessId);
        if (!b) return { reason: `unknown business ${fact.businessId}` };
        if (!Number.isInteger(fact.stage) || fact.stage < 0 || fact.stage > 4) {
          return { reason: `stage out of range: ${fact.stage}` };
        }
        if (fact.stage === b.refusalStage) return { reason: `business ${fact.businessId} already at stage ${fact.stage}` };
        // A refuser can be squared again, so stepping down to any lower stage is always allowed;
        // stepping up is only ever one rung at a time (B6a, the escalation ladder).
        if (fact.stage > b.refusalStage + 1) {
          return { reason: `stage ${fact.stage} skips rungs from ${b.refusalStage}` };
        }
        b.refusalStage = fact.stage;
        return null;
      }
      case "CollectionMissed": {
        if (!world.geo.businesses.byId[fact.businessId]) return { reason: `unknown business ${fact.businessId}` };
        return null; // logged only: the fact exists for `recent` predicates and spawnFrom (design 09 §1)
      }
      case "BusinessOwnerSet": {
        // docs/event-storming-2026-09-25.md §3 hotspot 1: a business's civilian owner, so `roles.ts`'s
        // `ownerOf` relation has someone to bind for templates (assoc.latePayer's reporter branch,
        // sendKid's memory, assoc.civil.help's named shopkeeper).
        const b = business(world, fact.businessId);
        if (!b) return { reason: `unknown business ${fact.businessId}` };
        const owner = world.characters.byId[fact.ownerId];
        if (!owner) return { reason: `unknown character ${fact.ownerId}` };
        if (owner.rank !== "civilian") return { reason: `character ${fact.ownerId} is not a civilian (rank ${owner.rank})` };
        b.ownerId = fact.ownerId;
        return null;
      }
      default:
        return { reason: `towns does not own ${fact.kind}` };
    }
  },
};

/**
 * Per-turn Sentiment decay toward 0, half-life 52 weeks (design 03 §5).
 * Not wired into `step` yet; another task owns that.
 */
export function decaySentiment(world: World, elapsedWeeks: number): void {
  for (const id of world.towns.order) {
    const t = world.towns.byId[id]!;
    t.sentiment = clampSigned(decayToward(t.sentiment, 0, 52, elapsedWeeks));
  }
}

/** Base compliance chance per business type, per ten thousand (design 03 §5). */
const BASE_COMPLIANCE: Record<BusinessType, PerTenThousand> = {
  stall: 9000,
  shop: 8000,
  bar: 8000,
  workshop: 8000,
  restaurant: 7500,
  site: 7000,
  supermarket: 6000,
};

/**
 * Probability of a business paying at a collection (design 03 §5): base(type) + fear*4 -
 * max(0,-sentiment)*3, clamped to 0..10000. State credibility and protection benefit are later
 * systems (pressure, chains); their terms are added there when those systems exist.
 */
export function complianceChance(world: World, businessId: string): PerTenThousand {
  const b = business(world, businessId);
  if (!b) throw new Error(`unknown business ${businessId}`);
  const block = world.geo.blocks.byId[b.blockId];
  if (!block) throw new Error(`unknown block ${b.blockId}`);
  const t = townState(world, block.townId);
  if (!t) throw new Error(`unknown town ${block.townId}`);
  const sentimentAgainst = Math.max(0, -t.sentiment);
  const raw = BASE_COMPLIANCE[b.type] + b.fear * 4 - sentimentAgainst * 3;
  return Math.min(10_000, Math.max(0, raw));
}
