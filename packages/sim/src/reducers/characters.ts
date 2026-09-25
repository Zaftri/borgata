// Characters reducer (design 02 §6 row 3). Rank, superior and share rules (design 03 §4).

import { tableInsert, mintId } from "@borgata/shared";
import type { Fact } from "../facts.js";
import { EMPTY_RECORD, defaultLifestyle } from "../world.js";
import type { World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

export const charactersReducer: Reducer = {
  owner: "characters",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "RankChange": {
        const c = world.characters.byId[fact.characterId];
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (!c.alive) return { reason: `character ${fact.characterId} is dead` };
        c.rank = fact.rank;
        return null;
      }
      case "SuperiorSet": {
        const c = world.characters.byId[fact.characterId];
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (fact.superiorId !== null) {
          const s = world.characters.byId[fact.superiorId];
          if (!s) return { reason: `unknown superior ${fact.superiorId}` };
          if (!s.alive) return { reason: `superior ${fact.superiorId} is dead` };
          if (fact.superiorId === fact.characterId) return { reason: "a character cannot be his own superior" };
        }
        c.superiorId = fact.superiorId;
        return null;
      }
      case "ShareRuleSet": {
        const sup = world.characters.byId[fact.superiorId];
        const sub = world.characters.byId[fact.subordinateId];
        if (!sup) return { reason: `unknown superior ${fact.superiorId}` };
        if (!sub) return { reason: `unknown subordinate ${fact.subordinateId}` };
        if (sub.superiorId !== fact.superiorId) return { reason: `${fact.subordinateId} does not report to ${fact.superiorId}` };
        const r = fact.rule;
        if (!Number.isSafeInteger(r.fixedPerTurn) || r.fixedPerTurn < 0) return { reason: `fixedPerTurn invalid: ${r.fixedPerTurn}` };
        if (!Number.isSafeInteger(r.percent) || r.percent < 0 || r.percent > 1000) return { reason: `percent invalid: ${r.percent}` };
        sup.shareRules[fact.subordinateId] = { fixedPerTurn: r.fixedPerTurn, percent: r.percent };
        return null;
      }
      case "StatusChange": {
        const c = world.characters.byId[fact.characterId];
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (!c.alive && fact.status !== "dead") return { reason: `character ${fact.characterId} is dead` };
        if ((fact.status === "arrested" || fact.status === "jailed") && (fact.untilTurn === undefined || !Number.isSafeInteger(fact.untilTurn) || fact.untilTurn <= world.meta.turn))
          return { reason: `detention needs untilTurn after the current turn` };
        c.status = fact.status;
        c.detainedUntilTurn = fact.status === "arrested" || fact.status === "jailed" ? (fact.untilTurn as number) : null;
        if (fact.status === "dead") c.alive = false;
        return null;
      }
      case "CharacterCreate": {
        if (world.characters.byId[fact.id]) return { reason: `character ${fact.id} exists` };
        if (!fact.name) return { reason: "a character needs a name" };
        if (fact.superiorId && !world.characters.byId[fact.superiorId]) return { reason: `unknown superior ${fact.superiorId}` };
        if (fact.familyId && !world.families.byId[fact.familyId]) return { reason: `unknown family ${fact.familyId}` };
        if (fact.crewId && !world.crews.byId[fact.crewId]) return { reason: `unknown crew ${fact.crewId}` };
        const accountId = mintId<"AccountId">(world.meta.ids, "acct");
        tableInsert(world.ledger.accounts, accountId, { id: accountId, ownerRef: { kind: "character", id: fact.id }, dirty: 0, clean: 0 });
        tableInsert(world.characters, fact.id, {
          id: fact.id, name: fact.name, familyId: fact.familyId, superiorId: fact.superiorId, shareRules: {}, crewId: fact.crewId, rank: fact.rank,
          age: fact.age, alive: true, status: "free", traits: [...fact.traits], loyalty: 500, exposure: 0, weight: 0, detainedUntilTurn: null, cooperating: false,
          onRecordWith: fact.onRecordWith, memory: [], record: { ...EMPTY_RECORD }, loans: [], lifestyle: defaultLifestyle(fact.rank), householdId: null, accounts: { personal: accountId }, playerControlled: false,
        });
        if (fact.crewId) {
          const crew = world.crews.byId[fact.crewId]!;
          if (!crew.memberIds.includes(fact.id) && (fact.rank === "soldier" || fact.rank === "associate")) crew.memberIds.push(fact.id);
        }
        return null;
      }
      case "LifestyleSet": {
        const c = world.characters.byId[fact.characterId];
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        c.lifestyle = fact.lifestyle;
        return null;
      }
      case "CooperationSet": {
        const c = world.characters.byId[fact.characterId];
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (c.cooperating) return { reason: "already cooperating" };
        c.cooperating = true;
        return null;
      }
      default:
        return { reason: `characters does not own ${fact.kind}` };
    }
  },
};

/** End-of-turn release of detainees whose term has passed (owner: characters). Returns Facts for the log. */
export function releaseDetainees(world: World): Fact[] {
  const out: Fact[] = [];
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.alive) continue;
    if ((c.status === "arrested" || c.status === "jailed") && c.detainedUntilTurn !== null && c.detainedUntilTurn <= world.meta.turn + 1) {
      out.push({ kind: "StatusChange", characterId: c.id, status: "free", cause: { rule: "detention.ended" } });
    }
  }
  return out;
}
