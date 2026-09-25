import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { hash64, hashToWords } from "./hash.js";
import { applyPermille, decayToward, lnScaled120, roundHalfAway } from "./math.js";
import { emptyTable, tableInsert, tableIntegrity, tableRemove } from "./table.js";

describe("canonical JSON", () => {
  it("sorts keys recursively and ignores undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: undefined } })).toBe('{"a":{"d":[1,2]},"b":1}');
  });
  it("rejects non-integers", () => {
    expect(() => canonicalJson({ x: 0.5 })).toThrow();
  });
});

describe("hash64", () => {
  it("is stable and 16 hex chars", () => {
    expect(hash64("borgata")).toMatch(/^[0-9a-f]{16}$/);
    expect(hash64("borgata")).toBe(hash64("borgata"));
    expect(hash64("borgata")).not.toBe(hash64("borgatb"));
  });
  it("derives four 32-bit words", () => {
    const w = hashToWords("seed::stream");
    expect(w).toHaveLength(4);
    for (const x of w) expect(x >= 0 && x <= 0xffffffff).toBe(true);
  });
});

describe("integer math", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfAway(5, 2)).toBe(3);
    expect(roundHalfAway(-5, 2)).toBe(-3);
    expect(roundHalfAway(4, 2)).toBe(2);
    expect(roundHalfAway(7, 3)).toBe(2);
  });
  it("applies permille", () => {
    expect(applyPermille(1000, 200)).toBe(200);
    expect(applyPermille(333, 100)).toBe(33);
  });
  it("decays toward a floor by half over one half-life", () => {
    expect(decayToward(1000, 0, 4, 4)).toBe(500);
    expect(decayToward(1000, 200, 4, 8)).toBe(400);
    expect(decayToward(1000, 0, 4, 2)).toBeGreaterThan(700);
    expect(decayToward(1000, 0, 4, 2)).toBeLessThan(720);
  });
  it("ln curve is monotone", () => {
    let prev = -1;
    for (let n = 0; n < 200; n++) {
      const v = lnScaled120(n);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("tables", () => {
  it("keeps order and byId in sync", () => {
    const t = emptyTable<number>();
    tableInsert(t, "a", 1);
    tableInsert(t, "b", 2);
    expect(tableIntegrity(t)).toBeNull();
    expect(() => tableInsert(t, "a", 3)).toThrow();
    tableRemove(t, "a");
    expect(t.order).toEqual(["b"]);
    expect(tableIntegrity(t)).toBeNull();
    t.order.push("ghost");
    expect(tableIntegrity(t)).toMatch(/ghost/);
  });
});
