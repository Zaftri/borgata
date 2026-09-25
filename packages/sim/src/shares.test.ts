import { describe, expect, it } from "vitest";
import { applyPermille, type AccountId } from "@borgata/shared";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { EMPTY_CONTENT } from "./content-types.js";
import { applyShares } from "./systems/shares.js";
import { addCharacter, addFamily, createEmptyWorld, type World } from "./world.js";

const setup = { archetype: null, background: "family", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function baseWorld(seed: string): World {
  return createEmptyWorld(seed, setup, EMPTY_CONTENT.version);
}

/** A chief and a subordinate reporting to him, in a family with the given treasury cut (permille). */
function chiefAndSubordinate(seed: string, treasuryCut = 100) {
  const world = baseWorld(seed);
  const family = addFamily(world, { name: "Family", treasuryCut });
  const chief = addCharacter(world, { name: "Chief", rank: "chief", familyId: family.id });
  const subordinate = addCharacter(world, { name: "Sub", rank: "soldier", familyId: family.id, superiorId: chief.id });
  return { world, family, chief, subordinate };
}

function mint(world: World, accountId: AccountId, amount: number): void {
  const log = new TurnLogBuilder(0);
  const applied = applyFacts(world, [{ kind: "MoneyMint", to: accountId, amount, money: "dirty", source: "test", cause }], log);
  if (applied !== 1) throw new Error("mint was rejected");
}

describe("applyShares", () => {
  it("moves fixedPerTurn + percent of income to the superior, then a treasury cut, in that order", () => {
    const { world, family, chief, subordinate } = chiefAndSubordinate("basic", 100);
    chief.shareRules[subordinate.id] = { fixedPerTurn: 10, percent: 400 };
    mint(world, subordinate.accounts.personal, 1000);

    const facts = applyShares(world);

    const expectedShare = 10 + applyPermille(1000, 400); // 10 + 400 = 410
    const expectedCut = applyPermille(expectedShare, 100); // 41

    expect(facts).toEqual([
      { kind: "MoneyMove", from: subordinate.accounts.personal, to: chief.accounts.personal, amount: expectedShare, money: "dirty", cause: { rule: "share", actorId: subordinate.id } },
      { kind: "MoneyMove", from: chief.accounts.personal, to: family.treasury, amount: expectedCut, money: "dirty", cause: { rule: "share.treasuryCut", actorId: chief.id } },
    ]);

    // The moves apply cleanly in this order: the share arrives before the cut is taken from it.
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, facts, log);
    expect(applied).toBe(2);
  });

  it("emits a heavy-share loyalty penalty when percent >= 500", () => {
    const { world, chief, subordinate } = chiefAndSubordinate("heavy");
    chief.shareRules[subordinate.id] = { fixedPerTurn: 0, percent: 600 };
    mint(world, subordinate.accounts.personal, 1000);

    const facts = applyShares(world);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === subordinate.id && f.delta === -4)).toBe(true);
  });

  it("emits a fair-share loyalty bonus when percent <= 300", () => {
    const { world, chief, subordinate } = chiefAndSubordinate("fair");
    chief.shareRules[subordinate.id] = { fixedPerTurn: 0, percent: 200 };
    mint(world, subordinate.accounts.personal, 1000);

    const facts = applyShares(world);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === subordinate.id && f.delta === 2)).toBe(true);
  });

  it("emits no loyalty delta for a share rule strictly between the fair and heavy thresholds", () => {
    const { world, chief, subordinate } = chiefAndSubordinate("middling");
    chief.shareRules[subordinate.id] = { fixedPerTurn: 10, percent: 400 };
    mint(world, subordinate.accounts.personal, 1000);

    const facts = applyShares(world);
    expect(facts.some((f) => f.kind === "LoyaltyDelta")).toBe(false);
  });

  it("caps the share at the subordinate's dirty balance", () => {
    const { world, chief, subordinate } = chiefAndSubordinate("capped", 100);
    chief.shareRules[subordinate.id] = { fixedPerTurn: 500, percent: 0 };
    mint(world, subordinate.accounts.personal, 100); // balance 100, far under the fixed 500

    const facts = applyShares(world);
    const move = facts.find((f) => f.kind === "MoneyMove" && f.cause.rule === "share");
    expect(move?.kind === "MoneyMove" && move.amount).toBe(100);
  });

  it("emits nothing when the share would be zero or negative", () => {
    const { world, chief, subordinate } = chiefAndSubordinate("zero");
    chief.shareRules[subordinate.id] = { fixedPerTurn: 0, percent: 0 };
    // No income minted this turn and no balance: share = 0.
    const facts = applyShares(world);
    expect(facts).toEqual([]);
  });

  it("emits nothing when the subordinate has no superior", () => {
    const world = baseWorld("no-superior");
    addCharacter(world, { name: "Loner", rank: "soldier" });
    expect(applyShares(world)).toEqual([]);
  });

  it("emits nothing when the superior has no share rule for the subordinate", () => {
    const { world, subordinate } = chiefAndSubordinate("no-rule");
    mint(world, subordinate.accounts.personal, 1000);
    expect(applyShares(world)).toEqual([]);
  });

  it("emits nothing when the superior is dead", () => {
    const { world, chief, subordinate } = chiefAndSubordinate("dead-superior");
    chief.shareRules[subordinate.id] = { fixedPerTurn: 10, percent: 400 };
    mint(world, subordinate.accounts.personal, 1000);
    chief.alive = false;
    expect(applyShares(world)).toEqual([]);
  });

  it("emits nothing when the subordinate is dead", () => {
    const { world, chief, subordinate } = chiefAndSubordinate("dead-subordinate");
    chief.shareRules[subordinate.id] = { fixedPerTurn: 10, percent: 400 };
    mint(world, subordinate.accounts.personal, 1000);
    subordinate.alive = false;
    expect(applyShares(world)).toEqual([]);
  });

  it("emits no treasury cut when the subordinate has no family", () => {
    const world = baseWorld("no-family");
    const chief = addCharacter(world, { name: "Chief", rank: "chief" });
    const subordinate = addCharacter(world, { name: "Sub", rank: "soldier", superiorId: chief.id });
    chief.shareRules[subordinate.id] = { fixedPerTurn: 10, percent: 400 };
    mint(world, subordinate.accounts.personal, 1000);

    const facts = applyShares(world);
    expect(facts.filter((f) => f.kind === "MoneyMove")).toHaveLength(1);
    expect(facts.some((f) => f.kind === "MoneyMove" && f.cause.rule === "share.treasuryCut")).toBe(false);
  });
});

