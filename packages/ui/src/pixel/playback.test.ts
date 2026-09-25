// Pure clip-scheduling tests (design 11 A1's task list). No PixiJS, no DOM: this exercises playback.ts only.

import { describe, expect, it } from "vitest";
import type { SceneClip } from "@borgata/sim";
import { BASE_BEAT_MS, advanceQueue, isQueueEmpty, scheduleClips, skipQueue, startQueue, totalDurationMs } from "./playback.js";

function clip(tick: number, kind: SceneClip["kind"] = "collect"): SceneClip {
  return { tick, kind, text: `beat ${tick}`, visibility: "known", cause: { rule: "test" } };
}

const THREE_CLIPS: SceneClip[] = [clip(1), clip(2, "missed"), clip(3, "note")];

describe("scheduleClips", () => {
  it("produces one beat per clip, in the given order", () => {
    const schedule = scheduleClips(THREE_CLIPS, 1);
    expect(schedule.map((b) => b.clip.tick)).toEqual([1, 2, 3]);
  });

  it("at 1x every beat lasts the base duration", () => {
    const schedule = scheduleClips(THREE_CLIPS, 1);
    for (const beat of schedule) expect(beat.durationMs).toBe(BASE_BEAT_MS);
  });

  it("at 2x every beat lasts half as long", () => {
    const schedule = scheduleClips(THREE_CLIPS, 2);
    for (const beat of schedule) expect(beat.durationMs).toBe(Math.round(BASE_BEAT_MS / 2));
  });

  it("an empty clip list schedules no beats", () => {
    expect(scheduleClips([], 1)).toEqual([]);
  });

  it("totalDurationMs sums the schedule", () => {
    const schedule = scheduleClips(THREE_CLIPS, 1);
    expect(totalDurationMs(schedule)).toBe(BASE_BEAT_MS * 3);
    expect(totalDurationMs([])).toBe(0);
  });
});

describe("playback queue", () => {
  it("startQueue makes the first clip current and queues the rest", () => {
    const q = startQueue(THREE_CLIPS, 1);
    expect(q.current?.clip.tick).toBe(1);
    expect(q.queue.map((b) => b.clip.tick)).toEqual([2, 3]);
  });

  it("advanceQueue pops one beat at a time, in order", () => {
    let q = startQueue(THREE_CLIPS, 1);
    q = advanceQueue(q);
    expect(q.current?.clip.tick).toBe(2);
    q = advanceQueue(q);
    expect(q.current?.clip.tick).toBe(3);
    q = advanceQueue(q);
    expect(q.current).toBeNull();
    expect(isQueueEmpty(q)).toBe(true);
  });

  it("advancing past the end stays empty (idempotent)", () => {
    let q = startQueue([clip(1)], 1);
    q = advanceQueue(q); // current -> null
    q = advanceQueue(q); // stays null
    expect(q.current).toBeNull();
    expect(q.queue).toEqual([]);
  });

  it("an empty clip list starts with an empty queue", () => {
    const q = startQueue([], 1);
    expect(isQueueEmpty(q)).toBe(true);
  });

  it("skip empties the queue, wherever the playhead was", () => {
    const mid = advanceQueue(startQueue(THREE_CLIPS, 1)); // current at tick 2, tick 3 still queued
    const skipped = skipQueue(mid);
    expect(skipped.current).toBeNull();
    expect(skipped.queue).toEqual([]);
    expect(isQueueEmpty(skipped)).toBe(true);
  });
});
