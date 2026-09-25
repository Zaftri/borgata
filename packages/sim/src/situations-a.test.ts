// Scenario tests for situations, wave A (design 10 §1 the kid's errand with its follow-up, §3 the debtor with
// its two follow-ups, §6 the block feud). One scenario per card driven through `step()` with a `decide` action,
// plus a scenario per follow-up that drives (or, where forcing the probabilistic branch naturally would be
// slow and non-deterministic, directly injects via `injectFacts`) the chain into the follow-up and decides it
// -- the same pattern associate-people.test.ts's own header describes and `assoc.sponsor.repay`'s test uses.
// Content lives in packages/content; sim may not import it for production code (design 01 §2), but this test
// file is exempt (eslint.config.js ignores packages/sim/src/**/*.test.ts from the sim-only-imports-
// @borgata/shared rule), same as associate-week.test.ts and associate-people.test.ts.
import { EMPTY_CONTENT } from "./content-types.js";
import { describe, expect, it } from "vitest";
import type { CharacterId } from "@borgata/shared";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import { addCharacter } from "./world.js";
import type { GameSetup, World } from "./world.js";
import type { ProcessTemplate } from "./engine/types.js";
import { SITUATIONS_A_TEMPLATES } from "../../content/src/templates/situations-a.js";
import { ASSOCIATE_WEEK_TEMPLATES } from "../../content/src/templates/associate-week.js";
import { ASSOCIATE_PEOPLE_TEMPLATES } from "../../content/src/templates/associate-people.js";

const [kidErrand, kidCaught, debtorPlea, debtorWeek2, debtorRan, feudNeighbor] = SITUATIONS_A_TEMPLATES;

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

function resolves(facts: readonly Fact[], templateId: string, instanceId: string): Extract<Fact, { kind: "ProcessResolve" }>[] {
  return facts.filter(
    (f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.cause.templateId === templateId && f.instanceId === instanceId,
  );
}

/** Steps up to `maxTurns` times, calling `beforeEach(world)` before every call, until an instance of
 * `templateId` is `awaitingDecision`. Mirrors associate-week.test.ts's and associate-people.test.ts's own
 * search loops. */
function stepUntilAwaitingDecision(
  world: World,
  content: ReturnType<typeof contentOf>,
  templateId: string,
  maxTurns: number,
  beforeEach: (w: World) => void = () => {},
): { world: World; logs: TurnLog[]; instanceId: string } {
  const logs: TurnLog[] = [];
  let instanceId: string | undefined;
  for (let i = 0; i < maxTurns && !instanceId; i++) {
    beforeEach(world);
    const r = step(world, [], content, opts);
    world = r.world;
    logs.push(r.log);
    const inst = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === templateId && p.state === "awaitingDecision");
    if (inst) instanceId = inst.id;
  }
  if (!instanceId) throw new Error(`no "${templateId}" instance reached awaitingDecision within ${maxTurns} turns`);
  return { world, logs, instanceId };
}

/** Adds the player's kid (design 09 §5, generation/player.ts): a civilian on record with the player, carrying
 * the `kid` trait, `superiorId` set to the player -- exactly what `subordinatesOf` + `trait: "kid"` (this
 * file's own `assoc.kid.errand` role) reads. The starter world (unlike full generation) does not create one on
 * its own, so tests add him directly, the same way associate-people.test.ts's own `rivalPoach` test adds the
 * rival directly rather than relying on generation. */
function addKid(world: World, meId: CharacterId) {
  const me = world.characters.byId[meId]!;
  return addCharacter(world, { name: "Turiddu", rank: "civilian", age: 15, familyId: me.familyId, superiorId: meId, traits: ["kid"] });
}

function findByName(world: World, name: string) {
  const cid = world.characters.order.find((id) => world.characters.byId[id]!.name === name);
  if (!cid) throw new Error(`starter world has no character named "${name}"`);
  return world.characters.byId[cid]!;
}

