// Scenario tests for situations-c (design 10 §7-§8): the associate who is short (with its follow-up, the
// associate leaving) and the loan that went bad (with its follow-up, the loan paid off in full). One scenario
// per template driven through `step()`, plus a scenario per follow-up. Content lives in packages/content; sim
// may not import it for production code (design 01 §2), but this test file is exempt (eslint.config.js ignores
// packages/sim/src/**/*.test.ts from the sim-only-imports-@borgata/shared rule), the same exemption
// soldier.test.ts and associate-week.test.ts already rely on.
import { EMPTY_CONTENT } from "./content-types.js";
import { describe, expect, it } from "vitest";
import { addCharacter } from "./world.js";
import type { Character, GameSetup, World } from "./world.js";
import { mintId, tableInsert } from "@borgata/shared";
import type { BusinessId, CharacterId, ClaimId } from "@borgata/shared";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import { addBlock, addBusiness, addTown } from "./fixtures.js";
import type { ProcessTemplate } from "./engine/types.js";
import { SITUATIONS_C_TEMPLATES } from "../../content/src/templates/situations-c.js";

const [associateShort, associateLeaves, loanBad, loanExtended] = SITUATIONS_C_TEMPLATES;

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const opts = { debug: true };

function contentOf(templates: ProcessTemplate[]) {
  return { ...EMPTY_CONTENT, version: "t", templates };
}

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

function processSpawns(facts: readonly Fact[], templateId: string): Extract<Fact, { kind: "ProcessSpawn" }>[] {
  return facts.filter((f): f is Extract<Fact, { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn" && f.instance.templateId === templateId);
}

function resolves(facts: readonly Fact[], templateId: string, instanceId: string): Extract<Fact, { kind: "ProcessResolve" }>[] {
  return facts.filter(
    (f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.cause.templateId === templateId && f.instanceId === instanceId,
  );
}

/** The starter world's chief, "Turi Lo Cascio" (starter.ts, design 02 §4). Copy of soldier.test.ts's own helper
 * (template/test files do not import each other). */
function findByName(world: World, name: string): Character {
  const cid = world.characters.order.find((id) => world.characters.byId[id]!.name === name);
  if (!cid) throw new Error(`starter world has no character named "${name}"`);
  return world.characters.byId[cid]!;
}

/** Fast-forwards the starter world's player past the ceremony directly to soldier, sponsored by the starter
 * crew's chief. Copy of soldier.test.ts's own `promoteToSoldier`. */
function promoteToSoldier(world: World): { meId: CharacterId; chief: Character } {
  const meId = world.player.characterId;
  const player = world.characters.byId[meId]!;
  const chief = findByName(world, "Turi Lo Cascio");
  player.rank = "soldier";
  player.superiorId = chief.id;
  player.crewId = chief.crewId;
  if (chief.crewId) {
    const crew = world.crews.byId[chief.crewId]!;
    if (!crew.memberIds.includes(meId)) crew.memberIds.push(meId);
  }
  if (!world.player.uiLayersUnlocked.includes("loanBook")) world.player.uiLayersUnlocked.push("loanBook");
  return { meId, chief };
}

/** An associate on record with `superiorId`, with the matching `Claim` `invariants/claims.ts`'s
 * `associateOnRecordConsistent` requires (design 02 §9). Copy of soldier.test.ts's own `addAssociateOnRecord`. */
function addAssociateOnRecord(world: World, name: string, superiorId: CharacterId): Character {
  const superior = world.characters.byId[superiorId]!;
  const man = addCharacter(world, { name, rank: "associate", age: 22, familyId: superior.familyId, superiorId, onRecordWith: superiorId });
  const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: man.id }, holderId: superiorId, since: world.meta.turn });
  return man;
}

