// Scenario tests for the associate's week, part 1 (design 09 §4 rows 1 to 6): one per template, driven through
// `step()` with a `decide` action where the template has one, asserting a visible consequence (a fact in the
// log or a state change), plus a dedicated test that `assoc.latePayer` spawns from a `CollectionMissed` fact
// within one turn (design 09 §7 item 4's `spawnFrom`). Content lives in packages/content; sim may not import it
// for production code (design 01 §2), but this test file is exempt (eslint.config.js ignores
// packages/sim/src/**/*.test.ts from the sim-only-imports-@borgata/shared rule), the same exemption
// refusal-chain.test.ts and state-templates.test.ts already rely on to read template source files directly.
//
// Each template is tested against a content array holding ONLY that template (not the full
// ASSOCIATE_WEEK_TEMPLATES bundle): the "per: character" spawn scans every character every turn regardless of
// which template it belongs to, so isolating one template per test keeps the `events.spawn` draw sequence (and
// therefore how many turns a probabilistic spawn takes to fire) independent of the other five templates and of
// whatever the parallel associate-people.ts task adds to the same lane.
import { EMPTY_CONTENT } from "./content-types.js";
import { describe, expect, it } from "vitest";
import type { BusinessId } from "@borgata/shared";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import { addCharacter } from "./world.js";
import type { GameSetup, World } from "./world.js";
import {
  ASSOCIATE_WEEK_TEMPLATES,
} from "../../content/src/templates/associate-week.js";
import type { ProcessTemplate } from "./engine/types.js";

const [latePayer, gameStake, gameRaid, favorDrive, favorNote, favorDoor] = ASSOCIATE_WEEK_TEMPLATES;

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

/** Steps up to `maxTurns` times, calling `beforeEach(world)` before every call (so a test can keep, e.g., town
 * heat pinned above a precondition threshold despite decay), until an instance of `templateId` is
 * `awaitingDecision`. Mirrors refusal-chain.test.ts's own search loop. */
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

describe("assoc.latePayer (design 09 §4 row 1; spawnFrom, design 09 §7 item 4)", () => {
  it("spawns from a CollectionMissed fact naming shop and me within one turn, and the 'lean' option raises fear, heat and evidence", () => {
    const content = contentOf([latePayer!]);
    let world = buildStarterWorld("late-payer-1", setup, content);
    const shopId = world.geo.businesses.order[0]! as BusinessId;
    const meId = world.player.characterId;

    // Turn 0: inject the missed collection (as the protection-tax chain would, design 09 §1) via `injectFacts`.
    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "CollectionMissed", businessId: shopId, collectorId: meId, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [r0.log];

    // Turn 1: the fact is now in `world.history.recentFacts` (recorded at the end of turn 0) and within the
    // spawnFrom default withinTurns of 1, so assoc.latePayer spawns this turn, bound straight off the fact.
    const r1 = step(world, [], content, opts);
    world = r1.world;
    logs.push(r1.log);

    const spawns = processSpawns(factsOf(logs), "assoc.latePayer");
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.instance.roles["shop"]).toEqual({ kind: "business", id: shopId });
    expect(spawns[0]!.instance.roles["me"]).toEqual({ kind: "character", id: meId });
    const instanceId = spawns[0]!.instance.id;

    // Same turn: duration 0 and a player-controlled decider, so the instance awaits a decision in the run it spawned.
    expect(r1.log.entries.some((e) => e.kind === "fact" && e.fact.kind === "ProcessAwaitDecision" && e.fact.instanceId === instanceId)).toBe(true);

    // Turn 2: choose "lean".
    const r3 = step(world, [{ kind: "decide", instanceId, optionId: "lean" }], content, opts);
    world = r3.world;
    logs.push(r3.log);

    const facts = factsOf(logs);
    expect(resolves(facts, "assoc.latePayer", instanceId)).toHaveLength(1);
    expect(facts.some((f) => f.kind === "FearDelta" && f.businessId === shopId && f.delta === 60)).toBe(true);
    expect(facts.some((f) => f.kind === "EvidenceAdd" && f.characterId === meId && f.item.weight === 4)).toBe(true);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === meId && f.field === "weeksMissed" && f.delta === 1)).toBe(true);
    expect(world.characters.byId[meId]!.record.weeksMissed).toBeGreaterThanOrEqual(1);
  });
});

