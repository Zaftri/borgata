// Portraits (design 07 §5, design 11 wave A2, packages/sim/src/scene.ts's `PortraitParts`/`portraitParts`):
// draws a character's face onto a canvas from its part indices. Twelve layers, in the fixed order design 07 §5
// lists: skin fill, head shape, hair, the hair's age variant, brows, eyes, nose, mouth, facial hair, age marks,
// clothing, accessory. Every layer comes from a small data table of pixel "runs" (one horizontal strip: a row,
// a starting column, a width, a colour) rather than a hand-drawn bitmap, so an artist can replace a table entry,
// or later the whole generator function, without touching the composition order, the cache, or the callers.
//
// Pure at import time: nothing here touches the DOM until `drawPortrait` is called, so importing this module in
// packages/ui's vitest environment (plain Node — no jsdom, no canvas polyfill; see vitest.config.ts) does not
// throw. `drawPortrait` itself needs a real canvas; it throws a clear error when `document.createElement` is not
// available instead of silently producing nothing.
//
// Colours come from packages/ui/src/pixel/palette.ts (wave A1's 48-colour master palette, design 07 §5); no
// hex values are invented here. `HOT_RED` is reserved for events that matter (palette.ts's own comment) and is
// never used decoratively in a portrait.

import { portraitParts, type Character, type PortraitParts, type World } from "@borgata/sim";
import {
  BLACK,
  BLUE_4,
  BLUE_5,
  BROWN_1,
  BROWN_2,
  BROWN_3,
  BROWN_4,
  BROWN_5,
  BROWN_6,
  BROWN_7,
  BROWN_8,
  GREEN_3,
  GREEN_4,
  OCHRE_4,
  OCHRE_5,
  PALETTE_BY_CATEGORY,
  STONE_1,
  STONE_3,
  STONE_5,
  STONE_6,
  TERRACOTTA_3,
  TERRACOTTA_4,
  TERRACOTTA_5,
  TERRACOTTA_6,
} from "./palette.js";

/** The logical drawing grid every part is authored against; `drawPortrait` scales up to the requested size. */
export const PORTRAIT_GRID = 32;

/** One pixel-art "run": a horizontal strip `w` pixels wide starting at `(x, y)` on the 32 by 32 grid. */
export type Run = { x: number; y: number; w: number; color: string };

// ---------------------------------------------------------------------------------------------------------------
// Palette groupings for portrait parts (see the palette note above; every colour is from palette.ts).
// ---------------------------------------------------------------------------------------------------------------

const SKIN_TONES = PALETTE_BY_CATEGORY.skin; // the palette's six portrait skin tones, shared with the atlas
const LIP_SHADES = [TERRACOTTA_3, TERRACOTTA_4, TERRACOTTA_5, TERRACOTTA_6, BROWN_5, BROWN_6] as const;
const HAIR_COLORS = [BLACK, BROWN_7, BROWN_6, BROWN_5, BROWN_4, BROWN_3, BROWN_2, BROWN_1] as const;
const GREY_HAIR = STONE_3;
const EYE_COLORS = [BROWN_5, BROWN_6, BLACK, BLUE_4, GREEN_4, OCHRE_5, BROWN_4, BLUE_5] as const;
const OUTLINE = BLACK;
const WHITE = STONE_1;
const SCAR = TERRACOTTA_5;
const GOLD = OCHRE_5;
const GLASS_FRAME = BLACK;
const EMBER = OCHRE_4;
const PIPE_WOOD = BROWN_5;

/** Clothing set colours: base (torso/shoulders), detail (collar, tie, sash, badge). */
type ClothingSet = { base: string; detail: string; style: "plain" | "collar" | "tie" | "sash" | "robe" | "badge" | "dress" };

/** Twelve clothing sets (design 07 §5): worker, suit, priest, magistrate, police, uniform, dress, plus the
 *  game's own rank ladder (associate through head) and the kid, matching `CLOTHING_BY_RANK` in scene.ts and
 *  `PortraitParts.clothing`'s `0..11` range. */