describe("soldier.associate.short (design 10 §7)", () => {
  it("spawns from a CollectionMissed fact naming the associate as collector, and 'confront' costs him loyalty and warns him", () => {
    const content = contentOf([associateShort!]);
    let world = buildStarterWorld("assoc-short-1", setup, content);
    const { meId } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Pino", meId);
    const shopId = world.geo.businesses.order[0]! as BusinessId;

    // Turn 0: inject the missed collection, naming the associate (not the player) as collector.
    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "CollectionMissed", businessId: shopId, collectorId: man.id, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [r0.log];

    // Turn 1: the fact is now in recentFacts, within spawnFrom's default withinTurns of 1.
    const r1 = step(world, [], content, opts);
    world = r1.world;
    logs.push(r1.log);

    const spawns = processSpawns(factsOf(logs), "soldier.associate.short");
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.instance.roles["man"]).toEqual({ kind: "character", id: man.id });
    expect(spawns[0]!.instance.roles["me"]).toEqual({ kind: "character", id: meId });
    const instanceId = spawns[0]!.instance.id;
    expect(r1.log.entries.some((e) => e.kind === "fact" && e.fact.kind === "ProcessAwaitDecision" && e.fact.instanceId === instanceId)).toBe(true);

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "confront" }], content, opts);
    world = rDecide.world;
    logs.push(rDecide.log);
    const facts = factsOf(logs);

    expect(resolves(facts, "soldier.associate.short", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === man.id && f.delta === -20)).toBe(true);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === man.id && f.memory.tag === "warnedByBoss")).toBe(true);
  });

  it("'letGo' costs nothing", () => {
    const content = contentOf([associateShort!]);
    let world = buildStarterWorld("assoc-short-2", setup, content);
    const { meId } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Pino", meId);
    const shopId = world.geo.businesses.order[0]! as BusinessId;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "CollectionMissed", businessId: shopId, collectorId: man.id, cause: { rule: "test" } }] });
    world = r0.world;
    const r1 = step(world, [], content, opts);
    world = r1.world;
    const spawns = processSpawns(factsOf([r0.log, r1.log]), "soldier.associate.short");
    const instanceId = spawns[0]!.instance.id;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "letGo" }], content, opts);
    const facts = factsOf([r0.log, r1.log, rDecide.log]);

    expect(resolves(facts, "soldier.associate.short", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === man.id)).toBe(false);
    expect(facts.some((f) => f.kind === "ShareRuleSet" && f.subordinateId === man.id)).toBe(false);
  });

  it("'squeeze' raises the man's share to 60 percent and costs him loyalty", () => {
    const content = contentOf([associateShort!]);
    let world = buildStarterWorld("assoc-short-3", setup, content);
    const { meId } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Pino", meId);
    const shopId = world.geo.businesses.order[0]! as BusinessId;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "CollectionMissed", businessId: shopId, collectorId: man.id, cause: { rule: "test" } }] });
    world = r0.world;
    const r1 = step(world, [], content, opts);
    world = r1.world;
    const spawns = processSpawns(factsOf([r0.log, r1.log]), "soldier.associate.short");
    const instanceId = spawns[0]!.instance.id;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "squeeze" }], content, opts);
    const facts = factsOf([r0.log, r1.log, rDecide.log]);

    expect(resolves(facts, "soldier.associate.short", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "ShareRuleSet" && f.superiorId === meId && f.subordinateId === man.id && f.rule.percent === 600)).toBe(true);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === man.id && f.delta === -40)).toBe(true);
  });
});

describe("soldier.associate.leaves (design 10 §7 follow-up)", () => {
  it("releases the man's claim and clears his superior", () => {
    const content = contentOf([associateLeaves!]);
    let world = buildStarterWorld("assoc-leaves-1", setup, content);
    const { meId } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Pino", meId);

    // Schedule the follow-up directly (this file's header note: the parent's own trigger is a 10 percent draw,
    // engine/scheduler.ts; injecting `ScheduleAdd` tests the follow-up's own effects deterministically).
    const entry = {
      id: "sched-test-leaves",
      fireTurn: world.meta.turn + 1,
      templateId: "soldier.associate.leaves",
      bind: { man: { kind: "character" as const, id: man.id } },
      causeChainId: "test-chain",
      priority: 0,
      createdTurn: world.meta.turn,
    };
    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "ScheduleAdd", entry, cause: { rule: "test" } }] });
    world = r0.world;
    const r1 = step(world, [], content, opts);
    world = r1.world;
    const facts = factsOf([r0.log, r1.log]);

    expect(facts.some((f) => f.kind === "ClaimRelease")).toBe(true);
    expect(facts.some((f) => f.kind === "SuperiorSet" && f.characterId === man.id && f.superiorId === null)).toBe(true);
    expect(world.characters.byId[man.id]!.onRecordWith).toBeNull();
    expect(world.characters.byId[man.id]!.superiorId).toBeNull();
  });
});

