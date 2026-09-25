// Engine-level tests for `spawn.spawnFrom` (design 09 §7 item 4): the spawn pass binds a role (and,
// optionally, a second role) straight from a recent fact's fields instead of iterating every entity of
// `spawn.per`. These tests exercise the mechanism itself with a minimal fixture template and fixture
// `RecentFact` entries pushed directly onto `world.history.recentFacts` (the same style
// engine/scheduler.test.ts uses for its own spawn-pass tests: `runScheduler` called directly, not through
// `step()`, so the fixture facts do not need to actually have happened through the full pipeline).
import { describe, expect, it } from "vitest";
import { buildStarterWorld } from "../starter.js";
import { EMPTY_CONTENT, type Content } from "../content-types.js";
import { runScheduler } from "./scheduler.js";
import type { ProcessTemplate } from "./types.js";

const setup = { archetype: null, background: "family", difficulty: "normal", ironman: false } as const;

function content(templates: ProcessTemplate[]): Content {
  return { ...EMPTY_CONTENT, version: "test", templates };
}

function world() {
  return buildStarterWorld("spawn-from-seed", setup, { ...EMPTY_CONTENT, version: "test", templates: [] });
}

/** Mirrors `assoc.latePayer`'s shape: `shop` from `businessId`, `me` (the spawn scope, `per: "character"`)
 * from `collectorId`, both off a `CollectionMissed`-shaped fact. */
function fixtureTemplate(overrides: Partial<ProcessTemplate> = {}): ProcessTemplate {
  return {
    id: "t.spawnFrom",
    version: 1,
    kind: "event",
    scope: "town",
    lane: "civil",
    spawn: {
      weight: 10_000,
      per: "character",
      maxActivePerScope: 1,
      spawnFrom: { factKind: "CollectionMissed", role: "shop", field: "businessId", role2: "me", field2: "collectorId" },
    },
    roles: {
      shop: { entity: "business", pick: "first" },
      me: { entity: "character", pick: "first" },
    },
    preconditions: [],
    duration: 5,
    resolve: [{ id: "out", effects: [] }],
    followUps: [],
    tags: ["test"],
    ...overrides,
  };
}

