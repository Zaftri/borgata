// The animated turn's projection (design 07 §2.2, §4): layout is deterministic, portraits are deterministic, and the
// clip list for a place equals the player-visible log entries about that place (the equivalence rule).
import { describe, expect, it } from "vitest";
import { loadContent } from "@borgata/content";
import { initialWorld } from "./replay.js";
import { step } from "./step.js";
import { clipOf, layoutTown, placesForPlayer, portraitParts, projectScene } from "./scene.js";
import { playerCharacter } from "./world.js";

const content = loadContent();
const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

describe("scene projection", () => {
  it("lays out the player's town deterministically with a building per business", () => {
    const world = initialWorld("scene-1", setup, content);
    const [place] = placesForPlayer(world);
    expect(place?.yours).toBe(true);
    const town = world.geo.towns.byId[place!.id]!;
    const a = layoutTown(world, town);
    const b = layoutTown(world, town);
    expect(a).toEqual(b);
    const businessCount = town.blockIds.reduce((n, id) => n + (world.geo.blocks.byId[id]?.businessIds.length ?? 0), 0);
    expect(a.buildings).toHaveLength(businessCount);
    expect(a.tiles).toHaveLength(a.height);
    for (const row of a.tiles) expect(row).toHaveLength(a.width);
    for (const bld of a.buildings) expect(a.tiles[bld.y]![bld.x]).toBe("wall");
  });

  it("portrait parts are deterministic, bounded, and age with the character", () => {
    const world = initialWorld("scene-2", setup, content);
    const me = playerCharacter(world);
    const p1 = portraitParts(me);
    expect(portraitParts(me)).toEqual(p1);
    expect(p1.hair).toBeLessThan(14);
    expect(p1.eyes).toBeLessThan(8);
    const older = { ...me, age: 66 };
    expect(portraitParts(older).ageMarks).toBe(3);
    expect(portraitParts(older).hairAge).toBe(2);
  });

  it("clips equal the player-visible log entries about the place, in tick order", () => {
    let world = initialWorld("scene-3", setup, content);
    const placeId = placesForPlayer(world)[0]!.id;
    for (let t = 0; t < 6; t++) {
      const r = step(world, [], content);
      world = r.world;
      const scene = projectScene(world, r.log, content, placeId)!;
      const expected = r.log.entries.map((e) => clipOf(world, e, placeId, new Map())).filter((c) => c !== null);
      expected.sort((a, b) => a!.tick - b!.tick);
      expect(scene.clips).toEqual(expected);
      for (let i = 1; i < scene.clips.length; i++) expect(scene.clips[i]!.tick).toBeGreaterThanOrEqual(scene.clips[i - 1]!.tick);
      expect(scene.actors.some((a) => a.role === "you")).toBe(true);
    }
  });

  it("collections in the place become collect clips anchored to the shop", () => {
    let world = initialWorld("scene-4", setup, content);
    const placeId = placesForPlayer(world)[0]!.id;
    let found = false;
    for (let t = 0; t < 8 && !found; t++) {
      const r = step(world, [], content);
      world = r.world;
      const scene = projectScene(world, r.log, content, placeId)!;
      const collect = scene.clips.find((c) => c.kind === "collect");
      if (collect) {
        found = true;
        expect(scene.buildings.some((b) => b.businessId === collect.businessId)).toBe(true);
      }
    }
    expect(found).toBe(true);
  });
});
