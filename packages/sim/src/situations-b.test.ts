// Scenario tests for situations, part b (design 10 §2, §4, §5): the new owner and his report to the police,
// the witness who wants to talk, and the sponsor's arrest and return. One scenario per template driven through
// `step()` with a `decide` action where the template has one, plus one scenario per follow-up that forces the
// branch (design 09 §7 item 4's `spawnFrom`, injected directly via `injectFacts` rather than waited out, the
// same determinism `associate-people.test.ts`'s own `assoc.sponsor.repay` scenario already relies on). Content
// lives in packages/content; sim may not import it for production code (design 01 §2), but this test file is
// exempt (eslint.config.js ignores packages/sim/src/**/*.test.ts from the sim-only-imports-@borgata/shared
// rule), the same exemption every sibling associate/soldier test file already relies on.
import { EMPTY_CONTENT } from "./content-types.js";
import { describe, expect, it } from "vitest";
import type { BusinessId } from "@borgata/shared";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import type { GameSetup, World } from "./world.js";
import type { ProcessTemplate } from "./engine/types.js";
import { SITUATIONS_B_TEMPLATES } from "../../content/src/templates/situations-b.js";

const [shopNewOwner, shopReported, witnessApproach, witnessTalks, sponsorArrested, sponsorReturns] = SITUATIONS_B_TEMPLATES;

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

/** Steps up to `maxTurns` times, calling `beforeEach(world)` before every call, until an instance of
 * `templateId` is `awaitingDecision`. Mirrors associate-week.test.ts's/associate-people.test.ts's own loop. */
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

/** The starter world's first crew's chief and two soldiers (design 02 §4): "Turi Lo Cascio" (chief), "Nino
 * Bracco" (soldier1, the player's sponsor) and "Pino Randazzo" (soldier2, also in soldier1's crew). */
function findByName(world: World, name: string) {
  const cid = world.characters.order.find((id) => world.characters.byId[id]!.name === name);
  if (!cid) throw new Error(`starter world has no character named "${name}"`);
  return world.characters.byId[cid]!;
}

describe("assoc.shop.newOwner (design 10 §2)", () => {
  it("spawns a shop from the sponsor's crew's blocks, and 'sponsor' resolves to 'introduced' (compliance up, favor down)", () => {
    const content = contentOf([shopNewOwner!]);
    let world = buildStarterWorld("shop-new-owner-1", setup, content);
    const meId = world.player.characterId;
    const sponsor = findByName(world, "Nino Bracco");
    const crewBusinessIds = new Set(world.geo.businesses.order);

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.shop.newOwner", 300);
    world = w1;

    const spawn = processSpawns(factsOf(logs1), "assoc.shop.newOwner")[0]!;
    expect(spawn.instance.roles["me"]).toEqual({ kind: "character", id: meId });
    const shopRole = spawn.instance.roles["shop"]!;
    expect(shopRole.kind).toBe("business");
    expect(crewBusinessIds.has(shopRole.id as BusinessId)).toBe(true);

    const r = step(world, [{ kind: "decide", instanceId, optionId: "sponsor" }], content, opts);
    world = r.world;
    const facts = factsOf([...logs1, r.log]);

    expect(resolves(facts, "assoc.shop.newOwner", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "ComplianceDelta" && f.businessId === shopRole.id && f.delta === 120)).toBe(true);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === sponsor.id && f.to === meId && f.delta === -10)).toBe(true);
  });
});

describe("assoc.shop.reported (design 10 §2 follow-up)", () => {
  it("fires from a scheduled bind (as 'explain''s 25 percent branch would produce), and 'tell' hands the evidence to the sponsor", () => {
    // Driven directly by injecting the ScheduleAdd assoc.shop.newOwner's own "reported" outcome would
    // eventually produce (design 04 §1's schedule effect), the same determinism associate-people.test.ts's
    // own assoc.sponsor.repay scenario relies on, rather than waiting out "explain"'s 25 percent draw.
    const content = contentOf([shopReported!]);
    let world = buildStarterWorld("shop-reported-1", setup, content);
    const meId = world.player.characterId;
    const sponsor = findByName(world, "Nino Bracco");
    const shopId = world.geo.businesses.order[0]! as BusinessId;

    const r0 = step(world, [], content, {
      ...opts,
      injectFacts: [
        {
          kind: "ScheduleAdd",
          entry: {
            id: "sched-test-reported",
            fireTurn: world.meta.turn + 1,
            templateId: "assoc.shop.reported",
            bind: { shop: { kind: "business", id: shopId }, me: { kind: "character", id: meId }, sponsor: { kind: "character", id: sponsor.id } },
            causeChainId: "test-chain",
            priority: 0,
            createdTurn: world.meta.turn,
          },
          cause: { rule: "test" },
        },
      ],
    });
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.shop.reported", 5);
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "tell" }], content, opts);
    const facts = factsOf([r0.log, ...logs1, r.log]);

    expect(resolves(facts, "assoc.shop.reported", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === sponsor.id && f.to === meId && f.delta === -15)).toBe(true);
    expect(facts.some((f) => f.kind === "ComplianceDelta" && f.businessId === shopId && f.delta === 150)).toBe(true);
    expect(facts.some((f) => f.kind === "EvidenceAdd" && f.characterId === sponsor.id && f.item.source === "participation")).toBe(true);
  });
});

