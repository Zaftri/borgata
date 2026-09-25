// Story test (build-plan §5b item 10; design 13 §1's war row): run through the REAL pipeline (`buildStarterWorld`
// -> `step` -> the shipped content, `loadContent()`) on the starter world, and check the story table's own
// numbers: "Four to twelve weeks" of war (design 13 §1's table; the task brief widens the test's own tolerance
// to 4-16 turns given a single fixed seed's variance around that median), ending in peace ("the war ends at
// peace, or when one family is weakened (design 12) and sues for it" -- design 13 §1's own "After" row wording;
// both paths converge on `war.meeting` setting `WarStateSet` null both ways, per war.ts's `PEACE_EFFECTS`).
//
// The war is kicked off with `injectFacts` (StepOptions, step.ts) rather than by waiting on the sit-down agent's
// own `dispute.district.refusedRuling` -> `war.declare` chain (a different file, not this task's system):
// this story tests what happens ONCE a war starts (design 13 §1's "War" and "After" rows), not how one gets
// declared (its own "Any" row, and war.ts's own war.test.ts already covers `war.declare` firing off a schedule
// entry the same way that chain would leave one).
import { describe, expect, it } from "vitest";
import type { FamilyId } from "@borgata/shared";
import { loadContent } from "../../../content/src/index.js";
import { step } from "../step.js";
import { buildStarterWorld } from "../starter.js";
import type { GameSetup, World } from "../world.js";
import type { Fact } from "../facts.js";
import type { TurnLog } from "../log.js";

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const content = loadContent();
const opts = { debug: false }; // see war.test.ts's own note: a chief killed in war.week's hit outcome can hit
// the pre-existing crew-succession gap (succession.ts: "replacement of a dead crew chief ... is a later phase"),
// not something a story test should throw on either.

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

function atWar(world: World, family1Id: string, family2Id: string): boolean {
  return world.families.byId[family1Id]!.warWith !== null || world.families.byId[family2Id]!.warWith !== null;
}

describe("war story (design 13 §1's war row, starter world)", () => {
  it("a declared war lasts between 4 and 16 turns and ends in peace, sometimes by way of a weakened family", () => {
    let world = buildStarterWorld("war-story-1", setup, content);
    const family1Id = world.families.order[0]!;
    const family2Id = world.families.order[1]!;

    // Declare (this story's own stand-in for dispute.district.refusedRuling -> war.declare, per this file's
    // header comment): the two starter families go to war, exactly as war.declare's own "declared" outcome
    // would leave them (WarStateSet both ways, StandingDelta -100, the "war" crisis flag raised).
    let r = step(world, [], content, {
      ...opts,
      injectFacts: [
        { kind: "WarStateSet", familyId: family1Id as FamilyId, enemyFamilyId: family2Id as FamilyId, cause: { rule: "story.declare" } },
        { kind: "WarStateSet", familyId: family2Id as FamilyId, enemyFamilyId: family1Id as FamilyId, cause: { rule: "story.declare" } },
        { kind: "StandingDelta", familyA: family1Id as FamilyId, familyB: family2Id as FamilyId, delta: -100, cause: { rule: "story.declare" } },
      ],
    });
    world = r.world;
    const declaredTurn = world.meta.turn;
    expect(atWar(world, family1Id, family2Id)).toBe(true);

    const logs: TurnLog[] = [];
    let peaceTurn: number | undefined;
    let sawWeakened = false;
    // A generous ceiling above the 16-turn window this story checks against, so a slow-to-resolve seed still
    // fails on the numeric assertion below (a clear message) rather than on an unbounded loop.
    for (let i = 0; i < 30 && peaceTurn === undefined; i++) {
      r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      if (world.families.byId[family1Id]!.state === "weakened" || world.families.byId[family2Id]!.state === "weakened") {
        sawWeakened = true;
      }
      if (!atWar(world, family1Id, family2Id)) peaceTurn = world.meta.turn;
    }

    expect(peaceTurn, "the war never reached peace within 30 turns").toBeDefined();
    const durationTurns = peaceTurn! - declaredTurn;
    expect(durationTurns, `war lasted ${durationTurns} turns, expected 4-16 (design 13 §1)`).toBeGreaterThanOrEqual(4);
    expect(durationTurns, `war lasted ${durationTurns} turns, expected 4-16 (design 13 §1)`).toBeLessThanOrEqual(16);

    // "ends in peace or with a weakened family" (the task brief, design 13 §1's own "After" row): every ending
    // this engine can produce IS a peace (war.meeting's PEACE_EFFECTS is the only path that clears `warWith`),
    // reached either by an AI head's own probabilistic accept or, when a family went `weakened` along the way,
    // by war.exhaustion's forced acceptance (war.ts header comment, deviation 2) -- so peace is asserted above
    // unconditionally, and `sawWeakened` is recorded, not required, since design 13 §1's acceptance criteria
    // (docs/design/13-disputes-to-the-district.md §1) only calls for wars to end "at peace, or when one family
    // is weakened and sues for it", not for every war to pass through a weakened family on the way there.
    const facts = factsOf(logs);
    const peaceOutcomes = facts
      .filter((f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve")
      .filter((f) => f.outcomeId === "peaceForced" || f.outcomeId === "peaceOffered" || f.outcomeId === "acceptedByPlayer");
    expect(peaceOutcomes.length).toBeGreaterThan(0);
    if (sawWeakened) {
      expect(facts.some((f) => f.kind === "ProcessResolve" && f.outcomeId === "peaceForced")).toBe(true);
    }
  });
});
