// packages/ui's vitest environment is plain Node (see /Users/s.wasiewicz/claude/mafia-game/vitest.config.ts:
// `environment: "node"`, no jsdom, no canvas polyfill in the workspace's devDependencies). So this suite tests
// the pure part tables (every layer generator, for every index in its range, produces runs without throwing)
// and the cache key, per design 11 wave A2's test list — not `drawPortrait`/`getPortraitCanvas` themselves,
// which need a real `document`/canvas and are exercised by hand in the browser (`pnpm dev`) instead.
import { describe, expect, it } from "vitest";
import type { PortraitParts } from "@borgata/sim";
import {
  clearPortraitCache,
  drawPortrait,
  EYE_SHAPE_COUNT,
  getPortraitCanvas,
  getPortraitDataUrl,
  HAIR_STYLE_COUNT,
  HEAD_SHAPE_COUNT,
  portraitCacheKey,
  portraitLayers,
} from "./portrait.js";

const HAIR_AGES = [0, 1, 2] as const;

function baseParts(overrides: Partial<PortraitParts> = {}): PortraitParts {
  return {
    skin: 0,
    head: 0,
    hair: 0,
    hairAge: 0,
    brows: 0,
    eyes: 0,
    nose: 0,
    mouth: 0,
    facialHair: 0,
    ageMarks: 0,
    clothing: 0,
    accessory: 0,
    ...overrides,
  };
}

describe("portraitLayers (pure part tables)", () => {
  it("draws (returns twelve non-throwing layers) for the base parts", () => {
    const layers = portraitLayers(baseParts());
    expect(layers).toHaveLength(12); // design 07 §5's twelve-layer order
    for (const layer of layers) {
      expect(Array.isArray(layer)).toBe(true);
      for (const run of layer) {
        expect(run.w).toBeGreaterThan(0);
        expect(typeof run.color).toBe("string");
      }
    }
  });

  it("draws without throwing for every skin index (0..5)", () => {
    for (let skin = 0; skin < 6; skin++) expect(() => portraitLayers(baseParts({ skin }))).not.toThrow();
  });

  it("draws without throwing for every head shape (0..5)", () => {
    expect(HEAD_SHAPE_COUNT).toBe(6);
    for (let head = 0; head < HEAD_SHAPE_COUNT; head++) expect(() => portraitLayers(baseParts({ head }))).not.toThrow();
  });

  it("draws without throwing for every hair style (0..13) and every age variant (full, thinning, grey)", () => {
    expect(HAIR_STYLE_COUNT).toBe(14);
    for (let hair = 0; hair < HAIR_STYLE_COUNT; hair++) {
      for (const hairAge of HAIR_AGES) {
        expect(() => portraitLayers(baseParts({ hair, hairAge }))).not.toThrow();
      }
    }
  });

  it("draws without throwing for every brow shape (0..4)", () => {
    for (let brows = 0; brows < 5; brows++) expect(() => portraitLayers(baseParts({ brows }))).not.toThrow();
  });

  it("draws without throwing for every eye shape (0..7)", () => {
    expect(EYE_SHAPE_COUNT).toBe(8);
    for (let eyes = 0; eyes < EYE_SHAPE_COUNT; eyes++) expect(() => portraitLayers(baseParts({ eyes }))).not.toThrow();
  });

  it("draws without throwing for every nose shape (0..5)", () => {
    for (let nose = 0; nose < 6; nose++) expect(() => portraitLayers(baseParts({ nose }))).not.toThrow();
  });

  it("draws without throwing for every mouth shape (0..6)", () => {
    for (let mouth = 0; mouth < 7; mouth++) expect(() => portraitLayers(baseParts({ mouth }))).not.toThrow();
  });

  it("draws without throwing for every facial hair set, including none (0..8)", () => {
    for (let facialHair = 0; facialHair < 9; facialHair++) expect(() => portraitLayers(baseParts({ facialHair }))).not.toThrow();
  });

  it("draws without throwing for every age-mark overlay, including none (0..3)", () => {
    for (let ageMarks = 0; ageMarks < 4; ageMarks++) {
      expect(() => portraitLayers(baseParts({ ageMarks: ageMarks as 0 | 1 | 2 | 3 }))).not.toThrow();
    }
  });

  it("draws without throwing for every clothing set (0..11)", () => {
    for (let clothing = 0; clothing < 12; clothing++) expect(() => portraitLayers(baseParts({ clothing }))).not.toThrow();
  });

  it("draws without throwing for every accessory, including none (0..7)", () => {
    for (let accessory = 0; accessory < 8; accessory++) expect(() => portraitLayers(baseParts({ accessory }))).not.toThrow();
  });

  it("draws without throwing across the full combinatorial sweep (every field at once, a coarse pass)", () => {
    for (let i = 0; i < 200; i++) {
      const parts = baseParts({
        skin: i % 6,
        head: i % 6,
        hair: i % 14,
        hairAge: (i % 3) as 0 | 1 | 2,
        brows: i % 5,
        eyes: i % 8,
        nose: i % 6,
        mouth: i % 7,
        facialHair: i % 9,
        ageMarks: (i % 4) as 0 | 1 | 2 | 3,
        clothing: i % 12,
        accessory: i % 8,
      });
      expect(() => portraitLayers(parts)).not.toThrow();
    }
  });
});

