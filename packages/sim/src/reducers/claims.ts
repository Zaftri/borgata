// Claims reducer (design 02 §6 row 2; design 02 §5, §9; A3). Owns the claims table: who is publicly
// on record for a business or an associate. Exactly one claim per subject (design 02 §9). Setting or
// transferring a claim onto an associate subject also sets that associate's `onRecordWith`; releasing
// it clears `onRecordWith` back to null. Reads characters and businesses but never writes them except
// for this one field, which design 02 §4 assigns to the claims owner.

import { tableInsert, tableRemove } from "@borgata/shared";
import type { CharacterId } from "@borgata/shared";
import type { ClaimSubject, Fact } from "../facts.js";
import type { Claim, World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

function sameSubject(a: ClaimSubject, b: ClaimSubject): boolean {
  if (a.kind === "business" && b.kind === "business") return a.id === b.id;
  if (a.kind === "associate" && b.kind === "associate") return a.id === b.id;
  return false;
}

/** The claim currently on a subject, if any (design 02 §9: at most one). O(claims); fine at phase-1 scale. */
export function claimOnSubject(world: World, subject: ClaimSubject): Claim | undefined {
  for (const id of world.claims.order) {
    const claim = world.claims.byId[id]!;
    if (sameSubject(claim.subject, subject)) return claim;
  }
  return undefined;
}

/** All claims held by a character, in table order (deterministic). */
export function claimsHeldBy(world: World, holderId: CharacterId): Claim[] {
  const out: Claim[] = [];
  for (const id of world.claims.order) {
    const claim = world.claims.byId[id]!;
    if (claim.holderId === holderId) out.push(claim);
  }
  return out;
}

/** A holder must be a living character of rank above civilian (design 02 §9). */
function rejectHolder(world: World, holderId: CharacterId): Rejection | null {
  const holder = world.characters.byId[holderId];
  if (!holder) return { reason: `unknown holder ${holderId}` };
  if (!holder.alive) return { reason: `holder ${holderId} is dead` };
  if (holder.rank === "civilian") return { reason: `holder ${holderId} is a civilian` };
  return null;
}

export const claimsReducer: Reducer = {
  owner: "claims",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "ClaimSet": {
        if (world.claims.byId[fact.claimId]) return { reason: `claim ${fact.claimId} already exists` };
        const holderBad = rejectHolder(world, fact.holderId);
        if (holderBad) return holderBad;
        const subject = fact.subject;
        if (subject.kind === "business") {
          if (!world.geo.businesses.byId[subject.id]) return { reason: `unknown business ${subject.id}` };
        } else {
          const associate = world.characters.byId[subject.id];
          if (!associate) return { reason: `unknown associate ${subject.id}` };
          if (associate.rank !== "associate") return { reason: `subject ${subject.id} is not rank associate (${associate.rank})` };
          if (subject.id === fact.holderId) return { reason: `associate ${subject.id} cannot hold their own claim` };
        }
        if (claimOnSubject(world, subject)) return { reason: `subject already has a claim` };
        const claim: Claim = { id: fact.claimId, subject, holderId: fact.holderId, since: world.meta.turn };
        tableInsert(world.claims, fact.claimId, claim);
        if (subject.kind === "associate") {
          world.characters.byId[subject.id]!.onRecordWith = fact.holderId;
        }
        return null;
      }
      case "ClaimTransfer": {
        const claim = world.claims.byId[fact.claimId];
        if (!claim) return { reason: `unknown claim ${fact.claimId}` };
        const holderBad = rejectHolder(world, fact.toHolderId);
        if (holderBad) return holderBad;
        if (claim.holderId === fact.toHolderId) return { reason: `claim ${fact.claimId} is already held by ${fact.toHolderId}` };
        claim.holderId = fact.toHolderId;
        if (claim.subject.kind === "associate") {
          const associate = world.characters.byId[claim.subject.id];
          if (associate) associate.onRecordWith = fact.toHolderId;
        }
        return null;
      }
      case "ClaimRelease": {
        const claim = world.claims.byId[fact.claimId];
        if (!claim) return { reason: `unknown claim ${fact.claimId}` };
        if (claim.subject.kind === "associate") {
          const associate = world.characters.byId[claim.subject.id];
          if (associate) associate.onRecordWith = null;
        }
        tableRemove(world.claims, fact.claimId);
        return null;
      }
      default:
        return { reason: `claims does not own ${fact.kind}` };
    }
  },
};
