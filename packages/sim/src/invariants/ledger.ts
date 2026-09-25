// Invariants for the loan book (design 09 §6), registered by importing this module from ./all.ts.
// A lender's aliveness is deliberately not checked here: a dead lender's loans are the estate's business, not
// a shape bug, and nothing in the loan reducer requires the lender to be alive to keep a book.

import { registerInvariant, type Violation } from "../invariants.js";

registerInvariant({
  name: "ledger.loansConsistent",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const lenderId of world.characters.order) {
      const lender = world.characters.byId[lenderId]!;
      for (const loan of lender.loans) {
        const borrowerExists =
          loan.borrower.kind === "business" ? !!world.geo.businesses.byId[loan.borrower.id] : !!world.characters.byId[loan.borrower.id];
        if (!borrowerExists) {
          out.push({ name: "ledger.loansConsistent", message: `loan ${loan.id} (lender ${lenderId}) borrower ${loan.borrower.kind}:${loan.borrower.id} does not exist` });
        }
        if (!Number.isSafeInteger(loan.principal) || loan.principal <= 0) {
          out.push({ name: "ledger.loansConsistent", message: `loan ${loan.id} (lender ${lenderId}) principal is ${loan.principal}` });
        }
        if (!Number.isSafeInteger(loan.points) || loan.points < 1 || loan.points > 10) {
          out.push({ name: "ledger.loansConsistent", message: `loan ${loan.id} (lender ${lenderId}) points out of range: ${loan.points}` });
        }
      }
    }
    return out;
  },
});
