import { describe, expect, it } from "vitest";
import type { CharacterId } from "@borgata/shared";
import { addCharacter, createEmptyWorld, favorKey, type World } from "./world.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { decayLoyalty } from "./reducers/relationships.js";
import { runInvariants } from "./invariants/all.js";
import { EMPTY_CONTENT } from "./content-types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function freshWorld(): World {
  return createEmptyWorld("relationships-test", setup, EMPTY_CONTENT.version);
}

function relViolations(world: World) {
  return runInvariants(world).filter((v) => v.name.startsWith("relationships."));
}

describe("relationships reducer: LoyaltyDelta", () => {
  it("applies a delta and clamps at both ends", () => {
    const world = freshWorld();
    const c = addCharacter(world, { name: "Nico", loyalty: 500 });
    const log = new TurnLogBuilder(0);

    let applied = applyFacts(world, [{ kind: "LoyaltyDelta", characterId: c.id, delta: 100, cause }], log);
    expect(applied).toBe(1);
    expect(world.characters.byId[c.id]!.loyalty).toBe(600);

    applied = applyFacts(world, [{ kind: "LoyaltyDelta", characterId: c.id, delta: 1000, cause }], log);
    expect(applied).toBe(1);
    expect(world.characters.byId[c.id]!.loyalty).toBe(1000); // clamped at max

    applied = applyFacts(world, [{ kind: "LoyaltyDelta", characterId: c.id, delta: -5000, cause }], log);
    expect(applied).toBe(1);
    expect(world.characters.byId[c.id]!.loyalty).toBe(0); // clamped at min
  });

  it("rejects an unknown character, a dead character, a zero delta and a non-integer delta", () => {
    const world = freshWorld();
    const alive = addCharacter(world, { name: "Alive", loyalty: 500 });
    const dead = addCharacter(world, { name: "Dead", loyalty: 500, alive: false });
    const log = new TurnLogBuilder(0);

    const applied = applyFacts(
      world,
      [
        { kind: "LoyaltyDelta", characterId: "chr-nope" as CharacterId, delta: 10, cause },
        { kind: "LoyaltyDelta", characterId: dead.id, delta: 10, cause },
        { kind: "LoyaltyDelta", characterId: alive.id, delta: 0, cause },
        { kind: "LoyaltyDelta", characterId: alive.id, delta: 1.5, cause },
        { kind: "LoyaltyDelta", characterId: alive.id, delta: Number.NaN, cause },
      ],
      log,
    );
    expect(applied).toBe(0);
    expect(log.entries.filter((e) => e.kind === "rejected")).toHaveLength(5);
    expect(world.characters.byId[alive.id]!.loyalty).toBe(500);
    expect(world.characters.byId[dead.id]!.loyalty).toBe(500);
  });
});

describe("relationships reducer: FavorDelta", () => {
  it("accumulates a signed favor and clamps at both ends", () => {
    const world = freshWorld();
    const a = addCharacter(world, { name: "A" });
    const b = addCharacter(world, { name: "B" });
    const log = new TurnLogBuilder(0);
    const key = favorKey(a.id, b.id);

    applyFacts(world, [{ kind: "FavorDelta", from: a.id, to: b.id, delta: 300, cause }], log);
    expect(world.favors[key]).toBe(300);

    applyFacts(world, [{ kind: "FavorDelta", from: a.id, to: b.id, delta: 1000, cause }], log);
    expect(world.favors[key]).toBe(1000); // clamped at max

    applyFacts(world, [{ kind: "FavorDelta", from: a.id, to: b.id, delta: -5000, cause }], log);
    expect(world.favors[key]).toBe(-1000); // clamped at min
  });

  it("removes the favor key once the balance returns to zero", () => {
    const world = freshWorld();
    const a = addCharacter(world, { name: "A" });
    const b = addCharacter(world, { name: "B" });
    const log = new TurnLogBuilder(0);
    const key = favorKey(a.id, b.id);

    applyFacts(world, [{ kind: "FavorDelta", from: a.id, to: b.id, delta: 40, cause }], log);
    expect(key in world.favors).toBe(true);

    applyFacts(world, [{ kind: "FavorDelta", from: a.id, to: b.id, delta: -40, cause }], log);
    expect(key in world.favors).toBe(false);
  });

  it("rejects unknown characters, from === to, a zero delta and a non-integer delta", () => {
    const world = freshWorld();
    const a = addCharacter(world, { name: "A" });
    const b = addCharacter(world, { name: "B" });
    const log = new TurnLogBuilder(0);

    const applied = applyFacts(
      world,
      [
        { kind: "FavorDelta", from: "chr-nope" as CharacterId, to: b.id, delta: 10, cause },
        { kind: "FavorDelta", from: a.id, to: "chr-nope" as CharacterId, delta: 10, cause },
        { kind: "FavorDelta", from: a.id, to: a.id, delta: 10, cause },
        { kind: "FavorDelta", from: a.id, to: b.id, delta: 0, cause },
        { kind: "FavorDelta", from: a.id, to: b.id, delta: 1.5, cause },
      ],
      log,
    );
    expect(applied).toBe(0);
    expect(log.entries.filter((e) => e.kind === "rejected")).toHaveLength(5);
    expect(world.favors).toEqual({});
  });
});

