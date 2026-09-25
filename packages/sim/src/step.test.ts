import { describe, expect, it } from "vitest";
import { createEmptyWorld, playerCharacter } from "./world.js";
import { step, InvariantViolationError, worldHash } from "./step.js";
import { EMPTY_CONTENT } from "./content-types.js";

const setup = { archetype: null, background: "family", difficulty: "normal", ironman: true } as const;
const cause = { rule: "test" };

describe("step", () => {
  it("is deterministic: equal inputs give equal hashes and does not mutate its input", () => {
    const w0 = createEmptyWorld("s", setup, EMPTY_CONTENT.version);
    const before = worldHash(w0);
    const r1 = step(w0, [], EMPTY_CONTENT);
    const r2 = step(w0, [], EMPTY_CONTENT);
    expect(r1.hash).toBe(r2.hash);
    expect(worldHash(w0)).toBe(before);
    expect(r1.world.meta.turn).toBe(1);
  });

  it("advances the calendar by the turn length and rolls the year at week 52", () => {
    let w = createEmptyWorld("cal", setup, EMPTY_CONTENT.version);
    for (let i = 0; i < 52; i++) w = step(w, [], EMPTY_CONTENT).world;
    expect(w.meta.calendar).toEqual({ year: 2, week: 1 });
    expect(w.meta.turn).toBe(52);
  });

  it("turn length follows rank and contracts to a week during a crisis, with a logged reason", () => {
    const w0 = createEmptyWorld("rank", setup, EMPTY_CONTENT.version);
    const me = playerCharacter(w0).id;
    const r1 = step(w0, [], EMPTY_CONTENT, { injectFacts: [{ kind: "RankChange", characterId: me, rank: "chief", cause }] });
    expect(r1.world.meta.turnLength).toBe(2);
    expect(r1.report.lines.some((l) => l.includes("2 weeks per turn"))).toBe(true);

    // r1 advanced by the pre-change length (1 week), then set the new length (2).
    expect(r1.world.meta.calendar.week).toBe(1 + 1);

    const r2 = step(r1.world, [], EMPTY_CONTENT, { injectFacts: [{ kind: "CrisisFlagSet", flag: "war", ttl: 3, active: true, cause }] });
    expect(r2.world.meta.turnLength).toBe(1);
    // r2 advanced by the pre-crisis length (2 weeks); the crisis ttl went 3 -> 2 at the end of the turn.
    expect(r2.world.meta.calendar.week).toBe(1 + 1 + 2);
    expect(r2.world.meta.crises[0]?.ttl).toBe(2);

    const r3 = step(r2.world, [], EMPTY_CONTENT); // ttl 2 -> 1, still active
    expect(r3.world.meta.turnLength).toBe(1);
    expect(r3.world.meta.calendar.week).toBe(1 + 1 + 2 + 1);
    const r4 = step(r3.world, [], EMPTY_CONTENT); // ttl 1 -> 0, expires
    expect(r4.world.meta.crises).toEqual([]);
    expect(r4.world.meta.turnLength).toBe(2);
    expect(r4.report.lines.some((l) => l.includes("rank: chief"))).toBe(true);
  });

  it("halts on a planted invariant violation in debug mode", () => {
    const w0 = createEmptyWorld("inv", setup, EMPTY_CONTENT.version);
    const broken = structuredClone(w0);
    broken.ledger.minted = 999; // accounts still sum to 0
    expect(() => step(broken, [], EMPTY_CONTENT)).toThrow(InvariantViolationError);
    expect(() => step(broken, [], EMPTY_CONTENT, { debug: false })).not.toThrow();
  });

  it("produces a player-facing report of money received", () => {
    const w0 = createEmptyWorld("rep", setup, EMPTY_CONTENT.version);
    const acct = playerCharacter(w0).accounts.personal;
    const r = step(w0, [], EMPTY_CONTENT, { injectFacts: [{ kind: "MoneyMint", to: acct, amount: 120, money: "dirty", source: "collections", cause }] });
    expect(r.report.lines).toContain("Received 120 kL (collections).");
  });
});