// docs/event-storming-2026-09-25.md §3 hotspot 1: `Business.ownerId`, the `ownerOf` role relation and a
// generated civilian owner (with a trait) for shops on the sponsor's crew's blocks reopen the "if shop has
// trait reporter" branch and the sendKid botched memory that `associate-week.ts`'s own file header used to
// document as dropped. The starter world's businesses have no owner by default (`buildStarterWorld` predates
// the generator addition), so these tests set one directly, the same way the top-level test above injects
// `CollectionMissed` directly rather than running it through the chain system.
describe("assoc.latePayer's keeper-bound branches (hotspot 1)", () => {
  it("'lean' adds an extra witness EvidenceAdd and resolves to 'leanedReporter' when the shop's owner has the reporter trait", () => {
    const content = contentOf([latePayer!]);
    let world = buildStarterWorld("late-payer-reporter-1", setup, content);
    const shopId = world.geo.businesses.order[0]! as BusinessId;
    const meId = world.player.characterId;
    const owner = addCharacter(world, { name: "Reporter Owner", rank: "civilian", age: 50, familyId: null, traits: ["reporter"] });
    world.geo.businesses.byId[shopId]!.ownerId = owner.id;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "CollectionMissed", businessId: shopId, collectorId: meId, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [r0.log];
    const r1 = step(world, [], content, opts);
    world = r1.world;
    logs.push(r1.log);

    const instanceId = processSpawns(factsOf(logs), "assoc.latePayer")[0]!.instance.id;
    const r2 = step(world, [{ kind: "decide", instanceId, optionId: "lean" }], content, opts);
    logs.push(r2.log);

    const facts = factsOf(logs);
    expect(resolves(facts, "assoc.latePayer", instanceId)[0]!.outcomeId).toBe("leanedReporter");
    // The base "lean" effects (design 09 §4) still apply on top of the reporter bonus.
    expect(facts.some((f) => f.kind === "FearDelta" && f.businessId === shopId && f.delta === 60)).toBe(true);
    expect(facts.some((f) => f.kind === "EvidenceAdd" && f.characterId === meId && f.item.source === "witness" && f.item.weight === 30)).toBe(true);
  });

  it("'lean' resolves to plain 'leaned' (no extra witness) when the owner exists but has no reporter trait", () => {
    const content = contentOf([latePayer!]);
    let world = buildStarterWorld("late-payer-reporter-2", setup, content);
    const shopId = world.geo.businesses.order[0]! as BusinessId;
    const meId = world.player.characterId;
    const owner = addCharacter(world, { name: "Proud Owner", rank: "civilian", age: 50, familyId: null, traits: ["proud"] });
    world.geo.businesses.byId[shopId]!.ownerId = owner.id;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "CollectionMissed", businessId: shopId, collectorId: meId, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [r0.log];
    const r1 = step(world, [], content, opts);
    world = r1.world;
    logs.push(r1.log);

    const instanceId = processSpawns(factsOf(logs), "assoc.latePayer")[0]!.instance.id;
    const r2 = step(world, [{ kind: "decide", instanceId, optionId: "lean" }], content, opts);
    logs.push(r2.log);

    const facts = factsOf(logs);
    expect(resolves(facts, "assoc.latePayer", instanceId)[0]!.outcomeId).toBe("leaned");
    expect(facts.some((f) => f.kind === "EvidenceAdd" && f.characterId === meId && f.item.source === "witness")).toBe(false);
  });

  it("sendKid's botched branch puts the 'laughed' memory on the keeper (about me) when the shop has an owner", () => {
    const content = contentOf([latePayer!]);
    let found = false;
    for (let i = 0; i < 80 && !found; i++) {
      let world = buildStarterWorld(`late-payer-sendkid-keeper-${i}`, setup, content);
      const shopId = world.geo.businesses.order[0]! as BusinessId;
      const meId = world.player.characterId;
      const owner = addCharacter(world, { name: "Keeper", rank: "civilian", age: 50, familyId: null, traits: [] });
      world.geo.businesses.byId[shopId]!.ownerId = owner.id;

      const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "CollectionMissed", businessId: shopId, collectorId: meId, cause: { rule: "test" } }] });
      world = r0.world;
      const logs: TurnLog[] = [r0.log];
      const r1 = step(world, [], content, opts);
      world = r1.world;
      logs.push(r1.log);
      const spawns = processSpawns(factsOf(logs), "assoc.latePayer");
      if (spawns.length === 0) continue;
      const instanceId = spawns[0]!.instance.id;
      const r2 = step(world, [{ kind: "decide", instanceId, optionId: "sendKid" }], content, opts);
      logs.push(r2.log);

      const facts = factsOf(logs);
      const resolve = resolves(facts, "assoc.latePayer", instanceId)[0];
      if (resolve?.outcomeId === "sendKidBotchedKeeper") {
        found = true;
        expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === owner.id && f.memory.tag === "laughed" && f.memory.aboutId === meId)).toBe(true);
        expect(facts.some((f) => f.kind === "ComplianceDelta" && f.businessId === shopId && f.delta === -40)).toBe(true);
      }
    }
    expect(found, "sendKidBotchedKeeper never fired across 80 seeds (15% chance each)").toBe(true);
  });

  it("sendKid's botched branch falls back to a memory on me when the shop has no owner", () => {
    const content = contentOf([latePayer!]);
    let found = false;
    for (let i = 0; i < 80 && !found; i++) {
      let world = buildStarterWorld(`late-payer-sendkid-nokeeper-${i}`, setup, content);
      const shopId = world.geo.businesses.order[0]! as BusinessId;
      const meId = world.player.characterId;
      // Default: no owner (buildStarterWorld predates the generator addition, ownerId stays null).

      const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "CollectionMissed", businessId: shopId, collectorId: meId, cause: { rule: "test" } }] });
      world = r0.world;
      const logs: TurnLog[] = [r0.log];
      const r1 = step(world, [], content, opts);
      world = r1.world;
      logs.push(r1.log);
      const spawns = processSpawns(factsOf(logs), "assoc.latePayer");
      if (spawns.length === 0) continue;
      const instanceId = spawns[0]!.instance.id;
      const r2 = step(world, [{ kind: "decide", instanceId, optionId: "sendKid" }], content, opts);
      logs.push(r2.log);

      const facts = factsOf(logs);
      const resolve = resolves(facts, "assoc.latePayer", instanceId)[0];
      if (resolve?.outcomeId === "sendKidBotchedNoKeeper") {
        found = true;
        expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === meId && f.memory.tag === "kidLaughedAt")).toBe(true);
      }
    }
    expect(found, "sendKidBotchedNoKeeper never fired across 80 seeds (15% chance each)").toBe(true);
  });
});

