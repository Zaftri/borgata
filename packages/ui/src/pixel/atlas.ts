// The pixel atlas (design 07 §5, design 11 wave A1): procedural pixel art, 16 by 16, generated in code on an
// offscreen canvas. This is the single place hand-drawn art replaces later — every consumer (TurnView.tsx) goes
// through the `atlas` object below, never through the grid generators directly.
//
// Split in two halves on purpose (the module doc in design 11's task list: "keep Pixi out of the pure
// modules"): the top half draws `PixelGrid`s (plain 16x16 arrays of palette colours) with no DOM and no PixiJS,
// so it runs anywhere, including a vitest "node" environment; the bottom half turns a grid into a cached
// PixiJS `Texture` via an offscreen `<canvas>`, which only works in a browser. `atlas.test.ts` exercises the
// grid generators directly and never touches the texture half.

import { Texture } from "pixi.js";
import type { ActorRole, BuildingState, BusinessType, PortraitParts, TileKind } from "@borgata/sim";
import {
  BLACK,
  BLUE_1,
  BLUE_2,
  BLUE_3,
  BLUE_4,
  BLUE_5,
  BROWN_4,
  BROWN_5,
  BROWN_6,
  BROWN_7,
  BROWN_8,
  GREEN_2,
  GREEN_3,
  GREEN_5,
  GREEN_6,
  OCHRE_1,
  OCHRE_2,
  OCHRE_3,
  OCHRE_5,
  OCHRE_6,
  OCHRE_7,
  PALETTE_BY_CATEGORY,
  STONE_1,
  STONE_2,
  STONE_3,
  STONE_4,
  STONE_5,
  STONE_6,
  TERRACOTTA_2,
  TERRACOTTA_3,
  TERRACOTTA_4,
  TERRACOTTA_5,
  TERRACOTTA_6,
} from "./palette.js";

/** A 16 by 16 sprite as palette colours; `null` is transparent. Row-major, `grid[y][x]`. */
export type PixelGrid = readonly (readonly (string | null)[])[];

export const SIZE = 16;

// The canonical enumerations the atlas draws, and that atlas.test.ts iterates over. Kept here (not
// re-derived from scene.ts's union types, which TypeScript can't turn into a runtime array) so the test and
// the switch statements below can't drift apart from each other, even if they can still drift from scene.ts
// itself — a scene.ts addition without a matching case falls through to a clearly-marked placeholder tile.
export const TILE_KINDS: readonly TileKind[] = ["street", "piazza", "wall", "water", "quay", "field", "church", "police", "harbor"];
export const BUILDING_TYPES: readonly BusinessType[] = ["stall", "shop", "bar", "workshop", "restaurant", "site", "supermarket"];
export const BUILDING_STATES: readonly BuildingState[] = ["open", "refusing", "yours", "sponsor", "closed"];
export const ACTOR_ROLES: readonly ActorRole[] = ["you", "kid", "associate", "soldier", "chief", "civilian"];

// ---------------------------------------------------------------------------------------------------------------
// Grid drawing helpers (pure).
// ---------------------------------------------------------------------------------------------------------------

type Row = (string | null)[];

function blank(fill: string | null = null): Row[] {
  return Array.from({ length: SIZE }, () => new Array<string | null>(SIZE).fill(fill));
}

function px(g: Row[], x: number, y: number, color: string | null): void {
  if (y < 0 || y >= SIZE || x < 0 || x >= SIZE) return;
  g[y]![x] = color;
}

function rect(g: Row[], x0: number, y0: number, x1: number, y1: number, color: string | null): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(g, x, y, color);
}

function hatch(g: Row[], x0: number, y0: number, x1: number, y1: number, color: string, step = 3): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x + y) % step === 0) px(g, x, y, color);
}

function freeze(g: Row[]): PixelGrid {
  return Object.freeze(g.map((row) => Object.freeze(row.slice()))) as PixelGrid;
}

// ---------------------------------------------------------------------------------------------------------------
// Tiles (design 05's archetypes give the edge tile; layoutTown in scene.ts gives the rest).
// ---------------------------------------------------------------------------------------------------------------

