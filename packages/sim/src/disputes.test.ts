// Scenario tests for the disputes wave (design 04 §5 FR-E; brainstorm E1, E2, E5; user stories 2 and 5;
import { EMPTY_CONTENT } from "./content-types.js";
// docs/gameplay-walkthrough.md rank 1's "around week 6" dispute and rank 3's "How you leave the rank" vacancy
// promotion). Content lives in packages/content; sim may not import it for production code (design 01 §2), but
// this test file is exempt (eslint.config.js ignores packages/sim/src/**/*.test.ts from the sim-only-imports
// rule), the same pattern as refusal-chain.test.ts and state-templates.test.ts.
import { describe, expect, it } from "vitest";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import { addCharacter } from "./world.js";
import type { GameSetup, World } from "./world.js";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import { DISPUTE_TEMPLATES } from "../../content/src/templates/disputes.js";

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const content = { ...EMPTY_CONTENT, version: "t", templates: [...DISPUTE_TEMPLATES] };
const opts = { debug: true };

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

/** The starter world's first crew chief in creation order, "Turi Lo Cascio" (design 02 §4), i.e. the first
 * family's chief -- reliable because `characters.order` is creation order and the first family is built
 * before the second (starter.ts). */
function findChief(world: World) {
  const chief = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.rank === "chief");
  if (!chief) throw new Error("starter world has no crew chief");
  return chief;
}