describe("assoc.kid.errand (design 10 §1)", () => {
  it("spawns for the kid on record with the player, and 'nightOff' raises his loyalty", () => {
    const content = contentOf([kidErrand!]);
    let world = buildStarterWorld("kid-errand-1", setup, content);
    const meId = world.player.characterId;
    const kid = addKid(world, meId);

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.kid.errand", 20);
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "nightOff" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(resolves(facts, "assoc.kid.errand", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === kid.id && f.delta === 15)).toBe(true);
  });

  it("'messages' either banks favor with the sponsor or runs quietly, always with a report", () => {
    const content = contentOf([kidErrand!]);
    let world = buildStarterWorld("kid-errand-2", setup, content);
    const meId = world.player.characterId;
    addKid(world, meId);
    const sponsor = findByName(world, "Nino Bracco"); // the player's sponsor (design 02 §4, starter.ts)

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.kid.errand", 20);
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "messages" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(resolves(facts, "assoc.kid.errand", instanceId)).toHaveLength(1);
    const gotFavor = facts.some((f) => f.kind === "FavorDelta" && f.from === sponsor.id && f.to === meId && f.delta === 5);
    const stayedQuiet = factsOf([r.log]).some((f) => f.kind === "ProcessResolve" && f.outcomeId === "quiet");
    expect(gotFavor || stayedQuiet).toBe(true);
  });

  it("does not spawn without a kid on record with the player", () => {
    const content = contentOf([kidErrand!]);
    let world = buildStarterWorld("kid-errand-3", setup, content);
    const logs: TurnLog[] = [];
    for (let i = 0; i < 20; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }
    const anySpawned = factsOf(logs).some((f) => f.kind === "ProcessSpawn" && f.instance.templateId === "assoc.kid.errand");
    expect(anySpawned).toBe(false);
  });
});

describe("assoc.kid.caught (design 10 §1, follow-up of assoc.kid.errand)", () => {
  it("forced via injectFacts (ScheduleAdd), 'fine' pays the fine and frees and reassures the kid", () => {
    const content = contentOf([kidCaught!]);
    let world = buildStarterWorld("kid-caught-1", setup, content);
    const meId = world.player.characterId;
    const meAccount = world.characters.byId[meId]!.accounts.personal;
    world.ledger.accounts.byId[meAccount]!.dirty = 50;
    world.ledger.minted += 50; // keep money.conservation honest about this fixture-injected cash
    const kid = addKid(world, meId);
    world.characters.byId[kid.id]!.status = "arrested";

    const r0 = step(world, [], content, {
      ...opts,
      injectFacts: [
        {
          kind: "ScheduleAdd",
          entry: {
            id: "sched-test-kid-caught",
            fireTurn: world.meta.turn + 1,
            templateId: "assoc.kid.caught",
            bind: { me: { kind: "character", id: meId }, kid: { kind: "character", id: kid.id } },
            causeChainId: "test-chain",
            priority: 0,
            createdTurn: world.meta.turn,
          },
          cause: { rule: "test" },
        },
      ],
    });
    world = r0.world;

    // The injected ScheduleAdd is applied at the END of r0's turn (step.ts applies injectFacts after the
    // scheduler run), so the entry only fires -- and the decision is offered -- on the NEXT step() call, the
    // same two-call shape assoc.sponsor.repay's own test uses.
    const r1 = step(world, [], content, opts);
    world = r1.world;
    const inst = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === "assoc.kid.caught" && p.state === "awaitingDecision");
    expect(inst).toBeDefined();

    const r2 = step(world, [{ kind: "decide", instanceId: inst!.id, optionId: "fine" }], content, opts);
    const facts = factsOf([r0.log, r1.log, r2.log]);

    expect(resolves(facts, "assoc.kid.caught", inst!.id)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "MoneyDestroy" && f.from === meAccount && f.amount === 15 && f.sink === "kidFine")).toBe(true);
    expect(facts.some((f) => f.kind === "StatusChange" && f.characterId === kid.id && f.status === "free")).toBe(true);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === kid.id && f.delta === 30)).toBe(true);
  });

  it("assoc.kid.errand's own 'caught' outcome (13%) schedules assoc.kid.caught bound to the kid", () => {
    const content = contentOf([kidErrand!, kidCaught!]);
    let world = buildStarterWorld("kid-caught-2", setup, content);
    const meId = world.player.characterId;
    const kid = addKid(world, meId);

    const logs: TurnLog[] = [];
    let scheduled = false;
    for (let i = 0; i < 60 && !scheduled; i++) {
      const inst = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === "assoc.kid.errand" && p.state === "awaitingDecision");
      const actions = inst ? [{ kind: "decide" as const, instanceId: inst.id, optionId: "collect" }] : [];
      const r = step(world, actions, content, opts);
      world = r.world;
      logs.push(r.log);
      // Delay 0 spawns the follow-up in the same run (scheduler, interactive turn 2026-09-25): a ProcessSpawn bound to the kid.
      scheduled = factsOf(logs).some((f) => f.kind === "ProcessSpawn" && f.instance.templateId === "assoc.kid.caught" && f.instance.roles["kid"]?.id === kid.id);
    }
    expect(scheduled).toBe(true);
  });
});

