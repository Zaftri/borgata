import { describe, expect, it } from "vitest";
import { tableInsert, type CharacterId } from "@borgata/shared";
import { EMPTY_CONTENT } from "./content-types.js";
import { addCharacter, createEmptyWorld, type World } from "./world.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { dossierOf, recomputeExposure } from "./reducers/evidence.js";
import { runInvariants } from "./invariants/all.js";
import { exposureFromActivity } from "./systems/exposure-sources.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";

const setup = { archetype: null, background: "family", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function baseWorld(seed: string): World {
  return createEmptyWorld(seed, setup, EMPTY_CONTENT.version);
}

function apply(world: World, facts: Parameters<typeof applyFacts>[1]) {
  const log = new TurnLogBuilder(world.meta.turn);
  const applied = applyFacts(world, facts, log);
  return { log: log.build(), applied };
}

describe("evidence reducer: EvidenceAdd", () => {
  it("creates a dossier lazily and adds an item, and sets exposure", () => {
    const world = baseWorld("add-lazy");
    const c = addCharacter(world, { name: "Nino" });
    expect(dossierOf(world, c.id)).toBeUndefined();

    const { applied } = apply(world, [
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight: 30, source: "witness" }, cause },
    ]);

    expect(applied).toBe(1);
    const dossier = dossierOf(world, c.id);
    expect(dossier?.items).toEqual([{ crimeRef: "witness:1", weight: 30, source: "witness", turn: world.meta.turn }]);
    expect(world.characters.byId[c.id]!.exposure).toBe(30);
  });

  it("sums weights across multiple items and multiple adds", () => {
    const world = baseWorld("add-sum");
    const c = addCharacter(world, { name: "Nino" });
    apply(world, [
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight: 30, source: "witness" }, cause },
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "wire:1", weight: 60, source: "wire" }, cause },
    ]);
    expect(world.characters.byId[c.id]!.exposure).toBe(90);
  });

  it("caps exposure at 1000", () => {
    const world = baseWorld("add-cap");
    const c = addCharacter(world, { name: "Nino" });
    apply(world, [
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "killing:1", weight: 700, source: "participation" }, cause },
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "collaborator:1", weight: 700, source: "collaborator" }, cause },
    ]);
    expect(world.characters.byId[c.id]!.exposure).toBe(1000);
    // The dossier itself keeps the true (uncapped) sum; only the derived meter is capped.
    const dossier = dossierOf(world, c.id)!;
    expect(dossier.items.reduce((t, i) => t + i.weight, 0)).toBe(1400);
  });

  it("rejects an unknown character", () => {
    const world = baseWorld("add-unknown-char");
    const { log, applied } = apply(world, [
      { kind: "EvidenceAdd", characterId: "chr-nope" as CharacterId, item: { crimeRef: "witness:1", weight: 30, source: "witness" }, cause },
    ]);
    expect(applied).toBe(0);
    expect(log.entries.some((e) => e.kind === "rejected")).toBe(true);
  });

  it("rejects a non-positive or non-integer weight", () => {
    const world = baseWorld("add-bad-weight");
    const c = addCharacter(world, { name: "Nino" });
    for (const weight of [0, -5, 1.5, NaN]) {
      const { applied } = apply(world, [
        { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight, source: "witness" }, cause },
      ]);
      expect(applied).toBe(0);
    }
    expect(dossierOf(world, c.id)).toBeUndefined();
  });

  it("rejects an empty crimeRef", () => {
    const world = baseWorld("add-empty-crimeref");
    const c = addCharacter(world, { name: "Nino" });
    const { applied } = apply(world, [
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "", weight: 30, source: "witness" }, cause },
    ]);
    expect(applied).toBe(0);
    expect(dossierOf(world, c.id)).toBeUndefined();
  });
});

describe("evidence reducer: EvidenceRemove", () => {
  it("removes all items with the crimeRef (a witness retracts everything he saw) and recomputes exposure", () => {
    const world = baseWorld("remove-all");
    const c = addCharacter(world, { name: "Nino" });
    apply(world, [
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight: 30, source: "witness" }, cause },
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight: 20, source: "witness" }, cause },
      { kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "wire:1", weight: 60, source: "wire" }, cause },
    ]);
    expect(world.characters.byId[c.id]!.exposure).toBe(110);

    const { applied } = apply(world, [{ kind: "EvidenceRemove", characterId: c.id, crimeRef: "witness:1", cause }]);
    expect(applied).toBe(1);
    expect(dossierOf(world, c.id)!.items).toEqual([{ crimeRef: "wire:1", weight: 60, source: "wire", turn: world.meta.turn }]);
    expect(world.characters.byId[c.id]!.exposure).toBe(60);
  });

  it("rejects when the dossier is missing", () => {
    const world = baseWorld("remove-no-dossier");
    const c = addCharacter(world, { name: "Nino" });
    const { applied } = apply(world, [{ kind: "EvidenceRemove", characterId: c.id, crimeRef: "witness:1", cause }]);
    expect(applied).toBe(0);
  });

  it("rejects when no item has that crimeRef", () => {
    const world = baseWorld("remove-no-match");
    const c = addCharacter(world, { name: "Nino" });
    apply(world, [{ kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight: 30, source: "witness" }, cause }]);
    const { applied } = apply(world, [{ kind: "EvidenceRemove", characterId: c.id, crimeRef: "wire:1", cause }]);
    expect(applied).toBe(0);
    expect(dossierOf(world, c.id)!.items).toHaveLength(1);
  });
});

