import { describe, expect, it } from "vitest";
import { tableRemove, type BusinessId, type CharacterId, type TownId } from "@borgata/shared";
import { addCharacter, createEmptyWorld, type World } from "./world.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { complianceChance, decaySentiment } from "./reducers/towns.js";
import { runInvariants } from "./invariants/all.js";
import { addBlock, addBusiness, addTown } from "./fixtures.js";
import { EMPTY_CONTENT } from "./content-types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function freshWorld(seed = "towns-test"): World {
  return createEmptyWorld(seed, setup, EMPTY_CONTENT.version);
}

function townsViolations(world: World): string[] {
  return runInvariants(world)
    .filter((v) => v.name.startsWith("towns."))
    .map((v) => v.name);
}

describe("towns fixtures", () => {
  it("builds a town, a block and a business with the documented defaults", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Corleone", archetype: "rural" });
    expect(world.geo.towns.byId[town.id]).toBe(town);
    expect(world.towns.byId[town.id]).toEqual({ townId: town.id, sentiment: 0, pettyCrime: 100 });

    const block = addBlock(world, town.id);
    expect(world.geo.blocks.byId[block.id]).toBe(block);
    expect(world.geo.towns.byId[town.id]!.blockIds).toEqual([block.id]);

    const biz = addBusiness(world, block.id, { type: "shop", size: 2 });
    expect(world.geo.businesses.byId[biz.id]).toBe(biz);
    expect(world.geo.blocks.byId[block.id]!.businessIds).toEqual([biz.id]);
    expect(biz.compliance).toBe(700);
    expect(biz.fear).toBe(300);
    expect(biz.refusalStage).toBe(0);
    expect(biz.ownerId).toBeNull();
  });
});

describe("towns reducer: SentimentDelta", () => {
  it("applies a nonzero delta and clamps to -1000..1000", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Palermo", archetype: "city" });
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(
      world,
      [
        { kind: "SentimentDelta", townId: town.id, delta: 50, cause },
        { kind: "SentimentDelta", townId: town.id, delta: -2000, cause },
      ],
      log,
    );
    expect(applied).toBe(2);
    expect(world.towns.byId[town.id]!.sentiment).toBe(-1000);
  });

  it("rejects an unknown town without throwing", () => {
    const world = freshWorld();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "SentimentDelta", townId: "town-nope" as TownId, delta: 10, cause }], log);
    expect(applied).toBe(0);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.kind).toBe("rejected");
  });

  it("rejects a zero delta", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Palermo", archetype: "city" });
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "SentimentDelta", townId: town.id, delta: 0, cause }], log);
    expect(applied).toBe(0);
    expect(world.towns.byId[town.id]!.sentiment).toBe(0);
  });

  it("rejects a non-safe-integer delta", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Palermo", archetype: "city" });
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "SentimentDelta", townId: town.id, delta: 1.5, cause }], log);
    expect(applied).toBe(0);
  });
});

describe("towns reducer: PettyCrimeDelta", () => {
  it("applies a nonzero delta and clamps to 0..1000", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Bagheria", archetype: "rural" });
    const log = new TurnLogBuilder(0);
    applyFacts(
      world,
      [
        { kind: "PettyCrimeDelta", townId: town.id, delta: -50, cause },
        { kind: "PettyCrimeDelta", townId: town.id, delta: -1000, cause },
      ],
      log,
    );
    expect(world.towns.byId[town.id]!.pettyCrime).toBe(0);
  });

  it("rejects an unknown town", () => {
    const world = freshWorld();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "PettyCrimeDelta", townId: "town-nope" as TownId, delta: 10, cause }], log);
    expect(applied).toBe(0);
  });

  it("rejects a zero delta", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Bagheria", archetype: "rural" });
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "PettyCrimeDelta", townId: town.id, delta: 0, cause }], log);
    expect(applied).toBe(0);
  });
});