describe("runScheduler: spawn pass, spawnFrom", () => {
  it("binds role and role2 from a matching recent fact's fields, within the default window (the previous turn)", () => {
    const w = world();
    const shopId = w.geo.businesses.order[0]!;
    const meId = w.player.characterId;
    w.meta.turn = 5;
    w.history.recentFacts.push({ turn: 4, kind: "CollectionMissed", subjects: [shopId, meId], fields: { businessId: shopId, collectorId: meId } });

    const facts = runScheduler(w, content([fixtureTemplate()]), []);
    const spawns = facts.filter((f) => f.kind === "ProcessSpawn");
    expect(spawns).toHaveLength(1);
    const inst = spawns[0]!.instance;
    expect(inst.roles["shop"]).toEqual({ kind: "business", id: shopId });
    expect(inst.roles["me"]).toEqual({ kind: "character", id: meId });
  });

  it("does not spawn from a fact older than withinTurns", () => {
    const w = world();
    const shopId = w.geo.businesses.order[0]!;
    const meId = w.player.characterId;
    w.meta.turn = 5;
    // Two turns back; default withinTurns is 1 (the previous turn only).
    w.history.recentFacts.push({ turn: 3, kind: "CollectionMissed", subjects: [shopId, meId], fields: { businessId: shopId, collectorId: meId } });

    const facts = runScheduler(w, content([fixtureTemplate()]), []);
    expect(facts.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(0);
  });

  it("respects an explicit withinTurns wider than the default", () => {
    const w = world();
    const shopId = w.geo.businesses.order[0]!;
    const meId = w.player.characterId;
    w.meta.turn = 5;
    w.history.recentFacts.push({ turn: 2, kind: "CollectionMissed", subjects: [shopId, meId], fields: { businessId: shopId, collectorId: meId } });

    const template = fixtureTemplate({
      spawn: {
        weight: 10_000,
        per: "character",
        maxActivePerScope: 1,
        spawnFrom: { factKind: "CollectionMissed", role: "shop", field: "businessId", role2: "me", field2: "collectorId", withinTurns: 3 },
      },
    });
    const facts = runScheduler(w, content([template]), []);
    expect(facts.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(1);
  });

  it("ignores a recent fact of a different kind", () => {
    const w = world();
    const meId = w.player.characterId;
    w.meta.turn = 5;
    w.history.recentFacts.push({ turn: 4, kind: "RankChange", subjects: [meId], fields: { characterId: meId } });

    const facts = runScheduler(w, content([fixtureTemplate()]), []);
    expect(facts.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(0);
  });

  it("skips a candidate whose fact is missing the named field", () => {
    const w = world();
    const meId = w.player.characterId;
    w.meta.turn = 5;
    // No businessId field at all: role "shop" cannot be bound.
    w.history.recentFacts.push({ turn: 4, kind: "CollectionMissed", subjects: [meId], fields: { collectorId: meId } });

    const facts = runScheduler(w, content([fixtureTemplate()]), []);
    expect(facts.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(0);
  });

  it("maxActivePerScope keys off the scope role (`me`, role2), not the other bound role (`shop`)", () => {
    const w = world();
    const [shopA, shopB] = w.geo.businesses.order;
    const meId = w.player.characterId;
    w.meta.turn = 5;
    // Two matching facts, same collector (the scope role), different shops.
    w.history.recentFacts.push({ turn: 4, kind: "CollectionMissed", subjects: [shopA!, meId], fields: { businessId: shopA!, collectorId: meId } });
    w.history.recentFacts.push({ turn: 4, kind: "CollectionMissed", subjects: [shopB!, meId], fields: { businessId: shopB!, collectorId: meId } });

    const facts = runScheduler(w, content([fixtureTemplate()]), []);
    // Only one spawn per active-scope entity per turn (maxActivePerScope: 1 on "me"), even though the two
    // facts name different shops.
    expect(facts.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(1);
  });

  it("still applies the spawn weight draw from the 'events.spawn' stream (weight 0 never spawns)", () => {
    const w = world();
    const shopId = w.geo.businesses.order[0]!;
    const meId = w.player.characterId;
    w.meta.turn = 5;
    w.history.recentFacts.push({ turn: 4, kind: "CollectionMissed", subjects: [shopId, meId], fields: { businessId: shopId, collectorId: meId } });

    const template = fixtureTemplate({
      spawn: {
        weight: 0,
        per: "character",
        maxActivePerScope: 1,
        spawnFrom: { factKind: "CollectionMissed", role: "shop", field: "businessId", role2: "me", field2: "collectorId" },
      },
    });
    const facts = runScheduler(w, content([template]), []);
    expect(facts.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(0);
  });

  it("still evaluates preconditions after full role binding", () => {
    const w = world();
    const shopId = w.geo.businesses.order[0]!;
    const meId = w.player.characterId;
    w.meta.turn = 5;
    w.history.recentFacts.push({ turn: 4, kind: "CollectionMissed", subjects: [shopId, meId], fields: { businessId: shopId, collectorId: meId } });

    const template = fixtureTemplate({ preconditions: [{ playerControlled: { role: "me", is: false } }] });
    const facts = runScheduler(w, content([template]), []);
    // The player character IS playerControlled, so a precondition requiring the opposite fails post-bind.
    expect(facts.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(0);
  });

  it("binds only role when role2/field2 are not given", () => {
    const w = world();
    const shopId = w.geo.businesses.order[0]!;
    w.meta.turn = 5;
    w.history.recentFacts.push({ turn: 4, kind: "CollectionMissed", subjects: [shopId], fields: { businessId: shopId } });

    const template = fixtureTemplate({
      spawn: { weight: 10_000, per: "business", maxActivePerScope: 1, spawnFrom: { factKind: "CollectionMissed", role: "shop", field: "businessId" } },
    });
    const facts = runScheduler(w, content([template]), []);
    const spawns = facts.filter((f) => f.kind === "ProcessSpawn");
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.instance.roles["shop"]).toEqual({ kind: "business", id: shopId });
    // "me" still gets bound normally (its own selector: entity character, pick "first").
    expect(spawns[0]!.instance.roles["me"]).toBeDefined();
  });
});
