// Tests for the event engine's evaluator (design 04 §1): predicates.ts, roles.ts, effects.ts.

import { describe, expect, it } from "vitest";
import { id, mintId, tableInsert, type CharacterId, type ProcessInstanceId } from "@borgata/shared";
import { addTown } from "../fixtures.js";
import { buildStarterWorld } from "../starter.js";
import { EMPTY_CONTENT } from "../content-types.js";
import { createRngState, getStream } from "../rng.js";
import { addCharacter, createEmptyWorld, playerCharacter, type Character, type World } from "../world.js";
import { evaluate, evaluateAll, predicateFnNames, registerPredicateFn, type Bindings } from "./predicates.js";
import { bindRoles, candidates } from "./roles.js";
import { resolveEffect, type EffectContext } from "./effects.js";
import type { Effect, EntityKind, EntityRef, Predicate, ProcessInstance, RoleSelector } from "./types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

registerPredicateFn("test.hasArg", (_world, _roles, args) => args["flag"] === true);

function freshWorld(seed = "evaluator-test"): World {
  return createEmptyWorld(seed, setup, EMPTY_CONTENT.version);
}

function starterWorld(seed = "evaluator-starter"): World {
  return buildStarterWorld(seed, setup, EMPTY_CONTENT);
}

function ref(kind: EntityKind, entityId: string): EntityRef {
  return { kind, id: entityId };
}

function byName(world: World, name: string): Character {
  const cid = world.characters.order.find((c) => world.characters.byId[c]!.name === name);
  if (!cid) throw new Error(`character "${name}" not found`);
  return world.characters.byId[cid]!;
}

function insertProcess(world: World, templateId: string, roles: Record<string, EntityRef> = {}): ProcessInstance {
  const procId = mintId<"ProcessInstanceId">(world.meta.ids, "proc") as ProcessInstanceId;
  const inst: ProcessInstance = {
    id: procId,
    templateId: id(templateId),
    templateVersion: 1,
    kind: "event",
    lane: "civil",
    state: "active",
    roles,
    startedTurn: world.meta.turn,
    resolveTurn: world.meta.turn + 1,
    progress: 0,
    locks: [],
    causeChainId: "chain-1",
    priority: 0,
  };
  tableInsert(world.processes, procId, inst);
  return inst;
}

// =================================================================================================================
// predicates.ts
// =================================================================================================================

describe("evaluate: all / any / not", () => {
  it("all is true only when every sub-predicate holds", () => {
    const world = freshWorld();
    const t: Predicate = { fn: { name: "always" } };
    const f: Predicate = { fn: { name: "never" } };
    expect(evaluate(world, {}, { all: [t, t] })).toBe(true);
    expect(evaluate(world, {}, { all: [t, f] })).toBe(false);
    expect(evaluate(world, {}, { all: [] })).toBe(true);
  });

  it("any is true when at least one sub-predicate holds", () => {
    const world = freshWorld();
    const t: Predicate = { fn: { name: "always" } };
    const f: Predicate = { fn: { name: "never" } };
    expect(evaluate(world, {}, { any: [f, t] })).toBe(true);
    expect(evaluate(world, {}, { any: [f, f] })).toBe(false);
    expect(evaluate(world, {}, { any: [] })).toBe(false);
  });

  it("not inverts its sub-predicate", () => {
    const world = freshWorld();
    expect(evaluate(world, {}, { not: { fn: { name: "always" } } })).toBe(false);
    expect(evaluate(world, {}, { not: { fn: { name: "never" } } })).toBe(true);
  });

  it("evaluateAll requires every predicate in the list to hold", () => {
    const world = freshWorld();
    const t: Predicate = { fn: { name: "always" } };
    const f: Predicate = { fn: { name: "never" } };
    expect(evaluateAll(world, {}, [t, t])).toBe(true);
    expect(evaluateAll(world, {}, [t, f])).toBe(false);
    expect(evaluateAll(world, {}, [])).toBe(true);
  });
});

describe("evaluate: cmp", () => {
  it("compares a numeric path on the bound entity for every operator", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco"); // loyalty 500 by default
    const roles: Bindings = { c: ref("character", soldier1.id) };
    expect(evaluate(world, roles, { cmp: { role: "c", path: "loyalty", op: "eq", value: 500 } })).toBe(true);
    expect(evaluate(world, roles, { cmp: { role: "c", path: "loyalty", op: "ne", value: 500 } })).toBe(false);
    expect(evaluate(world, roles, { cmp: { role: "c", path: "loyalty", op: "gte", value: 500 } })).toBe(true);
    expect(evaluate(world, roles, { cmp: { role: "c", path: "loyalty", op: "gt", value: 500 } })).toBe(false);
    expect(evaluate(world, roles, { cmp: { role: "c", path: "loyalty", op: "lte", value: 500 } })).toBe(true);
    expect(evaluate(world, roles, { cmp: { role: "c", path: "loyalty", op: "lt", value: 500 } })).toBe(false);
  });

  it("is false when the path is missing or non-numeric, or the role is unbound", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco");
    const roles: Bindings = { c: ref("character", soldier1.id) };
    expect(evaluate(world, roles, { cmp: { role: "c", path: "noSuchField", op: "gte", value: 0 } })).toBe(false);
    expect(evaluate(world, roles, { cmp: { role: "c", path: "name", op: "gte", value: 0 } })).toBe(false); // non-numeric
    expect(evaluate(world, {}, { cmp: { role: "missing", path: "loyalty", op: "gte", value: 0 } })).toBe(false);
  });

  it("reads TownState paths before falling back to the Town record", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Enna", archetype: "rural", population: 4200 });
    world.towns.byId[town.id]!.sentiment = -200;
    const roles: Bindings = { t: ref("town", town.id) };
    expect(evaluate(world, roles, { cmp: { role: "t", path: "sentiment", op: "eq", value: -200 } })).toBe(true);
    expect(evaluate(world, roles, { cmp: { role: "t", path: "population", op: "eq", value: 4200 } })).toBe(true);
  });
});