describe("towns reducer: ComplianceDelta and FearDelta", () => {
  function worldWithBusiness() {
    const world = freshWorld();
    const town = addTown(world, { name: "Trapani", archetype: "port" });
    const block = addBlock(world, town.id);
    const biz = addBusiness(world, block.id, { type: "bar", size: 1 });
    return { world, biz };
  }

  it("applies compliance and fear deltas, clamped to 0..1000", () => {
    const { world, biz } = worldWithBusiness();
    const log = new TurnLogBuilder(0);
    applyFacts(
      world,
      [
        { kind: "ComplianceDelta", businessId: biz.id, delta: 500, cause },
        { kind: "ComplianceDelta", businessId: biz.id, delta: -2000, cause },
        { kind: "FearDelta", businessId: biz.id, delta: 900, cause },
      ],
      log,
    );
    expect(world.geo.businesses.byId[biz.id]!.compliance).toBe(0);
    expect(world.geo.businesses.byId[biz.id]!.fear).toBe(1000);
  });

  it("rejects an unknown business for both facts", () => {
    const { world } = worldWithBusiness();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(
      world,
      [
        { kind: "ComplianceDelta", businessId: "biz-nope" as BusinessId, delta: 10, cause },
        { kind: "FearDelta", businessId: "biz-nope" as BusinessId, delta: 10, cause },
      ],
      log,
    );
    expect(applied).toBe(0);
  });

  it("rejects a zero delta for both facts", () => {
    const { world, biz } = worldWithBusiness();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(
      world,
      [
        { kind: "ComplianceDelta", businessId: biz.id, delta: 0, cause },
        { kind: "FearDelta", businessId: biz.id, delta: 0, cause },
      ],
      log,
    );
    expect(applied).toBe(0);
  });
});

describe("towns reducer: RefusalStage", () => {
  function worldWithBusiness() {
    const world = freshWorld();
    const town = addTown(world, { name: "Marsala", archetype: "port" });
    const block = addBlock(world, town.id);
    const biz = addBusiness(world, block.id, { type: "workshop", size: 1 });
    return { world, biz };
  }

  it("steps up one rung at a time", () => {
    const { world, biz } = worldWithBusiness();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(
      world,
      [
        { kind: "RefusalStage", businessId: biz.id, stage: 1, cause },
        { kind: "RefusalStage", businessId: biz.id, stage: 2, cause },
      ],
      log,
    );
    expect(applied).toBe(2);
    expect(world.geo.businesses.byId[biz.id]!.refusalStage).toBe(2);
  });

  it("allows dropping down to any lower stage in one move (a refuser can be squared again)", () => {
    const { world, biz } = worldWithBusiness();
    const log = new TurnLogBuilder(0);
    applyFacts(
      world,
      [
        { kind: "RefusalStage", businessId: biz.id, stage: 1, cause },
        { kind: "RefusalStage", businessId: biz.id, stage: 2, cause },
        { kind: "RefusalStage", businessId: biz.id, stage: 3, cause },
        { kind: "RefusalStage", businessId: biz.id, stage: 0, cause },
      ],
      log,
    );
    expect(world.geo.businesses.byId[biz.id]!.refusalStage).toBe(0);
  });

  it("rejects staying at the same stage", () => {
    const { world, biz } = worldWithBusiness();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "RefusalStage", businessId: biz.id, stage: 0, cause }], log);
    expect(applied).toBe(0);
  });

  it("rejects jumping up by more than one rung", () => {
    const { world, biz } = worldWithBusiness();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "RefusalStage", businessId: biz.id, stage: 2, cause }], log);
    expect(applied).toBe(0);
    expect(world.geo.businesses.byId[biz.id]!.refusalStage).toBe(0);
  });

  it("rejects an unknown business", () => {
    const world = freshWorld();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "RefusalStage", businessId: "biz-nope" as BusinessId, stage: 1, cause }], log);
    expect(applied).toBe(0);
  });
});

// docs/event-storming-2026-09-25.md §3 hotspot 1: the fact that sets a business's civilian owner.
describe("towns reducer: BusinessOwnerSet", () => {
  function worldWithBusiness() {
    const world = freshWorld();
    const town = addTown(world, { name: "Marsala", archetype: "port" });
    const block = addBlock(world, town.id);
    const biz = addBusiness(world, block.id, { type: "shop", size: 1 });
    return { world, biz };
  }

  it("sets ownerId when the business exists and the character is a civilian", () => {
    const { world, biz } = worldWithBusiness();
    const owner = addCharacter(world, { name: "Test Owner", rank: "civilian", familyId: null });
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "BusinessOwnerSet", businessId: biz.id, ownerId: owner.id, cause }], log);
    expect(applied).toBe(1);
    expect(world.geo.businesses.byId[biz.id]!.ownerId).toBe(owner.id);
  });

  it("rejects an unknown business", () => {
    const world = freshWorld();
    const owner = addCharacter(world, { name: "Test Owner", rank: "civilian", familyId: null });
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "BusinessOwnerSet", businessId: "biz-nope" as BusinessId, ownerId: owner.id, cause }], log);
    expect(applied).toBe(0);
  });

  it("rejects an unknown character", () => {
    const { world, biz } = worldWithBusiness();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "BusinessOwnerSet", businessId: biz.id, ownerId: "chr-nope" as CharacterId, cause }], log);
    expect(applied).toBe(0);
    expect(world.geo.businesses.byId[biz.id]!.ownerId).toBeNull();
  });

  it("rejects a non-civilian character", () => {
    const { world, biz } = worldWithBusiness();
    const soldier = addCharacter(world, { name: "Test Soldier", rank: "soldier", familyId: null });
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(world, [{ kind: "BusinessOwnerSet", businessId: biz.id, ownerId: soldier.id, cause }], log);
    expect(applied).toBe(0);
    expect(world.geo.businesses.byId[biz.id]!.ownerId).toBeNull();
  });
});

