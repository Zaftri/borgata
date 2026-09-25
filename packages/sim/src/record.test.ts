// Record system (design 09 §2, §3): weekly envelope counters, the one-turn-lagged arrest counter, and their
// effect on associate Weight (design 09 §3).
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT } from "./content-types.js";
import { buildStarterWorld } from "./starter.js";
import { computeWeight } from "./systems/progression.js";
import { recordStep } from "./systems/record.js";
import { playerCharacter } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

describe("recordStep: weekly counters", () => {
  it("credits a paid week and extends the streak for an associate who received income this turn", () => {
    const world = buildStarterWorld("record-paid", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    world.ledger.turnIncome[me.accounts.personal] = 20;

    const facts = recordStep(world, EMPTY_CONTENT);

    expect(facts).toContainEqual({ kind: "RecordDelta", characterId: me.id, field: "weeksPaid", delta: 1, cause: { rule: "record.weekly", actorId: me.id } });
    expect(facts).toContainEqual({ kind: "RecordDelta", characterId: me.id, field: "streakPaid", delta: 1, cause: { rule: "record.weekly", actorId: me.id } });
  });

  it("records a missed week and resets the streak for an associate with no income this turn", () => {
    const world = buildStarterWorld("record-missed", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    // No turnIncome entry: he collected nothing this turn.

    const facts = recordStep(world, EMPTY_CONTENT);

    expect(facts).toContainEqual({ kind: "RecordDelta", characterId: me.id, field: "weeksMissed", delta: 1, cause: { rule: "record.weekly", actorId: me.id } });
    expect(facts).toContainEqual({ kind: "RecordDelta", characterId: me.id, field: "streakPaid", delta: 0, set: true, cause: { rule: "record.weekly", actorId: me.id } });
  });

  it("does not touch the weekly counters for a non-associate", () => {
    const world = buildStarterWorld("record-nonassoc", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    me.rank = "soldier";
    world.ledger.turnIncome[me.accounts.personal] = 50;

    const facts = recordStep(world, EMPTY_CONTENT);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === me.id && (f.field === "weeksPaid" || f.field === "weeksMissed" || f.field === "streakPaid"))).toBe(false);
  });
});

describe("recordStep: arrest counter (one-turn lag, see the comment in systems/record.ts)", () => {
  it("credits an arrest the turn after a StatusChange naming a still-arrested character was recorded", () => {
    const world = buildStarterWorld("record-arrest", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    me.status = "arrested";
    world.meta.turn = 5;
    world.history.recentFacts.push({ turn: 4, kind: "StatusChange", subjects: [me.id] });

    const facts = recordStep(world, EMPTY_CONTENT);
    expect(facts).toContainEqual({ kind: "RecordDelta", characterId: me.id, field: "arrests", delta: 1, cause: { rule: "record.arrest", actorId: me.id } });
  });

  it("does not credit an arrest from a stale StatusChange (not exactly last turn)", () => {
    const world = buildStarterWorld("record-arrest-stale", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    me.status = "arrested";
    world.meta.turn = 5;
    world.history.recentFacts.push({ turn: 3, kind: "StatusChange", subjects: [me.id] });

    const facts = recordStep(world, EMPTY_CONTENT);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.field === "arrests")).toBe(false);
  });

  it("does not credit an arrest once the character is no longer arrested", () => {
    const world = buildStarterWorld("record-arrest-released", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    me.status = "free";
    world.meta.turn = 5;
    world.history.recentFacts.push({ turn: 4, kind: "StatusChange", subjects: [me.id] }); // e.g. a release recorded last turn

    const facts = recordStep(world, EMPTY_CONTENT);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.field === "arrests")).toBe(false);
  });
});

describe("associate Weight rises with the record (design 09 §3)", () => {
  it("computeWeight increases as jobsDone, streakPaid and weeksPaid accumulate", () => {
    const world = buildStarterWorld("weight-record", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const before = computeWeight(world, me.id);

    me.record = { ...me.record, jobsDone: 6, streakPaid: 10, weeksPaid: 20 };
    const after = computeWeight(world, me.id);

    expect(after).toBeGreaterThan(before);
  });

  it("does not add the record bonus for ranks other than associate", () => {
    const world = buildStarterWorld("weight-record-soldier", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    me.rank = "soldier";
    me.record = { ...me.record, jobsDone: 0, streakPaid: 0, weeksPaid: 0 };
    const withoutRecord = computeWeight(world, me.id);

    me.record = { ...me.record, jobsDone: 6, streakPaid: 10, weeksPaid: 20 };
    const withRecord = computeWeight(world, me.id);

    expect(withRecord).toBe(withoutRecord);
  });
});