describe("evaluate: band", () => {
  it("reads a family's attentionBand directly, and via a character's familyId", () => {
    const world = starterWorld();
    const family = world.families.byId[world.families.order[0]!]!;
    const chief = byName(world, "Turi Lo Cascio");
    expect(evaluate(world, { f: ref("family", family.id) }, { band: { role: "f", gte: 0, lte: 0 } })).toBe(true);
    expect(evaluate(world, { c: ref("character", chief.id) }, { band: { role: "c", gte: 0, lte: 0 } })).toBe(true);
    expect(evaluate(world, { c: ref("character", chief.id) }, { band: { role: "c", gte: 1 } })).toBe(false);
  });

  it("is false when the role has no family and for kinds that are neither family nor character", () => {
    const world = starterWorld();
    const family = world.families.byId[world.families.order[0]!]!;
    const civilian = addCharacter(world, { name: "Nobody" }); // no familyId
    expect(evaluate(world, { c: ref("character", civilian.id) }, { band: { role: "c", gte: 0 } })).toBe(false);
    expect(evaluate(world, { f: ref("family", family.id) }, { band: { role: "missing", gte: 0 } })).toBe(false);
  });
});

describe("evaluate: heat", () => {
  it("reads town heat directly, and resolved through a business or a character's crew block", () => {
    const world = starterWorld();
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const blockB = world.geo.blocks.byId[town.blockIds[1]!]!;
    const business = world.geo.businesses.byId[blockB.businessIds[0]!]!;
    const soldier1 = byName(world, "Nino Bracco"); // crew's first block is blockA, same town
    world.pressure.heatByTown[town.id] = 250;

    expect(evaluate(world, { t: ref("town", town.id) }, { heat: { role: "t", gte: 200 } })).toBe(true);
    expect(evaluate(world, { t: ref("town", town.id) }, { heat: { role: "t", gte: 300 } })).toBe(false);
    expect(evaluate(world, { b: ref("business", business.id) }, { heat: { role: "b", lte: 300 } })).toBe(true);
    expect(evaluate(world, { c: ref("character", soldier1.id) }, { heat: { role: "c", gte: 250, lte: 250 } })).toBe(true);
  });

  it("defaults unset heat to 0 and is false when the role cannot resolve to a town", () => {
    const world = starterWorld();
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const player = playerCharacter(world); // no crewId in the starter world
    expect(evaluate(world, { t: ref("town", town.id) }, { heat: { role: "t", lte: 0 } })).toBe(true);
    expect(evaluate(world, { c: ref("character", player.id) }, { heat: { role: "c", gte: 0 } })).toBe(false);
    const family = world.families.byId[world.families.order[0]!]!;
    expect(evaluate(world, { f: ref("family", family.id) }, { heat: { role: "f", gte: 0 } })).toBe(false);
  });
});

describe("evaluate: has", () => {
  it("checks traits, family tools and memory tags", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco");
    soldier1.traits.push("talker");
    soldier1.memory.push({ tag: "betrayed", weight: 10, turn: 0 });
    const family = world.families.byId[world.families.order[0]!]!;
    world.pressure.toolsByFamily[family.id] = ["patrols"];

    const c: Bindings = { c: ref("character", soldier1.id) };
    expect(evaluate(world, c, { has: { role: "c", trait: "talker" } })).toBe(true);
    expect(evaluate(world, c, { has: { role: "c", trait: "coward" } })).toBe(false);
    expect(evaluate(world, c, { has: { role: "c", tool: "patrols" } })).toBe(true); // via character's familyId
    expect(evaluate(world, c, { has: { role: "c", tool: "wiretaps" } })).toBe(false);
    expect(evaluate(world, c, { has: { role: "c", memoryTag: "betrayed" } })).toBe(true);
    expect(evaluate(world, c, { has: { role: "c", memoryTag: "nothing" } })).toBe(false);
  });

  it("is false for an unbound role or when none of trait/tool/memoryTag is given", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco");
    expect(evaluate(world, {}, { has: { role: "missing", trait: "talker" } })).toBe(false);
    expect(evaluate(world, { c: ref("character", soldier1.id) }, { has: { role: "c" } })).toBe(false);
  });
});

