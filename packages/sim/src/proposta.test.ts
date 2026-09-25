// La proposta (design 09 §3) and the six phase 6b fact kinds' reducer cases.
import { describe, expect, it } from "vitest";
import type { BusinessId } from "@borgata/shared";
import { EMPTY_CONTENT } from "./content-types.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { buildStarterWorld } from "./starter.js";
import { computeProposta } from "./systems/progression.js";
import { favorKey, playerCharacter } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

describe("computeProposta", () => {
  it("starts in band 0 with signs and reaches band 3 for a steady, useful associate", () => {
    const world = buildStarterWorld("proposta", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const p0 = computeProposta(world)!;
    expect(p0.band).toBe(0);
    expect(p0.value).toBe(0);
    me.record = { ...me.record, weeksPaid: 30, streakPaid: 25, jobsDone: 4 };
    world.favors[favorKey(me.onRecordWith!, me.id)] = 200;
    const p = computeProposta(world)!;
    expect(p.value).toBe(450 + 100 + 180 + 50);
    expect(p.band).toBe(3);
    expect(p.signs).toHaveLength(3);
    me.record.jobsDone = 1;
    expect(computeProposta(world)!.band).toBe(2);
  });

  it("a bones rule costs 200 until a murder memory exists", () => {
    const world = buildStarterWorld("proposta", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    me.record = { ...me.record, weeksPaid: 30, streakPaid: 25, jobsDone: 6 };
    world.families.byId[me.familyId!]!.policy.bonesRequired = true;
    expect(computeProposta(world)!.value).toBe(820 - 200);
    me.memory.push({ tag: "murder", weight: 300, turn: 0 });
    expect(computeProposta(world)!.value).toBe(820 + 150);
  });

  it("is null for a soldier", () => {
    const world = buildStarterWorld("proposta", setup, EMPTY_CONTENT);
    playerCharacter(world).rank = "soldier";
    expect(computeProposta(world)).toBeNull();
  });
});

describe("phase 6b reducer cases", () => {
  it("RecordDelta clamps at zero and supports set", () => {
    const world = buildStarterWorld("rec", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const log = new TurnLogBuilder(world.meta.turn);
    applyFacts(world, [
      { kind: "RecordDelta", characterId: me.id, field: "weeksPaid", delta: 2, cause },
      { kind: "RecordDelta", characterId: me.id, field: "streakPaid", delta: 0, set: true, cause },
      { kind: "RecordDelta", characterId: me.id, field: "arrests", delta: -1, cause },
    ], log);
    expect(me.record.weeksPaid).toBe(2);
    expect(me.record.arrests).toBe(0);
    expect(log.build().entries.filter((e) => e.kind === "rejected").length).toBe(1);
  });

  it("CharacterCreate makes a man with an account under the given superior", () => {
    const world = buildStarterWorld("create", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const log = new TurnLogBuilder(world.meta.turn);
    const id = "chr-new" as never;
    applyFacts(world, [{ kind: "CharacterCreate", id, name: "Turi", rank: "associate", age: 20, familyId: me.familyId, superiorId: me.id, crewId: me.crewId, onRecordWith: me.id, traits: ["kid"], cause }], log);
    const c = world.characters.byId[id]!;
    expect(c.superiorId).toBe(me.id);
    expect(world.ledger.accounts.byId[c.accounts.personal]).toBeDefined();
    applyFacts(world, [{ kind: "CharacterCreate", id, name: "Turi", rank: "associate", age: 20, familyId: null, superiorId: null, crewId: null, onRecordWith: null, traits: [], cause }], log);
    expect(log.build().entries.filter((e) => e.kind === "rejected").length).toBe(1);
  });

  it("loans move principal, collect interest, and default", () => {
    const world = buildStarterWorld("loan", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const acct = world.ledger.accounts.byId[me.accounts.personal]!;
    acct.dirty = 100;
    const shopId = world.geo.businesses.order[0]! as BusinessId;
    const log = new TurnLogBuilder(world.meta.turn);
    const loan = { id: "loan-1", lenderId: me.id, borrower: { kind: "business" as const, id: shopId }, principal: 60, points: 4, openedTurn: 0, weeksLate: 0 };
    applyFacts(world, [{ kind: "LoanOpen", loan, cause }], log);
    expect(acct.dirty).toBe(40);
    expect(me.loans).toHaveLength(1);
    applyFacts(world, [{ kind: "LoanPayment", lenderId: me.id, loanId: "loan-1", amount: 2, paid: true, cause }], log);
    expect(acct.dirty).toBe(42);
    applyFacts(world, [{ kind: "LoanPayment", lenderId: me.id, loanId: "loan-1", amount: 2, paid: false, cause }], log);
    expect(me.loans[0]!.weeksLate).toBe(1);
    applyFacts(world, [{ kind: "LoanDefault", lenderId: me.id, loanId: "loan-1", cause }], log);
    expect(me.loans).toHaveLength(0);
    expect(log.build().entries.filter((e) => e.kind === "rejected").length).toBe(0);
  });
});