describe("portraitCacheKey", () => {
  it("is stable for the same parts and size", () => {
    const parts = baseParts({ skin: 3, hair: 7, clothing: 5 });
    expect(portraitCacheKey(parts, 32)).toBe(portraitCacheKey({ ...parts }, 32));
  });

  it("differs when any field differs", () => {
    const a = baseParts();
    const key = portraitCacheKey(a, 32);
    const fields: Array<keyof PortraitParts> = [
      "skin", "head", "hair", "hairAge", "brows", "eyes", "nose", "mouth", "facialHair", "ageMarks", "clothing", "accessory",
    ];
    for (const field of fields) {
      const changed = { ...a, [field]: (a[field] as number) + 1 };
      expect(portraitCacheKey(changed, 32)).not.toBe(key);
    }
  });

  it("differs by size alone", () => {
    const parts = baseParts();
    expect(portraitCacheKey(parts, 32)).not.toBe(portraitCacheKey(parts, 64));
  });
});

describe("drawPortrait in a canvas-less environment (this workspace's Node vitest env)", () => {
  it("throws a clear, guarded error rather than a raw ReferenceError", () => {
    expect(() => drawPortrait(baseParts(), 32)).toThrow(/canvas/i);
  });

  it("getPortraitCanvas / getPortraitDataUrl propagate the same guard (no crash on import, only on draw)", () => {
    clearPortraitCache();
    expect(() => getPortraitCanvas(baseParts(), 32)).toThrow(/canvas/i);
    expect(() => getPortraitDataUrl(baseParts(), 32)).toThrow(/canvas/i);
  });
});

// The cache-identity and 200-compositions-under-200ms checks from design 11 wave A2's test list need a real
// canvas (`getPortraitCanvas` returning the *same* HTMLCanvasElement instance, and `drawPortrait` timed).
// This workspace's vitest environment is Node with no jsdom/canvas (see the file banner), so `document` is
// undefined and both checks are skipped here rather than faked; they're covered by hand in the browser.
describe.skipIf(typeof document === "undefined")("drawPortrait performance and canvas cache (browser only)", () => {
  it("returns the same canvas for the same parts and size", () => {
    clearPortraitCache();
    const parts = baseParts({ hair: 4 });
    expect(getPortraitCanvas(parts, 32)).toBe(getPortraitCanvas({ ...parts }, 32));
  });

  it("composes 200 portraits in under 200ms", () => {
    clearPortraitCache();
    const start = Date.now();
    for (let i = 0; i < 200; i++) {
      drawPortrait(baseParts({ skin: i % 6, hair: i % 14, clothing: i % 12, accessory: i % 8 }), 32);
    }
    expect(Date.now() - start).toBeLessThan(200);
  });
});
