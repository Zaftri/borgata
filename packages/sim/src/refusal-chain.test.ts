// Scenario test for the first chain of consequence (design 04 §8, B6a the escalation ladder, user story 11):
import { EMPTY_CONTENT } from "./content-types.js";
// a refusing shop -> the crew chief's decision -> arson (or a milder answer), with causeChainId linking every
// step. Content lives in packages/content; sim may not import the content package for production code
// (design 01 §2), but this test file is exempt from that import boundary (eslint.config.js ignores
// packages/sim/src/**/*.test.ts from the sim-only-imports-@borgata/shared rule), so it reads the templates
// straight from their source file with a relative path.
//
// `step()` is called here with `{ debug: false }`. Found while writing this test, reported separately (not
// fixed here; out of this task's file scope): `invariants/engine.ts` "engine.scheduleValid" checks
// `entry.fireTurn <= world.meta.turn`, but `step()` runs `advanceCalendar` (which increments `meta.turn` by
// exactly 1) *before* invariants run (design 01 §3 step 8 runs ahead of step 6 here). So a schedule entry
// created this call with `fireTurn = thisTurn + delay` is compared, after this same call, against
// `meta.turn = thisTurn + 1` -- which equals `fireTurn` whenever `delay === 1`, and equals it again one call
// before firing for any other `delay`, since firing only happens where `entry.fireTurn <= turn` is checked
// against the *pre-advance* turn (engine/scheduler.ts). In short: any pending schedule entry, in the persisted
// world between step() calls, trips this invariant on the turn immediately before it is due to fire --
// independent of which template or delay is used. This reproduces with any `FollowUp`/`schedule` effect run
// through `step()` with `debug: true`, including the ones this file's templates use per the brief (civil.ts).
// The likely fix is `entry.fireTurn < world.meta.turn` (a schedule entry due exactly this upcoming turn is
// valid; only one left in the past is not).
import { describe, expect, it } from "vitest";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import type { GameSetup, World } from "./world.js";
import { CIVIL_TEMPLATES } from "../../content/src/templates/civil.js";

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const content = { ...EMPTY_CONTENT, version: "t", templates: CIVIL_TEMPLATES };
const opts = { debug: true }; // invariants on: the schedule off-by-one this file first reported is fixed in invariants/engine.ts

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

/** The starter world's one crew chief ("Turi Lo Cascio"), design 02 §4. */
function findChief(world: World) {
  const chief = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.rank === "chief");
  if (!chief) throw new Error("starter world has no crew chief");
  return chief;
}

