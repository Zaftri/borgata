// Scenario tests for the two sit-downs (design 13 §3, disputes-to-the-district wave): packages/content/src/
// templates/district.ts's `dispute.stall.crew`, `dispute.district.refused`, `dispute.district.sitdown` and
// `dispute.district.refusedRuling`. Content lives in packages/content; sim may not import it for production code
// (design 01 §2), but this test file is exempt (eslint.config.js ignores packages/sim/src/**/*.test.ts from the
// sim-only-imports rule), the same pattern as disputes.test.ts and refusal-chain.test.ts.
//
// Two scenarios (the district sit-down and the refused-ruling escalation) construct their `ProcessInstance`
// directly rather than driving the full spawn chain through `step()`: the natural path (family.poach.attempt ->
// dispute.claim's heldWon/heldLost -> a 35 percent dispute.district.refused -> the sit-down -> a weight-gated
// probability of dispute.district.refusedRuling) compounds enough independent draws that reaching it
// deterministically within a reasonable turn budget is impractical. Direct construction is precedented in this
// package (engine/evaluator.test.ts's own `insertProcess`) for exactly this reason; every instance still runs
// through the real `step()`/scheduler/reducers, so the templates' own roles, decisions, outcomes and effects are
// exercised for real, only the spawn chain that would normally create them is skipped.
import { describe, expect, it } from "vitest";
import { id, mintId, tableInsert, type CharacterId, type FamilyId, type ProcessInstanceId, type ProvinceId } from "@borgata/shared";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import { addCharacter, addFamily, standingKey, type District, type GameSetup, type World } from "./world.js";
import type { EntityRef, ProcessInstance, ProcessKind, Lane } from "./engine/types.js";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import { EMPTY_CONTENT } from "./content-types.js";
import { DISPUTE_TEMPLATES } from "../../content/src/templates/disputes.js";
import { DISTRICT_TEMPLATES } from "../../content/src/templates/district.js";
import { WAR_TEMPLATES } from "../../content/src/templates/war.js";

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const content = { ...EMPTY_CONTENT, version: "t", templates: [...DISPUTE_TEMPLATES, ...DISTRICT_TEMPLATES, ...WAR_TEMPLATES] };
const opts = { debug: true };

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

function ref(kind: EntityRef["kind"], entityId: string): EntityRef {
  return { kind, id: entityId };
}

/** Direct instance construction (see file header): mirrors engine/evaluator.test.ts's own `insertProcess`,
 * generalized with `kind`/`lane` (that helper hardcodes "event"/"civil", which none of this wave's own
 * templates use) and a `resolveTurn` that defaults to "due this very call". */
function insertProcess(
  world: World,
  templateId: string,
  kind: ProcessKind,
  lane: Lane,
  roles: Record<string, EntityRef>,
  resolveTurn?: number,
): ProcessInstance {
  const procId = mintId<"ProcessInstanceId">(world.meta.ids, "proc") as ProcessInstanceId;
  const inst: ProcessInstance = {
    id: procId,
    templateId: id(templateId),
    templateVersion: 1,
    kind,
    lane,
    state: "active",
    roles,
    startedTurn: world.meta.turn,
    resolveTurn: resolveTurn ?? world.meta.turn,
    progress: 0,
    locks: [],
    causeChainId: `chain-${procId}`,
    priority: 0,
  };
  tableInsert(world.processes, procId, inst);
  return inst;
}