describe("relationships reducer: MemoryAdd", () => {
  it("pushes a memory entry stamped with the current turn, omitting aboutId when absent", () => {
    const world = freshWorld();
    world.meta.turn = 7;
    const c = addCharacter(world, { name: "Nico" });
    const about = addCharacter(world, { name: "Sal" });
    const log = new TurnLogBuilder(0);

    applyFacts(world, [{ kind: "MemoryAdd", characterId: c.id, memory: { tag: "insulted", weight: 5 }, cause }], log);
    const entry = world.characters.byId[c.id]!.memory[0]!;
    expect(entry).toEqual({ tag: "insulted", weight: 5, turn: 7 });
    expect("aboutId" in entry).toBe(false);

    applyFacts(world, [{ kind: "MemoryAdd", characterId: c.id, memory: { tag: "favored", aboutId: about.id, weight: 3 }, cause }], log);
    expect(world.characters.byId[c.id]!.memory[1]).toEqual({ tag: "favored", aboutId: about.id, weight: 3, turn: 7 });
  });

  it("rejects an unknown character, a non-positive or non-integer weight, and an empty tag", () => {
    const world = freshWorld();
    const c = addCharacter(world, { name: "Nico" });
    const log = new TurnLogBuilder(0);

    const applied = applyFacts(
      world,
      [
        { kind: "MemoryAdd", characterId: "chr-nope" as CharacterId, memory: { tag: "x", weight: 1 }, cause },
        { kind: "MemoryAdd", characterId: c.id, memory: { tag: "x", weight: 0 }, cause },
        { kind: "MemoryAdd", characterId: c.id, memory: { tag: "x", weight: -1 }, cause },
        { kind: "MemoryAdd", characterId: c.id, memory: { tag: "x", weight: 1.5 }, cause },
        { kind: "MemoryAdd", characterId: c.id, memory: { tag: "", weight: 1 }, cause },
      ],
      log,
    );
    expect(applied).toBe(0);
    expect(log.entries.filter((e) => e.kind === "rejected")).toHaveLength(5);
    expect(world.characters.byId[c.id]!.memory).toEqual([]);
  });

  it("bounds memory to 32 entries, dropping the lowest weight, ties broken by the oldest entry", () => {
    const world = freshWorld();
    const c = addCharacter(world, { name: "Nico" });
    const log = new TurnLogBuilder(0);
    const facts: Array<{ kind: "MemoryAdd"; characterId: CharacterId; memory: { tag: string; weight: number }; cause: typeof cause }> = [];

    for (let i = 0; i < 32; i++) {
      const weight = i === 5 ? 1 : i === 20 ? 1 : 100 + i; // two tied minimums at index 5 ("tie-old") and 20 ("tie-new")
      const tag = i === 5 ? "tie-old" : i === 20 ? "tie-new" : `filler-${i}`;
      facts.push({ kind: "MemoryAdd", characterId: c.id, memory: { tag, weight }, cause });
    }
    applyFacts(world, facts, log);
    expect(world.characters.byId[c.id]!.memory).toHaveLength(32);

    // one more push tips it over the limit; the earliest of the tied minimums is dropped
    applyFacts(world, [{ kind: "MemoryAdd", characterId: c.id, memory: { tag: "trigger", weight: 999 }, cause }], log);
    const tags = world.characters.byId[c.id]!.memory.map((m) => m.tag);
    expect(tags).toHaveLength(32);
    expect(tags).not.toContain("tie-old");
    expect(tags).toContain("tie-new");
    expect(tags).toContain("trigger");
  });
});

