// Loan book system (design 09 §6): weekly interest, multi-week turns, the chief's capital loan on a
// character borrower, default with a claim transfer or a fear penalty, and the full life through `step()`.
import { describe, expect, it } from "vitest";
import { roundHalfAway, type BlockId, type BusinessId } from "@borgata/shared";
import { EMPTY_CONTENT } from "./content-types.js";
import { addBusiness } from "./fixtures.js";
import { claimOnSubject } from "./reducers/claims.js";
import { totalMoney } from "./reducers/ledger.js";
import { buildStarterWorld } from "./starter.js";
import { step } from "./step.js";
import { loansStep, weeklyInterest } from "./systems/loans.js";
import { addCharacter, playerCharacter, type Loan, type World } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

function firstBusinessId(world: World): BusinessId {
  return world.geo.businesses.order[0]! as BusinessId;
}

describe("weeklyInterest", () => {
  it("is principal * points%, rounded half away from zero", () => {
    expect(weeklyInterest({ principal: 100, points: 3 })).toBe(3);
    expect(weeklyInterest({ principal: 25, points: 5 })).toBe(1); // 1.25 -> 1
    expect(weeklyInterest({ principal: 50, points: 5 })).toBe(3); // 2.5 -> 3 (half away from zero)
  });
});

describe("loansStep: business borrower", () => {
  it("rolls one LoanPayment per week covered by the turn", () => {
    const world = buildStarterWorld("loans-multiweek", setup, EMPTY_CONTENT);
    const lender = playerCharacter(world);
    lender.rank = "soldier";
    const businessId = firstBusinessId(world);
    const loan: Loan = { id: "loan-mw", lenderId: lender.id, borrower: { kind: "business", id: businessId }, principal: 100, points: 4, openedTurn: 0, weeksLate: 0 };
    lender.loans.push(loan);
    world.meta.turnLength = 2;

    const facts = loansStep(world, EMPTY_CONTENT);
    const payments = facts.filter((f) => f.kind === "LoanPayment" && f.loanId === "loan-mw");
    expect(payments).toHaveLength(2);
  });

  it("closes the loan and transfers a claim when it defaults on an unclaimed business", () => {
    const world = buildStarterWorld("loans-default-claim", setup, EMPTY_CONTENT);
    const lender = playerCharacter(world);
    lender.rank = "soldier";
    // Every business the starter world builds already has a claim (design 09 §1); add a fresh, unclaimed one.
    const blockId = world.geo.blocks.order[0]! as BlockId;
    const businessId = addBusiness(world, blockId, { type: "stall", size: 1 }).id;
    expect(claimOnSubject(world, { kind: "business", id: businessId })).toBeUndefined();
    const loan: Loan = { id: "loan-default", lenderId: lender.id, borrower: { kind: "business", id: businessId }, principal: 60, points: 4, openedTurn: 0, weeksLate: 4 };
    lender.loans.push(loan);

    const facts = loansStep(world, EMPTY_CONTENT);
    // `businessId` (design 10 §8, situations-c task's own Part 1): set on `LoanDefault` for a business borrower.
    expect(facts).toContainEqual({
      kind: "LoanDefault",
      lenderId: lender.id,
      loanId: "loan-default",
      businessId,
      cause: { rule: "loans.default", instanceId: "loan-default", actorId: lender.id },
    });
    expect(facts).toContainEqual({
      kind: "ClaimSet",
      claimId: expect.any(String),
      subject: { kind: "business", id: businessId },
      holderId: lender.id,
      cause: { rule: "loans.default.claim", instanceId: "loan-default", actorId: lender.id },
    });
    expect(facts.some((f) => f.kind === "LoanPayment" && f.loanId === "loan-default")).toBe(false);
  });

  it("closes the loan and adds fear instead when the business already has a claim", () => {
    const world = buildStarterWorld("loans-default-fear", setup, EMPTY_CONTENT);
    const lender = playerCharacter(world);
    lender.rank = "soldier";
    // Every blockA/blockB business in the starter world already has a claim (held by soldier1/soldier2).
    const claimedBusinessId = Object.values(world.claims.byId).find((c) => c.subject.kind === "business")!.subject.id as BusinessId;
    const loan: Loan = { id: "loan-default-2", lenderId: lender.id, borrower: { kind: "business", id: claimedBusinessId }, principal: 60, points: 4, openedTurn: 0, weeksLate: 4 };
    lender.loans.push(loan);

    const facts = loansStep(world, EMPTY_CONTENT);
    // `businessId` (design 10 §8, situations-c task's own Part 1): set on `LoanDefault` for a business borrower.
    expect(facts).toContainEqual({
      kind: "LoanDefault",
      lenderId: lender.id,
      loanId: "loan-default-2",
      businessId: claimedBusinessId,
      cause: { rule: "loans.default", instanceId: "loan-default-2", actorId: lender.id },
    });
    expect(facts).toContainEqual({ kind: "FearDelta", businessId: claimedBusinessId, delta: 100, cause: { rule: "loans.default.fear", instanceId: "loan-default-2", actorId: lender.id } });
    expect(facts.some((f) => f.kind === "ClaimSet")).toBe(false);
  });
});