describe("evaluate: status, rank, alive, playerControlled", () => {
  it("status matches a single value or membership in an array, on characters only", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco"); // status "free"
    const c: Bindings = { c: ref("character", soldier1.id) };
    expect(evaluate(world, c, { status: { role: "c", is: "free" } })).toBe(true);
    expect(evaluate(world, c, { status: { role: "c", is: "jailed" } })).toBe(false);
    expect(evaluate(world, c, { status: { role: "c", is: ["free", "hiding"] } })).toBe(true);
    expect(evaluate(world, c, { status: { role: "c", is: ["jailed", "arrested"] } })).toBe(false);
    const family = world.families.byId[world.families.order[0]!]!;
    expect(evaluate(world, { f: ref("family", family.id) }, { status: { role: "f", is: "free" } })).toBe(false);
  });

  it("rank checks membership in a list of ranks", () => {
    const world = starterWorld();
    const chief = byName(world, "Turi Lo Cascio");
    const c: Bindings = { c: ref("character", chief.id) };
    expect(evaluate(world, c, { rank: { role: "c", in: ["chief", "underboss"] } })).toBe(true);
    expect(evaluate(world, c, { rank: { role: "c", in: ["soldier"] } })).toBe(false);
  });

  it("alive is true for a living character and false otherwise", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco");
    expect(evaluate(world, { c: ref("character", soldier1.id) }, { alive: { role: "c" } })).toBe(true);
    soldier1.alive = false;
    expect(evaluate(world, { c: ref("character", soldier1.id) }, { alive: { role: "c" } })).toBe(false);
    const family = world.families.byId[world.families.order[0]!]!;
    expect(evaluate(world, { f: ref("family", family.id) }, { alive: { role: "f" } })).toBe(false);
  });

  it("playerControlled matches the character's flag against `is`", () => {
    const world = starterWorld();
    const player = playerCharacter(world);
    const soldier1 = byName(world, "Nino Bracco");
    expect(evaluate(world, { c: ref("character", player.id) }, { playerControlled: { role: "c", is: true } })).toBe(true);
    expect(evaluate(world, { c: ref("character", soldier1.id) }, { playerControlled: { role: "c", is: false } })).toBe(true);
    expect(evaluate(world, { c: ref("character", soldier1.id) }, { playerControlled: { role: "c", is: true } })).toBe(false);
  });
});

describe("evaluate: recent", () => {
  it("matches a fact kind within the turn window, optionally restricted to a role's id", () => {
    const world = starterWorld();
    world.meta.turn = 10;
    const soldier1 = byName(world, "Nino Bracco");
    const soldier2 = byName(world, "Pino Randazzo");
    world.history.recentFacts.push({ turn: 8, kind: "LoyaltyDelta", subjects: [soldier1.id] });
    world.history.recentFacts.push({ turn: 2, kind: "LoyaltyDelta", subjects: [soldier2.id] });

    const roles: Bindings = { target: ref("character", soldier1.id) };
    expect(evaluate(world, roles, { recent: { factKind: "LoyaltyDelta", role: "target", withinTurns: 5 } })).toBe(true);
    expect(evaluate(world, roles, { recent: { factKind: "LoyaltyDelta", role: "target", withinTurns: 1 } })).toBe(false);
    const otherRoles: Bindings = { target: ref("character", soldier2.id) };
    expect(evaluate(world, otherRoles, { recent: { factKind: "LoyaltyDelta", role: "target", withinTurns: 5 } })).toBe(false);
    expect(evaluate(world, {}, { recent: { factKind: "LoyaltyDelta", withinTurns: 5 } })).toBe(true); // no role restriction
  });
});

describe("evaluate: flag", () => {
  it("checks presence of a crisis flag against `active`", () => {
    const world = starterWorld();
    world.meta.crises.push({ flag: "war", ttl: 5, cause: "test" });
    expect(evaluate(world, {}, { flag: { name: "war", active: true } })).toBe(true);
    expect(evaluate(world, {}, { flag: { name: "war", active: false } })).toBe(false);
    expect(evaluate(world, {}, { flag: { name: "trial", active: false } })).toBe(true);
    expect(evaluate(world, {}, { flag: { name: "trial", active: true } })).toBe(false);
  });
});

describe("evaluate: activeTemplate", () => {
  it("finds an active instance of a template, optionally bound to a role", () => {
    const world = starterWorld();
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const blockA = world.geo.blocks.byId[town.blockIds[0]!]!;
    const bizId = blockA.businessIds[0]!;
    insertProcess(world, "civil.refusal.start", { shop: ref("business", bizId) });

    expect(evaluate(world, {}, { activeTemplate: { templateId: "civil.refusal.start", exists: true } })).toBe(true);
    expect(evaluate(world, {}, { activeTemplate: { templateId: "operation.arson", exists: true } })).toBe(false);
    expect(evaluate(world, {}, { activeTemplate: { templateId: "civil.refusal.start", exists: false } })).toBe(false);

    const matching: Bindings = { shop: ref("business", bizId) };
    expect(evaluate(world, matching, { activeTemplate: { templateId: "civil.refusal.start", role: "shop", exists: true } })).toBe(true);

    const otherBiz = blockA.businessIds[1]!;
    const nonMatching: Bindings = { shop: ref("business", otherBiz) };
    expect(evaluate(world, nonMatching, { activeTemplate: { templateId: "civil.refusal.start", role: "shop", exists: true } })).toBe(false);

    expect(evaluate(world, {}, { activeTemplate: { templateId: "civil.refusal.start", role: "shop", exists: true } })).toBe(false);
    expect(evaluate(world, {}, { activeTemplate: { templateId: "civil.refusal.start", role: "shop", exists: false } })).toBe(true);
  });
});