const CLOTHING_SETS: readonly ClothingSet[] = [
  { base: GREEN_3, detail: BROWN_5, style: "plain" }, // 0 civilian: worker
  { base: BROWN_7, detail: BLACK, style: "tie" }, // 1 associate: a young man's suit
  { base: STONE_6, detail: BLACK, style: "tie" }, // 2 soldier: a plainer suit
  { base: BROWN_7, detail: GOLD, style: "tie" }, // 3 chief: a better suit, a gold pin
  { base: BROWN_8, detail: GOLD, style: "tie" }, // 4 underboss: a darker, richer suit
  { base: STONE_5, detail: STONE_1, style: "collar" }, // 5 counselor: a lawyer's grey
  { base: BROWN_8, detail: GOLD, style: "tie" }, // 6 head: the best suit in the room
  { base: OCHRE_4, detail: BROWN_5, style: "plain" }, // 7 the kid: short trousers, a plain shirt
  { base: BLACK, detail: STONE_1, style: "collar" }, // 8 priest: a black cassock, a white collar
  { base: STONE_6, detail: STONE_1, style: "sash" }, // 9 magistrate: a dark robe, a sash
  { base: BLUE_5, detail: STONE_1, style: "badge" }, // 10 police: a blue uniform, a badge
  { base: TERRACOTTA_5, detail: GOLD, style: "dress" }, // 11 a woman's dress
];

// ---------------------------------------------------------------------------------------------------------------
// Small drawing helpers: a table entry is data (widths, colours, offsets); these turn it into runs.
// ---------------------------------------------------------------------------------------------------------------

/** One run per row, centered on `center`, from a profile of per-row widths starting at `startY`. */
function profileRuns(startY: number, widths: readonly number[], color: string, center = 16): Run[] {
  const out: Run[] = [];
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i]!;
    if (w <= 0) continue;
    out.push({ x: Math.round(center - w / 2), y: startY + i, w, color });
  }
  return out;
}

function rect(x: number, y: number, w: number, h: number, color: string): Run[] {
  const out: Run[] = [];
  for (let i = 0; i < h; i++) out.push({ x, y: y + i, w, color });
  return out;
}

