// Design 12 contracts: obligations reducer and system, lifestyle, family health, the flip roll's support term.
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT } from "./content-types.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { buildStarterWorld } from "./starter.js";
import { obligationsStep, prisonerSupported, WEAKENED_AFTER_TURNS } from "./systems/obligations.js";
import { computeWeight } from "./systems/progression.js";
import { step } from "./step.js";
import { playerCharacter, type Obligation, type World } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function open(world: World, o: Partial<Obligation> & Pick<Obligation, "id" | "kind" | "debtorId" | "beneficiary" | "amount">): void {
  const log = new TurnLogBuilder(world.meta.turn);
  const full: Obligation = { everyTurns: null, nextDueTurn: world.meta.turn, untilTurn: null, met: 0, missed: 0, lastResult: null, status: "open", ...o };
  applyFacts(world, [{ kind: "ObligationOpen", obligation: full, cause }], log);
  const rejected = log.build().entries.filter((e) => e.kind === "rejected");
  expect(rejected, JSON.stringify(rejected)).toHaveLength(0);
}

function soldierOf(world: World): ReturnType<typeof playerCharacter> {
  const s = Object.values(world.characters.byId).find((c) => c.rank === "soldier" && !c.playerControlled)!;
  return s;
}

describe("obligations reducer", () => {
  it("opens, meets, misses and closes", () => {
    const world = buildStarterWorld("oblig-1", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const s = soldierOf(world);
    open(world, { id: "ob-1", kind: "prisonerSupport", debtorId: me.id, beneficiary: { kind: "character", id: s.id }, amount: 15, everyTurns: 1 });
    const log = new TurnLogBuilder(world.meta.turn);
    applyFacts(world, [{ kind: "ObligationMet", obligationId: "ob-1", paidBy: "debtor", cause }], log);
    expect(world.obligations.byId["ob-1"]!.met).toBe(1);
    expect(world.obligations.byId["ob-1"]!.nextDueTurn).toBe(world.meta.turn + 1);
    applyFacts(world, [{ kind: "ObligationMissed", obligationId: "ob-1", debtorId: me.id, obligationKind: "prisonerSupport", cause }], log);
    expect(world.obligations.byId["ob-1"]!.lastResult).toBe("missed");
    applyFacts(world, [{ kind: "ObligationClose", obligationId: "ob-1", reason: "test", cause }], log);
    expect(world.obligations.byId["ob-1"]).toBeUndefined();
    applyFacts(world, [{ kind: "ObligationMet", obligationId: "ob-1", paidBy: "debtor", cause }], log);
    expect(log.build().entries.filter((e) => e.kind === "rejected")).toHaveLength(1);
  });

  it("a once-only obligation closes when met", () => {
    const world = buildStarterWorld("oblig-2", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    open(world, { id: "ob-2", kind: "funeral", debtorId: me.id, beneficiary: { kind: "external", id: "acct-external-sink" }, amount: 30 });
    applyFacts(world, [{ kind: "ObligationMet", obligationId: "ob-2", paidBy: "debtor", cause }], new TurnLogBuilder(0));
    expect(world.obligations.byId["ob-2"]!.status).toBe("closed");
  });
});

describe("obligations system", () => {
  it("raises ObligationDue for the player and pays for an AI debtor from purse or treasury", () => {
    const world = buildStarterWorld("oblig-3", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const s = soldierOf(world);
    const prisoner = Object.values(world.characters.byId).find((c) => c.rank === "soldier" && c.id !== s.id)!;
    prisoner.status = "arrested";
    prisoner.detainedUntilTurn = world.meta.turn + 4;
    open(world, { id: "ob-me", kind: "prisonerSupport", debtorId: me.id, beneficiary: { kind: "character", id: prisoner.id }, amount: 15, everyTurns: 1 });
    open(world, { id: "ob-ai", kind: "prisonerSupport", debtorId: s.id, beneficiary: { kind: "character", id: prisoner.id }, amount: 15, everyTurns: 1 });
    world.ledger.accounts.byId[s.accounts.personal]!.dirty = 0;
    const family = world.families.byId[s.familyId!]!;
    world.ledger.accounts.byId[family.treasury]!.dirty = 100;
    const facts = obligationsStep(world, EMPTY_CONTENT);
    expect(facts.some((f) => f.kind === "ObligationDue" && f.obligationId === "ob-me")).toBe(true);
    const met = facts.find((f) => f.kind === "ObligationMet" && f.obligationId === "ob-ai");
    expect(met && met.kind === "ObligationMet" ? met.paidBy : null).toBe("treasury");
    expect(facts.some((f) => f.kind === "MoneyMove" && f.from === family.treasury)).toBe(true);
  });

  it("closes prisoner support when the prisoner is free, and the flip term reads a met support", () => {
    const world = buildStarterWorld("oblig-4", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const prisoner = soldierOf(world);
    prisoner.status = "arrested";
    open(world, { id: "ob-p", kind: "prisonerSupport", debtorId: me.id, beneficiary: { kind: "character", id: prisoner.id }, amount: 15, everyTurns: 1 });
    expect(prisonerSupported(world, prisoner.id)).toBe(false);
    applyFacts(world, [{ kind: "ObligationMet", obligationId: "ob-p", paidBy: "debtor", cause }], new TurnLogBuilder(0));
    expect(prisonerSupported(world, prisoner.id)).toBe(true);
    prisoner.status = "free";
    const facts = obligationsStep(world, EMPTY_CONTENT);
    expect(facts.some((f) => f.kind === "ObligationClose" && f.obligationId === "ob-p")).toBe(true);
  });

  it("lifestyle costs money weekly, adds weight and heat, and falls to modest when unaffordable", () => {
    let world = buildStarterWorld("oblig-5", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const before = computeWeight(world, me.id);
    me.lifestyle = "lavish";
    expect(computeWeight(world, me.id)).toBe(before + 30); // an associate lives modestly by default (0), lavish is 30
    world.ledger.accounts.byId[me.accounts.personal]!.dirty += 200;
    world.ledger.minted += 200; // keep money.conservation honest
    const r = step(world, [], EMPTY_CONTENT);
    world = r.world;
    const facts = r.log.entries.flatMap((e) => (e.kind === "fact" ? [e.fact] : []));
    expect(facts.some((f) => f.kind === "MoneyDestroy" && f.sink === "lifestyle" && f.amount === 40)).toBe(true);
    expect(facts.some((f) => f.kind === "HeatDelta" && f.cause.rule === "activity.lifestyle")).toBe(true);
    // The fall to modest: with the purse empty at the system's turn (a step would first collect the week's income).
    const acct = world.ledger.accounts.byId[playerCharacter(world).accounts.personal]!;
    world.ledger.destroyed += acct.dirty - 5;
    acct.dirty = 5;
    const fall = obligationsStep(world, EMPTY_CONTENT);
    expect(fall.some((f) => f.kind === "LifestyleSet" && f.characterId === me.id && f.lifestyle === "modest")).toBe(true);
  });

  it("a family whose income falls below its duties for four turns is weakened, and recovers", () => {
    let world = buildStarterWorld("oblig-6", setup, EMPTY_CONTENT);
    const me = playerCharacter(world);
    const family = world.families.byId[me.familyId!]!;
    // Duties far above any income: a recurring 5,000 kL debt.
    open(world, { id: "ob-big", kind: "gift", debtorId: soldierOf(world).id, beneficiary: { kind: "external", id: "acct-external-sink" }, amount: 5000, everyTurns: 1 });
    for (let t = 0; t < WEAKENED_AFTER_TURNS + 1; t++) world = step(world, [], EMPTY_CONTENT).world;
    expect(world.families.byId[family.id]!.state).toBe("weakened");
    applyFacts(world, [{ kind: "ObligationClose", obligationId: "ob-big", reason: "test", cause }], new TurnLogBuilder(world.meta.turn));
    for (let t = 0; t < WEAKENED_AFTER_TURNS * 2 + 1; t++) world = step(world, [], EMPTY_CONTENT).world;
    expect(world.families.byId[family.id]!.state).toBe("healthy");
  });
});
