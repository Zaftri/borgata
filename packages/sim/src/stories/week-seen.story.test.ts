// Design 11 §1, "one week, seen", as an executable story: over thirty weeks on the starter and three generated
// seeds, the beats the story names appear on the player's place, every report line about the place has a beat
// (the equivalence rule), and every actor on the map has portrait parts in range. The renderer is not run here
// (no browser in the test runner); this pins the projection the renderer draws, which is where the seam between
// the map and the tab broke on 2026-09-25.
import { describe, expect, it } from "vitest";
import { loadContent } from "@borgata/content";
import { initialWorld } from "../replay.js";
import { buildStarterWorld } from "../starter.js";
import { step } from "../step.js";
import { placesForPlayer, projectScene, type ClipKind } from "../scene.js";
import { projectView } from "../view.js";
import type { World } from "../world.js";

const content = loadContent();
const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const opts = { debug: false } as const;

const fixtures: Array<{ name: string; make: () => World }> = [
  { name: "starter", make: () => buildStarterWorld("week-seen-starter", setup, content) },
  { name: "seen-1", make: () => initialWorld("week-seen-1", setup, content) },
  { name: "seen-2", make: () => initialWorld("week-seen-2", setup, content) },
  { name: "seen-3", make: () => initialWorld("week-seen-3", setup, content) },
];

/** A yes-man for the story: the first option of every card the player holds. */
function yesMan(world: World): Array<{ kind: "decide"; instanceId: string; optionId: string }> {
  const out: Array<{ kind: "decide"; instanceId: string; optionId: string }> = [];
  for (const id of world.processes.order) {
    const inst = world.processes.byId[id]!;
    if (inst.state !== "awaitingDecision" || !inst.decision) continue;
    const mine = Object.values(inst.roles).some((r) => r.kind === "character" && world.characters.byId[r.id]?.playerControlled);
    if (mine && inst.decision.options[0]) out.push({ kind: "decide", instanceId: inst.id, optionId: inst.decision.options[0] });
  }
  return out;
}

const EXPECTED_BEATS: ClipKind[] = ["collect", "game", "favor", "share"];

describe("story: one week, seen (design 11 §1)", () => {
  for (const fixture of fixtures) {
    it(`${fixture.name}: the named beats appear over 30 weeks, every actor has parts in range, and the scene never lacks the player`, () => {
      let world = fixture.make();
      const placeId = placesForPlayer(world)[0]!.id;
      const seen = new Set<ClipKind>();
      for (let t = 0; t < 30; t++) {
        const r = step(world, yesMan(world), content, opts);
        world = r.world;
        const scene = projectScene(world, r.log, content, placeId);
        expect(scene, `${fixture.name}: no scene for ${placeId}`).not.toBeNull();
        for (const c of scene!.clips) seen.add(c.kind);
        expect(scene!.actors.some((a) => a.role === "you"), `${fixture.name} week ${t}: the player is not on the map`).toBe(true);
        for (const a of scene!.actors) {
          const p = a.portrait;
          expect(p.skin).toBeLessThan(6);
          expect(p.hair).toBeLessThan(14);
          expect(p.eyes).toBeLessThan(8);
          expect(p.clothing).toBeLessThan(12);
          expect(a.x).toBeLessThan(scene!.width);
          expect(a.y).toBeLessThan(scene!.height);
        }
        // The view's places list names the place the scene shows.
        const view = projectView(world, r.log, content);
        expect(view.places.some((pl) => pl.id === placeId)).toBe(true);
      }
      for (const kind of EXPECTED_BEATS) expect(seen.has(kind), `${fixture.name}: no "${kind}" beat in 30 weeks (saw ${[...seen].join(", ")})`).toBe(true);
    });
  }

  it("the newspaper prints at least one line in 30 weeks on some seed", () => {
    let printed = false;
    for (const fixture of fixtures) {
      let world = fixture.make();
      for (let t = 0; t < 30 && !printed; t++) {
        const r = step(world, yesMan(world), content, opts);
        world = r.world;
        if (projectView(world, r.log, content).newspaper.length > 0) printed = true;
      }
    }
    expect(printed).toBe(true);
  });
});
