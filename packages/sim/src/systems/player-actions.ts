// Validate the player's actions against the world and turn them into Facts (design 07). Every rejection
// is returned with a reason; this module never throws on bad input (CLAUDE.md rule 7, applied to player
// input the same as to Facts).

import { mintId } from "@borgata/shared";
import { claimOnSubject } from "../reducers/claims.js";
import type { ClaimSubject, Fact } from "../facts.js";
import type { PlayerAction } from "../step.js";
import { playerCharacter, type World } from "../world.js";

export type ActionRejection = { action: PlayerAction; reason: string };

/** Human-readable text for the two things a player can ask permission for (a placeholder until disputes). */
const PERMISSION_TEXT: Record<"makeAssociate" | "openBook", string> = {
  makeAssociate: "make an associate",
  openBook: "open a book",
};

export function ingestPlayerActions(world: World, actions: readonly PlayerAction[]): { facts: Fact[]; rejected: ActionRejection[] } {
  const facts: Fact[] = [];
  const rejected: ActionRejection[] = [];
  const p = playerCharacter(world);

  for (const action of actions) {
    switch (action.kind) {
      case "setShare": {
        const sub = world.characters.byId[action.subordinateId];
        if (!sub) {
          rejected.push({ action, reason: `unknown subordinate ${action.subordinateId}` });
          break;
        }
        if (sub.superiorId !== p.id) {
          rejected.push({ action, reason: `${action.subordinateId} does not report to the player` });
          break;
        }
        const { fixedPerTurn, percent } = action.rule;
        if (!Number.isSafeInteger(fixedPerTurn) || fixedPerTurn < 0) {
          rejected.push({ action, reason: `fixedPerTurn invalid: ${fixedPerTurn}` });
          break;
        }
        if (!Number.isSafeInteger(percent) || percent < 0 || percent > 1000) {
          rejected.push({ action, reason: `percent invalid: ${percent}` });
          break;
        }
        facts.push({
          kind: "ShareRuleSet",
          superiorId: p.id,
          subordinateId: sub.id,
          rule: { fixedPerTurn, percent },
          cause: { rule: "player.setShare", actorId: p.id },
        });
        break;
      }
      case "claimBusiness": {
        if (p.rank === "civilian" || p.rank === "associate") {
          rejected.push({ action, reason: "associates cannot hold claims" });
          break;
        }
        const business = world.geo.businesses.byId[action.businessId];
        if (!business) {
          rejected.push({ action, reason: `unknown business ${action.businessId}` });
          break;
        }
        const subject: ClaimSubject = { kind: "business", id: business.id };
        if (claimOnSubject(world, subject)) {
          rejected.push({ action, reason: `business ${action.businessId} already claimed` });
          break;
        }
        const crew = p.crewId ? world.crews.byId[p.crewId] : undefined;
        if (!crew || !crew.blockIds.includes(business.blockId)) {
          rejected.push({ action, reason: `business ${action.businessId} is not on the player's crew's blocks` });
          break;
        }
        facts.push({
          kind: "ClaimSet",
          claimId: mintId<"ClaimId">(world.meta.ids, "clm"),
          subject,
          holderId: p.id,
          cause: { rule: "player.claimBusiness", actorId: p.id },
        });
        break;
      }
      case "releaseClaim": {
        const claim = world.claims.byId[action.claimId];
        if (!claim) {
          rejected.push({ action, reason: `unknown claim ${action.claimId}` });
          break;
        }
        if (claim.holderId !== p.id) {
          rejected.push({ action, reason: `claim ${action.claimId} is not held by the player` });
          break;
        }
        facts.push({ kind: "ClaimRelease", claimId: claim.id, cause: { rule: "player.releaseClaim", actorId: p.id } });
        break;
      }
      case "lend": {
        if (p.rank === "civilian" || p.rank === "associate") {
          rejected.push({ action, reason: "must be soldier or above to open the book to a business" });
          break;
        }
        const { principal, points, businessId } = action;
        if (!Number.isSafeInteger(principal) || principal < 10 || principal > 500) {
          rejected.push({ action, reason: `principal out of range (10..500): ${principal}` });
          break;
        }
        if (!Number.isSafeInteger(points) || points < 1 || points > 10) {
          rejected.push({ action, reason: `points out of range (1..10): ${points}` });
          break;
        }
        const account = world.ledger.accounts.byId[p.accounts.personal];
        if (!account || account.dirty < principal) {
          rejected.push({ action, reason: `insufficient dirty funds to lend ${principal}` });
          break;
        }
        const business = world.geo.businesses.byId[businessId];
        if (!business) {
          rejected.push({ action, reason: `unknown business ${businessId}` });
          break;
        }
        const block = world.geo.blocks.byId[business.blockId];
        const town = block ? world.geo.towns.byId[block.townId] : undefined;
        const family = p.familyId ? world.families.byId[p.familyId] : undefined;
        if (!town || !family || !family.townIds.includes(town.id)) {
          rejected.push({ action, reason: `business ${businessId} is not in a town where the family operates` });
          break;
        }
        facts.push({
          kind: "LoanOpen",
          loan: {
            id: mintId<string>(world.meta.ids, "loan"),
            lenderId: p.id,
            borrower: { kind: "business", id: business.id },
            principal,
            points,
            openedTurn: world.meta.turn,
            weeksLate: 0,
          },
          cause: { rule: "player.lend", actorId: p.id },
        });
        break;
      }
      case "setLifestyle": {
        // Design 12 (PC-4, P-3): a choice with a weekly cost, respect and attention; the system enforces affordability.
        if (action.lifestyle === p.lifestyle) { rejected.push({ action, reason: "already living that way" }); break; }
        facts.push({ kind: "LifestyleSet", characterId: p.id, lifestyle: action.lifestyle, cause: { rule: "player.setLifestyle", actorId: p.id } });
        break;
      }
      case "askPermission": {
        // TODO(phase 4 wave 2, disputes): the sponsor answers through the AI once disputes land; for now
        // this only acknowledges the ask so the request queue and report have something to show.
        // Phase 6b (design 09 §6): the ask is a logged fact; `soldier.openBook` and `soldier.askAssociate` spawn from it
        // (spawnFrom with match on `what`) and the chief answers through the template's decision.
        if (p.rank === "associate") {
          rejected.push({ action, reason: "an associate asks nothing of the chief; be made first" });
          break;
        }
        facts.push({ kind: "PermissionAsked", characterId: p.id, what: action.what, cause: { rule: "player.askPermission", actorId: p.id } });
        facts.push({
          kind: "RequestPush",
          request: {
            id: mintId<string>(world.meta.ids, "req"),
            turn: world.meta.turn,
            text: `You asked your sponsor for permission to ${PERMISSION_TEXT[action.what]}.`,
            instanceId: null,
            priority: 0,
          },
          cause: { rule: "player.askPermission", actorId: p.id },
        });
        break;
      }
      default:
        // "noop" and "decide" never reach this system (step.ts routes them elsewhere).
        break;
    }
  }

  return { facts, rejected };
}
