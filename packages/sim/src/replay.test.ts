import { describe, expect, it } from "vitest";
import { SNAPSHOT_EVERY_TURNS } from "@borgata/shared";
import { load, record, replay, run } from "./replay.js";
import { worldHash } from "./step.js";
import { EMPTY_CONTENT } from "./content-types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

describe("replay", () => {
  it("replaying a recorded action log reproduces the live run hash for hash", () => {
    const live = run("golden-a", setup, EMPTY_CONTENT, 60, () => []);
    const { save } = record("golden-a", setup, EMPTY_CONTENT, 60, () => []);
    const again = replay(save, EMPTY_CONTENT);
    expect(again.hashes).toEqual(live.hashes);
    expect(worldHash(again.world)).toBe(worldHash(live.world));
  });

  it("loading from the latest snapshot equals a full replay", () => {
    const turns = SNAPSHOT_EVERY_TURNS * 2 + 7;
    const { save, world } = record("snap", setup, EMPTY_CONTENT, turns, () => []);
    expect(save.snapshots.map((s) => s.turn)).toEqual([SNAPSHOT_EVERY_TURNS, SNAPSHOT_EVERY_TURNS * 2]);
    const loaded = load(save, EMPTY_CONTENT);
    expect(loaded.frozenBefore).toBeNull();
    expect(worldHash(loaded.world)).toBe(worldHash(world));
  });

  it("detects a corrupt snapshot", () => {
    const { save } = record("corrupt", setup, EMPTY_CONTENT, SNAPSHOT_EVERY_TURNS + 1, () => []);
    save.snapshots[0]!.world.meta.calendar.week = 40;
    expect(() => load(save, EMPTY_CONTENT)).toThrow(/corrupt/);
  });

  it("freezes history before the snapshot when content changed", () => {
    const { save } = record("cv", setup, EMPTY_CONTENT, SNAPSHOT_EVERY_TURNS + 3, () => []);
    const loaded = load(save, { ...EMPTY_CONTENT, version: "9.9.9" });
    expect(loaded.frozenBefore).toBe(SNAPSHOT_EVERY_TURNS);
  });

  it("refuses a save from another schema version", () => {
    const { save } = record("schema", setup, EMPTY_CONTENT, 3, () => []);
    save.schemaVersion = 0;
    expect(() => replay(save, EMPTY_CONTENT)).toThrow(/migration/);
  });
});
