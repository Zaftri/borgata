// Obligations (design 12 §2): what a man owes and to whom. Opened by cards and systems, met or missed each due
// turn by systems/obligations.ts (AI debtors) or by the due card (the player). This reducer never moves money;
// the ledger does that on the same turn from the facts the payer emits.
import { tableInsert, tableRemove } from "@borgata/shared";
import type { Fact } from "../facts.js";
import type { World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

export const obligationsReducer: Reducer = {
  owner: "obligations",
  apply(world: World, fact: Fact): Rejection | null {
  switch (fact.kind) {
    case "ObligationOpen": {
      const o = fact.obligation;
      if (world.obligations.byId[o.id]) return { reason: `obligation ${o.id} exists` };
      if (!world.characters.byId[o.debtorId]) return { reason: `unknown debtor ${o.debtorId}` };
      if (!Number.isSafeInteger(o.amount) || o.amount <= 0) return { reason: "amount must be positive" };
      if (o.everyTurns !== null && (!Number.isSafeInteger(o.everyTurns) || o.everyTurns < 1)) return { reason: "everyTurns must be a positive integer or null" };
      if (o.beneficiary.kind === "character" && !world.characters.byId[o.beneficiary.id]) return { reason: `unknown beneficiary ${o.beneficiary.id}` };
      if (o.beneficiary.kind === "family" && !world.families.byId[o.beneficiary.id]) return { reason: `unknown family ${o.beneficiary.id}` };
      tableInsert(world.obligations, o.id, { ...o, beneficiary: { ...o.beneficiary }, met: 0, missed: 0, lastResult: null, status: "open" });
      return null;
    }
    case "ObligationDue": {
      if (!world.obligations.byId[fact.obligationId]) return { reason: `unknown obligation ${fact.obligationId}` };
      return null; // logged only: cards spawn from it
    }
    case "ObligationMet":
    case "ObligationMissed": {
      const o = world.obligations.byId[fact.obligationId];
      if (!o) return { reason: `unknown obligation ${fact.obligationId}` };
      if (o.status !== "open") return { reason: `obligation ${o.id} is closed` };
      if (fact.kind === "ObligationMet") { o.met += 1; o.lastResult = "met"; } else { o.missed += 1; o.lastResult = "missed"; }
      if (o.everyTurns === null) o.status = "closed";
      else o.nextDueTurn = world.meta.turn + o.everyTurns;
      return null;
    }
    case "ObligationClose": {
      const o = world.obligations.byId[fact.obligationId];
      if (!o) return { reason: `unknown obligation ${fact.obligationId}` };
      tableRemove(world.obligations, fact.obligationId);
      return null;
    }
    default:
      return { reason: `obligations does not own ${fact.kind}` };
  }
  },
};