describe("assoc.debtor.plea (design 10 §3)", () => {
  it("spawns when me runs the game, and 'forgive' lifts sentiment and banks a generous memory", () => {
    const content = contentOf([debtorPlea!]);
    let world = buildStarterWorld("debtor-plea-1", setup, content);
    const meId = world.player.characterId;

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.debtor.plea", 60, (w) => {
      const me = w.characters.byId[meId]!;
      if (!me.memory.some((m) => m.tag === "runsGame")) me.memory.push({ tag: "runsGame", weight: 100, turn: w.meta.turn });
    });
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "forgive" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(resolves(facts, "assoc.debtor.plea", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === 10)).toBe(true);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === meId && f.memory.tag === "generous")).toBe(true);
  });

  it("'watch' mints money and costs sentiment", () => {
    const content = contentOf([debtorPlea!]);
    let world = buildStarterWorld("debtor-plea-2", setup, content);
    const meId = world.player.characterId;
    const meAccount = world.characters.byId[meId]!.accounts.personal;

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.debtor.plea", 60, (w) => {
      const me = w.characters.byId[meId]!;
      if (!me.memory.some((m) => m.tag === "runsGame")) me.memory.push({ tag: "runsGame", weight: 100, turn: w.meta.turn });
    });
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "watch" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(facts.some((f) => f.kind === "MoneyMint" && f.to === meAccount && f.amount === 25 && f.source === "debtorWatch")).toBe(true);
    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === -10)).toBe(true);
  });

  it("'week' schedules assoc.debtor.week2", () => {
    const content = contentOf([debtorPlea!]);
    let world = buildStarterWorld("debtor-plea-3", setup, content);
    const meId = world.player.characterId;

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.debtor.plea", 60, (w) => {
      const me = w.characters.byId[meId]!;
      if (!me.memory.some((m) => m.tag === "runsGame")) me.memory.push({ tag: "runsGame", weight: 100, turn: w.meta.turn });
    });
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "week" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(facts.some((f) => f.kind === "ScheduleAdd" && f.entry.templateId === "assoc.debtor.week2")).toBe(true);
  });
});