function processSpawns(facts: readonly Fact[], templateId: string): Extract<Fact, { kind: "ProcessSpawn" }>[] {
  return facts.filter((f): f is Extract<Fact, { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn" && f.instance.templateId === templateId);
}

describe("family.poach.attempt and dispute.claim (design 04 §5, user stories 2 and 5)", () => {
  it("fires on a first-family shop: the poacher belongs to the other family and the holder remembers being poached", () => {
    let world = buildStarterWorld("dispute-poach-1", setup, content);
    // The spawn odds are tuned for play, not for tests (2026-09-25): force this card's spawn weight here.
    const boosted = { ...content, templates: content.templates.map((t) => (t.id === "family.poach.attempt" && t.spawn ? { ...t, spawn: { ...t.spawn, weight: 10_000 } } : t)) };
    const family1Id = world.families.order[0]!;

    const logs: TurnLog[] = [];
    let poachSpawn: Extract<Fact, { kind: "ProcessSpawn" }> | undefined;
    for (let i = 0; i < 60 && !poachSpawn; i++) {
      const r = step(world, [], boosted, opts);
      world = r.world;
      logs.push(r.log);
      const spawns = processSpawns(factsOf([r.log]), "family.poach.attempt");
      poachSpawn = spawns.find((f) => f.instance.roles["victimFamily"]?.id === family1Id);
    }
    expect(poachSpawn).toBeDefined();

    const holderId = poachSpawn!.instance.roles["holder"]!.id;
    const poacherId = poachSpawn!.instance.roles["poacher"]!.id;
    expect(world.characters.byId[poacherId]!.familyId).not.toBe(family1Id);
    expect(world.characters.byId[holderId]!.memory.some((m) => m.tag === "poached" && m.aboutId === poacherId)).toBe(true);
  });

  it("with the arbiter not player-controlled, dispute.claim resolves heldWon or heldLost consistent with Weight (aiDefault hold)", () => {
    let world = buildStarterWorld("dispute-hold", setup, content);
    // Forced spawn odds (2026-09-25): the play weight is 8 per business per turn.
    const boosted = { ...content, templates: content.templates.map((t) => (t.id === "family.poach.attempt" && t.spawn ? { ...t, spawn: { ...t.spawn, weight: 10_000 } } : t)) };
    const family1Id = world.families.order[0]!;

    const logs: TurnLog[] = [];
    let shopId: string | undefined;
    for (let i = 0; i < 60 && !shopId; i++) {
      const r = step(world, [], boosted, opts);
      world = r.world;
      logs.push(r.log);
      const spawn = processSpawns(factsOf([r.log]), "family.poach.attempt").find((f) => f.instance.roles["victimFamily"]?.id === family1Id);
      if (spawn) shopId = spawn.instance.roles["shop"]!.id;
    }
    expect(shopId).toBeDefined();

    let disputeInstanceId: string | undefined;
    let outcomeId: string | undefined;
    let arbiterWeight: number | undefined;
    let poacherChiefWeight: number | undefined;
    for (let i = 0; i < 10 && outcomeId === undefined; i++) {
      // Snapshot the weights the scheduler is about to read (cmpRoles reads the stored field, updated only by
      // last turn's progressionStep, not recomputed live) before calling step() for this turn.
      let snapArbiter: number | undefined;
      let snapPoacherChief: number | undefined;
      if (disputeInstanceId) {
        const inst = world.processes.byId[disputeInstanceId];
        const arbiterRef = inst?.roles["arbiter"];
        const poacherChiefRef = inst?.roles["poacherChief"];
        snapArbiter = arbiterRef ? world.characters.byId[arbiterRef.id]?.weight : undefined;
        snapPoacherChief = poacherChiefRef ? world.characters.byId[poacherChiefRef.id]?.weight : undefined;
      }
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      for (const e of r.log.entries) {
        if (e.kind !== "fact") continue;
        if (e.fact.kind === "ProcessSpawn" && e.fact.instance.templateId === "dispute.claim" && e.fact.instance.roles["shop"]?.id === shopId) {
          disputeInstanceId = e.fact.instance.id;
        }
        if (e.fact.kind === "ProcessResolve" && e.fact.instanceId === disputeInstanceId) {
          outcomeId = e.fact.outcomeId;
          arbiterWeight = snapArbiter;
          poacherChiefWeight = snapPoacherChief;
        }
      }
    }

    expect(outcomeId === "heldWon" || outcomeId === "heldLost").toBe(true);
    expect(arbiterWeight).toBeDefined();
    expect(poacherChiefWeight).toBeDefined();
    expect(outcomeId).toBe(arbiterWeight! >= poacherChiefWeight! ? "heldWon" : "heldLost");
  });

  it("deciding concede transfers the claim to the poacher (user story 2)", () => {
    let world = buildStarterWorld("dispute-concede", setup, content);
    findChief(world).playerControlled = true;

    let choosingInstanceId: string | undefined;
    for (let i = 0; i < 80 && !choosingInstanceId; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      const inst = world.processes.order
        .map((id) => world.processes.byId[id]!)
        .find((p) => p.templateId === "dispute.claim" && p.state === "awaitingDecision");
      if (inst) choosingInstanceId = inst.id;
    }
    expect(choosingInstanceId).toBeDefined();

    const instBefore = world.processes.byId[choosingInstanceId!]!;
    // User story 5: the dispute offers three approaches.
    expect(instBefore.decision?.options.slice().sort()).toEqual(["concede", "hold", "pay"]);

    const shopId = instBefore.roles["shop"]!.id;
    const poacherId = instBefore.roles["poacher"]!.id;
    const originalHolderId = instBefore.roles["holder"]!.id;

    const r = step(world, [{ kind: "decide", instanceId: choosingInstanceId!, optionId: "concede" }], content, opts);
    world = r.world;

    const claim = world.claims.order.map((id) => world.claims.byId[id]!).find((c) => c.subject.kind === "business" && c.subject.id === shopId);
    expect(claim).toBeDefined();
    expect(claim!.holderId).toBe(poacherId);
    expect(world.characters.byId[originalHolderId]!.loyalty).toBeLessThan(500);
  });

  it("deciding pay moves 100 kL from the arbiter to the poacher", () => {
    let world = buildStarterWorld("dispute-pay", setup, content);
    const chief = findChief(world);
    chief.playerControlled = true;
    const arbiterAccount = chief.accounts.personal;
    // A player-controlled crew chief is skipped by family-ai (its ensureChain/ensureCrewShares), so Turi never
    // collects protection tax here; plant funds directly so the "pay" option has dirty money to move. Bump
    // `minted` by the same amount so money.conservation (invariants/ledger.ts) still holds.
    world.ledger.accounts.byId[arbiterAccount]!.dirty = 1000;
    world.ledger.minted += 1000;

    let choosingInstanceId: string | undefined;
    for (let i = 0; i < 80 && !choosingInstanceId; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      const inst = world.processes.order
        .map((id) => world.processes.byId[id]!)
        .find((p) => p.templateId === "dispute.claim" && p.state === "awaitingDecision");
      if (inst) choosingInstanceId = inst.id;
    }
    expect(choosingInstanceId).toBeDefined();

    const instBefore = world.processes.byId[choosingInstanceId!]!;
    const poacherId = instBefore.roles["poacher"]!.id;
    const poacherAccount = world.characters.byId[poacherId]!.accounts.personal;

    const r = step(world, [{ kind: "decide", instanceId: choosingInstanceId!, optionId: "pay" }], content, opts);
    world = r.world;

    // Check the MoneyMove fact itself, not the net account balance: the starter world's protection-tax chain
    // (systems/chains.ts, applyShares) keeps moving money into the arbiter's account every turn regardless of
    // content, so a before/after balance diff would be confounded by that unrelated income this same turn.
    const move = factsOf([r.log]).find(
      (f): f is Extract<Fact, { kind: "MoneyMove" }> => f.kind === "MoneyMove" && f.cause.rule === "dispute.claim.pay",
    );
    expect(move).toBeDefined();
    expect(move).toMatchObject({ from: arbiterAccount, to: poacherAccount, amount: 100, money: "dirty" });
  });

  it("heldLost sets the war crisis flag when the poacher's chief heavily outweighs the arbiter (user story 5)", () => {
    let world = buildStarterWorld("dispute-heldlost", setup, content);
    const family1Id = world.families.order[0]!;
    const family2Id = world.families.order[1]!;
    const chief2 = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.familyId === family2Id && c.rank === "chief")!;

    // Plant many subordinates on the rival chief so his Weight's menOnRecord component (design 03 §1,
    // lnScaled120) dwarfs the first family's chief, forcing heldLost deterministically.
    for (let i = 0; i < 50; i++) {
      addCharacter(world, { name: `Rival Associate ${i}`, rank: "civilian", familyId: chief2.familyId, superiorId: chief2.id });
    }

    const logs: TurnLog[] = [];
    let shopId: string | undefined;
    for (let i = 0; i < 60 && !shopId; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      const spawn = processSpawns(factsOf([r.log]), "family.poach.attempt").find((f) => f.instance.roles["victimFamily"]?.id === family1Id);
      if (spawn) shopId = spawn.instance.roles["shop"]!.id;
    }
    expect(shopId).toBeDefined();

    let outcomeId: string | undefined;
    for (let i = 0; i < 10 && outcomeId === undefined; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      for (const e of r.log.entries) {
        if (e.kind === "fact" && e.fact.kind === "ProcessResolve" && ["heldWon", "heldLost", "settled"].includes(e.fact.outcomeId)) {
          outcomeId = e.fact.outcomeId;
        }
      }
    }

    expect(outcomeId).toBe("heldLost");
    const facts = factsOf(logs);
    expect(facts.some((f) => f.kind === "CrisisFlagSet" && f.flag === "war" && f.active)).toBe(true);
  });
});

// Hotspot 5 (docs/event-storming-2026-09-25.md §3, 2026-09-25): "when the player is the party, the player
// decides." `dispute.claim` used to route the decision to `arbiter` alone, even when `holder` -- the player's
// own stall -- was the player. `decision.role: ["holder", "poacher", "arbiter"]` (engine/scheduler.ts
// resolveDeciderRoleName) reaches him instead. The bystander case is already covered above ("with the arbiter
// not player-controlled, dispute.claim resolves heldWon or heldLost consistent with Weight (aiDefault hold)"):
// neither `holder` nor `poacher` is ever playerControlled there, so `arbiter` still decides, exactly as before.
describe("dispute.claim routes to the player when he is the party (hotspot 5, 2026-09-25)", () => {
  it("the player's own stall is poached: the decision routes to him via `holder`, and choosing hold resolves consistently with Weight", () => {
    let world = buildStarterWorld("hotspot5-dispute-holder", setup, content);
    const family1Id = world.families.order[0]!;
    const chief1 = findChief(world);
    // Plant subordinates on the player's own arbiter (chief1) so his Weight reliably outweighs the poacher's
    // chief (design 03 §1's lnScaled120 menOnRecord component), forcing heldWon deterministically.
    for (let i = 0; i < 50; i++) {
      addCharacter(world, { name: `Own Associate ${i}`, rank: "civilian", familyId: chief1.familyId, superiorId: chief1.id });
    }

    // The player himself holds this shop's claim directly (hotspot 5's `holder` case): any of blockA's
    // businesses, since they're all held by family1's soldier1 by default (starter.ts) -- reassigned here.
    const shopId = world.geo.businesses.order[0]!;
    const claim = world.claims.order.map((id) => world.claims.byId[id]!).find((c) => c.subject.kind === "business" && c.subject.id === shopId)!;
    expect(claim.holderId).not.toBe(world.player.characterId); // sanity: not already the player's, before reassignment
    claim.holderId = world.player.characterId;

    const logs: TurnLog[] = [];
    let disputeInstanceId: string | undefined;
    // Weight 60 (per ten thousand) per business per turn (disputes.ts's own comment): a long budget to reach
    // this one specific business reliably.
    for (let i = 0; i < 1500 && !disputeInstanceId; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
      const inst = world.processes.order
        .map((id) => world.processes.byId[id]!)
        .find((p) => p.templateId === "dispute.claim" && p.roles["shop"]?.id === shopId);
      if (inst) disputeInstanceId = inst.id;
    }
    expect(disputeInstanceId).toBeDefined();

    // duration 1 (disputes.ts's own comment): the instance stays "active" for the spawn turn, then becomes
    // due and (since the player himself decides) awaits, rather than resolving immediately through the
    // arbiter's aiDefault -- confirming the arbiter's version never ran.
    for (let i = 0; i < 5 && world.processes.byId[disputeInstanceId!]?.state === "active"; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }
    const inst = world.processes.byId[disputeInstanceId!];
    expect(inst).toBeDefined();
    expect(inst!.state).toBe("awaitingDecision");
    expect(inst!.roles["holder"]?.id).toBe(world.player.characterId);
    expect(world.characters.byId[inst!.roles["arbiter"]!.id]!.familyId).toBe(family1Id);

    const r = step(world, [{ kind: "decide", instanceId: disputeInstanceId!, optionId: "hold" }], content, opts);
    world = r.world;
    logs.push(r.log);

    const facts = factsOf(logs);
    const resolve = facts.find(
      (f): f is Extract<Fact, { kind: "ProcessResolve" }> => f.kind === "ProcessResolve" && f.instanceId === disputeInstanceId,
    );
    expect(resolve?.outcomeId).toBe("heldWon");
    const decide = facts.find((f): f is Extract<Fact, { kind: "ProcessDecide" }> => f.kind === "ProcessDecide" && f.instanceId === disputeInstanceId);
    expect(decide?.optionId).toBe("hold");
  });
});

describe("soldier to crew chief promotion on a vacancy (G2, G3)", () => {
  it("a soldier player with Weight >= 250 and a vacant crew becomes chief of that crew", () => {
    const world = buildStarterWorld("promotion-chief", setup, content);
    const player = world.characters.byId[world.player.characterId]!;
    player.rank = "soldier";
    // Mirror what the associate->soldier promotion branch (checkPlayerPromotion) would already have unlocked,
    // since this fixture sets rank directly rather than going through that branch (progression.rankLayersConsistent
    // requires every layer up to the player's current rank tier once "block" is present, design 07 §1).
    world.player.uiLayersUnlocked.push("loanBook");

    // menOnRecord = 7 direct subordinates gives lnScaled120(7) = 250 (packages/shared/src/math.ts LN_TABLE),
    // crossing RANK_THRESHOLDS.chief on its own regardless of territory or tribute (systems/progression.ts).
    for (let i = 0; i < 7; i++) {
      addCharacter(world, { name: `Made Man ${i}`, rank: "associate", familyId: player.familyId, superiorId: player.id });
    }

    // A vacancy: the first family's existing crew chief is jailed (still alive, so no other invariant breaks).
    const vacantCrew = world.crews.order.map((id) => world.crews.byId[id]!).find((c) => c.familyId === player.familyId)!;
    world.characters.byId[vacantCrew.chiefId]!.status = "jailed";

    const r = step(world, [], content, opts);
    const w = r.world;

    expect(w.characters.byId[player.id]!.rank).toBe("chief");
    const crew = w.crews.byId[vacantCrew.id]!;
    expect(crew.chiefId).toBe(player.id);
    expect(w.characters.byId[player.id]!.crewId).toBe(vacantCrew.id);
  });
});
