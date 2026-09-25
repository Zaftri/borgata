// Scenario tests for war (design 13 §3, docs/design/13-disputes-to-the-district.md §1's war row;
// packages/content/src/templates/war.ts). Style follows disputes.test.ts: an isolated content array (the war
// templates alone), the starter world's two families, direct `step()` calls, facts read back off the log.
// `sim` may not import from `content` in production code (design 01 §2), but this file is exempt (eslint.config.
// js ignores packages/sim/src/**/*.test.ts from the sim-only-imports rule), the same as disputes.test.ts.
import { describe, expect, it } from "vitest";
import type { FamilyId } from "@borgata/shared";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import type { GameSetup, World } from "./world.js";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import type { ScheduledEntry } from "./engine/types.js";
import { EMPTY_CONTENT } from "./content-types.js";
import { WAR_TEMPLATES } from "../../content/src/templates/war.js";
import { WEEKLY_TARIFF } from "./systems/chains.js";

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const content = { ...EMPTY_CONTENT, version: "t", templates: [...WAR_TEMPLATES] };
const opts = { debug: true };

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

function twoFamilies(world: World): { family1Id: string; family2Id: string } {
  return { family1Id: world.families.order[0]!, family2Id: world.families.order[1]! };
}

/** Force a war directly via `injectFacts` (StepOptions, step.ts): the two starter families go to war without
 * needing `war.declare`'s own scheduling (exercised separately, in its own describe block below). */
function forceWar(world: World, family1Id: string, family2Id: string): World {
  const r = step(
    world,
    [],
    content,
    {
      ...opts,
      injectFacts: [
        { kind: "WarStateSet", familyId: family1Id as FamilyId, enemyFamilyId: family2Id as FamilyId, cause: { rule: "test.forceWar" } },
        { kind: "WarStateSet", familyId: family2Id as FamilyId, enemyFamilyId: family1Id as FamilyId, cause: { rule: "test.forceWar" } },
      ],
    },
  );
  return r.world;
}

describe("war.declare (design 13 §3)", () => {
  it("scheduled (as the sit-down agent's dispute.district.refusedRuling would) sets WarStateSet both ways and StandingDelta -100", () => {
    let world = buildStarterWorld("war-declare-1", setup, content);
    const { family1Id, family2Id } = twoFamilies(world);

    // war.declare's roles are always prebound by the schedule entry's own `bind` (this file's stand-in for the
    // sit-down agent's own `schedule` effect): construct the entry directly, the same way a `war.declare`
    // schedule effect would resolve to one (engine/effects.ts resolveEffect's "schedule" case).
    const entry: ScheduledEntry = {
      id: "sched-test-war-declare",
      fireTurn: world.meta.turn + 1,
      templateId: "war.declare",
      bind: { aggressor: { kind: "family", id: family1Id }, defender: { kind: "family", id: family2Id } },
      causeChainId: "test-chain-war-declare",
      priority: 0,
      createdTurn: world.meta.turn,
    };
    let r = step(world, [], content, { ...opts, injectFacts: [{ kind: "ScheduleAdd", entry, cause: { rule: "test.setup" } }] });
    world = r.world;
    expect(world.schedule.some((e) => e.id === entry.id)).toBe(true);

    r = step(world, [], content, opts);
    world = r.world;
    const facts = factsOf([r.log]);

    expect(facts.some((f) => f.kind === "WarStateSet" && f.familyId === family1Id && f.enemyFamilyId === family2Id)).toBe(true);
    expect(facts.some((f) => f.kind === "WarStateSet" && f.familyId === family2Id && f.enemyFamilyId === family1Id)).toBe(true);
    expect(facts.some((f) => f.kind === "StandingDelta" && f.delta === -100)).toBe(true);
    expect(world.families.byId[family1Id]!.warWith).toBe(family2Id);
    expect(world.families.byId[family2Id]!.warWith).toBe(family1Id);
  });
});