describe("assoc.debtor.week2 (design 10 §3, follow-up 1 of assoc.debtor.plea's 'week')", () => {
  it("forced via injectFacts (ScheduleAdd), resolves to 'paid' or schedules assoc.debtor.ran", () => {
    const content = contentOf([debtorWeek2!, debtorRan!]); // the immediate follow-up needs its template present
    let world = buildStarterWorld("debtor-week2-1", setup, content);
    const meId = world.player.characterId;

    const r0 = step(world, [], content, {
      ...opts,
      injectFacts: [
        {
          kind: "ScheduleAdd",
          entry: {
            id: "sched-test-debtor-week2",
            fireTurn: world.meta.turn + 1,
            templateId: "assoc.debtor.week2",
            bind: { me: { kind: "character", id: meId } },
            causeChainId: "test-chain",
            priority: 0,
            createdTurn: world.meta.turn,
          },
          cause: { rule: "test" },
        },
      ],
    });
    world = r0.world;
    const r1 = step(world, [], content, opts);
    world = r1.world;
    const facts = factsOf([r0.log, r1.log]);

    const paid = facts.some((f) => f.kind === "MoneyMint" && f.source === "debtorPaid" && f.amount === 40);
    const ran = facts.some((f) => f.kind === "ProcessSpawn" && f.instance.templateId === "assoc.debtor.ran"); // delay 0: spawned in the same run
    expect(paid || ran).toBe(true);
    expect(paid && ran).toBe(false); // exactly one of the two weighted branches
  });
});

describe("assoc.debtor.ran (design 10 §3, follow-up 2, the decision)", () => {
  /** Injects the ScheduleAdd a real "ran" branch would eventually produce, then steps once more so the entry
   * fires and the decision is offered -- the injected fact is only applied at the END of the injecting step's
   * turn (step.ts runs the scheduler before injectFacts), so the fire itself needs a second, plain call. */
  function scheduleDebtorRan(world: World, content: ReturnType<typeof contentOf>, meId: CharacterId) {
    const r0 = step(world, [], content, {
      ...opts,
      injectFacts: [
        {
          kind: "ScheduleAdd",
          entry: {
            id: "sched-test-debtor-ran",
            fireTurn: world.meta.turn + 1,
            templateId: "assoc.debtor.ran",
            bind: { me: { kind: "character", id: meId } },
            causeChainId: "test-chain",
            priority: 0,
            createdTurn: world.meta.turn,
          },
          cause: { rule: "test" },
        },
      ],
    });
    const r1 = step(r0.world, [], content, opts);
    return { world: r1.world, logs: [r0.log, r1.log] };
  }

  it("forced via injectFacts (ScheduleAdd), 'writeOff' banks a 'soft' memory and costs nothing", () => {
    const content = contentOf([debtorRan!]);
    let world = buildStarterWorld("debtor-ran-1", setup, content);
    const meId = world.player.characterId;

    const { world: w0, logs: logs0 } = scheduleDebtorRan(world, content, meId);
    world = w0;
    const inst = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === "assoc.debtor.ran" && p.state === "awaitingDecision");
    expect(inst).toBeDefined();

    const r1 = step(world, [{ kind: "decide", instanceId: inst!.id, optionId: "writeOff" }], content, opts);
    const facts = factsOf([...logs0, r1.log]);

    expect(resolves(facts, "assoc.debtor.ran", inst!.id)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === meId && f.memory.tag === "soft")).toBe(true);
  });

  it("'tellSponsor' costs favor and mints money to both me and (indirectly) the sponsor's men", () => {
    const content = contentOf([debtorRan!]);
    let world = buildStarterWorld("debtor-ran-2", setup, content);
    const meId = world.player.characterId;
    const meAccount = world.characters.byId[meId]!.accounts.personal;
    const sponsor = findByName(world, "Nino Bracco");

    const { world: w0, logs: logs0 } = scheduleDebtorRan(world, content, meId);
    world = w0;
    const inst = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === "assoc.debtor.ran" && p.state === "awaitingDecision");
    expect(inst).toBeDefined();

    const r1 = step(world, [{ kind: "decide", instanceId: inst!.id, optionId: "tellSponsor" }], content, opts);
    const facts = factsOf([...logs0, r1.log]);

    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === sponsor.id && f.to === meId && f.delta === -10)).toBe(true);
    expect(facts.some((f) => f.kind === "MoneyMint" && f.to === meAccount && f.amount === 20 && f.source === "debtorFound")).toBe(true);
  });
});