describe("assoc.game.stake (design 09 §4 row 2)", () => {
  it("spawns weekly while me runs the game, and 'bankSelf' resolves to a money fact on me's own account", () => {
    const content = contentOf([gameStake!]);
    let world = buildStarterWorld("game-stake-1", setup, content);
    const meId = world.player.characterId;
    const meAccount = world.characters.byId[meId]!.accounts.personal;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "MemoryAdd", characterId: meId, memory: { tag: "runsGame", weight: 100 }, cause: { rule: "test" } }] });
    world = r0.world;

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.game.stake", 5);
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "bankSelf" }], content, opts);
    world = r.world;
    const facts = factsOf([...logs1, r.log]);

    expect(resolves(facts, "assoc.game.stake", instanceId)).toHaveLength(1);
    const moneyFact = facts.find(
      (f): f is Extract<Fact, { kind: "MoneyMint" | "MoneyDestroy" }> =>
        (f.kind === "MoneyMint" && f.to === meAccount) || (f.kind === "MoneyDestroy" && f.from === meAccount),
    );
    expect(moneyFact).toBeDefined();
  });

  it("'move' cools the street down instead of paying out", () => {
    const content = contentOf([gameStake!]);
    let world = buildStarterWorld("game-stake-2", setup, content);
    const meId = world.player.characterId;
    const townId = world.geo.towns.order[0]!;
    world.pressure.heatByTown[townId] = 100;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "MemoryAdd", characterId: meId, memory: { tag: "runsGame", weight: 100 }, cause: { rule: "test" } }] });
    world = r0.world;

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.game.stake", 5);
    world = w1;

    const before = world.pressure.heatByTown[townId] ?? 0;
    const r = step(world, [{ kind: "decide", instanceId, optionId: "move" }], content, opts);
    world = r.world;
    const facts = factsOf([...logs1, r.log]);

    expect(facts.some((f) => f.kind === "HeatDelta" && f.townId === townId && f.delta === -30)).toBe(true);
    expect(world.pressure.heatByTown[townId]).toBeLessThan(before);
  });
});

