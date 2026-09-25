// Seeded random streams (design 01 §1, §5). xoshiro128** on 32-bit words.
// Each system asks for its own named stream; stream state lives in World.rng so replay resumes exactly.

import { hashToWords, type PerTenThousand } from "@borgata/shared";

export type StreamState = [number, number, number, number];
export type RngState = { seed: string; streams: Record<string, StreamState> };

export function createRngState(seed: string): RngState {
  return { seed, streams: {} };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** A cursor over a stream state array. Mutates the array in place so the world carries the position. */
export class Stream {
  constructor(private readonly s: StreamState) {}

  nextU32(): number {
    const s = this.s;
    const result = (Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0);
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Uniform integer in [0, maxExclusive). maxExclusive must be a positive safe integer <= 2^32. */
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) throw new RangeError(`nextInt bound ${maxExclusive}`);
    // Rejection sampling removes modulo bias while staying deterministic.
    const limit = 4294967296 - (4294967296 % maxExclusive);
    let u = this.nextU32();
    while (u >= limit) u = this.nextU32();
    return u % maxExclusive;
  }

  /** Integer in [lo, hi] inclusive. */
  nextRange(lo: number, hi: number): number {
    if (hi < lo) throw new RangeError("nextRange hi < lo");
    return lo + this.nextInt(hi - lo + 1);
  }

  /** True with probability p per ten thousand (design 01 §1). */
  chance(p: PerTenThousand): boolean {
    if (p <= 0) return false;
    if (p >= 10_000) return true;
    return this.nextInt(10_000) < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("pick from empty array");
    return items[this.nextInt(items.length)]!;
  }
}

/** Initial state for a named stream, derived from the world seed and the stream name only. */
export function initialStreamState(seed: string, name: string): StreamState {
  const words = hashToWords(`${seed}::${name}`);
  // xoshiro state must not be all zero.
  if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0) words[0] = 1;
  return [words[0] >>> 0, words[1] >>> 0, words[2] >>> 0, words[3] >>> 0];
}

/** Get (creating on first use) the named stream of a world. Names are `system.purpose`, e.g. `events.spawn`. */
export function getStream(rng: RngState, name: string): Stream {
  let state = rng.streams[name];
  if (!state) {
    state = initialStreamState(rng.seed, name);
    rng.streams[name] = state;
  }
  return new Stream(state);
}
