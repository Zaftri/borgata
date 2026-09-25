// Tests for the phase-4 migration's six engine extensions (docs/NOW.md phase 4 task 1): the `sameEntity` and
// `bound` predicates, the `blockOf`/`chiefOf`/`membersOf` relations (and `crewOf` accepting a business anchor),
// the `$turnPlus` effect reference, the `each` effect, and the `state.` fn predicate prefix (`state.flipRoll`).

import { describe, expect, it } from "vitest";
import { addBlock, addBusiness, addTown } from "../fixtures.js";
import { addCharacter, addCrew, addFamily, createEmptyWorld, type World } from "../world.js";
import { EMPTY_CONTENT, type Content } from "../content-types.js";
import { evaluate, predicateFnNames, type Bindings } from "./predicates.js";
import { candidates, eachCandidates } from "./roles.js";
import { resolveEffect, type EffectContext } from "./effects.js";
import { runScheduler } from "./scheduler.js";
import type { Effect, EntityKind, EntityRef, Predicate, ProcessTemplate } from "./types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

function ref(kind: EntityKind, id: string): EntityRef {
  return { kind, id };
}

function freshWorld(seed = "extensions-test"): World {
  return createEmptyWorld(seed, setup, "t");
}

/** One town, one block, one business on it, one family/crew holding the block, chief C with members M1, M2, M3
 * (table order), all living and free. Shared by the relation and `each` tests below. */
function crewFixture(seed: string) {
  const world = freshWorld(seed);
  const town = addTown(world, { name: "Town", archetype: "city" });
  const block = addBlock(world, town.id);
  const business = addBusiness(world, block.id, { type: "shop", size: 1 });

  const head = addCharacter(world, { name: "Head", rank: "head" });
  const family = addFamily(world, { name: "Family", headId: head.id, townIds: [town.id] });
  const chief = addCharacter(world, { name: "Chief", rank: "chief" });
  const m1 = addCharacter(world, { name: "M1", rank: "soldier" });
  const m2 = addCharacter(world, { name: "M2", rank: "soldier" });
  const m3 = addCharacter(world, { name: "M3", rank: "soldier" });
  const crew = addCrew(world, family.id, chief.id, [m1.id, m2.id, m3.id], [block.id]);

  return { world, town, block, business, family, chief, m1, m2, m3, crew };
}

// =================================================================================================================
// Extension 1: `sameEntity`.
// =================================================================================================================

describe("evaluate: sameEntity", () => {
  it("is true when two roles are the same entity and is:true, false when is:true and they differ", () => {
    const world = freshWorld();
    const a = ref("character", "chr-1");
    const b = ref("character", "chr-1");
    const c = ref("character", "chr-2");
    expect(evaluate(world, { a, b }, { sameEntity: { a: "a", b: "b", is: true } })).toBe(true);
    expect(evaluate(world, { a, c }, { sameEntity: { a: "a", b: "c", is: true } })).toBe(false);
    expect(evaluate(world, { a, c }, { sameEntity: { a: "a", b: "c", is: false } })).toBe(true);
  });

  it("is false for is:true (and true for is:false) when either role is unbound", () => {
    const world = freshWorld();
    const a = ref("character", "chr-1");
    expect(evaluate(world, { a }, { sameEntity: { a: "a", b: "missing", is: true } })).toBe(false);
    expect(evaluate(world, { a }, { sameEntity: { a: "a", b: "missing", is: false } })).toBe(true);
  });

  it("compares kind as well as id: a character and a business with the same string id are not the same entity", () => {
    const world = freshWorld();
    const a = ref("character", "x-1");
    const b = ref("business", "x-1");
    expect(evaluate(world, { a, b }, { sameEntity: { a: "a", b: "b", is: true } })).toBe(false);
  });
});

// =================================================================================================================
// Extension 6: `bound`.
// =================================================================================================================

describe("evaluate: bound", () => {
  it("reports whether a role was bound at all, independent of the entity's own state", () => {
    const world = freshWorld();
    const a = ref("character", "chr-1");
    expect(evaluate(world, { a }, { bound: { role: "a", is: true } })).toBe(true);
    expect(evaluate(world, { a }, { bound: { role: "a", is: false } })).toBe(false);
    expect(evaluate(world, {}, { bound: { role: "a", is: true } })).toBe(false);
    expect(evaluate(world, {}, { bound: { role: "a", is: false } })).toBe(true);
  });
});

// =================================================================================================================
// Extension 2: `blockOf`, `chiefOf`, `membersOf`, and `crewOf` accepting a business anchor.
// =================================================================================================================

