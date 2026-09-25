// Perf regression test for the scheduler (docs/NOW.md phase 5 task 3, design 04 §3-4): per-turn time rose to
// 1.8 ms with two families; generation adds 10-14 towns and hundreds of businesses. This builds a synthetic
// world at that scale (12 towns, ~380 businesses, 4 families, 12 crews) and 8 spawn templates covering the
// common precondition shapes (business compliance, town heat, family band, character rank/status/alive, a
// relation-bound role, a "random"-pick role, locks, an exclusiveTag), then:
//
//   1. asserts runScheduler's own median per-turn cost -- what the CandidateIndex, spawn prefilter and memoized
//      scope/tag lookups in scheduler.ts/roles.ts actually control -- stays under the 5 ms budget from
//      docs/NOW.md, with a wide margin;
//   2. asserts the exact sequence of Facts `runScheduler` produces, turn by turn, hashes identically to a
//      snapshot taken from the pre-optimization scheduler.ts/roles.ts (see FACT_SEQUENCE_HASH below) -- proof
//      that the change altered nothing about *what* the scheduler does or the order it draws from `events.*`
//      streams, only how many table walks it takes to get there;
//   3. reports (without gating on it) the full `step()` per-turn median, since that also includes systems this
//      task cannot touch (structuredClone and worldHash over the whole World every turn in step.ts;
//      recordRecentFacts's O(history) refilter there; runChains, exposureFromActivity) -- profiling this file's
//      own scenario found those dominate step()'s wall time at this scale (median ~6-7 ms even with runScheduler
//      itself under 1 ms), so gating the test's pass/fail on step()'s absolute time would be asserting on code
//      this change does not own. The task-report before/after numbers (measured with this same scenario) show
//      the improvement step() *does* get from this change: runScheduler median 2.65 ms -> 0.80 ms, and step()
//      median 9.39 ms -> 6.83 ms.

import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { canonicalJson, hash64, type BlockId, type TownId } from "@borgata/shared";
import { addBlock, addBusiness, addTown } from "../fixtures.js";
import { addCharacter, addCrew, addFamily, createEmptyWorld, type World } from "../world.js";
import { EMPTY_CONTENT, type Content } from "../content-types.js";
import { step } from "../step.js";
import { runScheduler } from "./scheduler.js";
import type { Fact } from "../facts.js";
import type { ProcessTemplate } from "./types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

const FAMILY_COUNT = 4;
const TOWNS_PER_FAMILY = 3; // 12 towns total
const BLOCKS_PER_TOWN = 4; // 48 blocks total
// Block 0 of each town is the crew's small territorial "anchor" (just enough businesses to give the
// protection-tax chain and the chiefOf-relation template something real to work with); blocks 1..N carry most
// of the business count, so the scheduler still iterates ~380 candidates every turn without every one of them
// being under active chain collection -- see the module comment above for why that distinction matters here.
const BUSINESSES_PER_ANCHOR_BLOCK = 2;
const BUSINESSES_PER_NORMAL_BLOCK = 10;
const TURNS = 50;
const SCHEDULER_BUDGET_MS_PER_TURN = 5;

function tpl(overrides: Partial<ProcessTemplate> & { id: string }): ProcessTemplate {
  return {
    version: 1,
    kind: "event",
    scope: "family",
    lane: "civil",
    roles: {},
    preconditions: [],
    duration: 3,
    resolve: [{ id: "out", effects: [] }],
    followUps: [],
    tags: ["perf"],
    ...overrides,
  };
}

function content(templates: ProcessTemplate[]): Content {
  return { ...EMPTY_CONTENT, version: "test", templates };
}

/** 12 towns / 48 blocks / ~380 businesses / 4 families / 12 crews / ~65 characters (docs/NOW.md phase 5 task 3:
 * "generation will add 10 to 14 towns and hundreds of businesses"). Built with the same fixtures.ts and world.ts
 * helpers every other sim test uses (addTown/addBlock/addBusiness, addCharacter/addFamily/addCrew). Each crew
 * gets a single collector (not every soldier) and territory over only its town's anchor block, so the
 * (out-of-scope) chain/exposure/history systems stay at a realistic volume instead of swamping the benchmark --
 * see the module comment above. */