describe("share cascade", () => {
  it("a chief pays the head out of what his soldiers paid him this turn, leaves first", async () => {
    const { createEmptyWorld, addCharacter, addFamily, addCrew } = await import("./world.js");
    const { TurnLogBuilder } = await import("./log.js");
    const { applyFacts } = await import("./reducers/index.js");
    const { applyShares } = await import("./systems/shares.js");
    const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
    const w = createEmptyWorld("cascade", setup, "0.0.0");
    const head = addCharacter(w, { name: "head", rank: "head" });
    const chief = addCharacter(w, { name: "chief", rank: "chief" });
    const soldier = addCharacter(w, { name: "soldier", rank: "soldier" });
    const fam = addFamily(w, { name: "F", headId: head.id, treasuryCut: 0 });
    addCrew(w, fam.id, chief.id, [soldier.id]);
    chief.shareRules[soldier.id] = { fixedPerTurn: 0, percent: 500 };
    head.shareRules[chief.id] = { fixedPerTurn: 0, percent: 500 };
    const log = new TurnLogBuilder(0);
    applyFacts(w, [{ kind: "MoneyMint", to: soldier.accounts.personal, amount: 1000, money: "dirty", source: "t", cause: { rule: "t" } }], log);
    applyFacts(w, applyShares(w), log);
    expect(w.ledger.accounts.byId[soldier.accounts.personal]!.dirty).toBe(500);
    expect(w.ledger.accounts.byId[chief.accounts.personal]!.dirty).toBe(250);
    expect(w.ledger.accounts.byId[head.accounts.personal]!.dirty).toBe(250);
  });
});
