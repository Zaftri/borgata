// Scenario tests for the state's phase-4 templates (docs/NOW.md phase 4 task 1): the same behaviours
import { EMPTY_CONTENT } from "./content-types.js";
// `state-actions.test.ts` asserted against the old hand-written `stateActions` system, now asserted through
// `step()` with content built from `STATE_TEMPLATES` on `buildStarterWorld`. Content lives in packages/content;
// sim may not import it for production code (design 01 §2), but this test file is exempt (eslint.config.js
// ignores packages/sim/src/**/*.test.ts from the sim-only-imports-@borgata/shared rule), same as
// refusal-chain.test.ts, which reads packages/content/src/templates/civil.js the same way.
import { describe, expect, it } from "vitest";
import { tableInsert, type CharacterId } from "@borgata/shared";
import type { Fact } from "./facts.js";
import { TurnLogBuilder, type TurnLog } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import { PATROL_HEAT_THRESHOLD } from "./systems/state-actions.js";
import type { GameSetup, Obligation, World } from "./world.js";
import { STATE_TEMPLATES } from "../../content/src/templates/state.js";

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const content = { ...EMPTY_CONTENT, version: "t", templates: [...STATE_TEMPLATES] };
const opts = { debug: true };

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

function isArrest(f: Fact): f is Extract<Fact, { kind: "StatusChange" }> {
  return f.kind === "StatusChange" && f.status === "arrested";
}

/** The starter world's first crew member by name (design 02 §4: "Nino Bracco" and "Pino Randazzo" are the
 * two soldiers; "Turi Lo Cascio" is the chief). */
function findByName(world: World, name: string) {
  const cid = world.characters.order.find((id) => world.characters.byId[id]!.name === name);
  if (!cid) throw new Error(`starter world has no character named "${name}"`);
  return world.characters.byId[cid]!;
}

/** Sets a character's exposure through a matching dossier entry, not just the derived field, so
 * `invariants/evidence.ts`'s "evidence.exposureMatchesDossier" (checked by `step(..., { debug: true })`) holds. */
function plantExposure(world: World, characterId: CharacterId, exposure: number): void {
  tableInsert(world.evidence.dossiers, characterId, {
    characterId,
    items: [{ crimeRef: `seed:${characterId}`, weight: exposure, source: "witness", turn: 0 }],
  });
  world.characters.byId[characterId]!.exposure = exposure;
}

const testCause = { rule: "test" };

/** Directly seeds a `prisonerSupport` obligation whose first week is already met (design 12 §1/§3:
 * `oblig.prisoner.open`'s "support"/"both" pay this same-turn in real play; this test file loads only
 * `STATE_TEMPLATES`, not the obligations content, so it goes straight through the reducer, the same way
 * `obligations.test.ts`'s and `obligations-cards.test.ts`'s own `open` helpers do). Applied outside `step()`
 * (no `TurnLog` from a real turn to attach to), so any rejection is surfaced immediately rather than silently
 * swallowed. */
function seedMetPrisonerSupport(world: World, debtorId: CharacterId, prisonerId: CharacterId): void {
  const log = new TurnLogBuilder(world.meta.turn);
  const obligation: Obligation = {
    id: "test-ob-1",
    kind: "prisonerSupport",
    debtorId,
    beneficiary: { kind: "character", id: prisonerId },
    amount: 15,
    everyTurns: 1,
    nextDueTurn: world.meta.turn,
    untilTurn: null,
    met: 0,
    missed: 0,
    lastResult: null,
    status: "open",
  };
  applyFacts(world, [{ kind: "ObligationOpen", obligation, cause: testCause }, { kind: "ObligationMet", obligationId: obligation.id, paidBy: "debtor", cause: testCause }], log);
  const rejected = log.build().entries.filter((e) => e.kind === "rejected");
  if (rejected.length > 0) throw new Error(`seedMetPrisonerSupport rejected: ${JSON.stringify(rejected)}`);
}

/** Run `turnsPerSeed` turns of a freshly built starter world (seeded `${seedPrefix}-${s}`, `configure` applied
 * before the first step) for up to `maxSeeds` seeds, stopping at the first seed whose run produces an arrest.
 * Kept to a few turns per seed deliberately: heat drifts upward on its own from ordinary background activity
 * (systems/exposure-sources.ts's protection-tax heat), so a short run per seed keeps heat within the band the
 * test set up, and trying many seeds instead of many turns is how the odds of an arrest are still made high. */