describe("evaluate: fn", () => {
  it("dispatches to the registry, including the always/never built-ins, and passes args through", () => {
    const world = freshWorld();
    expect(evaluate(world, {}, { fn: { name: "always" } })).toBe(true);
    expect(evaluate(world, {}, { fn: { name: "never" } })).toBe(false);
    expect(evaluate(world, {}, { fn: { name: "test.hasArg", args: { flag: true } } })).toBe(true);
    expect(evaluate(world, {}, { fn: { name: "test.hasArg", args: { flag: false } } })).toBe(false);
    expect(predicateFnNames()).toEqual(expect.arrayContaining(["always", "never", "test.hasArg"]));
  });

  it("throws for an unregistered name", () => {
    const world = freshWorld();
    expect(() => evaluate(world, {}, { fn: { name: "no.such.predicate" } })).toThrow();
  });
});

// =================================================================================================================
// roles.ts: candidates
// =================================================================================================================

describe("candidates: without `from`", () => {
  it("returns every entity of the kind, in table order", () => {
    const world = starterWorld();
    expect(candidates(world, "character", undefined, {}).map((r) => r.id)).toEqual(world.characters.order);
    expect(candidates(world, "town", undefined, {}).map((r) => r.id)).toEqual(world.geo.towns.order);
  });
});

