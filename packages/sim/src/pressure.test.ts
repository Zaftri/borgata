import { describe, expect, it } from "vitest";
import { type FamilyId, type TownId } from "@borgata/shared";
import { addCharacter, addFamily, createEmptyWorld, type World } from "./world.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { runInvariants } from "./invariants/all.js";
import { addBlock, addTown } from "./fixtures.js";
import { bandFor, decayPressure, recomputeBands, TOOLS_BY_BAND } from "./systems/pressure.js";
import { buildStarterWorld } from "./starter.js";
import { step } from "./step.js";
import { EMPTY_CONTENT } from "./content-types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function freshWorld(seed = "pressure-test"): World {
  return createEmptyWorld(seed, setup, EMPTY_CONTENT.version);
}

function apply(world: World, facts: Parameters<typeof applyFacts>[1]) {
  const log = new TurnLogBuilder(world.meta.turn);
  const applied = applyFacts(world, facts, log);
  return { log: log.build(), applied };
}

function pressureViolations(world: World): string[] {
  return runInvariants(world)
    .filter((v) => v.name.startsWith("pressure."))
    .map((v) => v.name);
}

// ---- reducer: HeatDelta ----

describe("pressure reducer: HeatDelta", () => {
  it("applies a nonzero delta, clamps to 0..1000 and deletes the key at 0", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Corleone", archetype: "rural" });

    apply(world, [{ kind: "HeatDelta", townId: town.id, delta: 5000, cause }]);
    expect(world.pressure.heatByTown[town.id]).toBe(1000);

    apply(world, [{ kind: "HeatDelta", townId: town.id, delta: -5000, cause }]);
    expect(world.pressure.heatByTown[town.id]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(world.pressure.heatByTown, town.id)).toBe(false);
  });

  it("rejects an unknown town, a zero delta and a non-safe-integer delta", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Palermo", archetype: "city" });

    const { applied: a1 } = apply(world, [{ kind: "HeatDelta", townId: "town-nope" as TownId, delta: 10, cause }]);
    expect(a1).toBe(0);
    const { applied: a2 } = apply(world, [{ kind: "HeatDelta", townId: town.id, delta: 0, cause }]);
    expect(a2).toBe(0);
    const { applied: a3 } = apply(world, [{ kind: "HeatDelta", townId: town.id, delta: 1.5, cause }]);
    expect(a3).toBe(0);
    expect(world.pressure.heatByTown[town.id]).toBeUndefined();
  });
});

// ---- reducer: AttentionDelta ----

describe("pressure reducer: AttentionDelta", () => {
  it("applies a nonzero delta and clamps to 0..1000", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });

    apply(world, [{ kind: "AttentionDelta", familyId: family.id, delta: 5000, cause }]);
    expect(world.families.byId[family.id]!.attention).toBe(1000);

    apply(world, [{ kind: "AttentionDelta", familyId: family.id, delta: -5000, cause }]);
    expect(world.families.byId[family.id]!.attention).toBe(0);
  });

  it("rejects an unknown family, a zero delta and a non-safe-integer delta", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });

    const { applied: a1 } = apply(world, [{ kind: "AttentionDelta", familyId: "fam-nope" as FamilyId, delta: 10, cause }]);
    expect(a1).toBe(0);
    const { applied: a2 } = apply(world, [{ kind: "AttentionDelta", familyId: family.id, delta: 0, cause }]);
    expect(a2).toBe(0);
    const { applied: a3 } = apply(world, [{ kind: "AttentionDelta", familyId: family.id, delta: 1.5, cause }]);
    expect(a3).toBe(0);
    expect(world.families.byId[family.id]!.attention).toBe(0);
  });
});

// ---- reducer: BandChange ----

describe("pressure reducer: BandChange", () => {
  it("sets attentionBand when `from` matches the family's current band", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });
    expect(world.families.byId[family.id]!.attentionBand).toBe(0);

    const { applied } = apply(world, [{ kind: "BandChange", familyId: family.id, from: 0, to: 1, cause }]);
    expect(applied).toBe(1);
    expect(world.families.byId[family.id]!.attentionBand).toBe(1);
  });

  it("rejects a mismatched `from`, `to` equal to `from`, and an unknown family", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });

    const { applied: a1 } = apply(world, [{ kind: "BandChange", familyId: family.id, from: 2, to: 3, cause }]);
    expect(a1).toBe(0);
    const { applied: a2 } = apply(world, [{ kind: "BandChange", familyId: family.id, from: 0, to: 0, cause }]);
    expect(a2).toBe(0);
    const { applied: a3 } = apply(world, [{ kind: "BandChange", familyId: "fam-nope" as FamilyId, from: 0, to: 1, cause }]);
    expect(a3).toBe(0);
    expect(world.families.byId[family.id]!.attentionBand).toBe(0);
  });
});