function tileStreet(): PixelGrid {
  const g = blank(STONE_4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (x % 4 === 0 || y % 4 === 0) px(g, x, y, STONE_6);
  return freeze(g);
}

function tilePiazza(): PixelGrid {
  const g = blank(STONE_1);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (x % 8 === 0 || y % 8 === 0) px(g, x, y, STONE_3);
  return freeze(g);
}

function tileWall(): PixelGrid {
  // Bare ground under a building footprint (scene.ts: "Buildings are drawn over 'wall' tiles"); a plain
  // plastered backdrop the building sprite fully covers, so its exact look rarely shows.
  const g = blank(OCHRE_2);
  for (let y = 0; y < SIZE; y++) if (y % 8 === 0) rect(g, 0, y, SIZE - 1, y, OCHRE_1);
  return freeze(g);
}

function tileWater(): PixelGrid {
  const g = blank(BLUE_5);
  for (let y = 0; y < SIZE; y++) {
    const offset = (y * 3) % 8;
    for (let x = 0; x < SIZE; x++) if ((x + offset) % 8 < 3) px(g, x, y, BLUE_3);
  }
  return freeze(g);
}

function tileQuay(): PixelGrid {
  const g = blank(BROWN_4);
  for (let y = 0; y < SIZE; y++) if (y % 4 === 0) rect(g, 0, y, SIZE - 1, y, BROWN_6);
  for (let x = 0; x < SIZE; x += 5) rect(g, x, 0, x, SIZE - 1, BROWN_5);
  return freeze(g);
}

function tileField(): PixelGrid {
  const g = blank(GREEN_3);
  for (let y = 0; y < SIZE; y++) if (y % 3 === 0) rect(g, 0, y, SIZE - 1, y, GREEN_5);
  return freeze(g);
}

function tileChurch(): PixelGrid {
  const g = blank(STONE_1);
  hatch(g, 0, 0, SIZE - 1, SIZE - 1, STONE_2, 5);
  rect(g, 7, 2, 8, 13, BROWN_6);
  rect(g, 4, 5, 11, 6, BROWN_6);
  return freeze(g);
}

function tilePolice(): PixelGrid {
  const g = blank(STONE_2);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (x % 4 === 0 || y % 4 === 0) px(g, x, y, STONE_4);
  // The blue lamp over a police post's door: a fixed, non-Attention-band blue (Attention's ramp is reserved
  // for the band itself, design 07 §5), just a period detail.
  rect(g, 6, 1, 9, 2, BLUE_2);
  rect(g, 6, 12, 9, 15, BROWN_6);
  return freeze(g);
}

function tileHarbor(): PixelGrid {
  const g = blank(BLUE_4);
  rect(g, 0, 10, SIZE - 1, SIZE - 1, BROWN_4);
  for (let y = 11; y < SIZE; y += 2) rect(g, 0, y, SIZE - 1, y, BROWN_6);
  rect(g, 3, 2, 4, 10, BROWN_6); // crane mast
  rect(g, 4, 2, 12, 3, BROWN_6); // crane arm
  rect(g, 11, 3, 12, 6, BROWN_7); // hook line
  return freeze(g);
}

const TILE_DRAWERS: Record<TileKind, () => PixelGrid> = {
  street: tileStreet,
  piazza: tilePiazza,
  wall: tileWall,
  water: tileWater,
  quay: tileQuay,
  field: tileField,
  church: tileChurch,
  police: tilePolice,
  harbor: tileHarbor,
};

export function tileGrid(kind: TileKind): PixelGrid {
  return TILE_DRAWERS[kind]();
}

// ---------------------------------------------------------------------------------------------------------------
// Buildings: one base sprite per BusinessType, then a state overlay (design 07 §5's "state overlays").
// ---------------------------------------------------------------------------------------------------------------

function buildingBase(wall: string, roof: string): Row[] {
  const g = blank(wall);
  rect(g, 0, 0, SIZE - 1, 1, roof);
  return g;
}

function base(type: BusinessType): Row[] {
  switch (type) {
    case "stall": {
      const g = buildingBase(OCHRE_3, BROWN_5);
      for (let x = 0; x < SIZE; x++) rect(g, x, 3, x, 4, x % 2 === 0 ? TERRACOTTA_3 : STONE_1); // awning
      rect(g, 2, 11, 13, 12, BROWN_5); // open counter
      rect(g, 4, 9, 4, 10, TERRACOTTA_2);
      rect(g, 8, 9, 8, 10, GREEN_2);
      rect(g, 11, 9, 11, 10, OCHRE_1);
      return g;
    }
    case "shop": {
      const g = buildingBase(OCHRE_2, BROWN_6);
      rect(g, 2, 2, 13, 3, TERRACOTTA_4); // sign
      rect(g, 3, 6, 6, 9, BLUE_3); // window
      rect(g, 9, 10, 12, 15, BROWN_6); // door
      return g;
    }
    case "bar": {
      const g = buildingBase(TERRACOTTA_2, BROWN_6);
      rect(g, 2, 2, 13, 3, BROWN_5); // sign
      rect(g, 2, 6, 5, 9, BLUE_2); // window with a jukebox glow behind the glass
      rect(g, 3, 7, 4, 8, OCHRE_1);
      rect(g, 10, 10, 13, 15, BROWN_7); // door
      return g;
    }
    case "workshop": {
      const g = buildingBase(STONE_4, BROWN_7);
      rect(g, 3, 9, 12, 15, BROWN_5); // roller door
      for (let y = 9; y <= 15; y += 2) rect(g, 3, y, 12, y, BROWN_7);
      rect(g, 11, 2, 13, 4, BLUE_3); // small high window
      return g;
    }
    case "restaurant": {
      const g = buildingBase(OCHRE_1, BROWN_5);
      for (let x = 0; x < SIZE; x++) rect(g, x, 3, x, 4, x % 2 === 0 ? GREEN_3 : STONE_1); // awning
      rect(g, 2, 7, 5, 10, BLUE_2);
      rect(g, 10, 7, 13, 10, BLUE_2);
      rect(g, 7, 10, 9, 15, BROWN_6); // door
      return g;
    }
    case "site": {
      // Under construction, so mostly open air and scaffolding rather than a solid wall (design 07 §5).
      const g = blank(STONE_1);
      for (let i = 0; i < 4; i++) {
        const x = 2 + i * 4;
        rect(g, x, 2, x, 15, BROWN_5); // uprights
      }
      for (let y = 4; y < SIZE; y += 4) rect(g, 2, y, 13, y, BROWN_6); // ledgers
      rect(g, 5, 11, 9, 14, TERRACOTTA_3); // stacked block
      for (let x = 0; x < SIZE; x += 4) rect(g, x, 0, x + 1, 0, OCHRE_5); // hazard marking, top edge
      return g;
    }
    case "supermarket": {
      const g = buildingBase(STONE_2, BROWN_6);
      rect(g, 1, 2, 14, 4, TERRACOTTA_5); // wide sign
      rect(g, 1, 7, 4, 10, BLUE_3);
      rect(g, 11, 7, 14, 10, BLUE_3);
      rect(g, 5, 9, 10, 15, BLUE_4); // glass doors
      return g;
    }
  }
}

function applyState(g: Row[], state: BuildingState): Row[] {
  switch (state) {
    case "open":
      return g;
    case "refusing":
      // A glued shutter, part-way down: the lower two-thirds hatched shut.
      hatch(g, 1, 6, 14, 15, BROWN_7, 3);
      return g;
    case "closed":
      // Fully shut and dim: the whole face hatched dark.
      hatch(g, 0, 2, 15, 15, BLACK, 2);
      return g;
    case "yours": {
      // A small sign in a distinct colour (design 11 A1): a green flag, top-left corner.
      rect(g, 1, 0, 2, 1, GREEN_6);
      return g;
    }
    case "sponsor": {
      // A subtler sign than "yours": a single muted-ochre pixel, not a block.
      px(g, 1, 0, OCHRE_7);
      return g;
    }
  }
}

export function buildingGrid(type: BusinessType, _size: number, state: BuildingState): PixelGrid {
  // `size` (1..5, scene.ts WIDTH_BY_SIZE) decides how many tiles wide the building's footprint is; the atlas
  // draws one 16x16 face and the renderer repeats it across that width (design 11 A1: no hand-drawn art yet).
  return freeze(applyState(base(type), state));
}

// ---------------------------------------------------------------------------------------------------------------
// Figures: small 16x16 street actors. Role decides the silhouette; the character's own PortraitParts decide
// colour (skin, clothing), design 11 A1's instruction — full portrait detail (32x32, all twelve layers) is
// portrait.ts's job for panels, not the street.
// ---------------------------------------------------------------------------------------------------------------

const CLOTHING_COLORS: readonly string[] = [
  BROWN_4, BLUE_5, GREEN_5, OCHRE_6, TERRACOTTA_5, STONE_5,
  BROWN_6, BLUE_4, GREEN_6, OCHRE_7, TERRACOTTA_6, STONE_6,
];

function clothingColor(index: number): string {
  return CLOTHING_COLORS[((index % CLOTHING_COLORS.length) + CLOTHING_COLORS.length) % CLOTHING_COLORS.length]!;
}

function skinColor(index: number): string {
  const skins = PALETTE_BY_CATEGORY.skin;
  return skins[((index % skins.length) + skins.length) % skins.length]!;
}

type PersonOptions = { headY: number; skin: string; clothing: string; hat?: string; belt?: string; mark?: string };

function personGrid(opts: PersonOptions): Row[] {
  const g = blank(null);
  const { headY, skin, clothing } = opts;
  if (opts.hat) rect(g, 5, headY - 2, 10, headY - 1, opts.hat);
  rect(g, 6, headY, 9, headY + 2, skin); // head
  rect(g, 5, headY + 3, 10, headY + 8, clothing); // body/arms
  rect(g, 6, headY + 9, 9, Math.min(SIZE - 1, headY + 10), BROWN_7); // legs
  if (opts.belt) rect(g, 5, headY + 8, 10, headY + 8, opts.belt);
  if (opts.mark) px(g, 10, headY + 4, opts.mark);
  return g;
}

function figureBase(role: ActorRole, parts: PortraitParts): Row[] {
  const skin = skinColor(parts.skin);
  const clothing = clothingColor(parts.clothing);
  switch (role) {
    case "kid":
      return personGrid({ headY: 7, skin, clothing });
    case "chief":
      return personGrid({ headY: 2, skin, clothing, hat: BROWN_7 });
    case "soldier":
      return personGrid({ headY: 2, skin, clothing, belt: BROWN_8 });
    case "you":
      return personGrid({ headY: 2, skin, clothing, mark: OCHRE_1 });
    case "associate":
    case "civilian":
      return personGrid({ headY: 2, skin, clothing });
  }
}

export function figureGrid(role: ActorRole, parts: PortraitParts): PixelGrid {
  return freeze(figureBase(role, parts));
}

// ---------------------------------------------------------------------------------------------------------------
// Effect sprites: a 1970s/80s boxy saloon, a coin, and the raid's blue-light sweep.
// ---------------------------------------------------------------------------------------------------------------

export function carGrid(): PixelGrid {
  const g = blank(null);
  rect(g, 2, 9, 13, 12, STONE_4); // body
  rect(g, 4, 6, 11, 9, TERRACOTTA_4); // cabin
  rect(g, 5, 7, 10, 8, BLUE_2); // windows
  rect(g, 1, 10, 1, 11, BROWN_7); // bumper
  rect(g, 14, 10, 14, 11, BROWN_7);
  rect(g, 3, 12, 5, 13, BLACK); // wheels
  rect(g, 10, 12, 12, 13, BLACK);
  return freeze(g);
}

export function coinGrid(): PixelGrid {
  const g = blank(null);
  rect(g, 6, 6, 9, 9, OCHRE_6);
  rect(g, 5, 5, 10, 10, OCHRE_3);
  rect(g, 6, 6, 9, 9, OCHRE_1);
  px(g, 7, 7, OCHRE_5);
  px(g, 8, 8, OCHRE_5);
  return freeze(g);
}

export function blueLightGrid(): PixelGrid {
  const g = blank(null);
  rect(g, 0, 0, SIZE - 1, SIZE - 1, BLUE_5);
  rect(g, 2, 2, 13, 13, BLUE_3);
  rect(g, 5, 5, 10, 10, BLUE_1);
  return freeze(g);
}

// ---------------------------------------------------------------------------------------------------------------
// Texture cache (browser only): the `atlas` object every other pixel/ module and TurnView.tsx uses.
// ---------------------------------------------------------------------------------------------------------------

function hexToRgb(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function gridToCanvas(grid: PixelGrid): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("atlas: 2D canvas context unavailable");
  const image = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = grid[y]!;
    for (let x = 0; x < SIZE; x++) {
      const color = row[x] ?? null;
      const i = (y * SIZE + x) * 4;
      if (color === null) {
        image.data[i + 3] = 0;
        continue;
      }
      const [r, gg, b] = hexToRgb(color);
      image.data[i] = r;
      image.data[i + 1] = gg;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const textureCache = new Map<string, Texture>();

function textureFor(key: string, grid: PixelGrid): Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  if (typeof document === "undefined") {
    throw new Error(`atlas: no browser canvas available to build texture "${key}" (this runs client-side only)`);
  }
  const texture = Texture.from(gridToCanvas(grid));
  texture.source.scaleMode = "nearest";
  textureCache.set(key, texture);
  return texture;
}

/** The atlas's public surface (design 11 A1): tiles, buildings, figures and a handful of effect sprites, all
 *  16x16, all cached by key so the same tile/building/figure/effect returns the same `Texture` instance. */
export const atlas = {
  tile(kind: TileKind): Texture {
    return textureFor(`tile:${kind}`, tileGrid(kind));
  },
  building(type: BusinessType, size: number, state: BuildingState): Texture {
    return textureFor(`building:${type}:${size}:${state}`, buildingGrid(type, size, state));
  },
  figure(role: ActorRole, parts: PortraitParts): Texture {
    return textureFor(`figure:${role}:${parts.skin}:${parts.clothing}`, figureGrid(role, parts));
  },
  car(): Texture {
    return textureFor("car", carGrid());
  },
  coin(): Texture {
    return textureFor("coin", coinGrid());
  },
  blueLight(): Texture {
    return textureFor("blueLight", blueLightGrid());
  },
};
