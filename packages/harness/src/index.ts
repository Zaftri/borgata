// Harness runners (design 08). Pure functions over the core; the CLI formats their results.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { SCHEMA_VERSION } from "@borgata/shared";
import { run, initialWorld, step, worldHash, runHealthChecks, InvariantViolationError, type Content, type GameSetup } from "@borgata/sim";
import { makeAiPlayer, type Strategy } from "./ai-player.js";
import { collectCareer, aggregate, type CareerMetrics, type Distribution } from "./metrics.js";

export const DEFAULT_SETUP: GameSetup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false };

export type SweepResult = {
  seeds: number;
  turns: number;
  violations: Array<{ seed: string; turn: number; violations: Array<{ name: string; message: string }> }>;
  determinismFailures: string[];
  finalHashes: Record<string, string>;
  /** Health checks (soft economy conditions) failing on the final world, by name: seeds affected and one sample message. */
  health: Record<string, { seeds: number; sample: string }>;
};

/** Generate N worlds, run T turns each with invariants on, and check same-seed determinism by running twice. */
export function sweep(content: Content, seeds: number, turns: number, strategy: Strategy = "quiet", seedPrefix = "sweep"): SweepResult {
  const result: SweepResult = { seeds, turns, violations: [], determinismFailures: [], finalHashes: {}, health: {} };
  for (let i = 0; i < seeds; i++) {
    const seed = `${seedPrefix}-${i}`;
    const ai = makeAiPlayer(strategy);
    try {
      // Per-turn hashing is off for speed (design 08 §7 samples hashes); determinism is checked on the final world.
      const a = run(seed, DEFAULT_SETUP, content, turns, (w, t) => ai.act(w, t), { debug: true, hash: false });
      const b = run(seed, DEFAULT_SETUP, content, turns, (w, t) => ai.act(w, t), { debug: true, hash: false });
      const ha = worldHash(a.world);
      if (ha !== worldHash(b.world)) result.determinismFailures.push(seed);
      result.finalHashes[seed] = ha;
      const seen = new Set<string>();
      for (const v of runHealthChecks(a.world)) {
        if (seen.has(v.name)) continue;
        seen.add(v.name);
        const h = (result.health[v.name] ??= { seeds: 0, sample: v.message });
        h.seeds++;
      }
    } catch (e) {
      if (e instanceof InvariantViolationError) result.violations.push({ seed, turn: e.turn, violations: [...e.violations] });
      else throw e;
    }
  }
  return result;
}

export type GoldenFile = {
  schemaVersion: number;
  contentVersion: string;
  entries: Array<{ seed: string; setup: GameSetup; strategy: Strategy; turns: number; hash: string }>;
};

export const GOLDEN_PATH = new URL("../golden/seeds.json", import.meta.url);

export function readGolden(): GoldenFile | null {
  if (!existsSync(GOLDEN_PATH)) return null;
  return JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as GoldenFile;
}

export const GOLDEN_SEEDS: Array<{ seed: string; strategy: Strategy; turns: number }> = [
  { seed: "golden-palermo-1", strategy: "quiet", turns: 104 },
  { seed: "golden-palermo-2", strategy: "loud", turns: 104 },
  { seed: "golden-trapani-1", strategy: "mixed", turns: 104 },
  { seed: "golden-island-1", strategy: "quiet", turns: 52 },
];

export function computeGolden(content: Content): GoldenFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: content.version,
    entries: GOLDEN_SEEDS.map((g) => {
      const ai = makeAiPlayer(g.strategy);
      const r = run(g.seed, DEFAULT_SETUP, content, g.turns, (w, t) => ai.act(w, t), { debug: true, hash: false });
      return { seed: g.seed, setup: DEFAULT_SETUP, strategy: g.strategy, turns: g.turns, hash: worldHash(r.world) };
    }),
  };
}

export function writeGolden(file: GoldenFile): void {
  mkdirSync(dirname(GOLDEN_PATH.pathname), { recursive: true });
  writeFileSync(GOLDEN_PATH, JSON.stringify(file, null, 2) + "\n");
}

export type ReplayCheck = { status: "ok" | "diverged" | "missing" | "stale"; details: string[] };

/** Recompute golden hashes and compare against the stored file (design 08 §6, §7). */
export function replayGolden(content: Content): ReplayCheck {
  const stored = readGolden();
  if (!stored) return { status: "missing", details: ["no golden file; run `harness golden --update`"] };
  if (stored.schemaVersion !== SCHEMA_VERSION || stored.contentVersion !== content.version) {
    return { status: "stale", details: [`golden file is for schema ${stored.schemaVersion} / content ${stored.contentVersion}; current is ${SCHEMA_VERSION} / ${content.version}`] };
  }
  const now = computeGolden(content);
  const details: string[] = [];
  for (const e of stored.entries) {
    const cur = now.entries.find((n) => n.seed === e.seed);
    if (!cur) details.push(`${e.seed}: no longer computed`);
    else if (cur.hash !== e.hash) details.push(`${e.seed}: stored ${e.hash} != current ${cur.hash}`);
  }
  return { status: details.length === 0 ? "ok" : "diverged", details };
}

export type CareersResult = { seeds: number; turns: number; strategy: Strategy; list: CareerMetrics[]; distribution: Distribution };

/** Run N careers (design 08 §2, §3) by stepping directly seed by seed, collecting metrics from every turn. */
export function careers(content: Content, seeds: number, turns: number, strategy: Strategy = "quiet", seedPrefix = "careers"): CareersResult {
  const list: CareerMetrics[] = [];
  for (let i = 0; i < seeds; i++) {
    const seed = `${seedPrefix}-${strategy}-${i}`;
    const ai = makeAiPlayer(strategy);
    list.push(collectCareer(seed, DEFAULT_SETUP, content, turns, ai));
  }
  return { seeds, turns, strategy, list, distribution: aggregate(list) };
}

export type PerfResult = { turns: number; msPerTurn: number; msGeneration: number; withinBudget: boolean };

/** Measure generation and per-turn time against NF-12 (2 s per turn, 15 s generation). */
export function perf(content: Content, turns = 200): PerfResult {
  const t0 = performance.now();
  let world = initialWorld("perf-seed", DEFAULT_SETUP, content);
  const t1 = performance.now();
  for (let i = 0; i < turns; i++) world = step(world, [], content, { debug: false, hash: false }).world;
  const t2 = performance.now();
  const msPerTurn = (t2 - t1) / turns;
  const msGeneration = t1 - t0;
  return { turns, msPerTurn, msGeneration, withinBudget: msPerTurn < 2000 && msGeneration < 15_000 };
}