function findArrestAcrossSeeds(
  seedPrefix: string,
  configure: (world: World) => void,
  turnsPerSeed: number,
  maxSeeds: number,
): { world: World; logs: TurnLog[]; facts: Fact[] } {
  for (let s = 0; s < maxSeeds; s++) {
    let world = buildStarterWorld(`${seedPrefix}-${s}`, setup, content);
    configure(world);
    const logs: TurnLog[] = [];
    for (let i = 0; i < turnsPerSeed; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }
    const facts = factsOf(logs);
    if (facts.some(isArrest)) return { world, logs, facts };
  }
  throw new Error(`no arrest fired in ${maxSeeds} seeds for "${seedPrefix}"`);
}

describe("state templates: heat gating", () => {
  it("no arrest (and no state-template spawn) while heat stays below the patrol threshold", () => {
    let world = buildStarterWorld("state-below-40", setup, content);
    const townId = world.geo.towns.order[0]!;
    world.pressure.heatByTown[townId] = 0;

    const logs: TurnLog[] = [];
    for (let i = 0; i < 10; i++) {
      if ((world.pressure.heatByTown[townId] ?? 0) >= PATROL_HEAT_THRESHOLD) break; // background drift guard
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }

    const facts = factsOf(logs);
    expect(facts.some(isArrest)).toBe(false);
    expect(facts.some((f) => f.kind === "ProcessSpawn" && f.instance.templateId.startsWith("state."))).toBe(false);
  });
});

describe("state templates: patrol arrests", () => {
  it("a patrol arrest is possible at heat 100 under an informant network", () => {
    const { facts } = findArrestAcrossSeeds(
      "state-patrol",
      (world) => {
        const townId = world.geo.towns.order[0]!;
        const familyId = world.families.order[0]!;
        world.pressure.heatByTown[townId] = 100;
        // Attention (not attentionBand directly: systems/pressure.ts recomputeBands derives the band from
        // this every turn and would otherwise fall straight back to band 0) high enough for band 1, so the
        // first step() naturally unlocks "informants" (and "squad") via its own ToolUnlock facts.
        world.families.byId[familyId]!.attention = 250;
      },
      5,
      200,
    );
    expect(facts.some(isArrest)).toBe(true);
  });
});

describe("state templates: raids", () => {
  it("a raid at heat 700 arrests with untilTurn = turn + 4, discharges heat and raises family attention", () => {
    let capturedTownId = "";
    let capturedFamilyId = "";
    const { logs, facts } = findArrestAcrossSeeds(
      "state-raid",
      (world) => {
        capturedTownId = world.geo.towns.order[0]!;
        capturedFamilyId = world.families.order[0]!;
        world.pressure.heatByTown[capturedTownId] = 700;
      },
      5,
      50,
    );

    const arrestLog = logs.find((l) => l.entries.some((e) => e.kind === "fact" && isArrest(e.fact)))!;
    const arrest = arrestLog.entries.find((e) => e.kind === "fact" && isArrest(e.fact))!;
    if (arrest.kind !== "fact" || !isArrest(arrest.fact)) throw new Error("unreachable");
    expect(arrest.fact.untilTurn).toBe(arrestLog.turn + 4);
    expect(arrest.fact.cause).toMatchObject({ rule: "state.raid.arrest" });

    expect(facts).toContainEqual({ kind: "HeatDelta", townId: capturedTownId, delta: -150, cause: expect.objectContaining({ rule: "state.raid.discharge" }) });
    expect(facts).toContainEqual({ kind: "AttentionDelta", familyId: capturedFamilyId, delta: 10, cause: expect.objectContaining({ rule: "state.arrest.noticed" }) });
    // Design change (2026-09-25): the flip no longer rolls at arrest, so no CooperationSet can land in the same
    // turn's log as the arrest itself any more (it now happens, if at all, two turns later at
    // `state.detained.interrogation`'s resolution -- see the "the interrogation" describe block below).
    expect(arrestLog.entries.some((e) => e.kind === "fact" && e.fact.kind === "CooperationSet")).toBe(false);
  });

  it("emits only a HeatDelta of -100 when a raid fires with no eligible suspect", () => {
    for (let s = 0; s < 50; s++) {
      let world = buildStarterWorld(`state-raid-empty-${s}`, setup, content);
      const townId = world.geo.towns.order[0]!;
      world.pressure.heatByTown[townId] = 700;
      // Jail every soldier/associate in town so the suspect role can never bind (design 02 §4: the starter
      // world's only two candidates are its two soldiers; the player, an associate, is not in a crew's
      // memberIds and so is never a candidate regardless).
      for (const cid of world.characters.order) {
        const c = world.characters.byId[cid]!;
        if (c.rank === "soldier" || c.rank === "associate") {
          c.status = "jailed";
          c.detainedUntilTurn = world.meta.turn + 1000;
        }
      }
      const r = step(world, [], content, opts);
      world = r.world;
      const facts = factsOf([r.log]);
      // Distinguish "the raid template fired" from systems/exposure-sources.ts's unrelated background HeatDelta
      // (the starter world's protection-tax chain adds heat most turns regardless of any raid).
      const raidFired = facts.some((f) => f.kind === "ProcessSpawn" && f.instance.templateId.startsWith("state."));
      if (raidFired) {
        expect(facts.some(isArrest)).toBe(false);
        expect(facts).toContainEqual({ kind: "HeatDelta", townId, delta: -100, cause: expect.objectContaining({ rule: "state.raid.empty" }) });
        return;
      }
    }
    throw new Error("no raid fired against the emptied town in 50 seeds");
  });
});

