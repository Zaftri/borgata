// The 48-colour master palette (design 07 §5): "warm and sun-bleached: ochres, terracotta, faded blues and
// greens, deep shadow browns, one hot red reserved for events that matter (fire, blood, a headline)." This is
// the single place the palette is defined; the tile/building/figure atlas (atlas.ts) and the portrait module
// (portrait.ts, another agent) both import named colours from here rather than inventing their own hex values,
// so a later re-paint of the whole slice is one file. Every value is a plain hex string so it can be handed
// straight to a canvas 2D context, a PixiJS `Graphics.fill({ color })`, or a `Sprite.tint`.
//
// No randomness, no Date, no DOM: this module is pure data and safe to import from a vitest "node" environment.

/** Ochres: sun-bleached plaster and stucco walls, lightest to darkest. */
export const OCHRE_1 = "#f2e2b9";
export const OCHRE_2 = "#e8d19a";
export const OCHRE_3 = "#dcbb77";
export const OCHRE_4 = "#cca658";
export const OCHRE_5 = "#b78b3f";
export const OCHRE_6 = "#9c7333";
export const OCHRE_7 = "#7e5c29";
export const OCHRE_8 = "#5f451f";

/** Terracotta: roof tiles, brick, clay pots. */
export const TERRACOTTA_1 = "#e8b48f";
export const TERRACOTTA_2 = "#d99468";
export const TERRACOTTA_3 = "#c67a4c";
export const TERRACOTTA_4 = "#a8603a";
export const TERRACOTTA_5 = "#8a4a2c";
export const TERRACOTTA_6 = "#6b3820";

/** Faded blues: sea, shutters, window glass. */
export const BLUE_1 = "#cfe0dd";
export const BLUE_2 = "#a9c6c4";
export const BLUE_3 = "#7fa8a8";
export const BLUE_4 = "#5c8a8c";
export const BLUE_5 = "#416e70";
export const BLUE_6 = "#2c4f52";

/** Faded greens: shutters, fields, awnings. */
export const GREEN_1 = "#d8dcb0";
export const GREEN_2 = "#c0c68f";
export const GREEN_3 = "#a3ac6e";
export const GREEN_4 = "#838f54";
export const GREEN_5 = "#656f3d";
export const GREEN_6 = "#47502a";

/** Deep shadow browns: doorways, wood, dirt, ink lines. */
export const BROWN_1 = "#b89a7c";
export const BROWN_2 = "#9c7f62";
export const BROWN_3 = "#82684d";
export const BROWN_4 = "#6a533b";
export const BROWN_5 = "#52402c";
export const BROWN_6 = "#3d2f20";
export const BROWN_7 = "#2a2015";
export const BROWN_8 = "#18120b";

/** Stone: cobbles, piazza flagstones, plaster in shade. */
export const STONE_1 = "#ece6d6";
export const STONE_2 = "#d9d2bd";
export const STONE_3 = "#c2ba9f";
export const STONE_4 = "#a49c80";
export const STONE_5 = "#837b60";
export const STONE_6 = "#5f5844";

/** Skin tones (design 07 §5's portrait skin layer, 6 values), shared by the atlas figures and the portraits. */
export const SKIN_1 = "#f2d3b3";
export const SKIN_2 = "#e0b48c";
export const SKIN_3 = "#c8935f";
export const SKIN_4 = "#a8703e";
export const SKIN_5 = "#7d5330";
export const SKIN_6 = "#573823";

/** The one hot red, reserved for events that matter: fire, blood, a headline. Never used decoratively. */
export const HOT_RED = "#c8281e";

/** Near-black, for outlines and deep shadow (window glass at night, wrought iron, ink). */
export const BLACK = "#14100a";

/** The full 48-entry palette in a fixed order, for anything that wants to enumerate or count it (tests, a
 *  future palette-swap tool). Named constants above are the ones code should actually reference. */
export const PALETTE: readonly string[] = [
  OCHRE_1, OCHRE_2, OCHRE_3, OCHRE_4, OCHRE_5, OCHRE_6, OCHRE_7, OCHRE_8,
  TERRACOTTA_1, TERRACOTTA_2, TERRACOTTA_3, TERRACOTTA_4, TERRACOTTA_5, TERRACOTTA_6,
  BLUE_1, BLUE_2, BLUE_3, BLUE_4, BLUE_5, BLUE_6,
  GREEN_1, GREEN_2, GREEN_3, GREEN_4, GREEN_5, GREEN_6,
  BROWN_1, BROWN_2, BROWN_3, BROWN_4, BROWN_5, BROWN_6, BROWN_7, BROWN_8,
  STONE_1, STONE_2, STONE_3, STONE_4, STONE_5, STONE_6,
  SKIN_1, SKIN_2, SKIN_3, SKIN_4, SKIN_5, SKIN_6,
  HOT_RED,
  BLACK,
];

/** Named palette lookup by category, for code that wants "the nth skin tone" etc. without importing every
 *  individual constant. */
export const PALETTE_BY_CATEGORY = {
  ochre: [OCHRE_1, OCHRE_2, OCHRE_3, OCHRE_4, OCHRE_5, OCHRE_6, OCHRE_7, OCHRE_8],
  terracotta: [TERRACOTTA_1, TERRACOTTA_2, TERRACOTTA_3, TERRACOTTA_4, TERRACOTTA_5, TERRACOTTA_6],
  blue: [BLUE_1, BLUE_2, BLUE_3, BLUE_4, BLUE_5, BLUE_6],
  green: [GREEN_1, GREEN_2, GREEN_3, GREEN_4, GREEN_5, GREEN_6],
  brown: [BROWN_1, BROWN_2, BROWN_3, BROWN_4, BROWN_5, BROWN_6, BROWN_7, BROWN_8],
  stone: [STONE_1, STONE_2, STONE_3, STONE_4, STONE_5, STONE_6],
  skin: [SKIN_1, SKIN_2, SKIN_3, SKIN_4, SKIN_5, SKIN_6],
} as const;

/** The Attention band's five-step ramp (design 07 §5): chosen to be distinguishable under the common
 *  colorblind types (Okabe-Ito), and always paired with the band's word, never the sole carrier of meaning
 *  (design 07 §6). Index 0 is the calmest band, index 4 the most severe. */
export const ATTENTION_RAMP: readonly [string, string, string, string, string] = [
  "#0072b2", // calm: a settled, watched-but-quiet blue
  "#009e73", // notable: bluish green
  "#f0e442", // watched: yellow
  "#e69f00", // alarmed: orange
  "#d55e00", // severe: vermillion, one step short of the reserved hot red
];