describe("candidates: relations", () => {
  it("inTown restricts characters, businesses and blocks to the town", () => {
    const world = starterWorld();
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const chief = byName(world, "Turi Lo Cascio");
    const soldier1 = byName(world, "Nino Bracco");
    const soldier2 = byName(world, "Pino Randazzo");
    const from: RoleSelector["from"] = { role: "town", relation: "inTown" };
    const roles: Bindings = { town: ref("town", town.id) };

    expect(candidates(world, "character", from, roles).map((r) => r.id).sort()).toEqual(
      [chief.id, soldier1.id, soldier2.id].sort(),
    );
    // The world now has two towns (starter.ts); restrict the expectation to this town's own blocks'
    // businesses rather than every business in the world.
    const expectedBusinessIds = town.blockIds.flatMap((id) => world.geo.blocks.byId[id]!.businessIds);
    expect(candidates(world, "business", from, roles).map((r) => r.id)).toEqual(expectedBusinessIds);
    expect(candidates(world, "block", from, roles).map((r) => r.id)).toEqual(town.blockIds);
  });

  it("inTown is empty when the anchor is not a town", () => {
    const world = starterWorld();
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const blockA = ref("block", town.blockIds[0]!);
    expect(candidates(world, "character", { role: "block", relation: "inTown" }, { block: blockA })).toEqual([]);
  });

  it("inCrew returns crew members plus the chief", () => {
    const world = starterWorld();
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const chief = byName(world, "Turi Lo Cascio");
    const soldier1 = byName(world, "Nino Bracco");
    const soldier2 = byName(world, "Pino Randazzo");
    const result = candidates(world, "character", { role: "crew", relation: "inCrew" }, { crew: ref("crew", crew.id) });
    expect(result.map((r) => r.id).sort()).toEqual([chief.id, soldier1.id, soldier2.id].sort());
    expect(candidates(world, "business", { role: "crew", relation: "inCrew" }, { crew: ref("crew", crew.id) })).toEqual([]);
  });

  it("inFamily returns family characters (including the player), crews and towns", () => {
    const world = starterWorld();
    const family = world.families.byId[world.families.order[0]!]!;
    const player = playerCharacter(world);
    const head = byName(world, "Don Calogero Ferrante");
    const chief = byName(world, "Turi Lo Cascio");
    const soldier1 = byName(world, "Nino Bracco");
    const soldier2 = byName(world, "Pino Randazzo");
    const roles: Bindings = { fam: ref("family", family.id) };
    const from: RoleSelector["from"] = { role: "fam", relation: "inFamily" };

    expect(candidates(world, "character", from, roles).map((r) => r.id).sort()).toEqual(
      [player.id, head.id, chief.id, soldier1.id, soldier2.id].sort(),
    );
    expect(candidates(world, "crew", from, roles).map((r) => r.id)).toEqual(family.crewIds);
    expect(candidates(world, "town", from, roles).map((r) => r.id)).toEqual(family.townIds);
  });

  it("superiorOf returns the single superior, or nothing", () => {
    const world = starterWorld();
    const chief = byName(world, "Turi Lo Cascio");
    const head = byName(world, "Don Calogero Ferrante");
    const from: RoleSelector["from"] = { role: "c", relation: "superiorOf" };
    expect(candidates(world, "character", from, { c: ref("character", chief.id) }).map((r) => r.id)).toEqual([head.id]);
    expect(candidates(world, "character", from, { c: ref("character", head.id) })).toEqual([]);
  });

  it("subordinatesOf returns every character whose superiorId matches", () => {
    const world = starterWorld();
    const chief = byName(world, "Turi Lo Cascio");
    const soldier1 = byName(world, "Nino Bracco");
    const soldier2 = byName(world, "Pino Randazzo");
    const player = playerCharacter(world);
    const from: RoleSelector["from"] = { role: "c", relation: "subordinatesOf" };
    expect(candidates(world, "character", from, { c: ref("character", chief.id) }).map((r) => r.id).sort()).toEqual(
      [soldier1.id, soldier2.id].sort(),
    );
    expect(candidates(world, "character", from, { c: ref("character", soldier1.id) }).map((r) => r.id)).toEqual([player.id]);
  });

  it("businessesOf resolves from a block, a town or a crew", () => {
    const world = starterWorld();
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const blockA = world.geo.blocks.byId[town.blockIds[0]!]!;
    const crew = world.crews.byId[world.crews.order[0]!]!;

    // The world now has two towns and two crews (starter.ts); the town and crew here are both this
    // town's (Borgo's blocks are the only ones this crew and town own), so the expectation is scoped
    // to this town's own blocks' businesses, not every business in the world.
    const expectedBusinessIds = town.blockIds.flatMap((id) => world.geo.blocks.byId[id]!.businessIds);
    expect(candidates(world, "business", { role: "b", relation: "businessesOf" }, { b: ref("block", blockA.id) }).map((r) => r.id)).toEqual(
      blockA.businessIds,
    );
    expect(candidates(world, "business", { role: "t", relation: "businessesOf" }, { t: ref("town", town.id) }).map((r) => r.id)).toEqual(
      expectedBusinessIds,
    );
    expect(candidates(world, "business", { role: "cr", relation: "businessesOf" }, { cr: ref("crew", crew.id) }).map((r) => r.id)).toEqual(
      expectedBusinessIds,
    );
  });

  it("townOf resolves from a block, a business, a crew and a character", () => {
    const world = starterWorld();
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const blockB = world.geo.blocks.byId[town.blockIds[1]!]!;
    const business = world.geo.businesses.byId[blockB.businessIds[0]!]!;
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const soldier1 = byName(world, "Nino Bracco");
    const player = playerCharacter(world);
    const from: RoleSelector["from"] = { role: "x", relation: "townOf" };

    expect(candidates(world, "town", from, { x: ref("block", blockB.id) }).map((r) => r.id)).toEqual([town.id]);
    expect(candidates(world, "town", from, { x: ref("business", business.id) }).map((r) => r.id)).toEqual([town.id]);
    expect(candidates(world, "town", from, { x: ref("crew", crew.id) }).map((r) => r.id)).toEqual([town.id]);
    expect(candidates(world, "town", from, { x: ref("character", soldier1.id) }).map((r) => r.id)).toEqual([town.id]);
    expect(candidates(world, "town", from, { x: ref("character", player.id) })).toEqual([]); // no crew
  });

  it("crewOf resolves from a character and a block", () => {
    const world = starterWorld();
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const soldier1 = byName(world, "Nino Bracco");
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const blockA = ref("block", town.blockIds[0]!);
    const player = playerCharacter(world);
    const from: RoleSelector["from"] = { role: "x", relation: "crewOf" };

    expect(candidates(world, "crew", from, { x: ref("character", soldier1.id) }).map((r) => r.id)).toEqual([crew.id]);
    expect(candidates(world, "crew", from, { x: blockA }).map((r) => r.id)).toEqual([crew.id]);
    expect(candidates(world, "crew", from, { x: ref("character", player.id) })).toEqual([]);
  });

  it("familyOf resolves from a character, a crew and a town", () => {
    const world = starterWorld();
    const family = world.families.byId[world.families.order[0]!]!;
    const chief = byName(world, "Turi Lo Cascio");
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const from: RoleSelector["from"] = { role: "x", relation: "familyOf" };

    expect(candidates(world, "family", from, { x: ref("character", chief.id) }).map((r) => r.id)).toEqual([family.id]);
    expect(candidates(world, "family", from, { x: ref("crew", crew.id) }).map((r) => r.id)).toEqual([family.id]);
    expect(candidates(world, "family", from, { x: ref("town", town.id) }).map((r) => r.id)).toEqual([family.id]);
  });

  it("returns [] when the anchor role is not bound at all", () => {
    const world = starterWorld();
    expect(candidates(world, "character", { role: "missing", relation: "inCrew" }, {})).toEqual([]);
  });
});

// =================================================================================================================
// roles.ts: bindRoles
// =================================================================================================================