describe("state templates: the interrogation (design 12 §1/§2, 2026-09-25 design change)", () => {
  /** Arrests `suspectId` directly (an injected `StatusChange`, not a raid draw: these tests are about
   * `state.detained.interrogation`'s own resolution, not about which candidate a raid picks), then steps forward
   * a fixed `maxTurns` turns and returns every fact seen. `untilTurn` is generous (arrest turn + 8) so
   * `releaseDetainees` (packages/sim/src/reducers/characters.ts) never frees the man before the interrogation --
   * spawned the turn after the arrest (`spawnFrom`'s `withinTurns: 1` default), resolving `duration: 2` turns
   * after that -- gets to run. `resolved` is true once a `ProcessResolve` whose `cause.templateId` is
   * `state.detained.interrogation` itself has landed (not just any `ProcessResolve`: the starter world's own
   * background heat can also spawn and resolve a patrol/raid in the same window). */
  function arrestAndRunToInterrogation(world: World, suspectId: CharacterId, maxTurns: number): { world: World; facts: Fact[]; resolved: boolean } {
    let w = world;
    const r0 = step(w, [], content, {
      ...opts,
      injectFacts: [{ kind: "StatusChange", characterId: suspectId, status: "arrested", untilTurn: w.meta.turn + 8, cause: testCause }],
    });
    w = r0.world;
    const logs: TurnLog[] = [r0.log];
    for (let i = 0; i < maxTurns; i++) {
      const r = step(w, [], content, opts);
      w = r.world;
      logs.push(r.log);
    }
    const facts = factsOf(logs);
    const resolved = facts.some((f) => f.kind === "ProcessResolve" && f.cause.templateId === "state.detained.interrogation");
    return { world: w, facts, resolved };
  }

  function interrogationResolve(facts: readonly Fact[], outcomeId: string): Fact | undefined {
    return facts.find((f) => f.kind === "ProcessResolve" && f.cause.templateId === "state.detained.interrogation" && f.outcomeId === outcomeId);
  }

  it("stays silent when a met prisonerSupport obligation and high loyalty make resistance overwhelm pressure", () => {
    const world = buildStarterWorld("state-interrogation-silent", setup, content);
    const candidate = findByName(world, "Nino Bracco");
    const debtor = findByName(world, "Turi Lo Cascio"); // the chief: any character works as the debtor here
    seedMetPrisonerSupport(world, debtor.id, candidate.id);
    candidate.exposure = 0;
    candidate.loyalty = 500; // the task's own fixture value; resistance is loyalty + livingSuperior + supported bonuses, pressure stays 0
    candidate.memory = [];

    const { facts, resolved } = arrestAndRunToInterrogation(world, candidate.id, 6);
    expect(resolved).toBe(true);
    expect(interrogationResolve(facts, "silent"), JSON.stringify(facts)).toBeDefined();
    expect(facts.some((f) => f.kind === "CooperationSet")).toBe(false);
    expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === candidate.id && f.delta === 10)).toBe(true);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === candidate.id && f.memory.tag === "heldUp")).toBe(true);
  });

  it("cooperates when exposure and an informant network make pressure overwhelm resistance, unsupported", () => {
    const world = buildStarterWorld("state-interrogation-cooperate", setup, content);
    const candidate = findByName(world, "Nino Bracco");
    const family = world.families.byId[world.families.order[0]!]!;
    family.attentionBand = 1; // the informant network term (+200 pressure)
    // Exposure itself is capped at 1000 (design 03 §3; invariants/evidence.ts's own "exposureMatchesDossier"
    // checks `min(1000, dossier sum)`), so 1000 plus the informant network (+200) and a murder memory (+300)
    // gives pressure 1500 against a resistance ceiling of loyalty(0) + livingSuperior(+200) = 200 -- 1300 clears
    // the draw range (0..999, predicates.ts's FLIP_DRAW_MAX) for every possible draw.
    plantExposure(world, candidate.id, 1000);
    candidate.loyalty = 0;
    candidate.memory = [{ tag: "murder", weight: 300, turn: 0 }];

    const { facts, resolved } = arrestAndRunToInterrogation(world, candidate.id, 6);
    expect(resolved).toBe(true);
    expect(interrogationResolve(facts, "cooperates"), JSON.stringify(facts)).toBeDefined();
    expect(facts.some((f) => f.kind === "CooperationSet" && f.characterId === candidate.id)).toBe(true);
    expect(facts.some((f) => f.kind === "EvidenceAdd" && f.item.source === "collaborator" && f.item.weight === 90)).toBe(true);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.memory.tag === "betrayedBy")).toBe(true);
  });

  it("never lets a playerControlled suspect cooperate, even under overwhelming pressure", () => {
    const world = buildStarterWorld("state-interrogation-player", setup, content);
    const candidate = findByName(world, "Nino Bracco");
    const family = world.families.byId[world.families.order[0]!]!;
    family.attentionBand = 1;
    plantExposure(world, candidate.id, 1000); // see the cooperate test above: exposure is capped at 1000
    candidate.loyalty = 0;
    candidate.memory = [{ tag: "murder", weight: 300, turn: 0 }];
    candidate.playerControlled = true;

    const { facts, resolved } = arrestAndRunToInterrogation(world, candidate.id, 6);
    expect(resolved).toBe(true);
    expect(facts.some((f) => f.kind === "CooperationSet")).toBe(false);
    expect(interrogationResolve(facts, "silent"), JSON.stringify(facts)).toBeDefined();
  });
});

