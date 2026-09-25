import { describe, expect, it } from "vitest";
import { mintId, type CharacterId, type FamilyId } from "@borgata/shared";
import { addBlock, addBusiness, addTown } from "./fixtures.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { runInvariants } from "./invariants/all.js";
import { EMPTY_CONTENT } from "./content-types.js";
import { FEAST_TARIFF, WEEKLY_TARIFF, feastsInWindow, runChains } from "./systems/chains.js";
import { applyPermille } from "@borgata/shared";
import { step } from "./step.js";
import { addCharacter, addCrew, addFamily, createEmptyWorld, type BusinessType, type World } from "./world.js";

const setup = { archetype: null, background: "family", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function baseWorld(seed: string): World {
  return createEmptyWorld(seed, setup, EMPTY_CONTENT.version);
}

/** Head, chief, two soldiers, a family, a crew, one block with size 1/2/3 businesses, and a fully
 * slotted protection-tax chain owned by the chief. Businesses default to fear 1000 (guaranteed pay,
 * design 03 §5: complianceChance clamps to 10000 and Stream.chance short-circuits without a draw). */
function buildFixture(seed: string) {
  const world = baseWorld(seed);
  const head = addCharacter(world, { name: "Head", rank: "head" });
  const chief = addCharacter(world, { name: "Chief", rank: "chief" });
  const soldier1 = addCharacter(world, { name: "Soldier1", rank: "soldier" });
  const soldier2 = addCharacter(world, { name: "Soldier2", rank: "soldier" });
  const family = addFamily(world, { name: "Family", headId: head.id });
  const town = addTown(world, { name: "Town", archetype: "city" });
  const block = addBlock(world, town.id);
  const crew = addCrew(world, family.id, chief.id, [soldier1.id, soldier2.id], [block.id]);
  const b1 = addBusiness(world, block.id, { type: "stall", size: 1, fear: 1000 });
  const b2 = addBusiness(world, block.id, { type: "shop", size: 2, fear: 1000 });
  const b3 = addBusiness(world, block.id, { type: "restaurant", size: 3, fear: 1000 });

  const chainId = mintId<"ChainInstanceId">(world.meta.ids, "chn");
  const log = new TurnLogBuilder(0);
  const applied = applyFacts(
    world,
    [
      { kind: "ChainCreate", chainId, templateId: "chain.protectionTax", familyId: family.id, ownerId: chief.id, slotNames: ["collectors", "blocks"], cause },
      { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: soldier1.id }, cause },
      { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: soldier2.id }, cause },
      { kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: block.id }, cause },
    ],
    log,
  );
  if (applied !== 4) throw new Error("fixture setup facts were rejected");

  return { world, head, chief, soldier1, soldier2, family, town, block, crew, b1, b2, b3, chainId };
}

/** A minimal chain with no slots filled, for the "empty slot" tests. */
function minimalChainWorld(seed: string) {
  const world = baseWorld(seed);
  const chief = addCharacter(world, { name: "Chief", rank: "chief" });
  const family = addFamily(world, { name: "Family" });
  const town = addTown(world, { name: "Town", archetype: "city" });
  const block = addBlock(world, town.id);
  const chainId = mintId<"ChainInstanceId">(world.meta.ids, "chn");
  const log = new TurnLogBuilder(0);
  applyFacts(
    world,
    [{ kind: "ChainCreate", chainId, templateId: "chain.protectionTax", familyId: family.id, ownerId: chief.id, slotNames: ["collectors", "blocks"], cause }],
    log,
  );
  return { world, chief, family, town, block, chainId };
}

