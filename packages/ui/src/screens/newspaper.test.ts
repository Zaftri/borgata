// Newspaper column layout test (design 11-pixel-slice wave A3). This environment has no
// `preact-render-to-string` (checked: not in node_modules for this workspace), so per the task this is a pure
// test of `splitIntoColumns`, the helper Newspaper.tsx uses to lay `view.newspaper` lines out as newsprint
// columns (first column reads top to bottom before the next one starts, as in print).

import { describe, expect, it } from "vitest";
import { splitIntoColumns } from "./Newspaper.js";

describe("splitIntoColumns", () => {
  it("returns no columns for no lines", () => {
    expect(splitIntoColumns([], 2)).toEqual([]);
  });

  it("puts everything in one column when columnCount is 1", () => {
    const lines = ["a", "b", "c"];
    expect(splitIntoColumns(lines, 1)).toEqual([["a", "b", "c"]]);
  });

  it("fills the first column top to bottom before starting the second (newspaper order, not round-robin)", () => {
    const lines = ["a", "b", "c", "d", "e"];
    // 5 lines over 2 columns: ceil(5/2) = 3 in the first column, the remaining 2 in the second.
    expect(splitIntoColumns(lines, 2)).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
  });

  it("splits an even number of lines evenly", () => {
    const lines = ["a", "b", "c", "d"];
    expect(splitIntoColumns(lines, 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("never returns an empty trailing column", () => {
    const lines = ["a"];
    // ceil(1/2) = 1 per column: the first column takes the only line, the second would be empty and is dropped.
    expect(splitIntoColumns(lines, 2)).toEqual([["a"]]);
  });

  it("drops empty columns for more columns than lines", () => {
    const lines = ["a", "b"];
    expect(splitIntoColumns(lines, 5)).toEqual([["a"], ["b"]]);
  });
});