/** A fresh, unclaimed business in a town the player's family operates (`lend`'s own checks, systems/player-
 * actions.ts): the starter world's own businesses already carry a generation-time claim (a collector needs one
 * to tax them), so "unclaimed" scenarios need a business fixtures.ts mints instead. Also tops up the lender's
 * account so `lend`'s balance check passes (soldier.test.ts's own `openBook` convention: adjust `minted` too, so
 * `money.conservation` stays honest about fixture-injected cash). */
function addLoanableBusiness(world: World, lenderId: CharacterId): BusinessId {
  const lender = world.characters.byId[lenderId]!;
  const family = world.families.byId[lender.familyId!]!;
  const town = addTown(world, { name: "Test Town", archetype: "generic", familyId: family.id });
  family.townIds.push(town.id);
  const block = addBlock(world, town.id);
  const business = addBusiness(world, block.id, { type: "shop", size: 2 });
  const account = world.ledger.accounts.byId[lender.accounts.personal]!;
  account.dirty += 200;
  world.ledger.minted += 200;
  return business.id;
}

describe("soldier.loan.bad (design 10 §8)", () => {
  it("spawns from a LoanDefault fact naming the shop and the lender, and 'take' claims the unclaimed shop", () => {
    const content = contentOf([loanBad!]);
    let world = buildStarterWorld("loan-bad-1", setup, content);
    const { meId } = promoteToSoldier(world);
    const shopId = addLoanableBusiness(world, meId);

    const rLend = step(world, [{ kind: "lend", businessId: shopId, principal: 100, points: 2 }], content, opts);
    world = rLend.world;
    const loanOpen = factsOf([rLend.log]).find((f): f is Extract<Fact, { kind: "LoanOpen" }> => f.kind === "LoanOpen");
    expect(loanOpen).toBeDefined();
    const loanId = loanOpen!.loan.id;

    // Turn after opening: inject the default directly (this task's own Part 1: `businessId` on `LoanDefault`).
    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "LoanDefault", lenderId: meId, loanId, businessId: shopId, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [rLend.log, r0.log];

    const r1 = step(world, [], content, opts);
    world = r1.world;
    logs.push(r1.log);

    const spawns = processSpawns(factsOf(logs), "soldier.loan.bad");
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.instance.roles["shop"]).toEqual({ kind: "business", id: shopId });
    expect(spawns[0]!.instance.roles["me"]).toEqual({ kind: "character", id: meId });
    const instanceId = spawns[0]!.instance.id;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "take" }], content, opts);
    world = rDecide.world;
    logs.push(rDecide.log);
    const facts = factsOf(logs);

    expect(resolves(facts, "soldier.loan.bad", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "ClaimSet" && f.subject.kind === "business" && f.subject.id === shopId && f.holderId === meId)).toBe(true);
    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === -20)).toBe(true);
  });

  it("'take' does not touch the claim when the shop is already claimed by someone else", () => {
    const content = contentOf([loanBad!]);
    let world = buildStarterWorld("loan-bad-2", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    const shopId = addLoanableBusiness(world, meId);

    const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
    tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "business", id: shopId }, holderId: chief.id, since: world.meta.turn });

    const rLend = step(world, [{ kind: "lend", businessId: shopId, principal: 100, points: 2 }], content, opts);
    world = rLend.world;
    const loanOpen = factsOf([rLend.log]).find((f): f is Extract<Fact, { kind: "LoanOpen" }> => f.kind === "LoanOpen")!;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "LoanDefault", lenderId: meId, loanId: loanOpen.loan.id, businessId: shopId, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [rLend.log, r0.log];
    const r1 = step(world, [], content, opts);
    world = r1.world;
    logs.push(r1.log);

    const spawns = processSpawns(factsOf(logs), "soldier.loan.bad");
    const instanceId = spawns[0]!.instance.id;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "take" }], content, opts);
    logs.push(rDecide.log);
    const facts = factsOf(logs);

    expect(resolves(facts, "soldier.loan.bad", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "ClaimSet" && f.subject.kind === "business" && f.subject.id === shopId)).toBe(false);
    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === -20)).toBe(true);
    expect(world.claims.byId[claimId]!.holderId).toBe(chief.id);
  });

  it("'stock' mints money and raises fear on the shop", () => {
    const content = contentOf([loanBad!]);
    let world = buildStarterWorld("loan-bad-3", setup, content);
    const { meId } = promoteToSoldier(world);
    const meAccount = world.characters.byId[meId]!.accounts.personal;
    const shopId = addLoanableBusiness(world, meId);

    const rLend = step(world, [{ kind: "lend", businessId: shopId, principal: 100, points: 2 }], content, opts);
    world = rLend.world;
    const loanOpen = factsOf([rLend.log]).find((f): f is Extract<Fact, { kind: "LoanOpen" }> => f.kind === "LoanOpen")!;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "LoanDefault", lenderId: meId, loanId: loanOpen.loan.id, businessId: shopId, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [rLend.log, r0.log];
    const r1 = step(world, [], content, opts);
    world = r1.world;
    logs.push(r1.log);

    const balanceBefore = world.ledger.accounts.byId[meAccount]!.dirty;
    const spawns = processSpawns(factsOf(logs), "soldier.loan.bad");
    const instanceId = spawns[0]!.instance.id;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "stock" }], content, opts);
    world = rDecide.world;
    logs.push(rDecide.log);
    const facts = factsOf(logs);

    expect(resolves(facts, "soldier.loan.bad", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "MoneyMint" && f.to === meAccount && f.amount === 60)).toBe(true);
    expect(facts.some((f) => f.kind === "FearDelta" && f.businessId === shopId && f.delta === 80)).toBe(true);
    expect(world.ledger.accounts.byId[meAccount]!.dirty).toBeGreaterThan(balanceBefore);
  });

  it("'extend' resolves without claiming the shop or minting money this turn", () => {
    const content = contentOf([loanBad!]);
    let world = buildStarterWorld("loan-bad-4", setup, content);
    const { meId } = promoteToSoldier(world);
    const shopId = addLoanableBusiness(world, meId);

    const rLend = step(world, [{ kind: "lend", businessId: shopId, principal: 100, points: 2 }], content, opts);
    world = rLend.world;
    const loanOpen = factsOf([rLend.log]).find((f): f is Extract<Fact, { kind: "LoanOpen" }> => f.kind === "LoanOpen")!;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "LoanDefault", lenderId: meId, loanId: loanOpen.loan.id, businessId: shopId, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [rLend.log, r0.log];
    const r1 = step(world, [], content, opts);
    world = r1.world;
    logs.push(r1.log);

    const spawns = processSpawns(factsOf(logs), "soldier.loan.bad");
    const instanceId = spawns[0]!.instance.id;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "extend" }], content, opts);
    logs.push(rDecide.log);
    const facts = factsOf(logs);

    expect(resolves(facts, "soldier.loan.bad", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "ClaimSet" && f.subject.kind === "business" && f.subject.id === shopId)).toBe(false);
  });
});

describe("soldier.loan.extended (design 10 §8 follow-up)", () => {
  it("mints 25 kL to the lender", () => {
    const content = contentOf([loanExtended!]);
    let world = buildStarterWorld("loan-extended-1", setup, content);
    const { meId } = promoteToSoldier(world);
    const meAccount = world.characters.byId[meId]!.accounts.personal;

    const entry = {
      id: "sched-test-extended",
      fireTurn: world.meta.turn + 1,
      templateId: "soldier.loan.extended",
      bind: { me: { kind: "character" as const, id: meId } },
      causeChainId: "test-chain",
      priority: 0,
      createdTurn: world.meta.turn,
    };
    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "ScheduleAdd", entry, cause: { rule: "test" } }] });
    world = r0.world;
    const r1 = step(world, [], content, opts);
    world = r1.world;
    const facts = factsOf([r0.log, r1.log]);

    expect(facts.some((f) => f.kind === "MoneyMint" && f.to === meAccount && f.amount === 25)).toBe(true);
  });
});