/** A single collector, single block, single business, for compliance-roll tests. */
function singleBusinessFixture(
  seed: string,
  fields: { type: BusinessType; size: 1 | 2 | 3 | 4 | 5; fear: number; sentiment?: number; week?: number; turnLength?: 1 | 2 | 4 },
) {
  const world = baseWorld(seed);
  const chief = addCharacter(world, { name: "Chief", rank: "chief" });
  const collector = addCharacter(world, { name: "Collector", rank: "soldier" });
  const family = addFamily(world, { name: "Family" });
  const town = addTown(world, { name: "Town", archetype: "city" });
  const block = addBlock(world, town.id);
  const business = addBusiness(world, block.id, { type: fields.type, size: fields.size, fear: fields.fear });
  if (fields.sentiment !== undefined) world.towns.byId[town.id]!.sentiment = fields.sentiment;
  if (fields.week !== undefined) world.meta.calendar.week = fields.week;
  if (fields.turnLength !== undefined) world.meta.turnLength = fields.turnLength;

  const chainId = mintId<"ChainInstanceId">(world.meta.ids, "chn");
  const log = new TurnLogBuilder(0);
  applyFacts(
    world,
    [
      { kind: "ChainCreate", chainId, templateId: "chain.protectionTax", familyId: family.id, ownerId: chief.id, slotNames: ["collectors", "blocks"], cause },
      { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: collector.id }, cause },
      { kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: block.id }, cause },
    ],
    log,
  );
  return { world, collector, business, chainId };
}

describe("feastsInWindow", () => {
  it("finds Christmas (52) in a window that wraps past year end", () => {
    expect(feastsInWindow(50, 4)).toContain(52);
  });

  it("finds Easter (15) in a two-week window", () => {
    expect(feastsInWindow(14, 2)).toContain(15);
  });

  it("is empty for a one-week window that hits no feast", () => {
    expect(feastsInWindow(16, 1)).toEqual([]);
  });
});

