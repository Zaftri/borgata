// Invariants for the claims system (design 02 §9), registered by importing this module from
// ./all.ts. Three checks: at most one claim per subject, every holder is valid, and the
// `onRecordWith` field on associate characters agrees with the associate-claim that names them.

import { registerInvariant, type Violation } from "../invariants.js";

registerInvariant({
  name: "claims.oneHolderPerSubject",
  check(world): Violation[] {
    const out: Violation[] = [];
    const seen = new Set<string>();
    for (const id of world.claims.order) {
      const claim = world.claims.byId[id]!;
      const key = `${claim.subject.kind}:${claim.subject.id}`;
      if (seen.has(key)) {
        out.push({ name: "claims.oneHolderPerSubject", message: `subject ${key} has more than one claim (also ${id})` });
      }
      seen.add(key);
    }
    return out;
  },
});

registerInvariant({
  name: "claims.holderValid",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.claims.order) {
      const claim = world.claims.byId[id]!;
      const holder = world.characters.byId[claim.holderId];
      if (!holder) {
        out.push({ name: "claims.holderValid", message: `claim ${id} holder ${claim.holderId} does not exist` });
      } else if (!holder.alive) {
        out.push({ name: "claims.holderValid", message: `claim ${id} holder ${claim.holderId} is dead` });
      } else if (holder.rank === "civilian") {
        out.push({ name: "claims.holderValid", message: `claim ${id} holder ${claim.holderId} is a civilian` });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "claims.associateOnRecordConsistent",
  check(world): Violation[] {
    const out: Violation[] = [];
    // claimIds keyed by associate subject id, so we can also catch more-than-one further down.
    const associateClaimIds = new Map<string, string[]>();
    for (const id of world.claims.order) {
      const claim = world.claims.byId[id]!;
      if (claim.subject.kind !== "associate") continue;
      const list = associateClaimIds.get(claim.subject.id) ?? [];
      list.push(id);
      associateClaimIds.set(claim.subject.id, list);
      const subjectChar = world.characters.byId[claim.subject.id];
      if (subjectChar && subjectChar.onRecordWith !== claim.holderId) {
        out.push({
          name: "claims.associateOnRecordConsistent",
          message: `claim ${id} holder ${claim.holderId} but subject ${claim.subject.id} onRecordWith is ${String(subjectChar.onRecordWith)}`,
        });
      }
    }
    for (const id of world.characters.order) {
      const character = world.characters.byId[id]!;
      if (!character.onRecordWith) continue;
      const claimIds = associateClaimIds.get(id) ?? [];
      if (claimIds.length !== 1) {
        out.push({
          name: "claims.associateOnRecordConsistent",
          message: `character ${id} onRecordWith ${character.onRecordWith} but has ${claimIds.length} associate-claims naming it as subject`,
        });
      }
    }
    return out;
  },
});