describe("state templates: end-to-end through step()", () => {
  it("raids, releases 4 turns later and violates no invariant over 12 turns on the starter world", () => {
    let world = buildStarterWorld("state-release", setup, content);
    const townId = world.geo.towns.order[0]!;
    world.pressure.heatByTown[townId] = 700;

    let arrestedId: CharacterId | undefined;
    let untilTurn: number | undefined;
    let releasedAtTurn: number | undefined;

    for (let i = 0; i < 12; i++) {
      const r = step(world, [], content, opts); // debug true: throws on any invariant violation
      world = r.world;
      for (const e of r.log.entries) {
        if (e.kind !== "fact") continue;
        if (isArrest(e.fact) && arrestedId === undefined) {
          arrestedId = e.fact.characterId;
          untilTurn = e.fact.untilTurn;
        }
        if (e.fact.kind === "StatusChange" && e.fact.status === "free" && e.fact.characterId === arrestedId && releasedAtTurn === undefined) {
          releasedAtTurn = world.meta.turn;
        }
      }
    }

    expect(arrestedId).toBeDefined();
    expect(untilTurn).toBeDefined();
    expect(releasedAtTurn).toBe(untilTurn);
    expect(world.characters.byId[arrestedId!]!.status).toBe("free");
  });

  it("is deterministic: the same seed and the same planted heat produce the same world hash", () => {
    function run(seed: string): string {
      let world = buildStarterWorld(seed, setup, content);
      const townId = world.geo.towns.order[0]!;
      world.pressure.heatByTown[townId] = 700;
      let hash = "";
      for (let i = 0; i < 10; i++) {
        const r = step(world, [], content, opts);
        world = r.world;
        hash = r.hash;
      }
      return hash;
    }

    const a = run("state-determinism");
    const b = run("state-determinism");
    expect(a).toBe(b);
  });
});
