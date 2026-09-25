// Scenario tests for design 12 §3's content (packages/content/src/templates/obligations.ts): one scenario per
// template, driven through `step()`, isolating each template in its own content array the same way
// soldier.test.ts does (this file's own header note there: sim may not import content for production code,
// design 01 §2, but a *.test.ts file is exempted, eslint.config.js).
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT } from "./content-types.js";
import { applyFacts } from "./reducers/index.js";
import { TurnLogBuilder } from "./log.js";
import { buildStarterWorld } from "./starter.js";
import { step } from "./step.js";
import { addCharacter, playerCharacter, type Character, type GameSetup, type Obligation, type World } from "./world.js";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import type { ProcessTemplate } from "./engine/types.js";
import { mintId, tableInsert, type CharacterId, type ClaimId } from "@borgata/shared";
import { OBLIGATION_TEMPLATES } from "../../content/src/templates/obligations.js";

const [prisonerOpen, dueCard, missedPrisoner, funeral, familyWeakenedNews, familyRecoveredNews, lifestyleFallen] = OBLIGATION_TEMPLATES;

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const opts = { debug: true };
const cause = { rule: "test" };

function contentOf(templates: ProcessTemplate[]) {
  return { ...EMPTY_CONTENT, version: "t", templates };
}

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

function findByName(world: World, name: string): Character {
  const cid = world.characters.order.find((id) => world.characters.byId[id]!.name === name);
  if (!cid) throw new Error(`starter world has no character named "${name}"`);
  return world.characters.byId[cid]!;
}

/** Same convention as soldier.test.ts's own `promoteToSoldier`. */
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

/** An associate on record with `superiorId` (soldier.test.ts's own convention): a fresh character, not an
 * existing crew member, so reassigning his superior never trips `families.crewsConsistent` (a crew member's
 * superior must be the crew's own chief). */
function addAssociateOnRecord(world: World, name: string, superiorId: CharacterId): Character {
  const superior = world.characters.byId[superiorId]!;
  const man = addCharacter(world, { name, rank: "associate", age: 22, familyId: superior.familyId, superiorId, onRecordWith: superiorId });
  const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: man.id }, holderId: superiorId, since: world.meta.turn });
  return man;
}

function stepUntilAwaitingDecision(
  world: World,
  content: ReturnType<typeof contentOf>,
  templateId: string,
  maxTurns: number,
): { world: World; logs: TurnLog[]; instanceId: string } {
  const logs: TurnLog[] = [];
  let instanceId: string | undefined;
  for (let i = 0; i < maxTurns && !instanceId; i++) {
    const r = step(world, [], content, opts);
    world = r.world;
    logs.push(r.log);
    const inst = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === templateId && p.state === "awaitingDecision");
    if (inst) instanceId = inst.id;
  }
  if (!instanceId) throw new Error(`no "${templateId}" instance reached awaitingDecision within ${maxTurns} turns`);
  return { world, logs, instanceId };
}

/** `obligations.test.ts`'s own helper: opens a real `Obligation` directly through the reducer (no card). */
function open(world: World, o: Partial<Obligation> & Pick<Obligation, "id" | "kind" | "debtorId" | "beneficiary" | "amount">): void {
  const log = new TurnLogBuilder(world.meta.turn);
  const full: Obligation = { everyTurns: null, nextDueTurn: world.meta.turn, untilTurn: null, met: 0, missed: 0, lastResult: null, status: "open", ...o };
  applyFacts(world, [{ kind: "ObligationOpen", obligation: full, cause }], log);
  const rejected = log.build().entries.filter((e) => e.kind === "rejected");
  expect(rejected, JSON.stringify(rejected)).toHaveLength(0);
}