function mirror(runs: readonly Run[], center = 16): Run[] {
  return runs.map((r) => ({ ...r, x: Math.round(2 * center - r.x - r.w) }));
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Skin (base fill) and 2. head shape (six jaw/skull profiles, design 07 §5's "skin and head shape (6)").
// ---------------------------------------------------------------------------------------------------------------

/** Widths per row, y = 7..22 (16 rows): the silhouette from crown to jaw. */
const HEAD_PROFILES: readonly (readonly number[])[] = [
  [8, 12, 15, 16, 17, 17, 17, 17, 17, 16, 16, 15, 14, 12, 10, 7], // 0 round
  [12, 14, 15, 16, 16, 16, 16, 16, 16, 16, 16, 16, 15, 14, 12, 9], // 1 square
  [6, 10, 13, 14, 15, 15, 15, 15, 15, 15, 14, 13, 11, 9, 7, 5], // 2 oval
  [9, 11, 13, 14, 14, 14, 14, 14, 14, 14, 14, 13, 12, 11, 9, 6], // 3 long
  [13, 15, 16, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4], // 4 heart
  [11, 15, 17, 18, 18, 18, 18, 18, 18, 18, 17, 16, 14, 12, 10, 7], // 5 wide
];
export const HEAD_SHAPE_COUNT = HEAD_PROFILES.length;

function headRuns(parts: PortraitParts): Run[] {
  const skin = SKIN_TONES[parts.skin % SKIN_TONES.length]!;
  const profile = HEAD_PROFILES[parts.head % HEAD_PROFILES.length]!;
  const face = profileRuns(7, profile, skin);
  // Ears: two small blocks partway down the profile, skin-coloured, always present regardless of head shape.
  const ears = [rect(6, 13, 2, 3, skin), rect(24, 13, 2, 3, skin)].flat();
  // Neck: a short skin column below the jaw, so clothing (layer 11) has something to sit against.
  const neck = rect(13, 22, 6, 2, skin);
  return [...face, ...ears, ...neck];
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Hair (fourteen styles) and 4. its age variant (full, thinning, grey) — design 07 §5's "hair (14, each with
//    three age variants: full, thinning, grey)".
// ---------------------------------------------------------------------------------------------------------------

type HairStyle = { top: readonly number[]; sides: number; colorIdx: number };

/** `top`: widths for the cap, rows y = 2..9 (8 rows). `sides`: rows of narrow side-locks below the cap, or 0. */
const HAIR_STYLES: readonly HairStyle[] = [
  { top: [0, 2, 4, 4, 4, 4, 4, 4], sides: 0, colorIdx: 0 }, // 0 shaved, a faint rim
  { top: [4, 10, 14, 16, 16, 16, 16, 14], sides: 0, colorIdx: 1 }, // 1 short crop
  { top: [2, 8, 13, 16, 17, 17, 17, 16], sides: 4, colorIdx: 2 }, // 2 short, combed sides
  { top: [0, 6, 12, 16, 18, 18, 18, 17], sides: 8, colorIdx: 0 }, // 3 medium length
  { top: [0, 4, 10, 15, 18, 19, 19, 18], sides: 12, colorIdx: 3 }, // 4 long
  { top: [6, 12, 16, 18, 18, 18, 17, 15], sides: 6, colorIdx: 4 }, // 5 wavy top
  { top: [0, 3, 9, 14, 17, 18, 18, 17], sides: 2, colorIdx: 5 }, // 6 receding
  { top: [8, 14, 17, 18, 18, 18, 17, 15], sides: 0, colorIdx: 6 }, // 7 slicked back
  { top: [10, 15, 17, 18, 18, 17, 15, 12], sides: 4, colorIdx: 7 }, // 8 side part
  { top: [0, 0, 6, 12, 16, 17, 17, 16], sides: 14, colorIdx: 2 }, // 9 long, center part
  { top: [4, 9, 13, 16, 17, 17, 16, 14], sides: 3, colorIdx: 1 }, // 10 short and curly
  { top: [0, 2, 6, 11, 15, 16, 16, 15], sides: 6, colorIdx: 4 }, // 11 balding, sides kept
  { top: [9, 13, 16, 17, 17, 17, 16, 14], sides: 16, colorIdx: 3 }, // 12 shoulder length
  { top: [0, 0, 0, 3, 6, 7, 7, 6], sides: 0, colorIdx: 6 }, // 13 bald / shaved close
];
export const HAIR_STYLE_COUNT = HAIR_STYLES.length;

/** Layer 3: the style's base shape, in its natural colour. */
function hairRuns(parts: PortraitParts): Run[] {
  const style = HAIR_STYLES[parts.hair % HAIR_STYLES.length]!;
  const color = HAIR_COLORS[style.colorIdx % HAIR_COLORS.length]!;
  const cap = profileRuns(2, style.top, color);
  const sides: Run[] = [];
  if (style.sides > 0) {
    sides.push(...rect(6, 9, 2, Math.min(16, style.sides), color));
    sides.push(...rect(24, 9, 2, Math.min(16, style.sides), color));
  }
  return [...cap, ...sides];
}

/** Layer 4: the age variant overlay (design 07 §5 / scene.ts's `hairAge`: 0 full, 1 thinning, 2 grey).
 *  "Full" adds nothing over layer 3. "Thinning" redraws alternate top rows in the skin tone, so the scalp
 *  shows through. "Grey" redraws the whole style in the grey shade, on top of its natural colour. */
function hairAgeRuns(parts: PortraitParts): Run[] {
  const style = HAIR_STYLES[parts.hair % HAIR_STYLES.length]!;
  if (parts.hairAge === 0) return [];
  if (parts.hairAge === 2) {
    const cap = profileRuns(2, style.top, GREY_HAIR);
    const sides: Run[] = [];
    if (style.sides > 0) {
      sides.push(...rect(6, 9, 2, Math.min(16, style.sides), GREY_HAIR));
      sides.push(...rect(24, 9, 2, Math.min(16, style.sides), GREY_HAIR));
    }
    return [...cap, ...sides];
  }
  // Thinning: patch every other top row back to skin, from the third row down (a receding, thinning crown).
  const skin = SKIN_TONES[parts.skin % SKIN_TONES.length]!;
  const patched = style.top.map((w, i) => (i >= 2 && i % 2 === 0 ? w : 0));
  return profileRuns(2, patched, skin);
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Brows (5 shapes).
// ---------------------------------------------------------------------------------------------------------------

function browRuns(parts: PortraitParts): Run[] {
  const color = HAIR_COLORS[HAIR_STYLES[parts.hair % HAIR_STYLES.length]!.colorIdx % HAIR_COLORS.length]!;
  const left = 9;
  let one: Run[];
  switch (parts.brows % 5) {
    case 0: // straight
      one = [{ x: left, y: 11, w: 4, color }];
      break;
    case 1: // arched
      one = [
        { x: left, y: 12, w: 2, color },
        { x: left + 2, y: 11, w: 3, color },
      ];
      break;
    case 2: // thick
      one = [
        { x: left - 1, y: 11, w: 5, color },
        { x: left - 1, y: 12, w: 5, color },
      ];
      break;
    case 3: // thin
      one = [{ x: left + 1, y: 11, w: 3, color }];
      break;
    default: // upturned (outer end raised)
      one = [
        { x: left, y: 12, w: 2, color },
        { x: left + 2, y: 11, w: 2, color },
      ];
  }
  return [...one, ...mirror(one)];
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Eyes (8 shapes).
// ---------------------------------------------------------------------------------------------------------------

type EyeShape = { w: number; h: 1 | 2; pupilOffset: number; lid: boolean };

const EYE_SHAPES: readonly EyeShape[] = [
  { w: 3, h: 1, pupilOffset: 1, lid: false }, // 0 round
  { w: 4, h: 1, pupilOffset: 2, lid: false }, // 1 almond
  { w: 3, h: 1, pupilOffset: 1, lid: true }, // 2 hooded
  { w: 2, h: 1, pupilOffset: 1, lid: false }, // 3 narrow
  { w: 4, h: 2, pupilOffset: 2, lid: false }, // 4 wide-set
  { w: 3, h: 1, pupilOffset: 0, lid: false }, // 5 downturned (pupil to the inner corner)
  { w: 3, h: 1, pupilOffset: 2, lid: false }, // 6 upturned (pupil to the outer corner)
  { w: 3, h: 1, pupilOffset: 1, lid: true }, // 7 monolid
];
export const EYE_SHAPE_COUNT = EYE_SHAPES.length;

function eyeRuns(parts: PortraitParts): Run[] {
  const shape = EYE_SHAPES[parts.eyes % EYE_SHAPES.length]!;
  const color = EYE_COLORS[parts.eyes % EYE_COLORS.length]!;
  const skin = SKIN_TONES[parts.skin % SKIN_TONES.length]!;
  const x = 11;
  const y = 13;
  const white = rect(x, y, shape.w, shape.h, WHITE);
  const pupil: Run[] = [{ x: x + Math.min(shape.pupilOffset, shape.w - 1), y, w: 1, color }];
  const lid = shape.lid ? [{ x, y: y - 1, w: shape.w, color: skin }] : [];
  const one = [...white, ...pupil, ...lid];
  return [...one, ...mirror(one)];
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Nose (6 shapes).
// ---------------------------------------------------------------------------------------------------------------

const NOSE_PROFILES: readonly (readonly number[])[] = [
  [1, 1, 2], // 0 small, straight
  [1, 2, 3], // 1 average
  [1, 2, 2, 4], // 2 broad, long
  [2, 2], // 3 flat, wide
  [1, 1, 1, 2], // 4 thin, long
  [1, 2, 2, 3], // 5 hooked (asymmetric shade added below)
];

function noseRuns(parts: PortraitParts): Run[] {
  const skin = SKIN_TONES[parts.skin % SKIN_TONES.length]!;
  const shade = LIP_SHADES[parts.skin % LIP_SHADES.length]!;
  const idx = parts.nose % NOSE_PROFILES.length;
  const profile = NOSE_PROFILES[idx]!;
  const bridge = profileRuns(15, profile, skin);
  const tipShade = [{ x: idx === 5 ? 17 : 15, y: 15 + profile.length - 1, w: 1, color: shade }];
  return [...bridge, ...tipShade];
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Mouth (7 shapes).
// ---------------------------------------------------------------------------------------------------------------

function mouthRuns(parts: PortraitParts): Run[] {
  const lip = LIP_SHADES[parts.skin % LIP_SHADES.length]!;
  const y = 19;
  switch (parts.mouth % 7) {
    case 0: // neutral
      return [{ x: 13, y, w: 6, color: lip }];
    case 1: // smile (corners raised a row)
      return [
        { x: 13, y, w: 6, color: lip },
        { x: 12, y: y - 1, w: 1, color: lip },
        { x: 19, y: y - 1, w: 1, color: lip },
      ];
    case 2: // frown (corners dropped a row)
      return [
        { x: 13, y, w: 6, color: lip },
        { x: 12, y: y + 1, w: 1, color: lip },
        { x: 19, y: y + 1, w: 1, color: lip },
      ];
    case 3: // thin
      return [{ x: 14, y, w: 4, color: lip }];
    case 4: // full (two rows)
      return [
        { x: 13, y, w: 6, color: lip },
        { x: 13, y: y + 1, w: 6, color: lip },
      ];
    case 5: // smirk (one side only raised)
      return [
        { x: 13, y, w: 6, color: lip },
        { x: 19, y: y - 1, w: 1, color: lip },
      ];
    default: // open (a sliver of white between the lips)
      return [
        { x: 13, y: y - 1, w: 6, color: lip },
        { x: 14, y, w: 4, color: WHITE },
        { x: 13, y: y + 1, w: 6, color: lip },
      ];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 9. Facial hair (9 including none).
// ---------------------------------------------------------------------------------------------------------------

function facialHairRuns(parts: PortraitParts): Run[] {
  if (parts.facialHair === 0) return [];
  const color = HAIR_COLORS[HAIR_STYLES[parts.hair % HAIR_STYLES.length]!.colorIdx % HAIR_COLORS.length]!;
  switch (parts.facialHair % 9) {
    case 1: // mustache
      return [{ x: 13, y: 18, w: 6, color }];
    case 2: // goatee
      return [
        { x: 13, y: 18, w: 6, color },
        { x: 14, y: 21, w: 4, color },
        { x: 14, y: 22, w: 4, color },
      ];
    case 3: // full beard
      return [
        { x: 13, y: 18, w: 6, color },
        { x: 10, y: 19, w: 12, color },
        { x: 10, y: 20, w: 12, color },
        { x: 11, y: 21, w: 10, color },
        { x: 12, y: 22, w: 8, color },
      ];
    case 4: // stubble (a faint scatter, drawn thin)
      return [
        { x: 11, y: 20, w: 10, color },
        { x: 12, y: 21, w: 8, color },
      ];
    case 5: // sideburns
      return [
        { x: 6, y: 13, w: 2, color },
        { x: 6, y: 16, w: 2, color },
        { x: 24, y: 13, w: 2, color },
        { x: 24, y: 16, w: 2, color },
      ];
    case 6: // handlebar mustache
      return [
        { x: 11, y: 18, w: 10, color },
        { x: 10, y: 17, w: 2, color },
        { x: 20, y: 17, w: 2, color },
      ];
    case 7: // soul patch
      return [{ x: 15, y: 21, w: 2, color }];
    default: // chin strap
      return [
        { x: 10, y: 19, w: 12, color },
        { x: 10, y: 20, w: 12, color },
        { x: 11, y: 21, w: 10, color },
      ];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 10. Age marks (4 overlays: none, lines, heavy lines, gaunt).
// ---------------------------------------------------------------------------------------------------------------

function ageMarkRuns(parts: PortraitParts): Run[] {
  if (parts.ageMarks === 0) return [];
  const shade = LIP_SHADES[(parts.skin + 2) % LIP_SHADES.length]!;
  if (parts.ageMarks === 1) {
    // lines: a crow's-foot at each eye, one at each mouth corner
    return [
      { x: 9, y: 14, w: 1, color: shade },
      { x: 22, y: 14, w: 1, color: shade },
      { x: 12, y: 20, w: 1, color: shade },
      { x: 19, y: 20, w: 1, color: shade },
    ];
  }
  if (parts.ageMarks === 2) {
    // heavy lines: the above, plus a forehead line and deeper nasolabial marks
    return [
      { x: 9, y: 14, w: 2, color: shade },
      { x: 21, y: 14, w: 2, color: shade },
      { x: 11, y: 20, w: 1, color: shade },
      { x: 20, y: 20, w: 1, color: shade },
      { x: 11, y: 9, w: 10, color: shade },
      { x: 11, y: 18, w: 1, color: shade },
      { x: 20, y: 18, w: 1, color: shade },
    ];
  }
  // gaunt: hollow cheeks, a sunken shade at both sides of the jaw
  return [
    { x: 8, y: 17, w: 2, color: shade },
    { x: 22, y: 17, w: 2, color: shade },
    { x: 9, y: 19, w: 1, color: shade },
    { x: 22, y: 19, w: 1, color: shade },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 11. Clothing (12 sets by role, design 07 §5, matching `CLOTHING_BY_RANK` in scene.ts).
// ---------------------------------------------------------------------------------------------------------------

const SHOULDER_PROFILE = [16, 20, 24, 26, 28, 28, 28, 28, 28] as const; // y = 23..31, widening at the shoulders

function clothingRuns(parts: PortraitParts): Run[] {
  const set = CLOTHING_SETS[parts.clothing % CLOTHING_SETS.length]!;
  const torso = profileRuns(23, SHOULDER_PROFILE, set.base);
  const detail: Run[] = [];
  switch (set.style) {
    case "tie":
      detail.push(...rect(15, 23, 2, 6, set.detail));
      break;
    case "collar":
      detail.push(...rect(13, 23, 6, 1, set.detail));
      break;
    case "sash":
      detail.push(...rect(10, 25, 12, 1, set.detail));
      break;
    case "badge":
      detail.push({ x: 14, y: 25, w: 1, color: set.detail });
      break;
    case "dress":
      detail.push(...rect(12, 23, 8, 1, set.detail));
      break;
    case "robe":
    case "plain":
      break;
  }
  return [...torso, ...detail];
}

// ---------------------------------------------------------------------------------------------------------------
// 12. Accessories (8 including none: glasses, hat, cigarette, scar, and four more).
// ---------------------------------------------------------------------------------------------------------------

function accessoryRuns(parts: PortraitParts): Run[] {
  switch (parts.accessory % 8) {
    case 0: // none
      return [];
    case 1: { // glasses: two frames and a bridge, over the eye row
      const frame = [
        { x: 10, y: 13, w: 5, color: GLASS_FRAME },
        { x: 10, y: 14, w: 1, color: GLASS_FRAME },
        { x: 14, y: 14, w: 1, color: GLASS_FRAME },
      ];
      return [...frame, ...mirror(frame), { x: 15, y: 13, w: 2, color: GLASS_FRAME }];
    }
    case 2: // hat: a fedora, covering the crown with a brim over the hairline
      return [...rect(9, 2, 14, 4, OUTLINE), ...rect(7, 6, 18, 1, OUTLINE)];
    case 3: // cigarette: a white stick at the mouth's corner with an ember tip
      return [
        { x: 20, y: 19, w: 3, color: WHITE },
        { x: 23, y: 19, w: 1, color: EMBER },
      ];
    case 4: // scar: a diagonal mark on one cheek
      return [
        { x: 20, y: 15, w: 1, color: SCAR },
        { x: 21, y: 16, w: 1, color: SCAR },
        { x: 22, y: 17, w: 1, color: SCAR },
      ];
    case 5: // pipe: a bowl and stem at the mouth
      return [
        { x: 20, y: 19, w: 3, color: PIPE_WOOD },
        { x: 23, y: 18, w: 2, color: PIPE_WOOD },
      ];
    case 6: // earring: a small gold stud
      return [{ x: 6, y: 15, w: 1, color: GOLD }];
    default: { // eyepatch: over one eye
      const patch = [{ x: 10, y: 13, w: 4, color: OUTLINE }];
      return [...patch, { x: 15, y: 13, w: 2, color: OUTLINE }];
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Composition: the twelve layers, in design 07 §5's order.
// ---------------------------------------------------------------------------------------------------------------

/** The twelve layers' runs, in draw order. Pure — no canvas — so tests can check every part index without one. */
export function portraitLayers(parts: PortraitParts): Run[][] {
  return [
    headRuns(parts), // 1: skin fill (drawn as part of the head silhouette)
    [], // 2: head shape is folded into headRuns's profile; kept as its own step for the twelve-layer order
    hairRuns(parts), // 3: hair
    hairAgeRuns(parts), // 4: the hair's age variant
    browRuns(parts), // 5: brows
    eyeRuns(parts), // 6: eyes
    noseRuns(parts), // 7: nose
    mouthRuns(parts), // 8: mouth
    facialHairRuns(parts), // 9: facial hair
    ageMarkRuns(parts), // 10: age marks
    clothingRuns(parts), // 11: clothing
    accessoryRuns(parts), // 12: accessory
  ];
}

/** A stable string key for `parts` at `size`: same parts and size always produce the same key (and, from the
 *  cache below, the same canvas). Field order is fixed so the key never depends on object insertion order. */
export function portraitCacheKey(parts: PortraitParts, size: number): string {
  return [
    size,
    parts.skin,
    parts.head,
    parts.hair,
    parts.hairAge,
    parts.brows,
    parts.eyes,
    parts.nose,
    parts.mouth,
    parts.facialHair,
    parts.ageMarks,
    parts.clothing,
    parts.accessory,
  ].join(":");
}

/** For screens that only hold a `PersonView`/`BookView` row (an id, no `PortraitParts`: design 11 wave A2, since
 *  `PlayerView`'s people and book rows predate portraits) — looks the character up in `world` (the store's own
 *  `World`, read-only; screens never otherwise touch it, design 07 §4) and derives its parts via the sim's
 *  `portraitParts`. Null when the world isn't loaded yet or the id no longer resolves to a living character. */
export function characterPortraitParts(world: World | null, characterId: string): PortraitParts | null {
  const c: Character | undefined = world?.characters.byId[characterId];
  return c ? portraitParts(c) : null;
}

const canvasCache = new Map<string, HTMLCanvasElement>();

/** True when a real canvas can be created in this environment (a browser, or a test with a canvas polyfill). */
function hasCanvas(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

/** Draws `parts` onto a fresh `size` by `size` canvas (32 or 64) and returns it. Each layer is filled in order;
 *  later layers draw over earlier ones, exactly as design 07 §5 lists them. Throws if no canvas is available —
 *  callers on the server should not call this; `Portrait.tsx` guards accordingly. */
export function drawPortrait(parts: PortraitParts, size: 32 | 64): HTMLCanvasElement {
  if (!hasCanvas()) {
    throw new Error("drawPortrait requires a DOM canvas (document.createElement is unavailable in this environment)");
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("drawPortrait: 2d canvas context unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.scale(size / PORTRAIT_GRID, size / PORTRAIT_GRID);
  for (const layer of portraitLayers(parts)) {
    for (const run of layer) {
      ctx.fillStyle = run.color;
      ctx.fillRect(run.x, run.y, run.w, 1);
    }
  }
  return canvas;
}

/** `drawPortrait`, cached by parts and size: the same parts and size return the exact same canvas element,
 *  never redrawn (design 11's "a cache keyed by the parts and size"). */
export function getPortraitCanvas(parts: PortraitParts, size: 32 | 64): HTMLCanvasElement {
  const key = portraitCacheKey(parts, size);
  const cached = canvasCache.get(key);
  if (cached) return cached;
  const canvas = drawPortrait(parts, size);
  canvasCache.set(key, canvas);
  return canvas;
}

/** Test-only: drops every cached canvas, so a suite can measure fresh compositions. Never called from app code. */
export function clearPortraitCache(): void {
  canvasCache.clear();
  dataUrlCache.clear();
}

const dataUrlCache = new Map<string, string>();

/** A data URL for `parts` at `size`, cached alongside the canvas: `Portrait.tsx` renders an `<img>` from this
 *  rather than re-encoding the cached canvas on every render. */
export function getPortraitDataUrl(parts: PortraitParts, size: 32 | 64): string {
  const key = portraitCacheKey(parts, size);
  const cached = dataUrlCache.get(key);
  if (cached) return cached;
  const url = getPortraitCanvas(parts, size).toDataURL();
  dataUrlCache.set(key, url);
  return url;
}