describe("bindRoles", () => {
  it("picks 'first' in table order among filtered candidates", () => {
    const world = starterWorld();
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const chief = byName(world, "Turi Lo Cascio");
    const selectors: Record<string, RoleSelector> = {
      member: { entity: "character", from: { role: "crew", relation: "inCrew" }, pick: "first" },
    };
    const bound = bindRoles(world, selectors, { crew: ref("crew", crew.id) }, getStream(world.rng, "test.pick"));
    expect(bound).not.toBeNull();
    expect(bound!["member"]).toEqual(ref("character", chief.id));
  });

  it("picks 'highest:path' and 'lowest:path' with the numeric loyalty field", () => {
    const world = starterWorld();
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const soldier1 = byName(world, "Nino Bracco");
    const soldier2 = byName(world, "Pino Randazzo");
    soldier1.loyalty = 600;
    soldier2.loyalty = 300;

    const highest = bindRoles(
      world,
      { m: { entity: "character", from: { role: "crew", relation: "inCrew" }, pick: "highest:loyalty" } },
      { crew: ref("crew", crew.id) },
      getStream(world.rng, "test.pick"),
    );
    expect(highest!["m"]).toEqual(ref("character", soldier1.id));

    const lowest = bindRoles(
      world,
      { m: { entity: "character", from: { role: "crew", relation: "inCrew" }, pick: "lowest:loyalty" } },
      { crew: ref("crew", crew.id) },
      getStream(world.rng, "test.pick"),
    );
    expect(lowest!["m"]).toEqual(ref("character", soldier2.id));
  });

  it("picks 'random' deterministically from the stream's state", () => {
    const world1 = starterWorld("bind-random");
    const world2 = starterWorld("bind-random");
    const crew1 = world1.crews.byId[world1.crews.order[0]!]!;
    const crew2 = world2.crews.byId[world2.crews.order[0]!]!;
    const selectors: Record<string, RoleSelector> = {
      m: { entity: "character", from: { role: "crew", relation: "inCrew" }, pick: "random" },
    };
    const a = bindRoles(world1, selectors, { crew: ref("crew", crew1.id) }, getStream(createRngState("same-seed"), "s"));
    const b = bindRoles(world2, selectors, { crew: ref("crew", crew2.id) }, getStream(createRngState("same-seed"), "s"));
    expect(a).toEqual(b);
  });

  it("filters candidates with `where`, evaluated against $candidate and bound roles", () => {
    const world = starterWorld();
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const soldier1 = byName(world, "Nino Bracco");
    const soldier2 = byName(world, "Pino Randazzo");
    soldier1.loyalty = 600;
    soldier2.loyalty = 300;
    const selectors: Record<string, RoleSelector> = {
      m: {
        entity: "character",
        from: { role: "crew", relation: "inCrew" },
        where: [{ cmp: { role: "$candidate", path: "loyalty", op: "gte", value: 550 } }],
        pick: "first",
      },
    };
    const bound = bindRoles(world, selectors, { crew: ref("crew", crew.id) }, getStream(world.rng, "test.pick"));
    expect(bound!["m"]).toEqual(ref("character", soldier1.id)); // only soldier1 (600) clears the 550 threshold; chief (500) and soldier2 (300) do not
  });

  it("leaves an optional role unbound rather than failing, when it has no candidates", () => {
    const world = starterWorld();
    const head = byName(world, "Don Calogero Ferrante"); // no superior
    const selectors: Record<string, RoleSelector> = {
      boss: { entity: "character", from: { role: "head", relation: "superiorOf" }, pick: "first", optional: true },
    };
    const bound = bindRoles(world, selectors, { head: ref("character", head.id) }, getStream(world.rng, "test.pick"));
    expect(bound).not.toBeNull();
    expect("boss" in bound!).toBe(false);
  });

  it("fails the whole binding when a required role has no candidates", () => {
    const world = starterWorld();
    const head = byName(world, "Don Calogero Ferrante");
    const selectors: Record<string, RoleSelector> = {
      boss: { entity: "character", from: { role: "head", relation: "superiorOf" }, pick: "first" },
    };
    const bound = bindRoles(world, selectors, { head: ref("character", head.id) }, getStream(world.rng, "test.pick"));
    expect(bound).toBeNull();
  });

  it("skips roles already present in `prebound`", () => {
    const world = starterWorld();
    const soldier2 = byName(world, "Pino Randazzo");
    const preboundRef = ref("character", soldier2.id);
    const selectors: Record<string, RoleSelector> = {
      target: { entity: "character", pick: "first" }, // would otherwise pick the player, first in table order
    };
    const bound = bindRoles(world, selectors, { target: preboundRef }, getStream(world.rng, "test.pick"));
    expect(bound!["target"]).toEqual(preboundRef);
  });

  it("resolves selectors in declared key order, so a role can depend only on one declared earlier", () => {
    const world = starterWorld();
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    const chief = byName(world, "Turi Lo Cascio");

    const correctOrder: Record<string, RoleSelector> = {
      town: { entity: "town", pick: "first" },
      leader: { entity: "character", from: { role: "town", relation: "inTown" }, pick: "highest:loyalty" },
    };
    const ok = bindRoles(world, correctOrder, {}, getStream(world.rng, "test.pick"));
    expect(ok).not.toBeNull();
    expect(ok!["leader"]).toEqual(ref("character", chief.id));

    const wrongOrder: Record<string, RoleSelector> = {
      leader: { entity: "character", from: { role: "town", relation: "inTown" }, pick: "highest:loyalty" },
      town: { entity: "town", pick: "first" },
    };
    const fails = bindRoles(world, wrongOrder, {}, getStream(world.rng, "test.pick"));
    expect(fails).toBeNull(); // "town" is not bound yet when "leader" is resolved
    expect(town.id).toBeTruthy(); // town fixture used above only for the assertion on chief
  });
});

// =================================================================================================================
// effects.ts: resolveEffect
// =================================================================================================================

function makeCtx(world: World, roles: Bindings, overrides: Partial<EffectContext> = {}): EffectContext {
  return {
    roles,
    turn: world.meta.turn,
    instanceId: "proc-1",
    templateId: "tmpl.test",
    causeChainId: "chain-1",
    cause: { rule: "base.rule" },
    ...overrides,
  };
}