describe("oblig.prisoner.open (design 12 §3)", () => {
  it("'support' opens a real, minted prisonerSupport obligation ($mint:ob resolves nested inside `obligation`) and pays the first week immediately", () => {
    const content = contentOf([prisonerOpen!]);
    let world = buildStarterWorld("oblig-prisoner-open-1", setup, content);
    const { meId } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Man On The Book", meId);
    const me = world.characters.byId[meId]!;
    world.ledger.accounts.byId[me.accounts.personal]!.dirty = 100;
    world.ledger.minted += 100;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: man.id, status: "arrested", untilTurn: world.meta.turn + 5, cause }] });
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "oblig.prisoner.open", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "support" }], content, opts);
    world = rDecide.world;
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);
    const openFact = facts.find((f): f is Extract<Fact, { kind: "ObligationOpen" }> => f.kind === "ObligationOpen");
    expect(openFact, JSON.stringify(facts)).toBeDefined();
    expect(openFact!.obligation.kind).toBe("prisonerSupport");
    expect(openFact!.obligation.debtorId).toBe(meId);
    expect(openFact!.obligation.beneficiary).toEqual({ kind: "character", id: man.id });
    expect(openFact!.obligation.amount).toBe(15);
    expect(typeof openFact!.obligation.id).toBe("string");
    expect(openFact!.obligation.id.length).toBeGreaterThan(0);
    // The mint actually landed in the world table (not just the raw fact), proving nested `$mint:` resolution.
    expect(world.obligations.byId[openFact!.obligation.id]).toBeDefined();

    // Design 12 §1/§2 (2026-09-25 change): the first week is paid in the very same decision, not on some later
    // turn's `ObligationDue`/`oblig.due.card` round trip -- so a man held three weeks is supported before
    // `state.detained.interrogation` (state.ts) rolls the flip in his second week.
    const obligationId = openFact!.obligation.id;
    expect(facts.some((f) => f.kind === "MoneyMove" && f.from === me.accounts.personal && f.to === man.accounts.personal && f.amount === 15)).toBe(true);
    const met = facts.find((f): f is Extract<Fact, { kind: "ObligationMet" }> => f.kind === "ObligationMet" && f.obligationId === obligationId);
    expect(met, JSON.stringify(facts)).toBeDefined();
    expect(met!.paidBy).toBe("debtor");
    expect(world.obligations.byId[obligationId]!.met).toBe(1);
    expect(world.obligations.byId[obligationId]!.lastResult).toBe("met");
    // The reducer applied ObligationOpen before ObligationMet, both from this one decision's effects list (both
    // land within `rDecide.log`, not spread across a later turn): confirms the ordering the task brief asks for.
    const decideFacts = factsOf([rDecide.log]);
    expect(decideFacts.some((f) => f.kind === "ObligationOpen")).toBe(true);
    expect(decideFacts.some((f) => f.kind === "ObligationMet" && f.obligationId === obligationId)).toBe(true);
  });

  it("'lawyer' opens a once lawyer obligation and lifts loyalty", () => {
    const content = contentOf([prisonerOpen!]);
    let world = buildStarterWorld("oblig-prisoner-open-2", setup, content);
    const { meId } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Man On The Book", meId);

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: man.id, status: "arrested", untilTurn: world.meta.turn + 5, cause }] });
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "oblig.prisoner.open", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "lawyer" }], content, opts);
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);
    const openFact = facts.find((f): f is Extract<Fact, { kind: "ObligationOpen" }> => f.kind === "ObligationOpen");
    expect(openFact!.obligation.kind).toBe("lawyer");
    expect(openFact!.obligation.everyTurns).toBeNull();
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === man.id && f.delta === 20)).toBe(true);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === man.id && f.memory.tag === "lawyered")).toBe(true);
  });

  it("'both' opens two distinct obligations (two mint prefixes do not collide) and pays the support side's first week immediately", () => {
    const content = contentOf([prisonerOpen!]);
    let world = buildStarterWorld("oblig-prisoner-open-3", setup, content);
    const { meId } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Man On The Book", meId);
    const me = world.characters.byId[meId]!;
    world.ledger.accounts.byId[me.accounts.personal]!.dirty = 100;
    world.ledger.minted += 100;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: man.id, status: "arrested", untilTurn: world.meta.turn + 5, cause }] });
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "oblig.prisoner.open", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "both" }], content, opts);
    world = rDecide.world;
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);
    const opens = facts.filter((f): f is Extract<Fact, { kind: "ObligationOpen" }> => f.kind === "ObligationOpen");
    expect(opens).toHaveLength(2);
    expect(new Set(opens.map((f) => f.obligation.id)).size).toBe(2); // distinct ids: no $mint collision
    expect(opens.some((f) => f.obligation.kind === "prisonerSupport")).toBe(true);
    const supportOpen = opens.find((f) => f.obligation.kind === "prisonerSupport")!;
    expect(facts.some((f) => f.kind === "MoneyMove" && f.from === me.accounts.personal && f.to === man.accounts.personal && f.amount === 15)).toBe(true);
    const met = facts.find((f): f is Extract<Fact, { kind: "ObligationMet" }> => f.kind === "ObligationMet" && f.obligationId === supportOpen.obligation.id);
    expect(met, JSON.stringify(facts)).toBeDefined();
    expect(world.obligations.byId[supportOpen.obligation.id]!.met).toBe(1);
    expect(opens.some((f) => f.obligation.kind === "lawyer")).toBe(true);
  });

  it("'nothing' (the default/timeout) costs the arrested man loyalty", () => {
    const content = contentOf([prisonerOpen!]);
    let world = buildStarterWorld("oblig-prisoner-open-4", setup, content);
    const { meId } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Man On The Book", meId);

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: man.id, status: "arrested", untilTurn: world.meta.turn + 5, cause }] });
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "oblig.prisoner.open", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "nothing" }], content, opts);
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === man.id && f.delta === -30)).toBe(true);
  });
});