describe("roles.ts candidates: blockOf", () => {
  it("business -> its block", () => {
    const { world, block, business } = crewFixture("blockof-business");
    const got = candidates(world, "block", { role: "shop", relation: "blockOf" }, { shop: ref("business", business.id) });
    expect(got).toEqual([ref("block", block.id)]);
  });

  it("character -> the first block of the character's crew", () => {
    const { world, block, m1 } = crewFixture("blockof-character");
    const got = candidates(world, "block", { role: "who", relation: "blockOf" }, { who: ref("character", m1.id) });
    expect(got).toEqual([ref("block", block.id)]);
  });

  it("is empty for an anchor kind it does not support, or an unbound anchor", () => {
    const { world, family } = crewFixture("blockof-unsupported");
    expect(candidates(world, "block", { role: "f", relation: "blockOf" }, { f: ref("family", family.id) })).toEqual([]);
    expect(candidates(world, "block", { role: "missing", relation: "blockOf" }, {})).toEqual([]);
  });
});

describe("roles.ts candidates: crewOf accepting a business anchor", () => {
  it("business -> the crew holding its block", () => {
    const { world, business, crew } = crewFixture("crewof-business");
    const got = candidates(world, "crew", { role: "shop", relation: "crewOf" }, { shop: ref("business", business.id) });
    expect(got).toEqual([ref("crew", crew.id)]);
  });
});

describe("roles.ts candidates: chiefOf", () => {
  it("crew, block or business all resolve to the same chief character", () => {
    const { world, block, business, crew, chief } = crewFixture("chiefof");
    const want = [ref("character", chief.id)];
    expect(candidates(world, "character", { role: "c", relation: "chiefOf" }, { c: ref("crew", crew.id) })).toEqual(want);
    expect(candidates(world, "character", { role: "b", relation: "chiefOf" }, { b: ref("block", block.id) })).toEqual(want);
    expect(candidates(world, "character", { role: "s", relation: "chiefOf" }, { s: ref("business", business.id) })).toEqual(want);
  });
});

describe("roles.ts candidates: membersOf", () => {
  it("a crew's members, excluding the chief, in table order", () => {
    const { world, crew, m1, m2, m3 } = crewFixture("membersof");
    const got = candidates(world, "character", { role: "c", relation: "membersOf" }, { c: ref("crew", crew.id) });
    expect(got).toEqual([ref("character", m1.id), ref("character", m2.id), ref("character", m3.id)]);
  });
});

describe("roles.ts eachCandidates", () => {
  it("delegates to candidates() at the relation's fixed target kind (membersOf -> character)", () => {
    const { world, crew, m1, m2, m3 } = crewFixture("each-candidates");
    const got = eachCandidates(world, { c: ref("crew", crew.id) }, { role: "c", relation: "membersOf" });
    expect(got).toEqual([ref("character", m1.id), ref("character", m2.id), ref("character", m3.id)]);
  });

  it("is empty for a relation with no single target kind (not meaningful for `each`)", () => {
    const { world, town } = crewFixture("each-candidates-ambiguous");
    expect(eachCandidates(world, { t: ref("town", town.id) }, { role: "t", relation: "inTown" })).toEqual([]);
  });
});

// =================================================================================================================
// Extension 3: `{ $turnPlus: n }`.
// =================================================================================================================

describe("effects.ts resolveEffect: $turnPlus", () => {
  function ctx(turn: number): EffectContext {
    return { roles: {}, turn, instanceId: "proc-1", templateId: "t.test", causeChainId: "chain-1", cause: { rule: "test" } };
  }

  it("resolves to ctx.turn + n on a fact field", () => {
    const world = freshWorld();
    const effect: Effect = {
      fact: "StatusChange",
      characterId: "chr-1",
      status: "arrested",
      untilTurn: { $turnPlus: 4 },
      cause: { rule: "test" },
    };
    const resolved = resolveEffect(world, effect, ctx(10));
    expect(resolved).toEqual({
      kind: "fact",
      fact: {
        kind: "StatusChange",
        characterId: "chr-1",
        status: "arrested",
        untilTurn: 14,
        cause: { rule: "test", instanceId: "proc-1", templateId: "t.test" },
      },
    });
  });

  it("tracks turn: the same effect resolves differently at a different ctx.turn", () => {
    const world = freshWorld();
    const effect: Effect = { fact: "StatusChange", characterId: "chr-1", status: "jailed", untilTurn: { $turnPlus: 1 }, cause: { rule: "test" } };
    const at0 = resolveEffect(world, effect, ctx(0));
    const at100 = resolveEffect(world, effect, ctx(100));
    expect(at0?.kind).toBe("fact");
    expect(at100?.kind).toBe("fact");
    if (at0?.kind === "fact" && at0.fact.kind === "StatusChange") expect(at0.fact.untilTurn).toBe(1);
    if (at100?.kind === "fact" && at100.fact.kind === "StatusChange") expect(at100.fact.untilTurn).toBe(101);
  });
});

// =================================================================================================================
// Extension 4: the `each` effect (integration through the scheduler, since expansion happens in applyEffects).
// =================================================================================================================

function tpl(overrides: Partial<ProcessTemplate> & { id: string }): ProcessTemplate {
  return {
    version: 1,
    kind: "event",
    scope: "family",
    lane: "families",
    roles: {},
    preconditions: [],
    duration: 0,
    resolve: [{ id: "out", effects: [] }],
    followUps: [],
    tags: ["test"],
    ...overrides,
  };
}