function buildLargeWorld(seed: string): World {
  const world = createEmptyWorld(seed, setup, "test");
  let townIndex = 0;

  for (let f = 0; f < FAMILY_COUNT; f++) {
    const head = addCharacter(world, { name: `Head${f}`, rank: "head", age: 55 });
    const townsBuilt: Array<{ townId: TownId; blockIds: BlockId[] }> = [];

    for (let t = 0; t < TOWNS_PER_FAMILY; t++) {
      const town = addTown(world, { name: `Town${townIndex}`, archetype: "market-quarter", population: 5000 });
      const blockIds: BlockId[] = [];
      for (let b = 0; b < BLOCKS_PER_TOWN; b++) {
        const block = addBlock(world, town.id);
        blockIds.push(block.id);
        const perBlock = b === 0 ? BUSINESSES_PER_ANCHOR_BLOCK : BUSINESSES_PER_NORMAL_BLOCK;
        for (let biz = 0; biz < perBlock; biz++) {
          // Compliance spread 300..999 so the business-scoped templates' "cmp compliance < ..." preconditions
          // (the spawn prefilter's target case) genuinely split candidates instead of trivially passing/failing all.
          addBusiness(world, block.id, {
            type: biz % 2 === 0 ? "shop" : "stall",
            size: 2,
            compliance: 300 + ((biz * 37 + b * 11) % 700),
            fear: 300,
          });
        }
      }
      townsBuilt.push({ townId: town.id, blockIds });
      townIndex++;
    }

    const family = addFamily(world, {
      name: `Family${f}`,
      headId: head.id,
      townIds: townsBuilt.map((t) => t.townId),
      treasuryCut: 100,
    });

    for (const { townId, blockIds } of townsBuilt) {
      const chief = addCharacter(world, { name: `Chief-${townId}`, rank: "chief", age: 45 });
      const members = blockIds.map((_, i) => addCharacter(world, { name: `Soldier-${townId}-${i}`, rank: "soldier", age: 28 + i }));
      addCrew(
        world,
        family.id,
        chief.id,
        members.slice(0, 1).map((m) => m.id),
        [blockIds[0]!],
      );
    }
  }

  return world;
}

/** 8 spawn templates (docs/NOW.md phase 5 task 3) covering the shapes the CandidateIndex and spawn prefilter
 * target: business compliance (cmp), town heat, family band, character rank/status/alive -- plus one
 * relation-bound extra role with a deterministic pick (still prefilter-safe), one with a "random"-pick extra
 * role (never prefiltered, exercising the unchanged fallback path), one with `locks` (state-style), and one with
 * an `exclusiveTag` (exercises the memoized existingExclusiveTagKeys lookup). Weights are deliberately modest
 * (not the guaranteed-spawn 10,000 many scheduler tests use): the point is to exercise iterating every business,
 * town, family and character candidate every turn (what the CandidateIndex and prefilter optimize), not to
 * maximize how many processes end up active -- see the module comment above. */
function buildTemplates(): ProcessTemplate[] {
  return [
    tpl({
      id: "perf.biz.compliance",
      lane: "civil",
      spawn: { weight: 400, per: "business", maxActivePerScope: 1 },
      roles: { shop: { entity: "business", pick: "first" } },
      preconditions: [{ cmp: { role: "shop", path: "compliance", op: "lt", value: 500 } }],
      duration: 10,
    }),
    tpl({
      id: "perf.biz.withChief",
      lane: "civil",
      spawn: { weight: 400, per: "business", maxActivePerScope: 1 },
      roles: {
        shop: { entity: "business", pick: "first" },
        chief: { entity: "character", from: { role: "shop", relation: "chiefOf" }, pick: "first" },
      },
      preconditions: [{ cmp: { role: "shop", path: "compliance", op: "lt", value: 350 } }, { alive: { role: "chief" } }],
      duration: 10,
    }),
    tpl({
      id: "perf.town.heat",
      lane: "world",
      spawn: { weight: 800, per: "town", maxActivePerScope: 1 },
      roles: { town: { entity: "town", pick: "first" } },
      preconditions: [{ heat: { role: "town", lte: 5_000 } }],
      duration: 10,
    }),
    tpl({
      id: "perf.family.band",
      lane: "commission",
      spawn: { weight: 800, per: "family", maxActivePerScope: 1 },
      roles: { family: { entity: "family", pick: "first" } },
      preconditions: [{ band: { role: "family", gte: 0 } }],
      duration: 10,
    }),
    tpl({
      id: "perf.char.rank",
      lane: "people",
      spawn: { weight: 400, per: "character", maxActivePerScope: 1 },
      roles: { who: { entity: "character", pick: "first" } },
      preconditions: [{ rank: { role: "who", in: ["soldier", "chief"] } }, { alive: { role: "who" } }],
      duration: 10,
    }),
    tpl({
      id: "perf.char.random",
      lane: "people",
      spawn: { weight: 300, per: "character", maxActivePerScope: 1 },
      roles: {
        who: { entity: "character", pick: "first" },
        block: { entity: "block", from: { role: "who", relation: "blockOf" }, pick: "random", optional: true },
      },
      preconditions: [{ rank: { role: "who", in: ["soldier"] } }],
      duration: 6,
    }),
    tpl({
      id: "perf.state.raid",
      lane: "state",
      spawn: { weight: 300, per: "character", maxActivePerScope: 1 },
      roles: { suspect: { entity: "character", pick: "first" } },
      preconditions: [{ rank: { role: "suspect", in: ["soldier", "chief"] } }, { status: { role: "suspect", is: "free" } }],
      locks: ["suspect"],
      duration: 4,
      resolve: [
        { id: "silent", weight: 8, effects: [] },
        { id: "cooperates", weight: 2, effects: [] },
      ],
    }),
    tpl({
      id: "perf.dispute.exclusive",
      lane: "families",
      spawn: { weight: 800, per: "family", maxActivePerScope: 1 },
      roles: { family: { entity: "family", pick: "first" } },
      exclusiveTag: "perf.war",
      duration: 12,
    }),
  ];
}

