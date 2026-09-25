// Replay and save files (design 01 §6, design 08 §7). A game is a seed, a setup and an action log;
// snapshots every N turns make loading fast. The replay check compares hashes turn by turn.

import { SCHEMA_VERSION, SNAPSHOT_EVERY_TURNS } from "@borgata/shared";
import type { Content } from "./content-types.js";
import { generateWorld } from "./generation/index.js";
import { step, worldHash, type PlayerAction, type StepOptions } from "./step.js";
import type { GameSetup, World } from "./world.js";

export type ActionLogEntry = { turn: number; actions: PlayerAction[] };

export type Snapshot = { turn: number; world: World; hash: string };

export type SaveFile = {
  schemaVersion: number;
  contentVersion: string;
  seed: string;
  setup: GameSetup;
  actions: ActionLogEntry[];
  snapshots: Snapshot[];
};

export type RunResult = { world: World; hashes: string[] };

/** Build the turn-0 world from the generator (design 05, build plan phase 5). */
export function initialWorld(seed: string, setup: GameSetup, content: Content): World {
  return generateWorld(seed, setup, content).world;
}

/** Run `turns` turns from the initial world, taking actions from `actionsFor`. Returns the world and a hash per turn. */
export function run(
  seed: string,
  setup: GameSetup,
  content: Content,
  turns: number,
  actionsFor: (world: World, turn: number) => PlayerAction[],
  opts: StepOptions = {},
): RunResult {
  let world = initialWorld(seed, setup, content);
  const hashes: string[] = [];
  for (let t = 0; t < turns; t++) {
    const result = step(world, actionsFor(world, t), content, opts);
    world = result.world;
    hashes.push(result.hash);
  }
  return { world, hashes };
}

/** Replay a recorded action log from the initial world. */
export function replay(save: SaveFile, content: Content, opts: StepOptions = {}): RunResult {
  if (save.schemaVersion !== SCHEMA_VERSION) throw new Error(`save schema ${save.schemaVersion} != ${SCHEMA_VERSION}; migration required`);
  const byTurn = new Map(save.actions.map((e) => [e.turn, e.actions]));
  const turns = save.actions.length === 0 ? 0 : Math.max(...save.actions.map((e) => e.turn)) + 1;
  return run(save.seed, save.setup, content, turns, (_w, t) => byTurn.get(t) ?? [], opts);
}

/** Record a run into a SaveFile with snapshots every SNAPSHOT_EVERY_TURNS turns. */
export function record(
  seed: string,
  setup: GameSetup,
  content: Content,
  turns: number,
  actionsFor: (world: World, turn: number) => PlayerAction[],
  opts: StepOptions = {},
): { save: SaveFile; world: World } {
  let world = initialWorld(seed, setup, content);
  const save: SaveFile = { schemaVersion: SCHEMA_VERSION, contentVersion: content.version, seed, setup, actions: [], snapshots: [] };
  for (let t = 0; t < turns; t++) {
    const actions = actionsFor(world, t);
    save.actions.push({ turn: t, actions });
    const result = step(world, actions, content, opts);
    world = result.world;
    if (world.meta.turn % SNAPSHOT_EVERY_TURNS === 0) save.snapshots.push({ turn: world.meta.turn, world: structuredClone(world), hash: result.hash });
  }
  return { save, world };
}

/**
 * Load: start from the latest snapshot and replay the remaining actions.
 * If the content version differs, replay from the snapshot only and report `frozenBefore`.
 */
export function load(save: SaveFile, content: Content, opts: StepOptions = {}): { world: World; frozenBefore: number | null } {
  if (save.schemaVersion !== SCHEMA_VERSION) throw new Error(`save schema ${save.schemaVersion} != ${SCHEMA_VERSION}; migration required`);
  const last = save.snapshots.at(-1);
  const contentChanged = save.contentVersion !== content.version;
  if (!last) {
    if (contentChanged) throw new Error("content version changed and no snapshot exists; cannot replay");
    return { world: replay(save, content, opts).world, frozenBefore: null };
  }
  if (worldHash(last.world) !== last.hash) throw new Error(`snapshot at turn ${last.turn} is corrupt (hash mismatch)`);
  let world: World = structuredClone(last.world);
  for (const entry of save.actions) {
    if (entry.turn < last.turn) continue;
    world = step(world, entry.actions, content, opts).world;
  }
  return { world, frozenBefore: contentChanged ? last.turn : null };
}
