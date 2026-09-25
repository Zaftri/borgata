// Tests for `pnpm harness coverage` (build plan §5b item 8c, design 08 §9c). A short smoke run (3 seeds x 10
// turns) proves the loop wires together end to end; the shape assertions check the coverage sets stay consistent
// with each other (every option/outcome id recorded actually belongs to some real template) without hard-coding
// which ones fire, since that is exactly the tuning-sensitive thing `harness coverage` itself is meant to surface.

import { describe, expect, it } from "vitest";
import { loadContent } from "@borgata/content";
import { coverageKey, runCoverage } from "./coverage.js";

const content = loadContent();

describe("runCoverage: smoke run", () => {
  it("runs 3 seeds x 10 turns with yesMan and only ever records ids that belong to a real template", () => {
    const r = runCoverage(content, 3, 10, "yesMan");
    expect(r.seeds).toBe(3);
    expect(r.turns).toBe(10);
    expect(r.strategy).toBe("yesMan");

    const templatesById = new Map(content.templates.map((t) => [t.id, t]));

    for (const key of r.optionsChosen) {
      const [templateId, optionId] = key.split("::");
      const t = templatesById.get(templateId!);
      expect(t?.decision?.options.some((o) => o.id === optionId)).toBe(true);
    }
    for (const key of r.allOutcomesReached) {
      const [templateId, outcomeId] = key.split("::");
      const t = templatesById.get(templateId!);
      expect(t?.resolve.some((o) => o.id === outcomeId)).toBe(true);
    }
    // Player-facing outcomes are always a subset of all outcomes reached (same ProcessResolve facts, narrower filter).
    for (const key of r.playerFacingOutcomesReached) expect(r.allOutcomesReached.has(key)).toBe(true);
  });

  it(
    "reaches at least one associate-week outcome under yesMan over a longer run",
    () => {
      // yesMan accepts favors and banks the game (ai-player.ts's PREFERENCES), so a slightly longer run than the
      // smoke test should exercise at least one of assoc.game.stake's outcomes for the player.
      const r = runCoverage(content, 4, 30, "yesMan");
      const reachedAny = ["bankGood", "bankBad", "bankBigNight", "borrowGood", "borrowBad", "skipped", "moved"].some((id) =>
        r.playerFacingOutcomesReached.has(coverageKey("assoc.game.stake", id)),
      );
      expect(reachedAny).toBe(true);
    },
    180_000, // a whole career on a shared CI runner (2026-09-25)
  );
});

describe("coverageKey", () => {
  it("joins templateId and id with the same separator both directions rely on", () => {
    expect(coverageKey("assoc.game.stake", "bankGood")).toBe("assoc.game.stake::bankGood");
  });
});
