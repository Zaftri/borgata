import { describe, expect, it } from "vitest";
import { buildStarterWorld } from "./starter.js";
import { worldHash } from "./step.js";
import { runInvariants } from "./invariants/all.js";
import { EMPTY_CONTENT } from "./content-types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

describe("buildStarterWorld", () => {
  it("passes every invariant", () => {
    const world = buildStarterWorld("starter-seed", setup, EMPTY_CONTENT);
    expect(runInvariants(world)).toEqual([]);
  });

  it("is deterministic: the same seed produces the same world hash", () => {
    const w1 = buildStarterWorld("starter-seed", setup, EMPTY_CONTENT);
    const w2 = buildStarterWorld("starter-seed", setup, EMPTY_CONTENT);
    expect(worldHash(w1)).toBe(worldHash(w2));
  });

  it("differs by seed", () => {
    const w1 = buildStarterWorld("seed-a", setup, EMPTY_CONTENT);
    const w2 = buildStarterWorld("seed-b", setup, EMPTY_CONTENT);
    expect(worldHash(w1)).not.toBe(worldHash(w2));
  });

  it("has two families, two crews and fifteen businesses", () => {
    const world = buildStarterWorld("starter-seed", setup, EMPTY_CONTENT);
    expect(world.families.order).toHaveLength(2);
    expect(world.crews.order).toHaveLength(2);
    expect(world.geo.businesses.order).toHaveLength(15);
  });

  it("gives the player rank associate with superiorId and onRecordWith set to the same soldier", () => {
    const world = buildStarterWorld("starter-seed", setup, EMPTY_CONTENT);
    const player = world.characters.byId[world.player.characterId]!;
    expect(player.rank).toBe("associate");
    expect(player.superiorId).not.toBeNull();
    expect(player.onRecordWith).not.toBeNull();
    expect(player.superiorId).toBe(player.onRecordWith);

    const soldier = world.characters.byId[player.superiorId!]!;
    expect(soldier.rank).toBe("soldier");
  });
});