describe("assoc.game.raid (design 09 §4 row 3)", () => {
  it("fires in the state lane once heat is high and me runs the game, arresting me", () => {
    const content = contentOf([gameRaid!]);
    let world = buildStarterWorld("game-raid-1", setup, content);
    const meId = world.player.characterId;
    const townId = world.geo.towns.order[0]!;

    const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "MemoryAdd", characterId: meId, memory: { tag: "runsGame", weight: 100 }, cause: { rule: "test" } }] });
    world = r0.world;
    const logs: TurnLog[] = [r0.log];

    let arrested = false;
    for (let i = 0; i < 400 && !arrested; i++) {
      // Pinned above the 60 threshold every turn so pressure decay (design 03 §5) never starves the roll.
      world.pressure.heatByTown[townId] = 300;
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      arrested = r.log.entries.some((e) => e.kind === "fact" && e.fact.kind === "StatusChange" && e.fact.characterId === meId && e.fact.status === "arrested");
    }
    expect(arrested).toBe(true);

    const facts = factsOf(logs);
    const spawn = processSpawns(facts, "assoc.game.raid")[0];
    expect(spawn).toBeDefined();
    const resolve = resolves(facts, "assoc.game.raid", spawn!.instance.id)[0];
    expect(resolve).toBeDefined();
    // Design change (2026-09-25): the flip no longer rolls at arrest (it moved to `state.detained.interrogation`,
    // state.ts), so `assoc.game.raid` now has a single "arrest" outcome instead of a "cooperates"/"silent" pair.
    expect(resolve!.outcomeId).toBe("arrest");
    expect(facts.some((f) => f.kind === "CooperationSet")).toBe(false);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === meId && f.field === "arrests" && f.delta === 1)).toBe(true);
    expect(facts.some((f) => f.kind === "HeatDelta" && f.townId === townId && f.delta === -80)).toBe(true);
  });
});

/** Shared by the three favor templates below: spawn is probabilistic (weight < 10000), so this searches across
 * turns for the decision, accepts it, and returns the facts from spawn through resolution. */
function runFavorAccept(seed: string, template: ProcessTemplate, templateId: string): { facts: Fact[]; world: World; meId: string } {
  const content = contentOf([template]);
  let world = buildStarterWorld(seed, setup, content);
  const meId = world.player.characterId;

  const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, templateId, 200);
  world = w1;

  const r = step(world, [{ kind: "decide", instanceId, optionId: "accept" }], content, opts);
  world = r.world;
  return { facts: factsOf([...logs1, r.log]), world, meId };
}

