// Atlas tests (design 11 A1's task list). The vitest environment here is "node" (vitest.config.ts: no jsdom),
// so this file tests only the pure grid-generation half of atlas.ts (tileGrid/buildingGrid/figureGrid/
// carGrid/coinGrid/blueLightGrid) plus the palette's shape. It never calls the `atlas` object itself (`tile`,
// `building`, `figure`, `car`, `coin`, `blueLight`): those build a real `<canvas>` and a PixiJS `Texture`,
// which need a browser and are exercised by hand / by TurnView in the running app, not by this suite.

import { describe, expect, it } from "vitest";
import type { PortraitParts } from "@borgata/sim";
import {
  ACTOR_ROLES,
  BUILDING_STATES,
  BUILDING_TYPES,
  SIZE,
  TILE_KINDS,
  atlas,
  blueLightGrid,
  buildingGrid,
  carGrid,
  coinGrid,
  figureGrid,
  tileGrid,
  type PixelGrid,
} from "./atlas.js";
import { PALETTE } from "./palette.js";

function assertGrid16x16(grid: PixelGrid): void {
  expect(grid).toHaveLength(SIZE);
  for (const row of grid) expect(row).toHaveLength(SIZE);
}

const SOME_PARTS: PortraitParts = {
  skin: 2, head: 1, hair: 3, hairAge: 0, brows: 1, eyes: 2, nose: 1, mouth: 2, facialHair: 0, ageMarks: 0, clothing: 5, accessory: 0,
};

describe("palette", () => {
  it("has exactly 48 entries", () => {
    expect(PALETTE).toHaveLength(48);
  });

  it("every entry is a distinct hex colour", () => {
    for (const c of PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(PALETTE).size).toBe(PALETTE.length);
  });
});

describe("atlas tile grids", () => {
  for (const kind of TILE_KINDS) {
    it(`"${kind}" is 16x16`, () => {
      assertGrid16x16(tileGrid(kind));
    });

    it(`"${kind}" is deterministic`, () => {
      expect(tileGrid(kind)).toEqual(tileGrid(kind));
    });
  }

  it("different kinds draw different grids", () => {
    const grids = TILE_KINDS.map((k) => JSON.stringify(tileGrid(k)));
    expect(new Set(grids).size).toBe(TILE_KINDS.length);
  });
});

describe("atlas building grids", () => {
  for (const type of BUILDING_TYPES) {
    for (const state of BUILDING_STATES) {
      it(`"${type}" state "${state}" is 16x16`, () => {
        assertGrid16x16(buildingGrid(type, 1, state));
      });
    }

    it(`"${type}" is deterministic across sizes and repeat calls`, () => {
      const a = buildingGrid(type, 1, "open");
      const b = buildingGrid(type, 1, "open");
      const c = buildingGrid(type, 5, "open"); // size doesn't change the 16x16 face (design 11 A1)
      expect(a).toEqual(b);
      expect(a).toEqual(c);
    });
  }

  it("every state overlay changes the base building's pixels", () => {
    for (const type of BUILDING_TYPES) {
      const openGrid = JSON.stringify(buildingGrid(type, 1, "open"));
      for (const state of BUILDING_STATES) {
        if (state === "open") continue;
        expect(JSON.stringify(buildingGrid(type, 1, state))).not.toBe(openGrid);
      }
    }
  });
});

describe("atlas figure grids", () => {
  for (const role of ACTOR_ROLES) {
    it(`"${role}" is 16x16`, () => {
      assertGrid16x16(figureGrid(role, SOME_PARTS));
    });
  }

  it("is deterministic for the same role and parts", () => {
    expect(figureGrid("soldier", SOME_PARTS)).toEqual(figureGrid("soldier", SOME_PARTS));
  });

  it("colours change with PortraitParts.skin and .clothing", () => {
    const a = figureGrid("civilian", { ...SOME_PARTS, skin: 0, clothing: 0 });
    const b = figureGrid("civilian", { ...SOME_PARTS, skin: 5, clothing: 11 });
    expect(a).not.toEqual(b);
  });

  it("shape changes with role even for identical parts", () => {
    const you = figureGrid("you", SOME_PARTS);
    const kid = figureGrid("kid", SOME_PARTS);
    expect(you).not.toEqual(kid);
  });
});

describe("atlas effect grids", () => {
  it("car, coin and blueLight are each 16x16 and deterministic", () => {
    assertGrid16x16(carGrid());
    assertGrid16x16(coinGrid());
    assertGrid16x16(blueLightGrid());
    expect(carGrid()).toEqual(carGrid());
    expect(coinGrid()).toEqual(coinGrid());
    expect(blueLightGrid()).toEqual(blueLightGrid());
  });
});

describe("atlas texture cache (browser-only half)", () => {
  // No jsdom in this workspace's vitest config (environment: "node"), so `atlas.tile` et al. cannot build a
  // real canvas/Texture here. This just pins down the guard's failure mode instead of silently skipping it.
  it("throws a clear error outside a browser rather than crashing on a missing `document`", () => {
    expect(() => atlas.tile("street")).toThrow(/browser/);
  });
});