describe("loansStep: character borrower (the chief's capital loan)", () => {
  it("always pays interest plus a principal/20 instalment, and reduces principal locally within the turn", () => {
    const world = buildStarterWorld("loans-capital", setup, EMPTY_CONTENT);
    const chief = addCharacter(world, { name: "Il Capo", rank: "chief" });
    const player = playerCharacter(world);
    const loan: Loan = { id: "loan-capital", lenderId: chief.id, borrower: { kind: "character", id: player.id }, principal: 400, points: 1, openedTurn: 0, weeksLate: 0 };
    chief.loans.push(loan);

    const facts = loansStep(world, EMPTY_CONTENT);
    const payments = facts.filter((f) => f.kind === "LoanPayment" && f.loanId === "loan-capital");
    expect(payments).toHaveLength(1);
    const payment = payments[0]!;
    if (payment.kind !== "LoanPayment") throw new Error("expected LoanPayment");
    const expectedPrincipalPaid = roundHalfAway(400, 20); // 20
    const expectedInterest = roundHalfAway(400 * 1, 100); // 4
    expect(payment.principalPaid).toBe(expectedPrincipalPaid);
    expect(payment.paid).toBe(true);
    expect(payment.amount).toBe(expectedInterest + expectedPrincipalPaid);
  });
});

describe("loan life through step()", () => {
  it("opens by a player lend action, survives a turn of interest, then defaults with a claim transfer once forced past the threshold, money always conserved", () => {
    let world = buildStarterWorld("loan-life", setup, EMPTY_CONTENT);
    let player = playerCharacter(world);
    player.rank = "soldier";
    world.player.uiLayersUnlocked.push("loanBook"); // a real promotion (progressionStep) would unlock this
    world.ledger.accounts.byId[player.accounts.personal]!.dirty = 200;
    world.ledger.minted += 200; // keep money.conservation honest about this fixture-injected cash
    const family = world.families.byId[player.familyId!]!;
    const town = world.geo.towns.byId[family.townIds[0]!]!;
    // Every business the starter world builds already has a claim (design 09 §1); add a fresh, unclaimed one.
    const businessId = addBusiness(world, town.blockIds[0]!, { type: "stall", size: 1 }).id;
    expect(claimOnSubject(world, { kind: "business", id: businessId })).toBeUndefined();

    playerCharacter(world).lifestyle = "modest"; // design 12: an ordinary lifestyle costs 5 kL a week; keep this test's arithmetic about the loan
    let result = step(world, [{ kind: "lend", businessId, principal: 60, points: 4 }], EMPTY_CONTENT);
    world = result.world;
    player = playerCharacter(world);
    expect(player.loans).toHaveLength(1);
    const loanId = player.loans[0]!.id;
    expect(player.loans[0]!.principal).toBe(60);
    expect(world.ledger.accounts.byId[player.accounts.personal]!.dirty).toBe(140); // 200 - 60 principal lent out

    // A turn passes: the pipeline rolls the week (paid or missed) and every invariant, including
    // money.conservation, ran inside step() without throwing.
    result = step(world, [], EMPTY_CONTENT);
    world = result.world;
    player = playerCharacter(world);
    expect(player.loans.find((l) => l.id === loanId)).toBeDefined();

    // Force the loan to the default threshold (bypassing the probability roll, which is exercised above) and
    // let the next step close it deterministically.
    world.characters.byId[player.id]!.loans.find((l) => l.id === loanId)!.weeksLate = 4;

    result = step(world, [], EMPTY_CONTENT);
    world = result.world;
    player = playerCharacter(world);
    expect(player.loans.find((l) => l.id === loanId)).toBeUndefined(); // the loan closed

    const claim = claimOnSubject(world, { kind: "business", id: businessId });
    expect(claim?.holderId).toBe(player.id); // the unclaimed business is now the lender's

    expect(totalMoney(world)).toBe(world.ledger.minted - world.ledger.destroyed);
  });
});
