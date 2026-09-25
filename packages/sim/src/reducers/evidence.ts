// Evidence reducer (design 03 §3; design 02 §5 Evidence, §6 row 5). Owns the dossier table and the
// derived `Character.exposure`. Items never decay in place (design 03 §3): they are removed only by
// EvidenceRemove (a witness's source dies or retracts) or later by a case reset (not yet implemented).

import { tableInsert } from "@borgata/shared";
import type { CharacterId } from "@borgata/shared";
import type { Fact } from "../facts.js";
import type { Dossier, World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

/** The dossier for a character, if any. */
export function dossierOf(world: World, characterId: CharacterId): Dossier | undefined {
  return world.evidence.dossiers.byId[characterId];
}

/** Recompute `character.exposure` from the dossier: min(1000, sum of item weights), or 0 with no dossier. */
export function recomputeExposure(world: World, characterId: CharacterId): void {
  const character = world.characters.byId[characterId];
  if (!character) return;
  const dossier = world.evidence.dossiers.byId[characterId];
  const sum = dossier ? dossier.items.reduce((total, item) => total + item.weight, 0) : 0;
  character.exposure = Math.min(1000, sum);
}

export const evidenceReducer: Reducer = {
  owner: "evidence",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "EvidenceAdd": {
        const character = world.characters.byId[fact.characterId];
        if (!character) return { reason: `unknown character ${fact.characterId}` };
        if (!Number.isSafeInteger(fact.item.weight) || fact.item.weight <= 0) {
          return { reason: `item weight must be a positive integer: ${fact.item.weight}` };
        }
        if (!fact.item.crimeRef) return { reason: "item crimeRef must not be empty" };

        let dossier = world.evidence.dossiers.byId[fact.characterId];
        if (!dossier) {
          dossier = { characterId: fact.characterId, items: [] };
          tableInsert(world.evidence.dossiers, fact.characterId, dossier);
        }
        // Same crime, same source: one item whose weight accumulates and whose turn is the latest sighting. Keeps a
        // dossier bounded by distinct crimes rather than by turns (2026-09-23: unbounded growth cost 0.1 ms per turn
        // per year on a full province). Distinct sources for one crime stay distinct items (a witness and a wire).
        const existing = dossier.items.find((i) => i.crimeRef === fact.item.crimeRef && i.source === fact.item.source);
        if (existing) {
          existing.weight += fact.item.weight;
          existing.turn = world.meta.turn;
        } else {
          dossier.items.push({ ...fact.item, turn: world.meta.turn });
        }
        recomputeExposure(world, fact.characterId);
        return null;
      }
      case "EvidenceRemove": {
        const dossier = world.evidence.dossiers.byId[fact.characterId];
        if (!dossier) return { reason: `no dossier for ${fact.characterId}` };
        const before = dossier.items.length;
        dossier.items = dossier.items.filter((item) => item.crimeRef !== fact.crimeRef);
        if (dossier.items.length === before) {
          return { reason: `no item with crimeRef ${fact.crimeRef} in dossier ${fact.characterId}` };
        }
        recomputeExposure(world, fact.characterId);
        return null;
      }
      default:
        return { reason: `evidence does not own ${fact.kind}` };
    }
  },
};