/** Full Facts, in order, through the project's own canonicalJson (the same primitive worldHash and the golden
 * seed hashes already use to decide "did behaviour change"). */
function hashFactSequence(turns: readonly Fact[][]): string {
  return hash64(canonicalJson(turns));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

// Snapshot taken by running this exact scenario (buildLargeWorld + buildTemplates, 50 turns) through the
// pre-optimization scheduler.ts/roles.ts, then confirmed to still match after the CandidateIndex/prefilter/
// memoization change (see the task report; also cross-checked against a full 104-turn, 4-seed `computeGolden`
// run with the real content package, which hashed identically before and after).
// Re-snapshotted 2026-09-23 after the spawn draw moved before role binding (docs/NOW.md phase 5); the sequence
// changed by design and this constant now guards against unintended changes from here on.
// Re-snapshotted 2026-09-24 (phase 6b): a resolved instance frees its maxActivePerScope slot in the same run, a
// duration-0 player decision is offered in the run it spawns, and zero-delay schedules added after their lane's
// scheduled pass are dated to the next turn. All three change the sequence by design.
const FACT_SEQUENCE_HASH = "788cb9a083e002da";

describe("scheduler perf (docs/NOW.md phase 5 task 3)", () => {
  it("runScheduler stays well under the 5 ms/turn budget and produces the exact same facts as before", () => {
    let world = buildLargeWorld("perf-scheduler-seed");
    const c = content(buildTemplates());

    const turnFacts: Fact[][] = [];
    const schedulerMs: number[] = [];
    const stepMs: number[] = [];

    for (let i = 0; i < TURNS; i++) {
      // A throwaway clone measures and records exactly what runScheduler does this turn (same starting world,
      // same rng cursor) without disturbing the world.rng / world.meta.ids state that the real step() call
      // below also advances -- runScheduler's own doc comment: it mutates only through named streams and the
      // id counter, so calling it on a clone here and discarding the clone leaves the real trajectory untouched.
      const snapshot = structuredClone(world);
      const t0 = performance.now();
      const facts = runScheduler(snapshot, c, []);
      schedulerMs.push(performance.now() - t0);
      turnFacts.push(facts);

      const t1 = performance.now();
      const result = step(world, [], c, { debug: false });
      stepMs.push(performance.now() - t1);
      world = result.world;
    }

    // 1. The budget this task actually controls.
    expect(median(schedulerMs)).toBeLessThan(SCHEDULER_BUDGET_MS_PER_TURN);

    // 2. Determinism: identical fact sequence to the pre-optimization scheduler (see FACT_SEQUENCE_HASH above).
    expect(hashFactSequence(turnFacts)).toBe(FACT_SEQUENCE_HASH);

    // 3. Informational only (see the module comment): step() also carries systems this task does not touch.
    console.log(`runScheduler median ${median(schedulerMs).toFixed(3)} ms; full step() median ${median(stepMs).toFixed(3)} ms`);
  });
});
