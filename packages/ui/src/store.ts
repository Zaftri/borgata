// The game store (design 07 §8, design 01 §6). Holds content, world, save and the projected PlayerView,
// and changes state only through the core's `initialWorld` / `step` / `load` (never mutates World itself).
// `view` is recomputed via `projectView(world, lastLog, content)` after every change, per design 07 §4's
// rendering rule: the interface reads only PlayerView and Report; components never touch `world` directly
// (this store is the one exception, and it never *renders*, only calls the core).

import { loadContent } from "@borgata/content";
import { SCHEMA_VERSION, SNAPSHOT_EVERY_TURNS } from "@borgata/shared";
import {
  initialWorld,
  load,
  projectView,
  step,
  type Content,
  type GameSetup,
  type PlayerAction,
  type PlayerView,
  type SaveFile,
  type TurnLog,
  type World,
} from "@borgata/sim";
import { useEffect, useState } from "preact/hooks";
import { idbKeyvalAdapter, type StorageAdapter } from "./storage.js";

export type StoreState = {
  content: Content;
  world: World | null;
  save: SaveFile | null;
  lastLog: TurnLog | null;
  view: PlayerView | null;
  pendingActions: PlayerAction[];
  /** Set when a storage call fails, or when `projectView` throws (a stub while phase 6's parallel work lands).
   *  Cleared on the next call that succeeds. Screens may show it; nothing in the store depends on it. */
  error: string | null;
  /** True right after a turn ends until the player dismisses the week's summary (design 07 §3, done as text). */
  weekOpen: boolean;
};

export type SaveSummary = { id: string; seed: string; setup: GameSetup; turn: number };

const SAVE_KEY_PREFIX = "borgata:save:";
const LAST_SAVE_KEY = "borgata:lastSave";

function freshState(content: Content): StoreState {
  return { content, world: null, save: null, lastLog: null, view: null, pendingActions: [], error: null, weekOpen: false };
}

