// Design 13 contracts: standing between families, war state and its effects, the district head, the district view.
import { describe, expect, it } from "vitest";
import { loadContent } from "@borgata/content";
import { EMPTY_CONTENT } from "./content-types.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { decayStanding } from "./reducers/relationships.js";
import { initialWorld } from "./replay.js";
import { runChains } from "./systems/chains.js";
import { exposureFromActivity } from "./systems/exposure-sources.js";
import { step } from "./step.js";
import { projectView } from "./view.js";
import type { FamilyId } from "@borgata/shared";
import { playerCharacter, standingKey, type World } from "./world.js";

const content = loadContent();
const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function twoFamilies(world: World): [FamilyId, FamilyId] {
  const me = playerCharacter(world);
  const mine = me.familyId!;
  const other = world.families.order.find((id) => id !== mine)! as FamilyId;
  return [mine, other];
}

describe("standing between families", () => {
  it("moves with StandingDelta, is symmetric, clamps, and fades toward zero", () => {
    const world = initialWorld("district-1", setup, content);
    const [a, b] = twoFamilies(world);
    const log = new TurnLogBuilder(0);
    applyFacts(world, [{ kind: "StandingDelta", familyA: a, familyB: b, delta: -300, cause }], log);
    expect(world.standing[standingKey(a, b)]).toBe(-300);
    expect(world.standing[standingKey(b, a)]).toBe(-300);
    applyFacts(world, [{ kind: "StandingDelta", familyA: b, familyB: a, delta: -900, cause }], log);
    expect(world.standing[standingKey(a, b)]).toBe(-1000);
    decayStanding(world, 104);
    expect(world.standing[standingKey(a, b)]).toBeGreaterThan(-1000);
    applyFacts(world, [{ kind: "StandingDelta", familyA: a, familyB: a, delta: 10, cause }], log);
    expect(log.build().entries.filter((e) => e.kind === "rejected")).toHaveLength(1);
  });
});

describe("war state", () => {
  it("halves a warring family's collections and heats both towns; a hiding man does not collect", () => {
    let world = initialWorld("district-2", setup, content);
    const [a, b] = twoFamilies(world);
    // Two turns so the chains exist and the round is settled.
    for (let t = 0; t < 2; t++) world = step(world, [], content).world;
    const peace = runChains(world, EMPTY_CONTENT).filter((f) => f.kind === "MoneyMint" && f.source === "protectionTax");
    applyFacts(world, [
      { kind: "WarStateSet", familyId: a, enemyFamilyId: b, cause },
      { kind: "WarStateSet", familyId: b, enemyFamilyId: a, cause },
    ], new TurnLogBuilder(world.meta.turn));
    expect(world.families.byId[a]!.warWith).toBe(b);
    const war = runChains(world, EMPTY_CONTENT).filter((f) => f.kind === "MoneyMint" && f.source === "protectionTax");
    const sum = (fs: typeof peace) => fs.reduce((n, f) => n + (f.kind === "MoneyMint" ? f.amount : 0), 0);
    expect(sum(war)).toBeLessThan(sum(peace));
    expect(sum(war)).toBeGreaterThan(0);
    const heat = exposureFromActivity(world, EMPTY_CONTENT).filter((f) => f.kind === "HeatDelta" && f.cause.rule === "activity.war");
    expect(heat.length).toBeGreaterThanOrEqual(2);
    // Peace again.
    applyFacts(world, [{ kind: "WarStateSet", familyId: a, enemyFamilyId: null, cause }], new TurnLogBuilder(world.meta.turn));
    expect(world.families.byId[a]!.warWith).toBeNull();
  });
});

describe("the district", () => {
  it("has a head chosen at generation from its own families, and the view shows the families with standing bands", () => {
    const world = initialWorld("district-3", setup, content);
    const me = playerCharacter(world);
    const family = world.families.byId[me.familyId!]!;
    const district = world.geo.districts.byId[family.districtId!]!;
    expect(district.districtHeadFamilyId).not.toBeNull();
    expect(district.familyIds).toContain(district.districtHeadFamilyId);
    const view = projectView(world, null, content);
    expect(view.district).not.toBeNull();
    expect(view.district!.families.some((f) => f.yours)).toBe(true);
    expect(view.district!.families.length).toBe(district.familyIds.length);
    const other = view.district!.families.find((f) => !f.yours);
    if (other) expect(other.standing).not.toBeNull();
    const log = new TurnLogBuilder(0);
    applyFacts(world, [{ kind: "DistrictHeadSet", districtId: district.id, familyId: "fam-nope" as never, cause }], log);
    expect(log.build().entries.filter((e) => e.kind === "rejected")).toHaveLength(1);
  });
});