describe("decayLoyalty", () => {
  it("moves loyalty toward 500 with a 104-week half-life, and leaves it unchanged at elapsed 0", () => {
    const world = freshWorld();
    const c = addCharacter(world, { name: "Nico", loyalty: 1000 });
    const dead = addCharacter(world, { name: "Dead", loyalty: 1000, alive: false });

    decayLoyalty(world, 104);
    expect(world.characters.byId[c.id]!.loyalty).toBe(750);
    expect(world.characters.byId[dead.id]!.loyalty).toBe(1000); // dead characters are untouched

    const world2 = freshWorld();
    const c2 = addCharacter(world2, { name: "Nico", loyalty: 1000 });
    decayLoyalty(world2, 0);
    expect(world2.characters.byId[c2.id]!.loyalty).toBe(1000); // unchanged
  });
});

describe("relationships invariants", () => {
  it("loyaltyInRange fires on a planted violation and is silent otherwise", () => {
    const world = freshWorld();
    const c = addCharacter(world, { name: "Nico", loyalty: 500 });
    expect(relViolations(world).filter((v) => v.name === "relationships.loyaltyInRange")).toEqual([]);

    world.characters.byId[c.id]!.loyalty = -5;
    expect(relViolations(world).some((v) => v.name === "relationships.loyaltyInRange")).toBe(true);

    world.characters.byId[c.id]!.loyalty = 1500;
    expect(relViolations(world).some((v) => v.name === "relationships.loyaltyInRange")).toBe(true);
  });

  it("favorsValid fires on a planted violation and is silent otherwise", () => {
    const world = freshWorld();
    const a = addCharacter(world, { name: "A" });
    const b = addCharacter(world, { name: "B" });
    world.favors[favorKey(a.id, b.id)] = 200;
    expect(relViolations(world).filter((v) => v.name === "relationships.favorsValid")).toEqual([]);

    world.favors["malformed"] = 200;
    expect(relViolations(world).some((v) => v.name === "relationships.favorsValid")).toBe(true);
    delete world.favors["malformed"];

    world.favors[favorKey(a.id, a.id)] = 200;
    expect(relViolations(world).some((v) => v.name === "relationships.favorsValid")).toBe(true);
    delete world.favors[favorKey(a.id, a.id)];

    world.favors[favorKey(a.id, "chr-nope" as CharacterId)] = 200;
    expect(relViolations(world).some((v) => v.name === "relationships.favorsValid")).toBe(true);
    delete world.favors[favorKey(a.id, "chr-nope" as CharacterId)];

    world.favors[favorKey(a.id, b.id)] = 5000;
    expect(relViolations(world).some((v) => v.name === "relationships.favorsValid")).toBe(true);
  });

  it("memoryBounded fires on a planted violation and is silent otherwise", () => {
    const world = freshWorld();
    const c = addCharacter(world, { name: "Nico" });
    c.memory.push({ tag: "ok", weight: 5, turn: 0 });
    expect(relViolations(world).filter((v) => v.name === "relationships.memoryBounded")).toEqual([]);

    for (let i = 0; i < 40; i++) c.memory.push({ tag: `x${i}`, weight: 1, turn: 0 });
    expect(relViolations(world).some((v) => v.name === "relationships.memoryBounded")).toBe(true);

    c.memory = [{ tag: "bad", weight: 0, turn: 0 }];
    expect(relViolations(world).some((v) => v.name === "relationships.memoryBounded")).toBe(true);
  });
});
