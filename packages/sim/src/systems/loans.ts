// Loan book system (design 09 §6): the weekly interest and payment roll for every loan on every living
// character's book. Read-only over the world (CLAUDE.md rule 1); emits `LoanOpen`/`LoanPayment`/`LoanDefault`
// (and, on a business default, `ClaimSet` or `FearDelta`) for their owners to apply.
//
// Turn length: loans are weekly, but a turn can cover more than one week once the player outranks associate
// (design 03 §6, `reducers/calendar.ts`). This system rolls the week once per week in the turn, simulating each
// loan locally (principal and weeksLate) between rolls, because it must not mutate `world` -- the real loan only
// changes once the emitted facts are applied in emission order by `applyFacts` after this system returns. A
// business borrower's week draws an independent chance from the `loans` stream against that week's (unchanging
// within this turn) compliance-derived odds, matching what the ledger reducer will do when it applies each
// week's fact in order. A character borrower (the chief's capital loan on the player) always gets `paid: true`;
// the borrower's actual ability to pay is checked by the ledger reducer at apply time (design 09 §6: "the
// reducer rejects when the borrower cannot pay and counts a late week"), so the local simulation below assumes
// the common case (payment succeeds) for that week -- a real failure only becomes visible to this system on a
// later turn, once `loan.weeksLate` reflects it.
//
// Default is checked at the top of each week, before that week's payment is rolled, against the running
// `weeksLate` (which starts from the loan's real, already-applied value): this both closes a loan that was
// already at or past four late weeks when the turn began, and closes one that crosses the threshold partway
// through a multi-week turn without waiting for a further roll. For the common one-week turn, a loan whose
// fourth late week lands *this* turn is closed on the following turn's first roll -- a one-turn lag, the same
// shape as the arrest lag documented in systems/record.ts.

import { clamp, mintId, roundHalfAway } from "@borgata/shared";
import type { Content } from "../content-types.js";
import type { Cause, Fact } from "../facts.js";
import { getStream } from "../rng.js";
import { claimOnSubject } from "../reducers/claims.js";
import type { Loan, World } from "../world.js";

/** Compliance*10 clamped to this band, per ten thousand (design 09 §6). */
const MIN_PAY_CHANCE = 1000;
const MAX_PAY_CHANCE = 9500;
/** The chief's capital loan on the player amortizes at principal/20 a week (design 09 §6). */
const PRINCIPAL_INSTALMENT_DIVISOR = 20;
/** Four missed weeks close the loan badly (design 09 §6). */
const DEFAULT_WEEKS_LATE = 4;

export function loansStep(world: World, _content: Content): Fact[] {
  const facts: Fact[] = [];
  const stream = getStream(world.rng, "loans");
  const weeksThisTurn = world.meta.turnLength;

  for (const lenderId of world.characters.order) {
    const lender = world.characters.byId[lenderId]!;
    if (!lender.alive) continue;

    for (const loan of lender.loans) {
      let principal = loan.principal;
      let weeksLate = loan.weeksLate;

      for (let week = 0; week < weeksThisTurn && principal > 0; week++) {
        if (weeksLate >= DEFAULT_WEEKS_LATE) {
          const defaultCause: Cause = { rule: "loans.default", instanceId: loan.id, actorId: lender.id };
          facts.push({
            kind: "LoanDefault",
            lenderId: lender.id,
            loanId: loan.id,
            cause: defaultCause,
            // `businessId` (design 10 §8): only a business borrower has one; `exactOptionalPropertyTypes`
            // (tsconfig.json) means the field must be omitted, not set to `undefined`, for a character borrower.
            ...(loan.borrower.kind === "business" ? { businessId: loan.borrower.id } : {}),
          });
          if (loan.borrower.kind === "business") {
            const existingClaim = claimOnSubject(world, { kind: "business", id: loan.borrower.id });
            if (!existingClaim) {
              facts.push({
                kind: "ClaimSet",
                claimId: mintId<"ClaimId">(world.meta.ids, "clm"),
                subject: { kind: "business", id: loan.borrower.id },
                holderId: lender.id,
                cause: { rule: "loans.default.claim", instanceId: loan.id, actorId: lender.id },
              });
            } else {
              facts.push({ kind: "FearDelta", businessId: loan.borrower.id, delta: 100, cause: { rule: "loans.default.fear", instanceId: loan.id, actorId: lender.id } });
            }
          }
          break; // the loan closes; no more rolls this turn.
        }

        const cause: Cause = { rule: "loans.weekly", instanceId: loan.id, actorId: lender.id };
        const interest = roundHalfAway(principal * loan.points, 100);

        if (loan.borrower.kind === "business") {
          const business = world.geo.businesses.byId[loan.borrower.id];
          if (!business) break; // gone; ledger.loansConsistent will flag the dangling loan
          const chance = clamp(business.compliance * 10, MIN_PAY_CHANCE, MAX_PAY_CHANCE);
          const paid = stream.chance(chance);
          facts.push({ kind: "LoanPayment", lenderId: lender.id, loanId: loan.id, amount: interest, paid, cause });
          weeksLate = paid ? 0 : weeksLate + 1;
        } else {
          const principalPaid = Math.min(principal, roundHalfAway(principal, PRINCIPAL_INSTALMENT_DIVISOR));
          facts.push({
            kind: "LoanPayment",
            lenderId: lender.id,
            loanId: loan.id,
            amount: interest + principalPaid,
            paid: true,
            principalPaid,
            cause,
          });
          weeksLate = 0;
          principal -= principalPaid;
        }
      }
    }
  }

  return facts;
}

/** Exported for tests: the weekly interest on a loan, integers only (design 09 §6). */
export function weeklyInterest(loan: Pick<Loan, "principal" | "points">): number {
  return roundHalfAway(loan.principal * loan.points, 100);
}