/** Minimal shape check for an imported file (not a full zod schema; `load()` throws on real corruption). */
function isSaveFileShape(v: unknown): v is SaveFile {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.schemaVersion === "number" &&
    typeof s.contentVersion === "string" &&
    typeof s.seed === "string" &&
    typeof s.setup === "object" &&
    s.setup !== null &&
    Array.isArray(s.actions) &&
    Array.isArray(s.snapshots)
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class GameStore {
  private state: StoreState;
  private listeners = new Set<() => void>();
  private readonly storage: StorageAdapter;

  constructor(content: Content = loadContent(), storage: StorageAdapter = idbKeyvalAdapter()) {
    this.state = freshState(content);
    this.storage = storage;
  }

  getState(): StoreState {
    return this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private setState(patch: Partial<StoreState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  /** Recompute `view` from the current `world`/`lastLog`/`content`. Swallows a throw from `projectView` so the
   *  rest of the store (queueing actions, ending turns, saving) stays usable while that projection is being
   *  implemented in parallel; the failure is recorded in `state.error` instead. */
  private refreshView(): void {
    if (!this.state.world) {
      this.state = { ...this.state, view: null };
      return;
    }
    try {
      const view = projectView(this.state.world, this.state.lastLog, this.state.content);
      this.state = { ...this.state, view, error: null };
    } catch (err) {
      this.state = { ...this.state, view: null, error: `view unavailable: ${errorMessage(err)}` };
    }
  }

  // ---- Lifecycle ----

  newGame(setup: GameSetup, seed: string): void {
    const world = initialWorld(seed, setup, this.state.content);
    const save: SaveFile = {
      schemaVersion: SCHEMA_VERSION,
      contentVersion: this.state.content.version,
      seed,
      setup,
      actions: [],
      snapshots: [],
    };
    this.state = { ...this.state, world, save, lastLog: null, pendingActions: [] };
    this.refreshView();
    this.emit();
  }

  /** Back to the setup screen. Keeps `content`; drops world/save/view/pending actions. */
  returnToSetup(): void {
    this.state = { ...this.state, world: null, save: null, lastLog: null, view: null, pendingActions: [], error: null, weekOpen: false };
    this.emit();
  }

  /** Queues a player action. A `decide` for an instance that already has a queued `decide` replaces it (a card's
   *  situation has exactly one queued choice at a time; clicking another option changes the choice rather than
   *  appending a second, contradictory one for the same instance). */
  queueAction(action: PlayerAction): void {
    if (!this.state.world) return;
    if (action.kind === "decide") {
      const withoutSameInstance = this.state.pendingActions.filter(
        (a) => !(a.kind === "decide" && a.instanceId === action.instanceId),
      );
      this.setState({ pendingActions: [...withoutSameInstance, action] });
      return;
    }
    this.setState({ pendingActions: [...this.state.pendingActions, action] });
  }

  removeAction(index: number): void {
    this.setState({ pendingActions: this.state.pendingActions.filter((_, i) => i !== index) });
  }

  endTurn(): void {
    const { world, save, content, pendingActions } = this.state;
    if (!world || !save) return;
    const result = step(world, pendingActions, content);
    const nextSave: SaveFile = {
      ...save,
      actions: [...save.actions, { turn: save.actions.length, actions: pendingActions }],
      snapshots: [...save.snapshots],
    };
    if (result.world.meta.turn % SNAPSHOT_EVERY_TURNS === 0) {
      nextSave.snapshots.push({ turn: result.world.meta.turn, world: structuredClone(result.world), hash: result.hash });
    }
    this.state = { ...this.state, world: result.world, save: nextSave, lastLog: result.log, pendingActions: [], weekOpen: true };
    this.refreshView();
    this.emit();
  }

  /** Close the week's summary; the same lines stay on the Report tab. */
  dismissWeek(): void {
    this.setState({ weekOpen: false });
  }

  // ---- Storage (design 01 §6). Every call is wrapped: storage failures never make the game unplayable. ----

  async saveToDb(): Promise<void> {
    const { save } = this.state;
    if (!save) return;
    try {
      await this.storage.set(`${SAVE_KEY_PREFIX}${save.seed}`, save);
      await this.storage.set(LAST_SAVE_KEY, save.seed);
      this.setState({ error: null });
    } catch (err) {
      this.setState({ error: `save failed: ${errorMessage(err)}` });
    }
  }

  async loadFromDb(id: string): Promise<void> {
    try {
      const save = await this.storage.get<SaveFile>(`${SAVE_KEY_PREFIX}${id}`);
      if (!save) {
        this.setState({ error: `no save named "${id}"` });
        return;
      }
      const { world } = load(save, this.state.content);
      this.state = { ...this.state, world, save, lastLog: null, pendingActions: [], error: null, weekOpen: false };
      this.refreshView();
      this.emit();
    } catch (err) {
      this.setState({ error: `load failed: ${errorMessage(err)}` });
    }
  }

  async listSaves(): Promise<SaveSummary[]> {
    try {
      const keys = await this.storage.keys();
      const ids = keys.filter((k) => k.startsWith(SAVE_KEY_PREFIX)).map((k) => k.slice(SAVE_KEY_PREFIX.length));
      const out: SaveSummary[] = [];
      for (const id of ids) {
        const save = await this.storage.get<SaveFile>(`${SAVE_KEY_PREFIX}${id}`);
        if (save) out.push({ id, seed: save.seed, setup: save.setup, turn: save.actions.length });
      }
      return out;
    } catch (err) {
      this.setState({ error: `list failed: ${errorMessage(err)}` });
      return [];
    }
  }

  async lastSaveId(): Promise<string | null> {
    try {
      return (await this.storage.get<string>(LAST_SAVE_KEY)) ?? null;
    } catch {
      return null;
    }
  }

  // ---- Export / import (design 01 §6) ----

  /** Serializes the current save as JSON and, in a browser, triggers a download. Always returns the JSON text. */
  exportSave(): string {
    const { save } = this.state;
    if (!save) throw new Error("no save to export");
    const json = JSON.stringify(save, null, 2);
    if (typeof document !== "undefined") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `borgata-${save.seed}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    return json;
  }

  /** Parses and loads a save exported by `exportSave`. Accepts raw JSON text or a `File`-like object. */
  async importSave(file: string | { text(): Promise<string> }): Promise<void> {
    try {
      const text = typeof file === "string" ? file : await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isSaveFileShape(parsed)) throw new Error("not a Borgata save file");
      const { world } = load(parsed, this.state.content);
      this.state = { ...this.state, world, save: parsed, lastLog: null, pendingActions: [], error: null, weekOpen: false };
      this.refreshView();
      this.emit();
    } catch (err) {
      this.setState({ error: `import failed: ${errorMessage(err)}` });
    }
  }
}

/** The app-wide store. Screens use `useGameStore()`; tests construct their own `GameStore` with a mock adapter. */
export const gameStore = new GameStore();

/** Preact hook: re-renders the caller whenever the given store changes. */
export function useGameStore(store: GameStore = gameStore): StoreState {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), [store]);
  return store.getState();
}
