// Invariants for the evidence system (design 03 §3; design 02 §5, §6 row 5), registered by importing
// this module from ./all.ts. Three checks: the derived exposure agrees with the dossier, every item
// in every dossier is well-formed, and every dossier names a character that exists.

import { registerInvariant, type Violation } from "../invariants.js";
import type { EvidenceSource } from "../world.js";

const VALID_SOURCES: readonly EvidenceSource[] = ["witness", "wire", "collaborator", "seizure", "document", "participation"];

registerInvariant({
  name: "evidence.exposureMatchesDossier",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.characters.order) {
      const character = world.characters.byId[id]!;
      const dossier = world.evidence.dossiers.byId[id];
      const sum = dossier ? dossier.items.reduce((total, item) => total + item.weight, 0) : 0;
      const expected = Math.min(1000, sum);
      if (character.exposure !== expected) {
        out.push({
          name: "evidence.exposureMatchesDossier",
          message: `character ${id} exposure ${character.exposure} but dossier implies ${expected}`,
        });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "evidence.itemsValid",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.evidence.dossiers.order) {
      const dossier = world.evidence.dossiers.byId[id]!;
      for (const item of dossier.items) {
        if (!Number.isSafeInteger(item.weight) || item.weight <= 0) {
          out.push({ name: "evidence.itemsValid", message: `dossier ${id} item ${item.crimeRef} has invalid weight ${item.weight}` });
        }
        if (!item.crimeRef) {
          out.push({ name: "evidence.itemsValid", message: `dossier ${id} has an item with an empty crimeRef` });
        }
        if (!VALID_SOURCES.includes(item.source)) {
          out.push({ name: "evidence.itemsValid", message: `dossier ${id} item ${item.crimeRef} has invalid source ${String(item.source)}` });
        }
        if (item.turn > world.meta.turn) {
          out.push({
            name: "evidence.itemsValid",
            message: `dossier ${id} item ${item.crimeRef} has turn ${item.turn} after current turn ${world.meta.turn}`,
          });
        }
      }
    }
    return out;
  },
});

registerInvariant({
  name: "evidence.dossierCharacterExists",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.evidence.dossiers.order) {
      if (!world.characters.byId[id]) {
        out.push({ name: "evidence.dossierCharacterExists", message: `dossier ${id} has no matching character` });
      }
    }
    return out;
  },
});