describe("recomputeExposure", () => {
  it("is 0 for a character with no dossier", () => {
    const world = baseWorld("recompute-empty");
    const c = addCharacter(world, { name: "Nino" });
    recomputeExposure(world, c.id);
    expect(world.characters.byId[c.id]!.exposure).toBe(0);
  });
});

describe("exposureFromActivity", () => {
  it("produces nothing when there are no chains", () => {
    const world = baseWorld("no-chains");
    expect(exposureFromActivity(world, EMPTY_CONTENT)).toEqual([]);
  });

  it("on the starter world, after two turns both soldiers have exposure and the chief less than a soldier", () => {
    const world0 = buildStarterWorld("evidence-starter", setup, EMPTY_CONTENT);
    // Turn 1: family AI creates and slots the protection-tax chain this turn; exposureFromActivity ran
    // against last turn's (empty) chains table, so nothing accrues yet.
    const r1 = step(world0, [], EMPTY_CONTENT);
    // Turn 2: the chain now exists and is fully slotted, so it produces evidence and heat.
    const r2 = step(r1.world, [], EMPTY_CONTENT);

    const soldierIds = r2.world.characters.order.filter((id) => r2.world.characters.byId[id]!.name.startsWith("Nino") || r2.world.characters.byId[id]!.name.startsWith("Pino"));
    expect(soldierIds.length).toBe(2);
    const soldierExposures = soldierIds.map((id) => r2.world.characters.byId[id]!.exposure);
    for (const e of soldierExposures) expect(e).toBeGreaterThan(0);

    const chief = r2.world.characters.byId[r2.world.characters.order.find((id) => r2.world.characters.byId[id]!.rank === "chief")!]!;
    expect(chief.exposure).toBeGreaterThan(0);
    expect(chief.exposure).toBeLessThan(Math.min(...soldierExposures));

    // Heat facts appear in the turn log (pressure reducer may still be a stub in parallel work, so we
    // assert the fact was emitted rather than the resulting state).
    const heatFacts = r2.log.entries.filter((e) => (e.kind === "fact" || e.kind === "rejected") && e.fact.kind === "HeatDelta");
    expect(heatFacts.length).toBeGreaterThan(0);
  });
});

describe("evidence invariants", () => {
  function violations(world: World, prefix: string): string[] {
    return runInvariants(world)
      .filter((v) => v.name.startsWith(prefix))
      .map((v) => v.name);
  }

  it("are silent on a well-formed world", () => {
    const world = baseWorld("inv-baseline");
    const c = addCharacter(world, { name: "Nino" });
    apply(world, [{ kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight: 30, source: "witness" }, cause }]);
    expect(violations(world, "evidence.")).toEqual([]);
  });

  it("exposureMatchesDossier fires when exposure is corrupted directly", () => {
    const world = baseWorld("inv-exposure-mismatch");
    const c = addCharacter(world, { name: "Nino" });
    apply(world, [{ kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight: 30, source: "witness" }, cause }]);
    world.characters.byId[c.id]!.exposure = 999;
    expect(violations(world, "evidence.exposureMatchesDossier")).toEqual(["evidence.exposureMatchesDossier"]);
  });

  it("itemsValid fires on a planted invalid weight, empty crimeRef, bad source or future turn", () => {
    const world = baseWorld("inv-items-valid");
    const c = addCharacter(world, { name: "Nino" });
    apply(world, [{ kind: "EvidenceAdd", characterId: c.id, item: { crimeRef: "witness:1", weight: 30, source: "witness" }, cause }]);
    const dossier = dossierOf(world, c.id)!;

    dossier.items.push({ crimeRef: "bad:1", weight: 0, source: "witness", turn: world.meta.turn });
    expect(violations(world, "evidence.itemsValid")).toContain("evidence.itemsValid");

    dossier.items = dossier.items.filter((i) => i.crimeRef !== "bad:1");
    dossier.items.push({ crimeRef: "", weight: 10, source: "witness", turn: world.meta.turn });
    expect(violations(world, "evidence.itemsValid")).toContain("evidence.itemsValid");

    dossier.items = dossier.items.filter((i) => i.crimeRef !== "");
    dossier.items.push({ crimeRef: "bad:2", weight: 10, source: "invalidSource" as never, turn: world.meta.turn });
    expect(violations(world, "evidence.itemsValid")).toContain("evidence.itemsValid");

    dossier.items = dossier.items.filter((i) => i.crimeRef !== "bad:2");
    dossier.items.push({ crimeRef: "bad:3", weight: 10, source: "witness", turn: world.meta.turn + 5 });
    expect(violations(world, "evidence.itemsValid")).toContain("evidence.itemsValid");
  });

  it("dossierCharacterExists fires on an orphaned dossier", () => {
    const world = baseWorld("inv-orphan-dossier");
    tableInsert(world.evidence.dossiers, "chr-nope", { characterId: "chr-nope" as CharacterId, items: [] });
    expect(violations(world, "evidence.dossierCharacterExists")).toEqual(["evidence.dossierCharacterExists"]);
  });
});