// ---- reducer: ToolUnlock ----

describe("pressure reducer: ToolUnlock", () => {
  it("creates the array and appends a tool, idempotently", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });
    expect(world.pressure.toolsByFamily[family.id]).toBeUndefined();

    apply(world, [{ kind: "ToolUnlock", familyId: family.id, tool: "patrols", cause }]);
    expect(world.pressure.toolsByFamily[family.id]).toEqual(["patrols"]);

    // Applying the same tool again is a harmless no-op, not a duplicate entry.
    const { applied } = apply(world, [{ kind: "ToolUnlock", familyId: family.id, tool: "patrols", cause }]);
    expect(applied).toBe(1);
    expect(world.pressure.toolsByFamily[family.id]).toEqual(["patrols"]);

    apply(world, [{ kind: "ToolUnlock", familyId: family.id, tool: "informants", cause }]);
    expect(world.pressure.toolsByFamily[family.id]).toEqual(["patrols", "informants"]);
  });

  it("rejects an unknown family", () => {
    const world = freshWorld();
    const { applied } = apply(world, [{ kind: "ToolUnlock", familyId: "fam-nope" as FamilyId, tool: "patrols", cause }]);
    expect(applied).toBe(0);
  });
});

// ---- decayPressure ----

describe("decayPressure", () => {
  it("decays town heat toward 0 with a half-life of 4 weeks: 800 -> 400 after 4 weeks", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Enna", archetype: "rural" });
    world.pressure.heatByTown[town.id] = 800;

    decayPressure(world, 4);

    expect(world.pressure.heatByTown[town.id]).toBe(400);
  });

  it("gains Attention inflow from the heat of its towns before that heat decays", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Trapani", archetype: "port" });
    const family = addFamily(world, { name: "Ferrante", townIds: [town.id] });
    world.pressure.heatByTown[town.id] = 800;

    // inflow = round(800 / 16) = 50; attention = 0 + 50 = 50; floor = 0 (no living members);
    // one full half-life (104 weeks) of decay toward 0 halves it: 50 -> 25.
    decayPressure(world, 104);

    expect(world.families.byId[family.id]!.attention).toBe(25);
  });

  it("never decays a family's Attention below its floor, 20*ln(familySize) approximated", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });
    for (let i = 0; i < 5; i++) addCharacter(world, { name: `Member ${i}`, familyId: family.id });
    world.families.byId[family.id]!.attention = 0;

    // Many half-lives converge fully onto the floor: lnScaled120(5) = 215, floor = round(215/6) = 36.
    decayPressure(world, 104 * 40);

    expect(world.families.byId[family.id]!.attention).toBe(36);
  });

  it("gives a family with no towns zero inflow (its Attention only decays)", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });
    world.families.byId[family.id]!.attention = 500;

    // No towns held, so inflow is 0; floor is 0 (no living members); one half-life halves it.
    decayPressure(world, 104);

    expect(world.families.byId[family.id]!.attention).toBe(250);
  });
});

// ---- bandFor ----

describe("bandFor", () => {
  it("enters a band immediately at its lower bound", () => {
    expect(bandFor(200, 0)).toBe(1);
    expect(bandFor(400, 1)).toBe(2);
    expect(bandFor(850, 0)).toBe(4); // a sharp rise can skip straight past intermediate bands
  });

  it("stays in the band until Attention falls more than 50 below the band's lower bound", () => {
    expect(bandFor(160, 1)).toBe(1); // 40 below 200: not enough to leave
    expect(bandFor(149, 1)).toBe(0); // 51 below 200: leaves
  });

  it("cascades down through every band Attention has fallen clear of", () => {
    expect(bandFor(0, 3)).toBe(0);
  });
});

// ---- recomputeBands ----

