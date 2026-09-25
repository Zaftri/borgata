// Store tests (build plan phase 6 item 4), node environment (vitest.config.ts). Storage is mocked via
// `memoryAdapter()` injected through the GameStore constructor, so IndexedDB is never touched.

import { describe, expect, it } from "vitest";
import { loadContent } from "@borgata/content";
import { load, worldHash, type GameSetup } from "@borgata/sim";
import { GameStore } from "./store.js";
import { memoryAdapter } from "./storage.js";

const content = loadContent();
const SETUP: GameSetup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false };

function freshStore(): GameStore {
  return new GameStore(content, memoryAdapter());
}

describe("GameStore", () => {
  // `projectView` is still a stub (packages/sim/src/view.ts throws "not implemented (phase 6)") while the
  // fog-of-war projection lands in parallel. The store swallows that throw (see `refreshView`) so every
  // other store operation stays testable; this one test that depends on a real view is skipped until then.
  it("newGame produces a view with rank associate", () => {
    const store = freshStore();
    store.newGame(SETUP, "test-seed-1");
    expect(store.getState().view?.you.rank).toBe("associate");
  });

  it("queue askPermission, endTurn advances the turn and records the action in the save", () => {
    const store = freshStore();
    store.newGame(SETUP, "test-seed-2");
    const turnBefore = store.getState().world!.meta.turn;

    store.queueAction({ kind: "askPermission", what: "makeAssociate" });
    expect(store.getState().pendingActions).toHaveLength(1);

    store.endTurn();
    const state = store.getState();
    expect(state.world!.meta.turn).toBe(turnBefore + 1);
    expect(state.pendingActions).toHaveLength(0);
    expect(state.save!.actions).toHaveLength(1);
    expect(state.save!.actions[0]).toEqual({ turn: 0, actions: [{ kind: "askPermission", what: "makeAssociate" }] });
  });

  it("queueAction replaces an earlier queued decide for the same instance instead of appending", () => {
    const store = freshStore();
    store.newGame(SETUP, "test-seed-decide");
    // Play until a week offers a card with two options (the generated world decides when).
    let decision = store.getState().view!.decisions.find((d) => d.options.length >= 2);
    for (let i = 0; i < 10 && !decision; i++) {
      store.endTurn();
      store.dismissWeek();
      decision = store.getState().view!.decisions.find((d) => d.options.length >= 2);
    }
    if (!decision) throw new Error("no two-option card within ten weeks");

    store.queueAction({ kind: "decide", instanceId: decision.instanceId, optionId: decision.options[0]!.id });
    store.queueAction({ kind: "decide", instanceId: decision.instanceId, optionId: decision.options[1]!.id });

    const pending = store.getState().pendingActions;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toEqual({ kind: "decide", instanceId: decision.instanceId, optionId: decision.options[1]!.id });
  });

  it("queueAction keeps queued decides for two different instances", () => {
    const store = freshStore();
    // This seed's first turn spawns two decisions (verified directly against projectView); a seed that happens
    // to spawn only one would make the assertion below vacuous rather than false.
    store.newGame(SETUP, "find-seed-0");
    // Play until a week offers two or more cards (the generated world decides when; ten weeks is plenty).
    let decisions = store.getState().view!.decisions;
    for (let i = 0; i < 10 && decisions.length < 2; i++) {
      store.endTurn();
      store.dismissWeek();
      decisions = store.getState().view!.decisions;
    }
    expect(decisions.length).toBeGreaterThanOrEqual(2);

    store.queueAction({ kind: "decide", instanceId: decisions[0]!.instanceId, optionId: decisions[0]!.options[0]!.id });
    store.queueAction({ kind: "decide", instanceId: decisions[1]!.instanceId, optionId: decisions[1]!.options[0]!.id });

    expect(store.getState().pendingActions).toHaveLength(2);
  });

  it("12 turns then load(save, content) gives the same worldHash as the store's world", () => {
    const store = freshStore();
    store.newGame(SETUP, "test-seed-3");
    for (let i = 0; i < 12; i++) store.endTurn();

    const state = store.getState();
    expect(state.save!.actions).toHaveLength(12);
    const { world: reloaded } = load(state.save!, content);
    expect(worldHash(reloaded)).toBe(worldHash(state.world!));
  });

  it("import of an exported JSON round-trips", async () => {
    const store = freshStore();
    store.newGame(SETUP, "test-seed-4");
    for (let i = 0; i < 3; i++) store.endTurn();
    const beforeHash = worldHash(store.getState().world!);
    const beforeSave = store.getState().save!;
    const json = store.exportSave();

    const other = freshStore();
    await other.importSave(json);

    const after = other.getState();
    expect(after.error).toBeNull();
    expect(after.save).toEqual(beforeSave);
    expect(worldHash(after.world!)).toBe(beforeHash);
  });

  it("keeps the store usable when a storage adapter fails", async () => {
    const failing = {
      get: async () => {
        throw new Error("boom");
      },
      set: async () => {
        throw new Error("boom");
      },
      del: async () => {
        throw new Error("boom");
      },
      keys: async () => {
        throw new Error("boom");
      },
    };
    const store = new GameStore(content, failing);
    store.newGame(SETUP, "test-seed-5");
    await store.saveToDb();
    expect(store.getState().error).toContain("save failed");
    // The game itself is still playable after a storage failure.
    store.queueAction({ kind: "askPermission", what: "openBook" });
    store.endTurn();
    expect(store.getState().save!.actions).toHaveLength(1);
  });
});

describe("the week modal flag", () => {
  it("opens after endTurn and closes on dismiss", () => {
    const store = new GameStore(loadContent(), memoryAdapter());
    store.newGame(SETUP, "week-1");
    expect(store.getState().weekOpen).toBe(false);
    store.endTurn();
    expect(store.getState().weekOpen).toBe(true);
    store.dismissWeek();
    expect(store.getState().weekOpen).toBe(false);
  });
});