describe("resolveEffect: fact construction", () => {
  it("resolves $role to the entity id (LoyaltyDelta)", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco");
    const effect: Effect = { fact: "LoyaltyDelta", characterId: "$target", delta: -150 };
    const resolved = resolveEffect(world, effect, makeCtx(world, { target: ref("character", soldier1.id) }));
    expect(resolved).toEqual({
      kind: "fact",
      fact: { kind: "LoyaltyDelta", characterId: soldier1.id, delta: -150, cause: { rule: "base.rule", instanceId: "proc-1", templateId: "tmpl.test" } },
    });
  });

  it("resolves $role.account for both a character and a family (MoneyMove)", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco");
    const family = world.families.byId[world.families.order[0]!]!;
    const effect: Effect = { fact: "MoneyMove", from: "$a.account", to: "$b.account", amount: 500, money: "dirty" };
    const roles: Bindings = { a: ref("character", soldier1.id), b: ref("family", family.id) };
    const resolved = resolveEffect(world, effect, makeCtx(world, roles));
    expect(resolved).toEqual({
      kind: "fact",
      fact: {
        kind: "MoneyMove",
        from: soldier1.accounts.personal,
        to: family.treasury,
        amount: 500,
        money: "dirty",
        cause: { rule: "base.rule", instanceId: "proc-1", templateId: "tmpl.test" },
      },
    });
  });

  it("resolves an $expr with mul/add/min/max, and with div", () => {
    const world = starterWorld();
    const soldier1 = byName(world, "Nino Bracco");
    soldier1.exposure = 100;
    const roles: Bindings = { town: ref("town", world.geo.towns.order[0]!), source: ref("character", soldier1.id) };

    const scaled: Effect = { fact: "HeatDelta", townId: "$town", delta: { $expr: { role: "source", path: "exposure", mul: 2, add: 10 } } };
    const r1 = resolveEffect(world, scaled, makeCtx(world, roles));
    expect(r1?.kind === "fact" && (r1.fact as { delta: number }).delta).toBe(210);

    const clamped: Effect = { fact: "HeatDelta", townId: "$town", delta: { $expr: { role: "source", path: "exposure", mul: 10, max: 500 } } };
    const r2 = resolveEffect(world, clamped, makeCtx(world, roles));
    expect(r2?.kind === "fact" && (r2.fact as { delta: number }).delta).toBe(500);

    const divided: Effect = { fact: "HeatDelta", townId: "$town", delta: { $expr: { role: "source", path: "exposure", mul: 1, div: 3 } } };
    const r3 = resolveEffect(world, divided, makeCtx(world, roles));
    expect(r3?.kind === "fact" && (r3.fact as { delta: number }).delta).toBe(33); // roundHalfAway(100, 3)
  });

  it("returns null when a field references an unbound role", () => {
    const world = starterWorld();
    const effect: Effect = { fact: "LoyaltyDelta", characterId: "$victim", delta: -50 };
    expect(resolveEffect(world, effect, makeCtx(world, {}))).toBeNull();
  });

  it("returns null when a role reference resolves to a missing field (e.g. no superior)", () => {
    const world = starterWorld();
    const head = byName(world, "Don Calogero Ferrante"); // superiorId is null
    const effect: Effect = { fact: "SuperiorSet", characterId: "$head", superiorId: "$head.superior" };
    expect(resolveEffect(world, effect, makeCtx(world, { head: ref("character", head.id) }))).toBeNull();
  });

  it("resolves $role.family, $role.crew and $role.superior", () => {
    const world = starterWorld();
    const chief = byName(world, "Turi Lo Cascio");
    const family = world.families.byId[world.families.order[0]!]!;
    const head = byName(world, "Don Calogero Ferrante");
    const crew = world.crews.byId[world.crews.order[0]!]!;

    const famEffect: Effect = { fact: "AttentionDelta", familyId: "$c.family", delta: 5 };
    const famResolved = resolveEffect(world, famEffect, makeCtx(world, { c: ref("character", chief.id) }));
    expect(famResolved?.kind === "fact" && (famResolved.fact as { familyId: string }).familyId).toBe(family.id);

    const crewEffect: Effect = { fact: "SuperiorSet", characterId: "$c", superiorId: "$c.superior" };
    const crewResolved = resolveEffect(world, crewEffect, makeCtx(world, { c: ref("character", chief.id) }));
    expect(crewResolved?.kind === "fact" && (crewResolved.fact as { superiorId: string }).superiorId).toBe(head.id);

    const memberEffect: Effect = { fact: "SuperiorSet", characterId: "$c.crew", superiorId: "$c" };
    const memberResolved = resolveEffect(world, memberEffect, makeCtx(world, { c: ref("character", chief.id) }));
    expect(memberResolved?.kind === "fact" && (memberResolved.fact as { characterId: string }).characterId).toBe(crew.id);
  });

  it("resolves $role.town for a crew and for a family, and $turn/$instance/$chainRef in nested fields", () => {
    const world = starterWorld();
    const crew = world.crews.byId[world.crews.order[0]!]!;
    const family = world.families.byId[world.families.order[0]!]!;
    const town = world.geo.towns.byId[world.geo.towns.order[0]!]!;
    world.meta.turn = 7;

    const crewTown: Effect = { fact: "HeatDelta", townId: "$crew.town", delta: 1 };
    const crewResolved = resolveEffect(world, crewTown, makeCtx(world, { crew: ref("crew", crew.id) }));
    expect(crewResolved?.kind === "fact" && (crewResolved.fact as { townId: string }).townId).toBe(town.id);

    const famTown: Effect = { fact: "HeatDelta", townId: "$fam.town", delta: 1 };
    const famResolved = resolveEffect(world, famTown, makeCtx(world, { fam: ref("family", family.id) }));
    expect(famResolved?.kind === "fact" && (famResolved.fact as { townId: string }).townId).toBe(town.id);

    const soldier1 = byName(world, "Nino Bracco");
    const tokens: Effect = {
      fact: "MemoryAdd",
      characterId: "$c",
      memory: { tag: "$chainRef", weight: "$turn" as unknown as number, aboutId: "$c" },
    };
    const ctx = makeCtx(world, { c: ref("character", soldier1.id) }, { instanceId: "proc-9" });
    const resolved = resolveEffect(world, tokens, ctx);
    expect(resolved).toEqual({
      kind: "fact",
      fact: {
        kind: "MemoryAdd",
        characterId: soldier1.id,
        memory: { tag: "chain-1", weight: 7, aboutId: soldier1.id },
        cause: { rule: "base.rule", instanceId: "proc-9", templateId: "tmpl.test" },
      },
    });
  });

  it("throws when the effect's fact kind is not a known owner (a content bug, per design 04 §1)", () => {
    const world = starterWorld();
    const bad = { fact: "NotARealFactKind", foo: 1 } as unknown as Effect;
    expect(() => resolveEffect(world, bad, makeCtx(world, {}))).toThrow();
  });
});