describe("assoc.favor.drive (design 09 §4 row 4)", () => {
  it("accepting resolves to one of the design's outcomes with its recorded consequence", () => {
    const { facts, meId } = runFavorAccept("favor-drive-1", favorDrive!, "assoc.favor.drive");
    const spawn = facts.find((f): f is Extract<Fact, { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn" && f.instance.templateId === "assoc.favor.drive")!;
    const resolve = resolves(facts, "assoc.favor.drive", spawn.instance.id)[0];
    expect(resolve).toBeDefined();
    expect(["pickup", "killingSurvives", "killingDead", "stopped", "witnessed"]).toContain(resolve!.outcomeId);
    // RecordDelta jobsDone (pickup/killing) or a StatusChange (stopped/killingDead) or EvidenceAdd (witnessed)
    // is guaranteed by every branch's own effects list; assert the union directly off the outcome id instead
    // of guessing which branch this seed drew.
    if (resolve!.outcomeId === "pickup" || resolve!.outcomeId === "killingSurvives" || resolve!.outcomeId === "killingDead") {
      expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === meId && f.field === "jobsDone")).toBe(true);
    } else if (resolve!.outcomeId === "stopped") {
      expect(facts.some((f) => f.kind === "StatusChange" && f.characterId === meId && f.status === "arrested")).toBe(true);
    } else {
      expect(facts.some((f) => f.kind === "EvidenceAdd" && f.characterId === meId)).toBe(true);
    }
    if (resolve!.outcomeId === "killingDead") {
      expect(facts.some((f) => f.kind === "StatusChange" && f.characterId === meId && f.status === "dead")).toBe(true);
    }
  });

  it("declining always costs favor and is recorded as a refusal", () => {
    const content = contentOf([favorDrive!]);
    let world = buildStarterWorld("favor-drive-2", setup, content);
    const meId = world.player.characterId;

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "assoc.favor.drive", 200);
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "decline" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(facts.some((f) => f.kind === "FavorDelta" && f.to === meId && f.delta === -15)).toBe(true);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === meId && f.field === "jobsRefused" && f.delta === 1)).toBe(true);
    expect(resolves(facts, "assoc.favor.drive", instanceId)[0]!.outcomeId).toBe("declined");
  });
});

describe("assoc.favor.note (design 09 §4 row 5)", () => {
  it("accepting resolves to 'delivered' or 'intercepted' with the matching consequence", () => {
    const { facts, meId } = runFavorAccept("favor-note-1", favorNote!, "assoc.favor.note");
    const spawn = facts.find((f): f is Extract<Fact, { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn" && f.instance.templateId === "assoc.favor.note")!;
    const resolve = resolves(facts, "assoc.favor.note", spawn.instance.id)[0];
    expect(resolve).toBeDefined();
    expect(["delivered", "intercepted"]).toContain(resolve!.outcomeId);
    if (resolve!.outcomeId === "delivered") {
      expect(facts.some((f) => f.kind === "FavorDelta" && f.to === meId && f.delta === 25)).toBe(true);
    } else {
      expect(facts.some((f) => f.kind === "EvidenceAdd" && f.characterId === meId && f.item.source === "document")).toBe(true);
      expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === meId && f.memory.tag === "knownCourier")).toBe(true);
    }
  });
});

describe("assoc.favor.door (design 09 §4 row 6)", () => {
  it("accepting always pays favor up front, then resolves to one of the design's outcomes", () => {
    const { facts, meId } = runFavorAccept("favor-door-1", favorDoor!, "assoc.favor.door");
    // "accept"'s own effects (design 09 §4: "FavorDelta +30, jobsDone") apply regardless of the random outcome.
    expect(facts.some((f) => f.kind === "FavorDelta" && f.to === meId && f.delta === 30)).toBe(true);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === meId && f.field === "jobsDone" && f.delta === 1)).toBe(true);

    const spawn = facts.find((f): f is Extract<Fact, { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn" && f.instance.templateId === "assoc.favor.door")!;
    const resolve = resolves(facts, "assoc.favor.door", spawn.instance.id)[0];
    expect(resolve).toBeDefined();
    expect(["nothing", "somethingHappened", "policeArriveSurvives", "policeArriveDead", "witnessed"]).toContain(resolve!.outcomeId);
  });
});