function processSpawns(facts: readonly Fact[], templateId: string): Extract<Fact, { kind: "ProcessSpawn" }>[] {
  return facts.filter((f): f is Extract<Fact, { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn" && f.instance.templateId === templateId);
}

/** The starter world's two families' chief/soldier characters, by name (starter.ts, design 02 §4). */
function starterCast(world: World) {
  const byName = (name: string) => world.characters.order.map((cid) => world.characters.byId[cid]!).find((c) => c.name === name)!;
  return {
    family1Id: world.families.order[0]! as FamilyId,
    family2Id: world.families.order[1]! as FamilyId,
    head1: byName("Don Calogero Ferrante"),
    chief1: byName("Turi Lo Cascio"),
    soldier1: byName("Nino Bracco"),
    soldier2: byName("Pino Randazzo"),
    head2: byName("Don Pietro Vassallo"),
    chief2: byName("Rosario Cascino"),
    soldier3: byName("Gaspare Butera"),
  };
}

/** A third family, purely to serve as the district head (an arbiter distinct from the starter world's own two
 * disputants), plus a District binding all three families to it via the new `districtHeadOf` relation
 * (engine/roles.ts, this wave). `generation.districtsCoherent` (invariants/generation.ts) only requires every
 * district's own `familyIds` to agree with each listed family's `districtId` -- satisfied below -- and exempts
 * the family-count-of-3 rule entirely when there is exactly one district in the world, which is the case here. */
function setupDistrict(world: World): { arbiterFamilyId: FamilyId; arbiterHeadId: CharacterId } {
  const { family1Id, family2Id } = starterCast(world);
  const arbiterHead = addCharacter(world, { name: "Don Michele Terranova", rank: "head", age: 66, traits: [] });
  const arbiterFamily = addFamily(world, { name: "Famiglia del Distretto", townIds: [], headId: arbiterHead.id, treasuryCut: 100 });
  const districtId = mintId<"DistrictId">(world.meta.ids, "dist");
  const district: District = {
    id: districtId,
    name: "Test District",
    provinceId: mintId<"ProvinceId">(world.meta.ids, "prov") as ProvinceId,
    familyIds: [family1Id, family2Id, arbiterFamily.id],
    districtHeadFamilyId: arbiterFamily.id,
  };
  tableInsert(world.geo.districts, districtId, district);
  world.families.byId[family1Id]!.districtId = districtId;
  world.families.byId[family2Id]!.districtId = districtId;
  arbiterFamily.districtId = districtId;
  return { arbiterFamilyId: arbiterFamily.id, arbiterHeadId: arbiterHead.id };
}

describe("dispute.stall.crew (design 13 §3, story 'soldier')", () => {
  it("the player as holder chooses offer: the rival is cut in and the claim stays with the player", () => {
    let world = buildStarterWorld("district-crew-offer", setup, content);
    // The spawn odds are tuned for play, not for tests (2026-09-25): force this card's spawn weight here.
    const boosted = { ...content, templates: content.templates.map((t) => (t.id === "dispute.stall.crew" && t.spawn ? { ...t, spawn: { ...t.spawn, weight: 10_000 } } : t)) };
    const { soldier1, soldier2 } = starterCast(world);
    world.characters.byId[soldier1.id]!.playerControlled = true;

    const logs: TurnLog[] = [];
    let choosingInstanceId: string | undefined;
    // Weight 150 (per ten thousand) per business, 6 blockA businesses all held by soldier1 (starter.ts):
    // expected wait well under 200 turns.
    for (let i = 0; i < 200 && !choosingInstanceId; i++) {
      const r = step(world, [], boosted, opts);
      world = r.world;
      logs.push(r.log);
      const inst = world.processes.order
        .map((pid) => world.processes.byId[pid]!)
        .find((p) => p.templateId === "dispute.stall.crew" && p.state === "awaitingDecision" && p.roles["holder"]?.id === soldier1.id);
      if (inst) choosingInstanceId = inst.id;
    }
    expect(choosingInstanceId).toBeDefined();

    const instBefore = world.processes.byId[choosingInstanceId!]!;
    expect(instBefore.roles["rival"]?.id).toBe(soldier2.id);
    const shopId = instBefore.roles["shop"]!.id;

    const r = step(world, [{ kind: "decide", instanceId: choosingInstanceId!, optionId: "offer" }], content, opts);
    world = r.world;
    logs.push(r.log);

    const facts = factsOf(logs);
    const favor = facts.find(
      (f): f is Extract<Fact, { kind: "FavorDelta" }> => f.kind === "FavorDelta" && f.cause.rule === "dispute.stall.crew.offer",
    );
    expect(favor).toMatchObject({ from: soldier2.id, to: soldier1.id, delta: 30 });
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === soldier2.id && f.memory.tag === "cutIn")).toBe(true);

    const resolve = facts.find(
      (f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === choosingInstanceId,
    );
    // CREW_HOLDER_DECIDED: the holder role (soldier1) is the player, so the player-voice outcome fires.
    expect(resolve?.outcomeId).toBe("offerSettled");

    const claim = world.claims.order.map((cid) => world.claims.byId[cid]!).find((c) => c.subject.kind === "business" && c.subject.id === shopId);
    expect(claim!.holderId).toBe(soldier1.id); // "offer" never transfers the claim.
  });
});

describe("dispute.district.sitdown (design 13 §3, story 'soldier, week n')", () => {
  it("the player as holder chooses record (no cost) then, in a second sit-down, gift (60 kL and standing with the district)", () => {
    let world = buildStarterWorld("district-sitdown-player", setup, content);
    const { family1Id, family2Id, soldier1, soldier3 } = starterCast(world);
    const { arbiterFamilyId } = setupDistrict(world);
    world.characters.byId[soldier1.id]!.playerControlled = true;
    // The "gift" option destroys 60 kL dirty from the holder's own account (dispute.claim's own "pay" test,
    // disputes.test.ts, sets this same way): plant funds directly rather than waiting on collections.
    const holderAccount = world.characters.byId[soldier1.id]!.accounts.personal;
    world.ledger.accounts.byId[holderAccount]!.dirty = 1000;
    world.ledger.minted += 1000;

    const shopId = world.geo.businesses.order[0]!;
    const shop2Id = world.geo.businesses.order[1]!;
    const roles = (shop: string): Record<string, EntityRef> => ({
      shop: ref("business", shop),
      holder: ref("character", soldier1.id),
      poacher: ref("character", soldier3.id),
      holderFamily: ref("family", family1Id),
      poacherFamily: ref("family", family2Id),
      arbiterFamily: ref("family", arbiterFamilyId),
    });
    const recordInst = insertProcess(world, "dispute.district.sitdown", "dispute", "commission", roles(shopId));
    const giftInst = insertProcess(world, "dispute.district.sitdown", "dispute", "commission", roles(shop2Id));

    const logs: TurnLog[] = [];
    // Turn 1: both instances are due; the decider (holder, playerControlled) is offered a decision (awaits).
    let r = step(world, [], content, opts);
    world = r.world;
    logs.push(r.log);
    expect(world.processes.byId[recordInst.id]!.state).toBe("awaitingDecision");
    expect(world.processes.byId[giftInst.id]!.state).toBe("awaitingDecision");
    expect(world.processes.byId[recordInst.id]!.roles["holder"]?.id).toBe(soldier1.id);

    // Turn 2: decide both.
    r = step(
      world,
      [
        { kind: "decide", instanceId: recordInst.id, optionId: "record" },
        { kind: "decide", instanceId: giftInst.id, optionId: "gift" },
      ],
      content,
      opts,
    );
    world = r.world;
    logs.push(r.log);

    const facts = factsOf(logs);
    const recordDecide = facts.find((f): f is Extract<Fact, { kind: "ProcessDecide" }> => f.kind === "ProcessDecide" && f.instanceId === recordInst.id);
    expect(recordDecide?.optionId).toBe("record");
    const recordResolve = facts.find((f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === recordInst.id);
    expect(recordResolve?.outcomeId).toMatch(/^record/);
    // "record" itself costs nothing: no MoneyDestroy tied to the record instance's own decision.
    expect(facts.some((f) => f.kind === "MoneyDestroy" && f.cause.instanceId === recordInst.id)).toBe(false);

    const giftDecide = facts.find((f): f is Extract<Fact, { kind: "ProcessDecide" }> => f.kind === "ProcessDecide" && f.instanceId === giftInst.id);
    expect(giftDecide?.optionId).toBe("gift");
    const giftMoney = facts.find(
      (f): f is Extract<Fact, { kind: "MoneyDestroy" }> => f.kind === "MoneyDestroy" && f.cause.rule === "dispute.district.sitdown.gift",
    );
    expect(giftMoney).toMatchObject({ from: holderAccount, amount: 60, money: "dirty", sink: "gift" });
    const giftStanding = facts.find(
      (f): f is Extract<Fact, { kind: "StandingDelta" }> =>
        f.kind === "StandingDelta" && f.cause.rule === "dispute.district.sitdown.gift" && f.delta === 40,
    );
    expect(giftStanding).toBeDefined();
    const giftResolve = facts.find((f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === giftInst.id);
    expect(giftResolve?.outcomeId).toMatch(/^gift/);
  });

  it("an AI-only sit-down (neither party playerControlled) resolves to a ruling and moves standing between the two families", () => {
    let world = buildStarterWorld("district-sitdown-ai", setup, content);
    const { family1Id, family2Id, soldier1, soldier3 } = starterCast(world);
    const { arbiterFamilyId } = setupDistrict(world);
    // Friendly standing toward the district (>= 0, the starter default of 0 already qualifies) so "record"
    // (aiDefault) resolves via the stallStays/split branch deterministically -- both move standing upward.
    expect(world.standing[standingKey(family1Id, arbiterFamilyId)] ?? 0).toBe(0);

    const shopId = world.geo.businesses.order[0]!;
    const inst = insertProcess(world, "dispute.district.sitdown", "dispute", "commission", {
      shop: ref("business", shopId),
      holder: ref("character", soldier1.id),
      poacher: ref("character", soldier3.id),
      holderFamily: ref("family", family1Id),
      poacherFamily: ref("family", family2Id),
      arbiterFamily: ref("family", arbiterFamilyId),
    });

    // Neither holder nor poacher nor the arbiter's head is playerControlled, so the AI default ("record")
    // resolves the same turn the instance becomes due -- no awaitingDecision step needed.
    const r = step(world, [], content, opts);
    world = r.world;

    const facts = factsOf([r.log]);
    const resolve = facts.find((f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === inst.id);
    expect(resolve).toBeDefined();
    expect(resolve!.outcomeId).toMatch(/^record/);
    expect(world.standing[standingKey(family1Id, family2Id)] ?? 0).toBeGreaterThan(0); // stallStays (+60) or split (+20): both positive.
  });
});

describe("dispute.district.refusedRuling schedules war.declare (design 13 §3)", () => {
  it("StandingDelta -200 with the district, then war.declare fires and sets WarStateSet both ways", () => {
    let world = buildStarterWorld("district-refused-ruling", setup, content);
    const { family1Id, family2Id, soldier1, soldier3 } = starterCast(world);
    const { arbiterFamilyId } = setupDistrict(world);

    const shopId = world.geo.businesses.order[0]!;
    const inst = insertProcess(world, "dispute.district.refusedRuling", "dispute", "commission", {
      shop: ref("business", shopId),
      holder: ref("character", soldier1.id),
      poacher: ref("character", soldier3.id),
      refusingFamily: ref("family", family1Id),
      otherFamily: ref("family", family2Id),
      districtFamily: ref("family", arbiterFamilyId),
    });

    const logs: TurnLog[] = [];
    let r = step(world, [], content, opts); // refusedRuling resolves: StandingDelta -200, schedules war.declare delay 1.
    world = r.world;
    logs.push(r.log);

    let facts = factsOf(logs);
    const resolve = facts.find((f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === inst.id);
    expect(resolve?.outcomeId).toBe("refusedRuling");
    const standing = facts.find(
      (f): f is Extract<Fact, { kind: "StandingDelta" }> =>
        f.kind === "StandingDelta" && f.cause.rule === "dispute.district.refusedRuling" && f.delta === -200,
    );
    expect(standing).toMatchObject({ familyA: family1Id, familyB: arbiterFamilyId });
    const scheduled = facts.find((f): f is Extract<Fact, { kind: "ScheduleAdd" }> => f.kind === "ScheduleAdd" && f.entry.templateId === "war.declare");
    expect(scheduled).toBeDefined();
    expect(scheduled!.entry.bind["aggressor"]).toEqual({ kind: "family", id: family1Id });
    expect(scheduled!.entry.bind["defender"]).toEqual({ kind: "family", id: family2Id });

    r = step(world, [], content, opts); // the scheduled entry (fireTurn = turn+1) fires: war.declare spawns and resolves.
    world = r.world;
    logs.push(r.log);
    facts = factsOf(logs);

    const warSpawn = processSpawns(facts, "war.declare").find(
      (f) => f.instance.roles["aggressor"]?.id === family1Id && f.instance.roles["defender"]?.id === family2Id,
    );
    expect(warSpawn).toBeDefined();
    expect(
      facts.some(
        (f) => f.kind === "WarStateSet" && f.familyId === family1Id && f.enemyFamilyId === family2Id,
      ),
    ).toBe(true);
    expect(
      facts.some(
        (f) => f.kind === "WarStateSet" && f.familyId === family2Id && f.enemyFamilyId === family1Id,
      ),
    ).toBe(true);
    expect(world.families.byId[family1Id]!.warWith).toBe(family2Id);
    expect(world.families.byId[family2Id]!.warWith).toBe(family1Id);
  });
});