describe("runChains: protection tax", () => {
  it("produces nothing when the collectors slot is empty", () => {
    const { world, block, chainId } = minimalChainWorld("empty-collectors");
    const log = new TurnLogBuilder(0);
    applyFacts(world, [{ kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: block.id }, cause }], log);
    addBusiness(world, block.id, { type: "stall", size: 1, fear: 1000 });
    expect(runChains(world, EMPTY_CONTENT)).toEqual([]);
  });

  it("produces nothing when the blocks slot is empty", () => {
    const { world, chief, chainId } = minimalChainWorld("empty-blocks");
    const log = new TurnLogBuilder(0);
    applyFacts(world, [{ kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: chief.id }, cause }], log);
    expect(runChains(world, EMPTY_CONTENT)).toEqual([]);
  });

  it("is deterministic: the same world (cloned) produces the same facts", () => {
    const { world } = buildFixture("deterministic");
    const facts1 = runChains(structuredClone(world), EMPTY_CONTENT);
    const facts2 = runChains(structuredClone(world), EMPTY_CONTENT);
    expect(facts1).toEqual(facts2);
    expect(facts1.length).toBeGreaterThan(0);
  });

  it("charges size 1 and 2 businesses the weekly tariff times turnLength", () => {
    const { world, soldier1, soldier2 } = buildFixture("weekly");
    world.meta.turnLength = 2;
    const facts = runChains(world, EMPTY_CONTENT);
    const mints = facts.filter((f) => f.kind === "MoneyMint");

    const toSoldier1 = mints.find((f) => f.kind === "MoneyMint" && f.to === soldier1.accounts.personal);
    const toSoldier2 = mints.find((f) => f.kind === "MoneyMint" && f.to === soldier2.accounts.personal);
    expect(toSoldier1?.kind === "MoneyMint" && toSoldier1.amount).toBe(WEEKLY_TARIFF[1] * 2);
    expect(toSoldier2?.kind === "MoneyMint" && toSoldier2.amount).toBe(WEEKLY_TARIFF[2] * 2);
    // The size 3 restaurant is not due outside a feast week (week 1 by default).
    expect(mints).toHaveLength(2);
  });

  it("charges size 3-5 businesses only at a feast, for the feast tariff", () => {
    const { world } = buildFixture("feast");
    world.meta.calendar.week = 15; // Easter
    world.meta.turnLength = 1;
    const facts = runChains(world, EMPTY_CONTENT);
    const mints = facts.filter((f) => f.kind === "MoneyMint");
    // b1 (size 1) and b2 (size 2) are due weekly regardless; b3 (size 3) is due only because of the feast.
    expect(mints).toHaveLength(3);
    expect(mints.some((f) => f.kind === "MoneyMint" && f.amount === FEAST_TARIFF[3])).toBe(true);
  });

  it("charges nothing for a refusing business (refusalStage >= 1)", () => {
    const { world, b1 } = buildFixture("refusal");
    const log = new TurnLogBuilder(0);
    applyFacts(world, [{ kind: "RefusalStage", businessId: b1.id, stage: 1, cause }], log);
    const facts = runChains(world, EMPTY_CONTENT);
    const mints = facts.filter((f) => f.kind === "MoneyMint");
    // Only b2 (size 2, weekly) is due at week 1: b1 is squared and refuses, b3 needs a feast.
    expect(mints).toHaveLength(1);
    expect(mints[0]!.amount).toBe(WEEKLY_TARIFF[2]);
    expect(facts.some((f) => f.kind === "ComplianceDelta" && f.businessId === b1.id)).toBe(false);
  });

  it("pays always when fear is 1000 (compliance chance clamps to 10000, no draw needed)", () => {
    const { world } = singleBusinessFixture("always-pays", { type: "stall", size: 1, fear: 1000 });
    const facts = runChains(world, EMPTY_CONTENT);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.kind).toBe("MoneyMint");
  });

  it("never pays when the compliance chance is driven to 0, and yields a ComplianceDelta", () => {
    // fear 0 and an extreme adverse sentiment drive complianceChance's raw score to (or below) 0,
    // which clamps to 0: Stream.chance(0) returns false unconditionally, no draw needed.
    const { world, business } = singleBusinessFixture("never-pays", {
      type: "supermarket",
      size: 5,
      fear: 0,
      sentiment: -10_000,
      week: 15, // feast, so the size-5 business is due
      turnLength: 1,
    });
    const facts = runChains(world, EMPTY_CONTENT);
    expect(facts).toHaveLength(2); // ComplianceDelta plus CollectionMissed (design 09 §1)
    expect(facts[1]?.kind).toBe("CollectionMissed");
    expect(facts[0]).toEqual({ kind: "ComplianceDelta", businessId: business.id, delta: -20, cause: { rule: "chain.protectionTax", instanceId: expect.any(String) } });
  });

  it("assigns collectors round-robin over business index, in slot order", () => {
    const world = baseWorld("round-robin");
    const chief = addCharacter(world, { name: "Chief", rank: "chief" });
    const c1 = addCharacter(world, { name: "C1", rank: "soldier" });
    const c2 = addCharacter(world, { name: "C2", rank: "soldier" });
    const family = addFamily(world, { name: "Family" });
    const town = addTown(world, { name: "Town", archetype: "city" });
    const block = addBlock(world, town.id);
    const businesses = [0, 1, 2, 3].map(() => addBusiness(world, block.id, { type: "stall", size: 1, fear: 1000 }));

    const chainId = mintId<"ChainInstanceId">(world.meta.ids, "chn");
    const log = new TurnLogBuilder(0);
    applyFacts(
      world,
      [
        { kind: "ChainCreate", chainId, templateId: "chain.protectionTax", familyId: family.id, ownerId: chief.id, slotNames: ["collectors", "blocks"], cause },
        { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: c1.id }, cause },
        { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: c2.id }, cause },
        { kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: block.id }, cause },
      ],
      log,
    );

    const facts = runChains(world, EMPTY_CONTENT);
    const mints = facts.filter((f): f is Extract<typeof f, { kind: "MoneyMint" }> => f.kind === "MoneyMint");
    expect(mints).toHaveLength(4);
    const collectorOrder = businesses.map((b, i) => {
      const collectorId = i % 2 === 0 ? c1.id : c2.id;
      const expected = world.characters.byId[collectorId]!.accounts.personal;
      return mints[i]!.to === expected;
    });
    expect(collectorOrder).toEqual([true, true, true, true]);
  });

  it("skips a dead or non-free collector, using only living free collectors", () => {
    const world = baseWorld("skip-collector");
    const chief = addCharacter(world, { name: "Chief", rank: "chief" });
    const deadCollector = addCharacter(world, { name: "Dead", rank: "soldier", alive: false });
    const jailedCollector = addCharacter(world, { name: "Jailed", rank: "soldier", status: "jailed" });
    const livingCollector = addCharacter(world, { name: "Living", rank: "soldier" });
    const family = addFamily(world, { name: "Family" });
    const town = addTown(world, { name: "Town", archetype: "city" });
    const block = addBlock(world, town.id);
    const business = addBusiness(world, block.id, { type: "stall", size: 1, fear: 1000 });

    const chainId = mintId<"ChainInstanceId">(world.meta.ids, "chn");
    const log = new TurnLogBuilder(0);
    applyFacts(
      world,
      [
        { kind: "ChainCreate", chainId, templateId: "chain.protectionTax", familyId: family.id, ownerId: chief.id, slotNames: ["collectors", "blocks"], cause },
        { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: deadCollector.id }, cause },
        { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: jailedCollector.id }, cause },
        { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: livingCollector.id }, cause },
        { kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: block.id }, cause },
      ],
      log,
    );

    const facts = runChains(world, EMPTY_CONTENT);
    expect(facts).toEqual([
      { kind: "MoneyMint", to: livingCollector.accounts.personal, amount: WEEKLY_TARIFF[1], money: "dirty", source: "protectionTax", cause: { rule: "chain.protectionTax", instanceId: chainId, actorId: livingCollector.id, subjectId: business.id } },
    ]);
    void business;
  });

  it("produces nothing when there are no living, free collectors", () => {
    const world = baseWorld("no-collectors");
    const chief = addCharacter(world, { name: "Chief", rank: "chief" });
    const deadCollector = addCharacter(world, { name: "Dead", rank: "soldier", alive: false });
    const family = addFamily(world, { name: "Family" });
    const town = addTown(world, { name: "Town", archetype: "city" });
    const block = addBlock(world, town.id);
    addBusiness(world, block.id, { type: "stall", size: 1, fear: 1000 });

    const chainId = mintId<"ChainInstanceId">(world.meta.ids, "chn");
    const log = new TurnLogBuilder(0);
    applyFacts(
      world,
      [
        { kind: "ChainCreate", chainId, templateId: "chain.protectionTax", familyId: family.id, ownerId: chief.id, slotNames: ["collectors", "blocks"], cause },
        { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: deadCollector.id }, cause },
        { kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: block.id }, cause },
      ],
      log,
    );

    expect(runChains(world, EMPTY_CONTENT)).toEqual([]);
  });

  it("ignores chain instances of a different template", () => {
    const world = baseWorld("other-template");
    const chief = addCharacter(world, { name: "Chief", rank: "chief" });
    const collector = addCharacter(world, { name: "Collector", rank: "soldier" });
    const family = addFamily(world, { name: "Family" });
    const town = addTown(world, { name: "Town", archetype: "city" });
    const block = addBlock(world, town.id);
    addBusiness(world, block.id, { type: "stall", size: 1, fear: 1000 });

    const chainId = mintId<"ChainInstanceId">(world.meta.ids, "chn");
    const log = new TurnLogBuilder(0);
    applyFacts(
      world,
      [
        { kind: "ChainCreate", chainId, templateId: "chain.loans", familyId: family.id, ownerId: chief.id, slotNames: ["collectors", "blocks"], cause },
        { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: collector.id }, cause },
        { kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: block.id }, cause },
      ],
      log,
    );

    expect(runChains(world, EMPTY_CONTENT)).toEqual([]);
  });
});

