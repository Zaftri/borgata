import { describe, expect, it } from "vitest";
import { createRngState, getStream, initialStreamState } from "./rng.js";

describe("seeded streams", () => {
  it("is deterministic for the same seed and stream name", () => {
    const a = getStream(createRngState("seed-1"), "events");
    const b = getStream(createRngState("seed-1"), "events");
    const xs = Array.from({ length: 10 }, () => a.nextU32());
    const ys = Array.from({ length: 10 }, () => b.nextU32());
    expect(xs).toEqual(ys);
  });

  it("differs across seeds and across stream names", () => {
    const a = getStream(createRngState("seed-1"), "events").nextU32();
    const b = getStream(createRngState("seed-2"), "events").nextU32();
    const c = getStream(createRngState("seed-1"), "families").nextU32();
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("keeps streams independent: consuming one does not move another", () => {
    const rng = createRngState("seed-x");
    const familiesFirst = getStream(rng, "families").nextU32();
    const rng2 = createRngState("seed-x");
    const ev = getStream(rng2, "events");
    for (let i = 0; i < 1000; i++) ev.nextU32();
    const familiesAfterEvents = getStream(rng2, "families").nextU32();
    expect(familiesAfterEvents).toBe(familiesFirst);
  });

  it("persists its cursor in the rng state so a clone resumes exactly", () => {
    const rng = createRngState("seed-p");
    const s = getStream(rng, "gen");
    s.nextU32();
    s.nextU32();
    const clone = structuredClone(rng);
    expect(getStream(clone, "gen").nextU32()).toBe(getStream(rng, "gen").nextU32());
  });

  it("nextInt is in range and roughly uniform", () => {
    const s = getStream(createRngState("u"), "t");
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 70_000; i++) counts[s.nextInt(7)]! += 1;
    for (const c of counts) {
      expect(c).toBeGreaterThan(9_000);
      expect(c).toBeLessThan(11_000);
    }
  });

  it("chance respects per-ten-thousand bounds", () => {
    const s = getStream(createRngState("c"), "t");
    expect(s.chance(0)).toBe(false);
    expect(s.chance(10_000)).toBe(true);
    let hits = 0;
    for (let i = 0; i < 20_000; i++) if (s.chance(2_500)) hits++;
    expect(hits).toBeGreaterThan(4_500);
    expect(hits).toBeLessThan(5_500);
  });

  it("never produces an all-zero initial state", () => {
    const st = initialStreamState("", "");
    expect(st.some((x) => x !== 0)).toBe(true);
  });
});