describe("assoc.witness.approach (design 10 §4)", () => {
  it("spawns in the state lane once me carries a recent 'sawSomething' memory, and 'ignore' resolves without spending anything", () => {
    const content = contentOf([witnessApproach!]);
    let world = buildStarterWorld("witness-approach-1", setup, content);
    const meId = world.player.characterId;
    const player = world.characters.byId[meId]!;
    player.memory.push({ tag: "sawSomething", weight: 120, turn: world.meta.turn });

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.witness.approach", 50);
    world = w1;

    const spawn = processSpawns(factsOf(logs1), "assoc.witness.approach")[0]!;
    expect(spawn.instance.lane).toBe("state");

    const r = step(world, [{ kind: "decide", instanceId, optionId: "ignore" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(resolves(facts, "assoc.witness.approach", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "ReportNote" && f.text.includes("You let him be, for now."))).toBe(true);
  });

  it("'ignore' schedules assoc.witness.talks one time in four (design 10 §4's own probability 2500)", () => {
    // The schedule is a 25 percent draw (`{ schedule: { ..., probability: 2500 } }`), not a certainty, so this
    // retries across fresh seeds (a fresh RNG stream each time) rather than asserting on one single decide --
    // the same bounded-retry idiom `stepUntilAwaitingDecision` already uses for a probabilistic spawn timing,
    // applied here to a probabilistic post-decision effect instead.
    const content = contentOf([witnessApproach!]);
    let scheduled = false;
    for (let seed = 0; seed < 60 && !scheduled; seed++) {
      let world = buildStarterWorld(`witness-approach-schedule-${seed}`, setup, content);
      const player = world.characters.byId[world.player.characterId]!;
      player.memory.push({ tag: "sawSomething", weight: 120, turn: world.meta.turn });

      const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.witness.approach", 50);
      world = w1;
      const r = step(world, [{ kind: "decide", instanceId, optionId: "ignore" }], content, opts);
      const facts = factsOf([...logs1, r.log]);
      scheduled = facts.some((f) => f.kind === "ScheduleAdd" && f.entry.templateId === "assoc.witness.talks");
    }
    expect(scheduled).toBe(true);
  });

  it("does not spawn without the memory (no 'sawSomething' tag, no card)", () => {
    const content = contentOf([witnessApproach!]);
    let world = buildStarterWorld("witness-approach-2", setup, content);
    const logs: TurnLog[] = [];
    for (let i = 0; i < 20; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }
    expect(processSpawns(factsOf(logs), "assoc.witness.approach")).toHaveLength(0);
  });
});

describe("assoc.witness.talks (design 10 §4 follow-up, no decision)", () => {
  it("fires from a scheduled bind and adds testimony evidence plus heat on the town", () => {
    const content = contentOf([witnessTalks!]);
    let world = buildStarterWorld("witness-talks-1", setup, content);
    const meId = world.player.characterId;
    const townId = world.geo.towns.order[0]!;

    const r0 = step(world, [], content, {
      ...opts,
      injectFacts: [
        {
          kind: "ScheduleAdd",
          entry: {
            id: "sched-test-talks",
            fireTurn: world.meta.turn + 1,
            templateId: "assoc.witness.talks",
            bind: { me: { kind: "character", id: meId }, town: { kind: "town", id: townId } },
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

    expect(facts.some((f) => f.kind === "EvidenceAdd" && f.characterId === meId && f.item.weight === 40 && f.item.source === "witness")).toBe(true);
    expect(facts.some((f) => f.kind === "HeatDelta" && f.townId === townId && f.delta === 10)).toBe(true);
  });
});

describe("assoc.sponsor.arrested (design 10 §5)", () => {
  it("spawns from a StatusChange arrested on the sponsor, and 'wife' brings money and favor", () => {
    const content = contentOf([sponsorArrested!]);
    let world = buildStarterWorld("sponsor-arrested-1", setup, content);
    const meId = world.player.characterId;
    const meAccount = world.characters.byId[meId]!.accounts.personal;
    const sponsor = findByName(world, "Nino Bracco");
    world.ledger.accounts.byId[meAccount]!.dirty = 50;
    world.ledger.minted += 50; // keep money.conservation honest about this fixture-injected cash

    const r0 = step(world, [], content, {
      ...opts,
      injectFacts: [{ kind: "StatusChange", characterId: sponsor.id, status: "arrested", untilTurn: world.meta.turn + 10, cause: { rule: "test" } }],
    });
    world = r0.world;
    const logs: TurnLog[] = [r0.log];

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.sponsor.arrested", 5);
    world = w1;
    logs.push(...logs1);

    const spawn = processSpawns(factsOf(logs), "assoc.sponsor.arrested")[0]!;
    expect(spawn.instance.roles["sponsor"]).toEqual({ kind: "character", id: sponsor.id });
    expect(spawn.instance.roles["me"]).toEqual({ kind: "character", id: meId });

    const r = step(world, [{ kind: "decide", instanceId, optionId: "wife" }], content, opts);
    const facts = factsOf([...logs, r.log]);

    expect(resolves(facts, "assoc.sponsor.arrested", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "MoneyDestroy" && f.from === meAccount && f.amount === 20 && f.sink === "lawyer")).toBe(true);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === sponsor.id && f.to === meId && f.delta === 20)).toBe(true);
  });
});

describe("assoc.sponsor.returns (design 10 §5 follow-up)", () => {
  it("resolves 'grateful' when me held the line (FavorDelta +30) via the arrested -> free StatusChange pair", () => {
    const content = contentOf([sponsorArrested!, sponsorReturns!]);
    let world = buildStarterWorld("sponsor-returns-1", setup, content);
    const meId = world.player.characterId;
    const sponsor = findByName(world, "Nino Bracco");

    const rArrest = step(world, [], content, {
      ...opts,
      injectFacts: [{ kind: "StatusChange", characterId: sponsor.id, status: "arrested", untilTurn: world.meta.turn + 10, cause: { rule: "test" } }],
    });
    world = rArrest.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.sponsor.arrested", 5);
    world = w1;
    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "collect" }], content, opts);
    world = rDecide.world;
    expect(world.characters.byId[meId]!.memory.some((m) => m.tag === "heldTheLine")).toBe(true);

    // The sponsor's release, injected directly (design 10 §5's own header: reducers/characters.ts's
    // releaseDetainees emits exactly this fact with cause rule "detention.ended" once the term passes).
    const rFree = step(world, [], content, {
      ...opts,
      injectFacts: [{ kind: "StatusChange", characterId: sponsor.id, status: "free", cause: { rule: "detention.ended" } }],
    });
    world = rFree.world;
    const rResolve = step(world, [], content, opts);
    world = rResolve.world;

    const facts = factsOf([rArrest.log, ...logs1, rDecide.log, rFree.log, rResolve.log]);
    expect(processSpawns(facts, "assoc.sponsor.returns")).toHaveLength(1);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === sponsor.id && f.to === meId && f.delta === 30)).toBe(true);
  });

  it("resolves 'unnoticed' when me neither held the line nor skimmed (the 'wife' branch)", () => {
    const content = contentOf([sponsorArrested!, sponsorReturns!]);
    let world = buildStarterWorld("sponsor-returns-2", setup, content);
    const meId = world.player.characterId;
    const meAccount = world.characters.byId[meId]!.accounts.personal;
    const sponsor = findByName(world, "Nino Bracco");
    world.ledger.accounts.byId[meAccount]!.dirty = 50;
    world.ledger.minted += 50;

    const rArrest = step(world, [], content, {
      ...opts,
      injectFacts: [{ kind: "StatusChange", characterId: sponsor.id, status: "arrested", untilTurn: world.meta.turn + 10, cause: { rule: "test" } }],
    });
    world = rArrest.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.sponsor.arrested", 5);
    world = w1;
    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "wife" }], content, opts);
    world = rDecide.world;
    expect(world.characters.byId[meId]!.memory.some((m) => m.tag === "heldTheLine" || m.tag === "skimmed")).toBe(false);

    const rFree = step(world, [], content, {
      ...opts,
      injectFacts: [{ kind: "StatusChange", characterId: sponsor.id, status: "free", cause: { rule: "detention.ended" } }],
    });
    world = rFree.world;
    const rResolve = step(world, [], content, opts);
    world = rResolve.world;

    const facts = factsOf([rArrest.log, ...logs1, rDecide.log, rFree.log, rResolve.log]);
    const resolvedFacts = facts.filter((f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.cause.templateId === "assoc.sponsor.returns");
    expect(resolvedFacts).toHaveLength(1);
    expect(resolvedFacts[0]!.outcomeId).toBe("unnoticed");
  });
});
