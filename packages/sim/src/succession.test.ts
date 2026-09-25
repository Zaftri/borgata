// The dead leave the books (design 02 §6) and a dead crew chief is replaced (design 13).
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT } from "./content-types.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { buildStarterWorld } from "./starter.js";
import { step } from "./step.js";
import { playerCharacter } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

describe("succession", () => {
  it("a dead crew chief is replaced by the crew's soldier of most Weight, and the crew stays consistent", () => {
    let world = buildStarterWorld("succ-1", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const oldChief = crew.chiefId;
    applyFacts(world, [{ kind: "StatusChange", characterId: oldChief, status: "dead", cause: { rule: "test" } }], new TurnLogBuilder(world.meta.turn));
    world = step(world, [], EMPTY_CONTENT).world; // invariants run inside: crewsConsistent must hold after the step
    const after = world.crews.byId[crew.id]!;
    expect(after.chiefId).not.toBe(oldChief);
    const newChief = world.characters.byId[after.chiefId]!;
    expect(newChief.alive).toBe(true);
    expect(newChief.rank).toBe("chief");
    expect(after.memberIds).not.toContain(newChief.id);
    expect(me.alive).toBe(true);
  });
});