describe("assoc.feud.neighbor (design 10 §6)", () => {
  it("binds two distinct shops from the sponsor's crew's blocks, and 'split' raises sentiment and favor", () => {
    const content = contentOf([feudNeighbor!]);
    let world = buildStarterWorld("feud-neighbor-1", setup, content);
    const meId = world.player.characterId;
    const sponsor = findByName(world, "Nino Bracco");

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.feud.neighbor", 60);
    world = w1;

    const spawn = w1.processes.byId[instanceId]!;
    const shopA = spawn.roles["shopA"];
    const shopB = spawn.roles["shopB"];
    expect(shopA).toBeDefined();
    expect(shopB).toBeDefined();
    expect(shopA!.id).not.toBe(shopB!.id);

    const r = step(world, [{ kind: "decide", instanceId, optionId: "split" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(resolves(facts, "assoc.feud.neighbor", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === 15)).toBe(true);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === sponsor.id && f.to === meId && f.delta === 10)).toBe(true);
  });

  it("'ignore' costs sentiment only", () => {
    const content = contentOf([feudNeighbor!]);
    let world = buildStarterWorld("feud-neighbor-2", setup, content);

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.feud.neighbor", 60);
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "ignore" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === -10)).toBe(true);
  });
});

// ===================================================================================================================
// Density (task brief): a 30-turn run on the starter world (kid added, runsGame granted) with a local "yes-man"
// that always takes the first offered option for any awaitingDecision instance the player holds, counting how
// many turns offer two or more simultaneous decisions. Run against this file's own six templates PLUS the
// pre-existing, already-stable associate's-week content (associate-week.ts, associate-people.ts -- both
// already exercised against this same starter world by their own test files): design 09 §12 reports "two or
// more decisions in about two thirds of weeks" from that content alone, and this file's own weekly kid card
// plus its rarer chains are meant to raise that share further (design 10 §9 story 1: 90 percent is the
// integrated target once the owner lands all three parallel waves; this test's 60 percent is a conservative
// floor reachable from this task's own slice plus the pre-existing content it can safely depend on -- the
// sibling `situations-b`/`situations-c` files are two other agents' concurrent, unreviewed work, so this test
// does not import them, to keep its own result reproducible regardless of their state).
// ===================================================================================================================

describe("density (design 10 §9)", () => {
  it("offers two or more decisions in at least 60% of 30 turns with a local yes-man", () => {
    const content = contentOf([...ASSOCIATE_WEEK_TEMPLATES, ...ASSOCIATE_PEOPLE_TEMPLATES, ...SITUATIONS_A_TEMPLATES]);
    let world = buildStarterWorld("density-30", setup, content);
    const meId = world.player.characterId;
    addKid(world, meId);
    const me = world.characters.byId[meId]!;
    me.memory.push({ tag: "runsGame", weight: 100, turn: world.meta.turn });

    let turnsWithTwoPlus = 0;
    let pending: { kind: "decide"; instanceId: string; optionId: string }[] = [];
    for (let turn = 0; turn < 30; turn++) {
      const r = step(world, pending, content, opts);
      world = r.world;

      const awaiting = world.processes.order
        .map((id) => world.processes.byId[id]!)
        .filter((p) => p.state === "awaitingDecision" && p.decision);
      if (awaiting.length >= 2) turnsWithTwoPlus++;

      // The local yes-man: always the first listed option (design 09 §12's "yesMan" preset takes the
      // proactive branch first too; the exact preference does not matter for density, only that every
      // pending card gets answered so the next one can spawn).
      pending = awaiting.map((p) => ({ kind: "decide" as const, instanceId: p.id, optionId: p.decision!.options[0]! }));
    }

    const density = turnsWithTwoPlus / 30;
    console.log(`situations-a density: ${turnsWithTwoPlus}/30 turns offered 2+ decisions (${(density * 100).toFixed(0)}%)`);
    expect(density).toBeGreaterThanOrEqual(0.6);
  });
});
