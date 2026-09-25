// Integer math for the simulation core (design 01 §1, §5). No floating point crosses these helpers.

/** A meter is an integer in 0..1000 (design 03). */
export type Meter = number;
/** A signed meter is an integer in -1000..1000 (Sentiment). */
export type SignedMeter = number;
/** Parts per thousand, integer 0..1000. */
export type Permille = number;
/** Parts per ten thousand, integer 0..10000. Used for probabilities. */
export type PerTenThousand = number;
/** Money in thousands of lire, integer. */
export type KiloLire = number;

export const METER_MAX = 1000;
export const PERMILLE_MAX = 1000;
export const PER_TEN_THOUSAND_MAX = 10_000;

export function assertInt(n: number, what = "value"): number {
  if (!Number.isSafeInteger(n)) throw new TypeError(`${what} must be a safe integer, got ${n}`);
  return n;
}

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

export function clampMeter(n: number): Meter {
  return clamp(n, 0, METER_MAX);
}

export function clampSigned(n: number): SignedMeter {
  return clamp(n, -METER_MAX, METER_MAX);
}

/** Round half away from zero. The single rounding rule for the core (design 01 §5). */
export function roundHalfAway(numerator: number, denominator: number): number {
  assertInt(numerator, "numerator");
  assertInt(denominator, "denominator");
  if (denominator === 0) throw new RangeError("division by zero");
  const neg = (numerator < 0) !== (denominator < 0);
  const an = Math.abs(numerator);
  const ad = Math.abs(denominator);
  const q = Math.floor(an / ad);
  const r = an - q * ad;
  const rounded = r * 2 >= ad ? q + 1 : q;
  return neg ? -rounded : rounded;
}

/** value * permille / 1000, rounded half away from zero. */
export function applyPermille(value: number, permille: Permille): number {
  return roundHalfAway(value * permille, PERMILLE_MAX);
}

/** value * perTenThousand / 10000, rounded half away from zero. */
export function applyPerTenThousand(value: number, p: PerTenThousand): number {
  return roundHalfAway(value * p, PER_TEN_THOUSAND_MAX);
}

/**
 * Exponential decay toward a floor using a half-life in turns, in integer arithmetic.
 * Returns the new value after one step of `elapsed` turns.
 * Approximation: value moves toward floor by fraction 1 - 2^(-elapsed/halfLife), computed in per-ten-thousand.
 */
export function decayToward(value: number, floor: number, halfLifeTurns: number, elapsed: number): number {
  assertInt(halfLifeTurns, "halfLife");
  assertInt(elapsed, "elapsed");
  if (halfLifeTurns <= 0 || elapsed <= 0) return value;
  // fraction remaining = 2^(-elapsed/halfLife). Use a lookup by 1/64ths of a half-life for determinism.
  const steps64 = roundHalfAway(elapsed * 64, halfLifeTurns); // in 64ths of a half-life
  let remaining = PER_TEN_THOUSAND_MAX;
  let whole = Math.floor(steps64 / 64);
  const frac = steps64 - whole * 64;
  while (whole-- > 0) remaining = roundHalfAway(remaining, 2);
  if (frac > 0) remaining = roundHalfAway(remaining * HALF_POW_64[frac]!, PER_TEN_THOUSAND_MAX);
  const diff = value - floor;
  return floor + applyPerTenThousand(diff, remaining);
}

/** 2^(-k/64) for k in 0..63, in per-ten-thousand. Precomputed so the core never calls Math.pow. */
const HALF_POW_64: readonly number[] = [
  10000, 9892, 9786, 9680, 9576, 9473, 9371, 9270, 9170, 9071, 8974, 8877, 8781, 8687, 8593, 8500,
  8409, 8318, 8229, 8140, 8053, 7966, 7880, 7796, 7711, 7628, 7546, 7465, 7385, 7305, 7226, 7149,
  7071, 6995, 6920, 6845, 6771, 6698, 6626, 6555, 6484, 6415, 6345, 6277, 6209, 6142, 6076, 6011,
  5946, 5882, 5819, 5756, 5694, 5633, 5572, 5512, 5453, 5394, 5336, 5279, 5222, 5166, 5110, 5055,
];

/** Natural-log-like curve for Weight components (design 03 §1): integer approximation of 120*ln(1+n), n >= 0. */
export function lnScaled120(n: number): number {
  assertInt(n, "n");
  if (n <= 0) return 0;
  // ln(1+n) via table for small n and bit-length approximation beyond.
  if (n < LN_TABLE.length) return LN_TABLE[n]!;
  // For large n: 120*ln(1+n) ~ 120*(0.6931*bitLength + correction). Keep monotone and cheap.
  const bits = 32 - Math.clz32(n);
  return roundHalfAway(120 * 6931 * bits, 10000);
}

/** 120*ln(1+n) rounded, n = 0..64. */
const LN_TABLE: readonly number[] = [
  0, 83, 132, 166, 193, 215, 233, 250, 264, 276, 288, 298, 308, 317, 325, 333, 340, 347, 353, 359,
  365, 371, 376, 381, 386, 391, 395, 400, 404, 408, 412, 416, 419, 423, 427, 430, 433, 437, 440, 443,
  446, 449, 451, 454, 457, 459, 462, 464, 467, 469, 472, 474, 476, 479, 481, 483, 485, 487, 489, 491,
  493, 495, 497, 499, 501,
];