describe("chains invariants", () => {
  function chainViolations(world: World): string[] {
    return runInvariants(world)
      .filter((v) => v.name.startsWith("chains."))
      .map((v) => v.name);
  }

  it("are silent on a well-formed chain", () => {
    const { world } = buildFixture("inv-baseline");
    expect(chainViolations(world)).toEqual([]);
  });

  it("slotsValid fires on a duplicate filler in a slot", () => {
    const { world, chainId, soldier1 } = buildFixture("inv-duplicate");
    world.chains.byId[chainId]!.slots["collectors"]!.push({ kind: "character", id: soldier1.id });
    expect(chainViolations(world)).toContain("chains.slotsValid");
  });

  it("slotsValid fires on a filler that does not exist", () => {
    const { world, chainId } = buildFixture("inv-missing-filler");
    world.chains.byId[chainId]!.slots["collectors"]!.push({ kind: "character", id: "chr-nope" as CharacterId });
    expect(chainViolations(world)).toContain("chains.slotsValid");
  });

  it("ownerValid fires when the owner does not exist", () => {
    const { world, chainId } = buildFixture("inv-owner");
    world.chains.byId[chainId]!.ownerId = "chr-nope" as CharacterId;
    expect(chainViolations(world)).toContain("chains.ownerValid");
  });

  it("ownerValid fires when the family does not exist", () => {
    const { world, chainId } = buildFixture("inv-family");
    world.chains.byId[chainId]!.familyId = "fam-nope" as FamilyId;
    expect(chainViolations(world)).toContain("chains.ownerValid");
  });

  it("blocksBelongToFamily is silent when the town has no family, and fires when it belongs to another family", () => {
    const { world, chainId } = buildFixture("inv-block-family");
    expect(chainViolations(world)).not.toContain("chains.blocksBelongToFamily");

    const otherFamily = addFamily(world, { name: "Rivals" });
    const otherTown = addTown(world, { name: "Rival Town", archetype: "city", familyId: otherFamily.id });
    const otherBlock = addBlock(world, otherTown.id);
    const log = new TurnLogBuilder(0);
    applyFacts(world, [{ kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: otherBlock.id }, cause }], log);
    expect(chainViolations(world)).toContain("chains.blocksBelongToFamily");
  });
});