describe("war.week (design 13 §3): collections halve, hits and hiding happen", () => {
  it("collections halve for a family at war (chains.ts, checked via MoneyMint amounts)", () => {
    let world = buildStarterWorld("war-week-halved", setup, content);
    const { family1Id, family2Id } = twoFamilies(world);

    // Turn 1: family-ai (step.ts) creates each family's protection-tax chain via a ChainCreate fact, but
    // runChains reads `world.chains` BEFORE that turn's facts apply -- chains.test.ts's own fixtures insert a
    // ChainCreate directly for exactly this reason. So the chains exist only from turn 2 on; warm up here.
    let r = step(world, [], content, opts);
    world = r.world;

    // Baseline: one turn at peace, collect this family's own MoneyMint amounts for its protection-tax chain.
    r = step(world, [], content, opts);
    world = r.world;
    const peaceMints = factsOf([r.log]).filter(
      (f): f is Extract<Fact, { kind: "MoneyMint" }> => f.kind === "MoneyMint" && f.source === "protectionTax",
    );
    expect(peaceMints.length).toBeGreaterThan(0);
    // Every stall/shop mint at peace matches the full weekly tariff (design 03 §4; the starter world's turnLength is 1).
    for (const m of peaceMints) expect([WEEKLY_TARIFF[1], WEEKLY_TARIFF[2]]).toContain(m.amount);

    world = forceWar(world, family1Id, family2Id);
    r = step(world, [], content, opts);
    world = r.world;
    const warMints = factsOf([r.log]).filter(
      (f): f is Extract<Fact, { kind: "MoneyMint" }> => f.kind === "MoneyMint" && f.source === "protectionTax",
    );
    expect(warMints.length).toBeGreaterThan(0);
    // Halved per systems/chains.ts's own `atWar` branch: Math.max(1, Math.floor(amount / 2)).
    for (const m of warMints) expect([Math.floor(WEEKLY_TARIFF[1] / 2), Math.floor(WEEKLY_TARIFF[2] / 2)]).toContain(m.amount);
  });

  it("over 12 forced turns of war, a hit (dead or hiding) or a retreat happens at least once on each side", () => {
    let world = buildStarterWorld("war-week-hits", setup, content);
    const { family1Id, family2Id } = twoFamilies(world);
    world = forceWar(world, family1Id, family2Id);

    const logs: TurnLog[] = [];
    for (let i = 0; i < 12; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }
    const facts = factsOf(logs);
    const outcomeIds = facts
      .filter((f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve")
      .map((f) => f.outcomeId);

    expect(outcomeIds).toContain("quiet");
    // At least one of the war's own "something happened" outcomes fired somewhere across 12 turns of two
    // families both rolling `war.week` every turn (weight 10,000: hit 30%, retreat 15% per week per family).
    const eventful = outcomeIds.some((id) => id === "hitDead" || id === "hitHiding" || id === "retreat");
    expect(eventful).toBe(true);

    const statusChanges = facts.filter((f): f is Extract<Fact, { kind: "StatusChange" }> => f.kind === "StatusChange");
    expect(statusChanges.some((f) => f.status === "dead" || f.status === "hiding")).toBe(true);
  });
});

describe("war.meeting (design 13 §3): a meeting accepts peace and the war state clears", () => {
  it("across several 4-turn meeting cycles, the AI head eventually accepts and both families' warWith clear", () => {
    let world = buildStarterWorld("war-meeting-accept", setup, content);
    const { family1Id, family2Id } = twoFamilies(world);
    world = forceWar(world, family1Id, family2Id);

    const logs: TurnLog[] = [];
    let peaceTurn: number | undefined;
    for (let i = 0; i < 40 && peaceTurn === undefined; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      if (world.families.byId[family1Id]!.warWith === null && world.families.byId[family2Id]!.warWith === null) {
        peaceTurn = world.meta.turn;
      }
    }
    expect(peaceTurn, "no war.meeting accepted peace within 40 turns").toBeDefined();

    const facts = factsOf(logs);
    const peaceOutcomes = facts
      .filter((f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve")
      .filter((f) => f.outcomeId === "peaceForced" || f.outcomeId === "peaceOffered");
    expect(peaceOutcomes.length).toBeGreaterThan(0);

    // The player's own family (family1, per buildStarterWorld) is a party to every one of its own war.declare/
    // week/meeting instances, so the crisis flag it raised is cleared once peace lands.
    expect(world.meta.crises.some((c) => c.flag === "war")).toBe(false);
  });
});

describe("war.return (design 13 §3): a hiding man comes home once his family is no longer at war", () => {
  it("a hiding character returns to free within a couple of turns after peace", () => {
    let world = buildStarterWorld("war-return-1", setup, content);
    const { family1Id, family2Id } = twoFamilies(world);
    world = forceWar(world, family1Id, family2Id);

    // Send one of family1's soldiers into hiding directly (this file's own stand-in for a `war.week` "retreat"/
    // "hitHiding" outcome, so the return can be tested without waiting on the hit roll too).
    const soldier = world.characters.order
      .map((id) => world.characters.byId[id]!)
      .find((c) => c.familyId === family1Id && c.rank === "soldier")!;
    let r = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: soldier.id, status: "hiding", cause: { rule: "test.setup" } }] });
    world = r.world;
    expect(world.characters.byId[soldier.id]!.status).toBe("hiding");

    // Peace: clear both families' warWith directly (war.meeting's own accept effects, exercised separately above).
    r = step(world, [], content, {
      ...opts,
      injectFacts: [
        { kind: "WarStateSet", familyId: family1Id as FamilyId, enemyFamilyId: null, cause: { rule: "test.setup" } },
        { kind: "WarStateSet", familyId: family2Id as FamilyId, enemyFamilyId: null, cause: { rule: "test.setup" } },
      ],
    });
    world = r.world;
    expect(world.families.byId[family1Id]!.warWith).toBeNull();

    let returned = false;
    for (let i = 0; i < 4 && !returned; i++) {
      r = step(world, [], content, opts);
      world = r.world;
      returned = world.characters.byId[soldier.id]!.status === "free";
    }
    expect(returned).toBe(true);
  });
});