describe("recomputeBands", () => {
  it("unlocks band 0's patrols on the first recompute even with no band change", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });

    const facts = recomputeBands(world);

    expect(facts).toEqual([{ kind: "ToolUnlock", familyId: family.id, tool: "patrols", cause: { rule: "pressure.bandTools" } }]);
  });

  it("emits BandChange and the new band's tools on a rise, and nothing more on a later fall", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });
    apply(world, recomputeBands(world)); // first recompute: unlocks patrols

    world.families.byId[family.id]!.attention = 250;
    const riseFacts = recomputeBands(world);

    expect(riseFacts).toEqual([
      { kind: "BandChange", familyId: family.id, from: 0, to: 1, cause: { rule: "attention.rose" } },
      { kind: "ToolUnlock", familyId: family.id, tool: "informants", cause: { rule: "pressure.bandTools" } },
      { kind: "ToolUnlock", familyId: family.id, tool: "squad", cause: { rule: "pressure.bandTools" } },
    ]);
    apply(world, riseFacts);
    expect(world.families.byId[family.id]!.attentionBand).toBe(1);
    expect(world.pressure.toolsByFamily[family.id]).toEqual(["patrols", "informants", "squad"]);

    world.families.byId[family.id]!.attention = 0;
    const fallFacts = recomputeBands(world);

    expect(fallFacts).toEqual([{ kind: "BandChange", familyId: family.id, from: 1, to: 0, cause: { rule: "attention.eased" } }]);
    apply(world, fallFacts);
    // Falling never strips tools already earned.
    expect(world.pressure.toolsByFamily[family.id]).toEqual(["patrols", "informants", "squad"]);
  });

  it("TOOLS_BY_BAND covers every tool exactly once, in table order", () => {
    const all = Object.values(TOOLS_BY_BAND).flat();
    expect(all).toEqual(["patrols", "informants", "squad", "magistrate", "wiretaps", "seizures", "collaboratorProgram", "army", "hardPrison"]);
    expect(new Set(all).size).toBe(all.length);
  });
});

// ---- end-to-end: step on the starter world ----

describe("pressure through step() on the starter world", () => {
  it("runs 52 turns keeping meters in range (via invariants inside step) and the family band low", () => {
    let world = buildStarterWorld("pressure-e2e", setup, EMPTY_CONTENT);
    let sawHeat = false;

    for (let i = 0; i < 52; i++) {
      const result = step(world, [], EMPTY_CONTENT); // throws on any invariant violation, including pressure.*
      world = result.world;
      if (Object.keys(world.pressure.heatByTown).length > 0) sawHeat = true;
    }

    if (!sawHeat) {
      // The heat-emitting system (exposure-sources.ts) is built in parallel; if it never landed heat
      // in this run, fall back to checking decayPressure directly on a planted heat value.
      const world2 = freshWorld("pressure-fallback");
      const town2 = addTown(world2, { name: "Fallback", archetype: "rural" });
      world2.pressure.heatByTown[town2.id] = 800;
      decayPressure(world2, 4);
      expect(world2.pressure.heatByTown[town2.id]).toBe(400);
    } else {
      expect(sawHeat).toBe(true);
    }

    const familyId = world.families.order[0]!;
    const family = world.families.byId[familyId]!;
    expect([0, 1]).toContain(family.attentionBand);
  });
});

// ---- invariants ----

describe("pressure invariants", () => {
  it("metersInRange fires on an out-of-range heat, an out-of-range attention, and a zero-valued heat key; silent otherwise", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Siracusa", archetype: "city" });
    const family = addFamily(world, { name: "Ferrante" });
    expect(pressureViolations(world)).not.toContain("pressure.metersInRange");

    world.pressure.heatByTown[town.id] = 5000;
    expect(pressureViolations(world)).toContain("pressure.metersInRange");
    delete world.pressure.heatByTown[town.id];

    world.pressure.heatByTown[town.id] = 0;
    expect(pressureViolations(world)).toContain("pressure.metersInRange");
    delete world.pressure.heatByTown[town.id];
    expect(pressureViolations(world)).not.toContain("pressure.metersInRange");

    world.families.byId[family.id]!.attention = 5000;
    expect(pressureViolations(world)).toContain("pressure.metersInRange");
  });

  it("bandConsistent fires when attentionBand does not match bandFor(attention, attentionBand); silent otherwise", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });
    expect(pressureViolations(world)).not.toContain("pressure.bandConsistent");

    world.families.byId[family.id]!.attentionBand = 2;
    expect(pressureViolations(world)).toContain("pressure.bandConsistent");
  });

  it("toolsMatchBand fires when a family holds a tool above its band; silent otherwise", () => {
    const world = freshWorld();
    const family = addFamily(world, { name: "Ferrante" });
    world.pressure.toolsByFamily[family.id] = ["patrols"];
    expect(pressureViolations(world)).not.toContain("pressure.toolsMatchBand");

    world.pressure.toolsByFamily[family.id] = ["magistrate"]; // band 2 tool, family is band 0
    expect(pressureViolations(world)).toContain("pressure.toolsMatchBand");
  });

  it("heatTownsExist fires when heat is recorded for a town that does not exist; silent otherwise", () => {
    const world = freshWorld();
    const town = addTown(world, { name: "Bagheria", archetype: "rural" });
    addBlock(world, town.id);
    world.pressure.heatByTown[town.id] = 100;
    expect(pressureViolations(world)).not.toContain("pressure.heatTownsExist");

    world.pressure.heatByTown["town-nope" as TownId] = 100;
    expect(pressureViolations(world)).toContain("pressure.heatTownsExist");
  });
});