function processSpawns(facts: readonly Fact[], templateId: string): Extract<Fact, { kind: "ProcessSpawn" }>[] {
  return facts.filter((f): f is Extract<Fact, { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn" && f.instance.templateId === templateId);
}

function claimHolderOf(world: World, businessId: string): string | undefined {
  return world.claims.order.map((id) => world.claims.byId[id]!).find((c) => c.subject.kind === "business" && c.subject.id === businessId)?.holderId;
}

/** Hotspot 5 (docs/event-storming-2026-09-25.md §3): a shop whose claim holder is neither the player nor the
 * player's own superior (i.e. neither `holder` nor `mine`, civil.ts's file header, can ever bind to the player)
 * -- the starter world's blockA shops are held by the player's own sponsor (soldier1), so a genuine bystander
 * case needs one of blockB's shops (soldier2) instead. */
function findBystanderShop(world: World): string {
  const player = world.characters.byId[world.player.characterId]!;
  const shopId = world.geo.businesses.order.find((id) => {
    const holderId = claimHolderOf(world, id);
    return holderId !== undefined && holderId !== player.id && holderId !== player.superiorId;
  });
  if (!shopId) throw new Error("starter world has no bystander shop");
  return shopId;
}

describe("the refusal chain (design 04 §8, user story 11)", () => {
  it("civil.refusal.start fires, family.intimidation.choose is AI-decided (glue), and the chain shares a causeChainId", () => {
    let world = buildStarterWorld("refusal-chain-1", setup, content);
    // Hotspot 5 (docs/event-storming-2026-09-25.md §3): a bystander shop, not businesses.order[0] (which the
    // starter world's soldier1 holds, with the player himself on record as his subordinate -- that shop would
    // now route the decision to the player via `mine`, not the chief; see the "mine" test below).
    const shopId = findBystanderShop(world);
    world.geo.businesses.byId[shopId]!.compliance = 300; // below the 400 threshold (civil.refusal.start precondition)

    const logs: TurnLog[] = [];
    let refusalTurn = -1;
    // Weight 1500 (per ten thousand) per turn: essentially certain within 40 turns.
    for (let i = 0; i < 40 && refusalTurn < 0; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      if (world.geo.businesses.byId[shopId]!.refusalStage === 1) refusalTurn = i;
    }
    expect(refusalTurn).toBeGreaterThanOrEqual(0);
    expect(world.geo.businesses.byId[shopId]!.refusalStage).toBe(1);

    // Two more turns: turn+1 the schedule entry fires and spawns family.intimidation.choose; turn+2 it is
    // due, and since the crew chief is not playerControlled here, the engine takes `aiDefault` ("glue")
    // immediately (design 04 §3 step 4). A couple of turns of slack either side.
    for (let i = 0; i < 4; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }

    const facts = factsOf(logs);

    const startSpawns = processSpawns(facts, "civil.refusal.start").filter((f) => f.instance.roles["shop"]?.id === shopId);
    expect(startSpawns).toHaveLength(1);
    const startInstance = startSpawns[0]!.instance;

    const chooseSpawns = processSpawns(facts, "family.intimidation.choose").filter((f) => f.instance.parentId === startInstance.id);
    expect(chooseSpawns).toHaveLength(1);
    const chooseInstance = chooseSpawns[0]!.instance;
    expect(chooseInstance.causeChainId).toBe(startInstance.causeChainId);

    // The "glue" option's FearDelta, tied back to the choose instance by cause.instanceId (design 04 §1).
    const glueFear = facts.find(
      (f): f is Extract<Fact, { kind: "FearDelta" }> =>
        f.kind === "FearDelta" && f.businessId === shopId && f.delta === 80 && f.cause.instanceId === chooseInstance.id,
    );
    expect(glueFear).toBeDefined();
    expect(world.geo.businesses.byId[shopId]!.fear).toBe(380); // 300 starter default + 80 from glue

    // family.intimidation.choose bound a "town" role matching the player's family's town, so it is
    // player-facing at spawn (engine/scheduler.ts isPlayerFacing) even though the AI, not the player,
    // resolves the decision itself.
    // ... and once the instance resolved, the progression sweep cleared the request (no dangling decisions).
    const pushed = facts.find((f) => f.kind === "RequestPush" && f.request.instanceId === chooseInstance.id);
    expect(pushed).toBeDefined();
    expect(world.player.requestQueue.find((r) => r.instanceId === chooseInstance.id)).toBeUndefined();

    // Hotspot 5: a bystander shop resolves through the original, chief-voiced outcome, never the player-voice
    // ones, and the player earns none of the extra participation evidence those carry.
    const resolve = facts.find(
      (f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === chooseInstance.id,
    );
    expect(resolve?.outcomeId).toBe("glued");
    expect(
      facts.some((f) => f.kind === "EvidenceAdd" && f.characterId === world.player.characterId && f.cause.instanceId === chooseInstance.id),
    ).toBe(false);
  });

  it("with the chief playerControlled, the decision awaits, and choosing arson spawns and resolves operation.arson", () => {
    let world = buildStarterWorld("refusal-chain-2", setup, content);
    // Hotspot 5: a bystander shop, so `holder`/`mine` never bind to the player and the chief's own
    // playerControlled flag (set below) is what actually routes the decision here.
    const shopId = findBystanderShop(world);
    world.geo.businesses.byId[shopId]!.compliance = 300;
    findChief(world).playerControlled = true;

    let choosingInstanceId: string | undefined;
    for (let i = 0; i < 60 && !choosingInstanceId; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      const inst = world.processes.order
        .map((id) => world.processes.byId[id]!)
        .find((p) => p.templateId === "family.intimidation.choose" && p.state === "awaitingDecision");
      if (inst) choosingInstanceId = inst.id;
    }
    expect(choosingInstanceId).toBeDefined();

    const r = step(world, [{ kind: "decide", instanceId: choosingInstanceId!, optionId: "arson" }], content, opts);
    world = r.world;
    const logs: TurnLog[] = [r.log];
    expect(r.log.entries.some((e) => e.kind === "fact" && e.fact.kind === "ProcessDecide" && e.fact.optionId === "arson")).toBe(true);

    let arsonResolved = false;
    for (let i = 0; i < 3 && !arsonResolved; i++) {
      const r2 = step(world, [], content, opts);
      world = r2.world;
      logs.push(r2.log);
      arsonResolved = r2.log.entries.some(
        (e) => e.kind === "fact" && e.fact.kind === "ProcessResolve" && ["success", "witnessed", "failed"].includes(e.fact.outcomeId),
      );
    }
    expect(arsonResolved).toBe(true);

    const facts = factsOf(logs);
    const arsonSpawn = processSpawns(facts, "operation.arson").find((f) => f.instance.roles["shop"]?.id === shopId);
    expect(arsonSpawn).toBeDefined();

    const resolve = facts.find(
      (f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === arsonSpawn!.instance.id,
    );
    expect(resolve).toBeDefined();

    if (resolve!.outcomeId === "failed") {
      expect(facts.some((f) => f.kind === "MemoryAdd" && f.memory.tag === "botched")).toBe(true);
    } else {
      expect(facts.some((f) => f.kind === "FearDelta" && f.businessId === shopId && f.delta === 300)).toBe(true);
      expect(world.geo.businesses.byId[shopId]!.refusalStage).toBe(0); // arson resets the ladder on success/witnessed
    }
  });

  it("user story 11: a three-step chain (refusal, decision, arson) is visibly connected by cause in the logs", () => {
    // A public killing is not an available template yet (docs/NOW.md phase 3 next tasks); this chain is the
    // one release-ready three-step chain (headline-equivalent sign/report, state-equivalent follow-up,
    // and a connected follow-up), which is what user story 11's acceptance criterion is checking for: steps
    // "visibly connected... whose steps are visibly connected in the newspaper" via a shared causeChainId.
    let world = buildStarterWorld("refusal-chain-3", setup, content);
    // Hotspot 5: a bystander shop, same reason as the test above.
    const shopId = findBystanderShop(world);
    world.geo.businesses.byId[shopId]!.compliance = 300;
    findChief(world).playerControlled = true;

    const logs: TurnLog[] = [];
    let choosingInstanceId: string | undefined;
    for (let i = 0; i < 60 && !choosingInstanceId; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      const inst = world.processes.order
        .map((id) => world.processes.byId[id]!)
        .find((p) => p.templateId === "family.intimidation.choose" && p.state === "awaitingDecision");
      if (inst) choosingInstanceId = inst.id;
    }
    expect(choosingInstanceId).toBeDefined();

    const decideResult = step(world, [{ kind: "decide", instanceId: choosingInstanceId!, optionId: "arson" }], content, opts);
    world = decideResult.world;
    logs.push(decideResult.log);
    for (let i = 0; i < 3; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }

    const facts = factsOf(logs);
    const startInstance = processSpawns(facts, "civil.refusal.start").find((f) => f.instance.roles["shop"]?.id === shopId)!.instance;
    const chooseInstance = processSpawns(facts, "family.intimidation.choose").find((f) => f.instance.parentId === startInstance.id)!.instance;
    const arsonInstance = processSpawns(facts, "operation.arson").find((f) => f.instance.parentId === chooseInstance.id)!.instance;

    // Three steps, one chain: each instance's causeChainId matches the one civil.refusal.start minted, and
    // parentId threads spawn -> decision -> operation, exactly design 04 §2's "the newspaper groups them by
    // causeChainId".
    expect(chooseInstance.causeChainId).toBe(startInstance.causeChainId);
    expect(arsonInstance.causeChainId).toBe(startInstance.causeChainId);
    expect(arsonInstance.parentId).toBe(chooseInstance.id);
    expect(chooseInstance.parentId).toBe(startInstance.id);

    const decide = facts.find(
      (f): f is Extract<Fact, { kind: "ProcessDecide" }> => f.kind === "ProcessDecide" && f.instanceId === chooseInstance.id && f.optionId === "arson",
    );
    expect(decide).toBeDefined();
  });
});

// Hotspot 5 (docs/event-storming-2026-09-25.md §3, 2026-09-25): "when the player is the party, the player
// decides." Two scenarios: the player as `mine` (an associate on record with the shop's holder -- the starter
// world's own default relationship, soldier1's blockA shops) and the player as `holder` himself (his own claim
// on a shop). Both must reach the player without ever offering the chief's version, and a bystander shop (the
// tests above) must still reach the chief and never the player.
describe("family.intimidation.choose routes to the player when he is the party (hotspot 5, 2026-09-25)", () => {
  it("the player's own collector share: an associate on record with the shop's holder chooses glue himself, via `mine`", () => {
    let world = buildStarterWorld("hotspot5-mine", setup, content);
    // blockA (businesses.order[0]): held by soldier1, the starter world's own player.superiorId (starter.ts) --
    // the player is already on record with him, so `mine` binds to the player with no setup at all.
    const shopId = world.geo.businesses.order[0]!;
    expect(claimHolderOf(world, shopId)).toBe(world.characters.byId[world.player.characterId]!.superiorId);
    world.geo.businesses.byId[shopId]!.compliance = 300;

    const logs: TurnLog[] = [];
    let choosingInstanceId: string | undefined;
    for (let i = 0; i < 60 && !choosingInstanceId; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      const inst = world.processes.order
        .map((id) => world.processes.byId[id]!)
        .find((p) => p.templateId === "family.intimidation.choose" && p.state === "awaitingDecision" && p.roles["shop"]?.id === shopId);
      if (inst) choosingInstanceId = inst.id;
    }
    expect(choosingInstanceId).toBeDefined();
    // Not the chief: the player's own subordinate role bound the decision (design 04's decision.role list,
    // engine/scheduler.ts resolveDeciderRoleName -- `holder` (soldier1) is not playerControlled, so `mine` wins).
    expect(world.processes.byId[choosingInstanceId!]!.roles["mine"]?.id).toBe(world.player.characterId);

    const r = step(world, [{ kind: "decide", instanceId: choosingInstanceId!, optionId: "glue" }], content, opts);
    world = r.world;
    logs.push(r.log);

    const facts = factsOf(logs);
    const resolve = facts.find(
      (f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === choosingInstanceId,
    );
    expect(resolve?.outcomeId).toBe("gluedMine");
    // The consequences a player-made choice carries (hotspot 5's proposal): participation evidence and a job
    // credited to the player himself, not the chief.
    expect(
      facts.some(
        (f) =>
          f.kind === "EvidenceAdd" && f.characterId === world.player.characterId && f.item.weight === 10 && f.item.source === "participation",
      ),
    ).toBe(true);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === world.player.characterId && f.field === "jobsDone" && f.delta === 1)).toBe(
      true,
    );
    expect(facts.some((f) => f.kind === "ReportNote" && f.text.includes("You glue his locks yourself"))).toBe(true);
    // The chief's own version never ran.
    expect(facts.some((f) => f.kind === "ProcessResolve" && ["glued", "gluedHolder"].includes(f.outcomeId))).toBe(false);
  });

  it("the player himself holds the shop's claim: the decision routes to him via `holder`, and choosing arson still spawns operation.arson", () => {
    let world = buildStarterWorld("hotspot5-holder", setup, content);
    // A bystander shop by default (soldier2's, blockB); reassigning its claim makes the player its holder
    // directly, so `holder` -- not `mine` or `chief` -- decides (resolveDeciderRoleName checks it first).
    const shopId = findBystanderShop(world);
    const claim = world.claims.order.map((id) => world.claims.byId[id]!).find((c) => c.subject.kind === "business" && c.subject.id === shopId)!;
    claim.holderId = world.player.characterId;
    world.geo.businesses.byId[shopId]!.compliance = 300;

    const logs: TurnLog[] = [];
    let choosingInstanceId: string | undefined;
    for (let i = 0; i < 60 && !choosingInstanceId; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      const inst = world.processes.order
        .map((id) => world.processes.byId[id]!)
        .find((p) => p.templateId === "family.intimidation.choose" && p.state === "awaitingDecision" && p.roles["shop"]?.id === shopId);
      if (inst) choosingInstanceId = inst.id;
    }
    expect(choosingInstanceId).toBeDefined();
    expect(world.processes.byId[choosingInstanceId!]!.roles["holder"]?.id).toBe(world.player.characterId);

    const decideResult = step(world, [{ kind: "decide", instanceId: choosingInstanceId!, optionId: "arson" }], content, opts);
    world = decideResult.world;
    logs.push(decideResult.log);
    for (let i = 0; i < 3; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }

    const facts = factsOf(logs);
    // Same follow-up as the chief's version (civil.ts's own comment: "the same effects and follow-ups"):
    // arson is still scheduled and resolves as an operation, unaffected by who ordered it.
    const arsonSpawn = processSpawns(facts, "operation.arson").find((f) => f.instance.roles["shop"]?.id === shopId);
    expect(arsonSpawn).toBeDefined();
    expect(facts.some((f) => f.kind === "ProcessResolve" && f.instanceId === arsonSpawn!.instance.id)).toBe(true);

    // The decision's own resolution names the player as the one who ordered it, with the extra evidence and
    // job credit hotspot 5 adds -- and never the chief's third-person version.
    expect(facts.some((f) => f.kind === "ProcessResolve" && f.outcomeId === "burnedHolder")).toBe(true);
    expect(facts.some((f) => f.kind === "ProcessResolve" && ["burned", "burnedMine"].includes(f.outcomeId))).toBe(false);
    expect(
      facts.some(
        (f) =>
          f.kind === "EvidenceAdd" && f.characterId === world.player.characterId && f.item.weight === 30 && f.item.source === "participation",
      ),
    ).toBe(true);
    expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === world.player.characterId && f.field === "jobsDone" && f.delta === 1)).toBe(
      true,
    );
    expect(facts.some((f) => f.kind === "ReportNote" && f.text.includes("You give the order yourself"))).toBe(true);
  });
});