describe("resolveEffect: cause", () => {
  it("defaults cause to ctx.cause plus instanceId and templateId", () => {
    const world = starterWorld();
    const effect: Effect = { fact: "HeatDelta", townId: world.geo.towns.order[0]!, delta: 5 };
    const ctx = makeCtx(world, {}, { cause: { rule: "state.patrol", actorId: "chr-9" as CharacterId } });
    const resolved = resolveEffect(world, effect, ctx);
    expect(resolved?.kind === "fact" && resolved.fact.cause).toEqual({
      rule: "state.patrol",
      actorId: "chr-9",
      instanceId: "proc-1",
      templateId: "tmpl.test",
    });
  });

  it("merges a `cause.rule` given on the effect, keeping the rest of ctx.cause", () => {
    const world = starterWorld();
    const effect: Effect = { fact: "HeatDelta", townId: world.geo.towns.order[0]!, delta: 5, cause: { rule: "operation.arson" } };
    const ctx = makeCtx(world, {}, { cause: { rule: "engine.default", actorId: "chr-9" as CharacterId } });
    const resolved = resolveEffect(world, effect, ctx);
    expect(resolved?.kind === "fact" && resolved.fact.cause).toEqual({
      rule: "operation.arson",
      actorId: "chr-9",
      instanceId: "proc-1",
      templateId: "tmpl.test",
    });
  });
});

describe("resolveEffect: schedule / cancel / crisis / request", () => {
  it("resolves a schedule effect's delay range to its midpoint and keeps the range, with defaults", () => {
    const world = starterWorld();
    const effect: Effect = { schedule: { templateId: "civil.refusal.spread", delay: { min: 2, max: 6 } } };
    const resolved = resolveEffect(world, effect, makeCtx(world, {}));
    expect(resolved).toEqual({
      kind: "schedule",
      templateId: "civil.refusal.spread",
      delay: 4,
      delayRange: { min: 2, max: 6 },
      probability: 10_000,
      bind: {},
      priority: 0,
    });
  });

  it("resolves a fixed schedule delay with no delayRange, honoring explicit fields", () => {
    const world = starterWorld();
    const effect: Effect = {
      schedule: { templateId: "state.squad.assigned", delay: 5, probability: 8000, bind: { target: "victim" }, priority: 2 },
    };
    const resolved = resolveEffect(world, effect, makeCtx(world, {}));
    expect(resolved).toEqual({
      kind: "schedule",
      templateId: "state.squad.assigned",
      delay: 5,
      probability: 8000,
      bind: { target: "victim" },
      priority: 2,
    });
  });

  it("passes cancel, crisis and request effects through", () => {
    const world = starterWorld();
    const ctx = makeCtx(world, {});
    expect(resolveEffect(world, { cancel: { templateId: "chain.protectionTax", boundTo: "target", reason: "arrested" } }, ctx)).toEqual({
      kind: "cancel",
      templateId: "chain.protectionTax",
      boundTo: "target",
      reason: "arrested",
    });
    expect(resolveEffect(world, { cancel: { templateId: "chain.protectionTax", reason: "arrested" } }, ctx)).toEqual({
      kind: "cancel",
      templateId: "chain.protectionTax",
      reason: "arrested",
    });
    expect(resolveEffect(world, { crisis: { flag: "war", ttl: 12, active: true } }, ctx)).toEqual({
      kind: "crisis",
      flag: "war",
      ttl: 12,
      active: true,
    });
    expect(resolveEffect(world, { request: { text: "The shopkeeper has stopped paying." } }, ctx)).toEqual({
      kind: "request",
      text: "The shopkeeper has stopped paying.",
    });
  });
});