describe("decaySentiment", () => {
  it("moves sentiment toward 0 with a half-life of 52 weeks", () => {
    const world = freshWorld();
    const positive = addTown(world, { name: "A", archetype: "rural" });
    const negative = addTown(world, { name: "B", archetype: "rural" });
    world.towns.byId[positive.id]!.sentiment = 400;
    world.towns.byId[negative.id]!.sentiment = -400;

    decaySentiment(world, 52);

    expect(world.towns.byId[positive.id]!.sentiment).toBe(200);
    expect(world.towns.byId[negative.id]!.sentiment).toBe(-200);
  });
});

describe("complianceChance", () => {
  it("computes base(type) + fear*4 - max(0,-sentiment)*3, clamped to 0..10000", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Catania", archetype: "city" });
    world.towns.byId[town.id]!.sentiment = -100;
    const block = addBlock(world, town.id);

    const stall = addBusiness(world, block.id, { type: "stall", size: 1, fear: 200, compliance: 700 });
    // 9000 + 200*4 - 100*3 = 9000 + 800 - 300 = 9500
    expect(complianceChance(world, stall.id)).toBe(9500);

    const supermarket = addBusiness(world, block.id, { type: "supermarket", size: 5, fear: 50, compliance: 700 });
    // 6000 + 50*4 - 100*3 = 6000 + 200 - 300 = 5900
    expect(complianceChance(world, supermarket.id)).toBe(5900);
  });

  it("clamps to 0..10000 and ignores positive sentiment (only sentiment against counts)", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Enna", archetype: "rural" });
    world.towns.byId[town.id]!.sentiment = 900; // positive sentiment should not add anything
    const block = addBlock(world, town.id);
    const biz = addBusiness(world, block.id, { type: "stall", size: 1, fear: 1000 });
    // 9000 + 1000*4 - 0 = 13000, clamped to 10000
    expect(complianceChance(world, biz.id)).toBe(10_000);
  });
});

describe("towns invariants", () => {
  it("stateForEveryTown fires when a town has no TownState, and vice versa; silent otherwise", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Ragusa", archetype: "rural" });
    expect(townsViolations(world)).not.toContain("towns.stateForEveryTown");

    tableRemove(world.towns, town.id);
    expect(townsViolations(world)).toContain("towns.stateForEveryTown");
  });

  it("metersInRange fires on a planted out-of-range value; silent otherwise", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Siracusa", archetype: "city" });
    const block = addBlock(world, town.id);
    const biz = addBusiness(world, block.id, { type: "shop", size: 2 });
    expect(townsViolations(world)).not.toContain("towns.metersInRange");

    world.towns.byId[town.id]!.sentiment = 5000;
    expect(townsViolations(world)).toContain("towns.metersInRange");
    world.towns.byId[town.id]!.sentiment = 0;

    world.geo.businesses.byId[biz.id]!.refusalStage = 9 as never;
    expect(townsViolations(world)).toContain("towns.metersInRange");
  });

  it("blocksConsistent fires when a block or business points at the wrong parent; silent otherwise", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Messina", archetype: "port" });
    const block = addBlock(world, town.id);
    addBusiness(world, block.id, { type: "site", size: 4 });
    expect(townsViolations(world)).not.toContain("towns.blocksConsistent");

    // Detach the block from the town's list without touching the block itself.
    world.geo.towns.byId[town.id]!.blockIds = [];
    expect(townsViolations(world)).toContain("towns.blocksConsistent");
    world.geo.towns.byId[town.id]!.blockIds = [block.id];

    // Detach the business from the block's list without touching the business itself.
    world.geo.blocks.byId[block.id]!.businessIds = [];
    expect(townsViolations(world)).toContain("towns.blocksConsistent");
  });
});