describe("chains + shares through step()", () => {
  it("chain income on turn 2 flows to the collector and, via the share rule, to the chief", () => {
    const world0 = baseWorld("e2e");
    const chief = addCharacter(world0, { name: "Chief", rank: "chief" });
    const collector = addCharacter(world0, { name: "Collector", rank: "soldier", superiorId: chief.id });
    const family = addFamily(world0, { name: "Family", treasuryCut: 100 });
    collector.familyId = family.id;
    chief.shareRules[collector.id] = { fixedPerTurn: 0, percent: 400 };
    const town = addTown(world0, { name: "Town", archetype: "city" });
    const block = addBlock(world0, town.id);
    addBusiness(world0, block.id, { type: "stall", size: 1, fear: 1000 }); // guaranteed pay

    const chainId = mintId<"ChainInstanceId">(world0.meta.ids, "chn");
    const r1 = step(world0, [], EMPTY_CONTENT, {
      injectFacts: [
        { kind: "ChainCreate", chainId, templateId: "chain.protectionTax", familyId: family.id, ownerId: chief.id, slotNames: ["collectors", "blocks"], cause },
        { kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: collector.id }, cause },
        { kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: block.id }, cause },
      ],
    });

    // Turn 1: the chain is created this turn (after runChains already ran with no chains), so no income yet.
    expect(r1.world.ledger.accounts.byId[collector.accounts.personal]!.dirty).toBe(0);
    expect(r1.world.ledger.accounts.byId[chief.accounts.personal]!.dirty).toBe(0);

    // Turn 2: the now fully-slotted chain runs, mints to the collector, and shares move to the chief.
    const r2 = step(r1.world, [], EMPTY_CONTENT);

    const collectorIncome = WEEKLY_TARIFF[1] * r1.world.meta.turnLength; // turnLength is 1 (turn 1's length)
    const share = applyPermille(collectorIncome, 400);
    expect(share).toBeGreaterThan(0);

    expect(r2.world.ledger.accounts.byId[collector.accounts.personal]!.dirty).toBe(collectorIncome - share);
    expect(r2.world.ledger.accounts.byId[chief.accounts.personal]!.dirty).toBe(share);

    const total = runInvariants(r2.world).filter((v) => v.name.startsWith("money."));
    expect(total).toEqual([]);
  });
});