describe("oblig.due.card (design 12 §3)", () => {
  it("'pay' pays the real obligation the same turn the memory marker lands (systems/obligations.ts reads it back)", () => {
    const content = contentOf([dueCard!]);
    let world = buildStarterWorld("oblig-due-1", setup, content);
    const me = playerCharacter(world);
    world.ledger.accounts.byId[me.accounts.personal]!.dirty = 100;
    world.ledger.minted += 100;
    const prisoner = findByName(world, "Pino Randazzo");
    prisoner.status = "arrested"; // `conditionEnded` (systems/obligations.ts) closes a prisonerSupport obligation whose beneficiary is not (still) arrested
    open(world, { id: "ob-due-1", kind: "prisonerSupport", debtorId: me.id, beneficiary: { kind: "character", id: prisoner.id }, amount: 15, everyTurns: 1 });

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "oblig.due.card", 5);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "pay" }], content, opts);
    world = rDecide.world;
    const facts = factsOf([...logs1, rDecide.log]);

    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === me.id && f.memory.tag === "obligationPay")).toBe(true);
    expect(facts.some((f) => f.kind === "MoneyMove" && f.from === me.accounts.personal && f.to === prisoner.accounts.personal && f.amount === 15)).toBe(true);
    const met = facts.find((f): f is Extract<Fact, { kind: "ObligationMet" }> => f.kind === "ObligationMet" && f.obligationId === "ob-due-1");
    expect(met, JSON.stringify(facts)).toBeDefined();
    expect(met!.paidBy).toBe("debtor");
    expect(world.obligations.byId["ob-due-1"]!.met).toBe(1);
  });

  it("'skip' (and the timeout default) misses the obligation", () => {
    const content = contentOf([dueCard!]);
    let world = buildStarterWorld("oblig-due-2", setup, content);
    const me = playerCharacter(world);
    const prisoner = findByName(world, "Pino Randazzo");
    prisoner.status = "arrested";
    open(world, { id: "ob-due-2", kind: "prisonerSupport", debtorId: me.id, beneficiary: { kind: "character", id: prisoner.id }, amount: 15, everyTurns: 1 });

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "oblig.due.card", 5);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "skip" }], content, opts);
    const facts = factsOf([...logs1, rDecide.log]);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.memory.tag === "obligationSkip")).toBe(true);
    const missed = facts.find((f): f is Extract<Fact, { kind: "ObligationMissed" }> => f.kind === "ObligationMissed" && f.obligationId === "ob-due-2");
    expect(missed, JSON.stringify(facts)).toBeDefined();
    expect(missed!.beneficiaryId).toBe(prisoner.id);
  });
});

describe("oblig.missed.prisoner (design 12 §3)", () => {
  it("a real missed prisonerSupport costs the prisoner loyalty and is remembered", () => {
    const content = contentOf([missedPrisoner!]);
    let world = buildStarterWorld("oblig-missed-1", setup, content);
    const debtor = findByName(world, "Nino Bracco"); // an AI soldier: his own purse and the family treasury both dry
    const prisoner = findByName(world, "Pino Randazzo");
    prisoner.status = "arrested";
    world.ledger.accounts.byId[debtor.accounts.personal]!.dirty = 0;
    const family = world.families.byId[debtor.familyId!]!;
    world.ledger.accounts.byId[family.treasury]!.dirty = 0;
    open(world, { id: "ob-missed-1", kind: "prisonerSupport", debtorId: debtor.id, beneficiary: { kind: "character", id: prisoner.id }, amount: 15, everyTurns: 1 });

    // Turn 0: `obligationsStep` itself (systems/obligations.ts) misses the real obligation. `spawnFrom`
    // (engine/scheduler.ts) reads the *previous* turn's recorded facts, so the content card that reacts to it
    // only spawns and resolves on the turn after; a second plain `step()` gives it that turn.
    const r0 = step(world, [], content, opts);
    world = r0.world;
    const facts0 = factsOf([r0.log]);
    const missed = facts0.find((f): f is Extract<Fact, { kind: "ObligationMissed" }> => f.kind === "ObligationMissed" && f.obligationId === "ob-missed-1");
    expect(missed, JSON.stringify(facts0)).toBeDefined();
    expect(missed!.beneficiaryId).toBe(prisoner.id);

    const r1 = step(world, [], content, opts);
    world = r1.world;
    const facts1 = factsOf([r1.log]);
    expect(facts1.some((f) => f.kind === "LoyaltyDelta" && f.characterId === prisoner.id && f.delta === -40), JSON.stringify(facts1)).toBe(true);
    expect(facts1.some((f) => f.kind === "MemoryAdd" && f.characterId === prisoner.id && f.memory.tag === "familyLeftAlone")).toBe(true);
    const noted = facts1.filter((f): f is Extract<Fact, { kind: "ReportNote" }> => f.kind === "ReportNote");
    expect(noted.length, JSON.stringify(facts1)).toBeGreaterThan(0);
  });
});