function content(templates: ProcessTemplate[]): Content {
  return { ...EMPTY_CONTENT, version: "test", templates };
}

describe("engine/types.ts each effect, expanded by scheduler.ts applyEffects", () => {
  it("applies the inner effects once per crew member, excluding one via sameEntity in `where`, table order", () => {
    const { world, m1, m2, m3 } = crewFixture("each-effect");

    const template = tpl({
      id: "t.eachMembers",
      spawn: { weight: 10_000, per: "crew" },
      roles: {
        crew: { entity: "crew", pick: "first" },
        skip: { entity: "character", from: { role: "crew", relation: "membersOf" }, pick: "first" },
      },
      duration: 0,
      resolve: [
        {
          id: "out",
          effects: [
            {
              each: {
                from: "crew",
                relation: "membersOf",
                as: "member",
                where: [{ sameEntity: { a: "member", b: "skip", is: false } }],
                effects: [{ fact: "LoyaltyDelta", characterId: "$member", delta: -1, cause: { rule: "test.each" } }],
              },
            },
          ],
        },
      ],
    });

    const facts = runScheduler(world, content([template]), []);
    const deltas = facts.filter((f) => f.kind === "LoyaltyDelta");
    // "skip" binds to the first membersOf candidate (table order: m1), so only m2 and m3 are affected.
    expect(deltas).toEqual([
      { kind: "LoyaltyDelta", characterId: m2.id, delta: -1, cause: expect.objectContaining({ rule: "test.each" }) },
      { kind: "LoyaltyDelta", characterId: m3.id, delta: -1, cause: expect.objectContaining({ rule: "test.each" }) },
    ]);
    expect(deltas.some((f) => f.kind === "LoyaltyDelta" && f.characterId === m1.id)).toBe(false);
  });

  it("expands to nothing when the anchor role is unbound (no error)", () => {
    const { world } = crewFixture("each-unbound");
    const template = tpl({
      id: "t.eachUnbound",
      spawn: { weight: 10_000, per: "family" },
      roles: {},
      resolve: [
        {
          id: "out",
          effects: [
            {
              each: {
                from: "nope",
                relation: "membersOf",
                as: "x",
                effects: [{ fact: "LoyaltyDelta", characterId: "$x", delta: -1, cause: { rule: "test" } }],
              },
            },
          ],
        },
      ],
    });
    const facts = runScheduler(world, content([template]), []);
    expect(facts.some((f) => f.kind === "LoyaltyDelta")).toBe(false);
  });
});

// =================================================================================================================
// Extension 5: `state.` fn predicates (state.flipRoll), including the memoization documented in predicates.ts.
// =================================================================================================================

describe("predicates.ts: state.flipRoll", () => {
  it("is registered under the state. prefix", () => {
    expect(predicateFnNames()).toContain("state.flipRoll");
  });

  it("is false when the suspect role is unbound or not a character (no candidate to draw against)", () => {
    const world = freshWorld("flip-unbound");
    expect(evaluate(world, {}, { fn: { name: "state.flipRoll" } })).toBe(false);
    expect(evaluate(world, { suspect: ref("business", "biz-1") }, { fn: { name: "state.flipRoll" } })).toBe(false);
  });

  it("never returns true for a playerControlled candidate, however extreme the pressure", () => {
    const { world, m1 } = crewFixture("flip-player");
    const c = world.characters.byId[m1.id]!;
    c.exposure = 900;
    c.playerControlled = true;
    const roles: Bindings = { suspect: ref("character", m1.id) };
    expect(evaluate(world, roles, { fn: { name: "state.flipRoll" } })).toBe(false);
  });

  it("draws exactly once per resolution: a second evaluation against the same bindings object does not touch the stream again", () => {
    const { world, m1 } = crewFixture("flip-memo");
    const c = world.characters.byId[m1.id]!;
    c.exposure = 500;
    c.loyalty = 500; // a middling gap: the actual draw matters, so a second real draw could disagree
    const roles: Bindings = { suspect: ref("character", m1.id) };
    const p: Predicate = { fn: { name: "state.flipRoll" } };

    const first = evaluate(world, roles, p);
    const rawStreamBefore = JSON.stringify(world.rng.streams["state.flip"]);
    const second = evaluate(world, roles, p);
    const rawStreamAfter = JSON.stringify(world.rng.streams["state.flip"]);

    expect(second).toBe(first); // memoized: never disagrees with itself within one resolution
    expect(rawStreamAfter).toBe(rawStreamBefore); // and the second call never drew again

    // A fresh bindings object (a new resolution) is free to draw again; it must still return a boolean.
    const freshRoles: Bindings = { suspect: ref("character", m1.id) };
    expect(typeof evaluate(world, freshRoles, p)).toBe("boolean");
  });
});
