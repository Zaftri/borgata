// Tests for the terminal play loop's core (build plan phase 4b; design 07 §2-§5). Drives `runPlay` with a
// scripted input array (no readline, no filesystem) and asserts on the captured output plus the returned
// SaveFile.

import { describe, expect, it } from "vitest";
import { loadContent } from "@borgata/content";
import { load, worldHash } from "@borgata/sim";
import { runPlay } from "./play.js";

const SEED = "play-test";

/** ~12 turns: `who`/`map` (no-ops for the log), three bare `end`s, a rejected claim (associates cannot claim
 * a business), an `ask makeAssociate`, then eight more `end`s. 12 `end`s in total, so 12 turns are stepped. */
function script(): string[] {
  return [
    "who",
    "map",
    "end",
    "end",
    "end",
    "claim biz-does-not-exist",
    "ask makeAssociate",
    "end",
    "end",
    "end",
    "end",
    "end",
    "end",
    "end",
    "end",
    "end",
  ];
}

describe("runPlay", () => {
  it("drives a scripted session, reporting rejections and the family roster", async () => {
    const content = loadContent();
    const output: string[] = [];

    const result = await runPlay({
      seed: SEED,
      content,
      input: script(),
      output: (line) => output.push(line),
    });

    const joined = output.join("\n");

    // The report header appears at the top of every turn (at least the 12 completed ones).
    const headerCount = output.filter((l) => l === "--- Report (last turn) ---").length;
    expect(headerCount).toBeGreaterThanOrEqual(12);

    // The `who` listing includes the player's sponsor, whoever the generator named him (phase 5: worlds are generated).
    const player = result.world.characters.byId[result.world.player.characterId]!;
    const sponsor = result.world.characters.byId[player.superiorId!]!;
    expect(joined).toContain(sponsor.name);

    // The invalid claim (an associate cannot hold a claim) is rejected, and the note surfaces via report.lines.
    expect(joined).toContain("associates cannot hold claims");

    // Exactly 12 `end`s were typed, so 12 turns were recorded in the save.
    expect(result.save.actions).toHaveLength(12);
  });

  it("round-trips through @borgata/sim's load with a matching world hash", async () => {
    const content = loadContent();
    const result = await runPlay({
      seed: SEED,
      content,
      input: script(),
      output: () => {},
    });

    const { world } = load(result.save, content);
    expect(worldHash(world)).toBe(worldHash(result.world));
  });
});
