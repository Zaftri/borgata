// Ledger reducer (design 03 §4). Owns accounts, minted and destroyed. Enforces conservation:
// money only enters through MoneyMint (listed sources) and leaves through MoneyDestroy (listed sinks).

import { applyPermille, tableInsert } from "@borgata/shared";
import type { Fact } from "../facts.js";
import type { World, Account } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

function account(world: World, id: string): Account | undefined {
  return world.ledger.accounts.byId[id];
}

/** The civilians outside the family: shopkeepers who borrow. Money lent to them leaves the family's books here. */
export const CIVILIANS_ACCOUNT = "acct-external-civilians";
function ensureExternal(world: World, id: string): void {
  if (!world.ledger.accounts.byId[id]) tableInsert(world.ledger.accounts, id, { id: id as Account["id"], ownerRef: { kind: "external", id }, dirty: 0, clean: 0 });
}

function checkAmount(amount: number): Rejection | null {
  if (!Number.isSafeInteger(amount)) return { reason: `amount is not an integer: ${amount}` };
  if (amount <= 0) return { reason: `amount must be positive: ${amount}` };
  return null;
}

export const ledgerReducer: Reducer = {
  owner: "ledger",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "MoneyMint": {
        const bad = checkAmount(fact.amount);
        if (bad) return bad;
        const to = account(world, fact.to);
        if (!to) return { reason: `unknown account ${fact.to}` };
        to[fact.money] += fact.amount;
        world.ledger.minted += fact.amount;
        world.ledger.turnIncome[fact.to] = (world.ledger.turnIncome[fact.to] ?? 0) + fact.amount;
        return null;
      }
      case "MoneyMove": {
        const bad = checkAmount(fact.amount);
        if (bad) return bad;
        if (fact.from === fact.to) return { reason: "move to same account" };
        const from = account(world, fact.from);
        const to = account(world, fact.to);
        if (!from) return { reason: `unknown account ${fact.from}` };
        if (!to) return { reason: `unknown account ${fact.to}` };
        if (from[fact.money] < fact.amount) return { reason: `insufficient ${fact.money} funds in ${fact.from}: ${from[fact.money]} < ${fact.amount}` };
        from[fact.money] -= fact.amount;
        to[fact.money] += fact.amount;
        return null;
      }
      case "MoneyDestroy": {
        const bad = checkAmount(fact.amount);
        if (bad) return bad;
        const from = account(world, fact.from);
        if (!from) return { reason: `unknown account ${fact.from}` };
        if (from[fact.money] < fact.amount) return { reason: `insufficient ${fact.money} funds in ${fact.from}` };
        from[fact.money] -= fact.amount;
        world.ledger.destroyed += fact.amount;
        return null;
      }
      case "Launder": {
        const bad = checkAmount(fact.amount);
        if (bad) return bad;
        if (fact.feePermille < 0 || fact.feePermille > 1000) return { reason: `fee out of range: ${fact.feePermille}` };
        const acct = account(world, fact.account);
        if (!acct) return { reason: `unknown account ${fact.account}` };
        if (acct.dirty < fact.amount) return { reason: `insufficient dirty funds in ${fact.account}` };
        const fee = applyPermille(fact.amount, fact.feePermille);
        acct.dirty -= fact.amount;
        acct.clean += fact.amount - fee;
        world.ledger.destroyed += fee; // the fee leaves the economy (sink: launderFee)
        return null;
      }
      case "LoanOpen": {
        const loan = fact.loan;
        const lender = world.characters.byId[loan.lenderId];
        if (!lender) return { reason: `unknown lender ${loan.lenderId}` };
        if (lender.loans.some((l) => l.id === loan.id)) return { reason: `loan ${loan.id} exists` };
        if (!Number.isSafeInteger(loan.principal) || loan.principal <= 0) return { reason: "principal must be positive" };
        if (!Number.isSafeInteger(loan.points) || loan.points < 1 || loan.points > 10) return { reason: "points must be 1..10 per week" };
        // A man of honor lends from his own purse; when it is short, the family treasury backs him (design 09 §6:
        // the chief "moves 400 kL" as capital, which in practice is the family's money in his hands). A civilian
        // or associate has no treasury to draw on.
        const from = account(world, lender.accounts.personal);
        if (!from) return { reason: "lender has no account" };
        // The purse pays what it has and the treasury the rest (a made man only; the grant predicate
        // `ledger.accountAtLeast` judges the same sum, so a granted book is always funded).
        let fromTreasury = 0;
        let treasury: Account | undefined;
        if (from.dirty < loan.principal) {
          const family = lender.familyId && lender.rank !== "associate" && lender.rank !== "civilian" ? world.families.byId[lender.familyId] : undefined;
          treasury = family ? account(world, family.treasury) : undefined;
          fromTreasury = loan.principal - from.dirty;
          if (!treasury || treasury.dirty < fromTreasury) return { reason: `lender cannot fund ${loan.principal}` };
        }
        let toId: string;
        if (loan.borrower.kind === "character") {
          const b = world.characters.byId[loan.borrower.id];
          if (!b) return { reason: `unknown borrower ${loan.borrower.id}` };
          toId = b.accounts.personal;
        } else {
          if (!world.geo.businesses.byId[loan.borrower.id]) return { reason: `unknown business ${loan.borrower.id}` };
          toId = CIVILIANS_ACCOUNT;
          ensureExternal(world, CIVILIANS_ACCOUNT);
        }
        from.dirty -= loan.principal - fromTreasury;
        if (treasury && fromTreasury > 0) treasury.dirty -= fromTreasury;
        account(world, toId)!.dirty += loan.principal;
        lender.loans.push({ ...loan, borrower: { ...loan.borrower }, weeksLate: 0, openedTurn: world.meta.turn });
        return null;
      }
      case "LoanPayment": {
        const lender = world.characters.byId[fact.lenderId];
        const loan = lender?.loans.find((l) => l.id === fact.loanId);
        if (!lender || !loan) return { reason: `unknown loan ${fact.loanId}` };
        if (!fact.paid) {
          loan.weeksLate += 1;
          return null;
        }
        if (!Number.isSafeInteger(fact.amount) || fact.amount <= 0) return { reason: "payment must be positive" };
        if (fact.principalPaid !== undefined && (!Number.isSafeInteger(fact.principalPaid) || fact.principalPaid < 0 || fact.principalPaid > fact.amount)) {
          return { reason: "principalPaid must be a non-negative integer no greater than the payment" };
        }
        const to = account(world, lender.accounts.personal)!;
        if (loan.borrower.kind === "character") {
          const b = world.characters.byId[loan.borrower.id];
          const from = b ? account(world, b.accounts.personal) : undefined;
          if (!from) return { reason: "borrower has no account" };
          if (from.dirty < fact.amount) {
            loan.weeksLate += 1;
            return null; // could not pay: counts as a missed week, not a rejection
          }
          from.dirty -= fact.amount;
          to.dirty += fact.amount;
        } else {
          // Interest from a shopkeeper is new money entering the family's world (design 03 §4 lists loan interest as a source).
          to.dirty += fact.amount;
          world.ledger.minted += fact.amount;
          world.ledger.turnIncome[to.id] = (world.ledger.turnIncome[to.id] ?? 0) + fact.amount;
        }
        loan.weeksLate = 0;
        // Principal instalment (design 09 §6): the fact carries how much of the payment reduces principal;
        // the loan closes once principal reaches zero.
        if (fact.principalPaid) {
          const remaining = loan.principal - fact.principalPaid;
          if (remaining <= 0) {
            const i = lender.loans.findIndex((l) => l.id === loan.id);
            if (i >= 0) lender.loans.splice(i, 1);
          } else {
            loan.principal = remaining;
          }
        }
        return null;
      }
      case "LoanDefault": {
        const lender = world.characters.byId[fact.lenderId];
        const i = lender?.loans.findIndex((l) => l.id === fact.loanId) ?? -1;
        if (!lender || i < 0) return { reason: `unknown loan ${fact.loanId}` };
        lender.loans.splice(i, 1); // principal is lost; a claim or fear effect is the template's business
        return null;
      }
      default:
        return { reason: `ledger does not own ${fact.kind}` };
    }
  },
};

/** Sum of all money in all accounts. Conservation: equals minted - destroyed (design 01 §4). */
export function totalMoney(world: World): number {
  let sum = 0;
  for (const id of world.ledger.accounts.order) {
    const a = world.ledger.accounts.byId[id]!;
    sum += a.dirty + a.clean;
  }
  return sum;
}