describe("oblig.funeral (design 12 §3)", () => {
  it("'attend' opens a once funeral obligation", () => {
    const content = contentOf([funeral!]);
    let world = buildStarterWorld("oblig-funeral-1", setup, content);
    const { meId } = promoteToSoldier(world);
    const dead = findByName(world, "Pino Randazzo");

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: dead.id, status: "dead", cause }] });
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "oblig.funeral", 5);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "attend" }], content, opts);
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);
    const openFact = facts.find((f): f is Extract<Fact, { kind: "ObligationOpen" }> => f.kind === "ObligationOpen");
    expect(openFact, JSON.stringify(facts)).toBeDefined();
    expect(openFact!.obligation.kind).toBe("funeral");
    expect(openFact!.obligation.debtorId).toBe(meId);
    expect(openFact!.obligation.everyTurns).toBeNull();
  });

  it("'stayAway' costs favor with the crew chief and is remembered", () => {
    const content = contentOf([funeral!]);
    let world = buildStarterWorld("oblig-funeral-2", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    const dead = findByName(world, "Pino Randazzo");

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: dead.id, status: "dead", cause }] });
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "oblig.funeral", 5);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "stayAway" }], content, opts);
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === chief.id && f.to === meId && f.delta === -20)).toBe(true);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === meId && f.memory.tag === "missedFuneral")).toBe(true);
  });
});

describe("family.weakened.news / family.recovered.news (design 12 §3)", () => {
  it("announces the player's own family weakening and recovering in the newspaper", () => {
    const contentW = contentOf([familyWeakenedNews!]);
    let world = buildStarterWorld("oblig-family-news-1", setup, contentW);
    const me = playerCharacter(world);
    // `spawnFrom` reads the *previous* turn's recorded facts (engine/scheduler.ts): the turn `injectFacts`
    // lands is too early for the same turn's spawn pass to see it; a follow-up plain `step()` does.
    const r0 = step(world, [], contentW, { ...opts, injectFacts: [{ kind: "FamilyStateSet", familyId: me.familyId!, state: "weakened", cause }] });
    world = r0.world;
    const r1 = step(world, [], contentW, opts);
    const facts = factsOf([r0.log, r1.log]);
    const noted = facts.filter((f): f is Extract<Fact, { kind: "ReportNote" }> => f.kind === "ReportNote" && f.channel === "newspaper");
    expect(noted.some((f) => /purse/i.test(f.text)), JSON.stringify(facts)).toBe(true);

    const contentR = contentOf([familyRecoveredNews!]);
    world = buildStarterWorld("oblig-family-news-2", setup, contentR);
    const me2 = playerCharacter(world);
    const r2 = step(world, [], contentR, { ...opts, injectFacts: [{ kind: "FamilyStateSet", familyId: me2.familyId!, state: "healthy", cause }] });
    world = r2.world;
    const r3 = step(world, [], contentR, opts);
    const facts2 = factsOf([r2.log, r3.log]);
    const noted2 = facts2.filter((f): f is Extract<Fact, { kind: "ReportNote" }> => f.kind === "ReportNote" && f.channel === "newspaper");
    expect(noted2.some((f) => /feet again/i.test(f.text)), JSON.stringify(facts2)).toBe(true);
  });
});

describe("lifestyle.fallen (design 12 §3)", () => {
  it("prints a rare newspaper flavor line when the player falls to modest", () => {
    const content = contentOf([lifestyleFallen!]);
    let world = buildStarterWorld("oblig-lifestyle-1", setup, content);
    const me = playerCharacter(world);
    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "LifestyleSet", characterId: me.id, lifestyle: "modest", cause: { rule: "lifestyle.unaffordable", actorId: me.id } }] });
    world = r0.world;
    const r1 = step(world, [], content, opts);
    const facts = factsOf([r0.log, r1.log]);
    const noted = facts.filter((f): f is Extract<Fact, { kind: "ReportNote" }> => f.kind === "ReportNote" && f.channel === "newspaper");
    expect(noted.some((f) => /bar/i.test(f.text)), JSON.stringify(facts)).toBe(true);
  });
});
