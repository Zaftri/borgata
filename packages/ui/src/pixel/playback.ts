// Pure clip-scheduling logic for the animated Turn view (design 11 A1's task list: "extract it into
// playback.ts... vitest runs in node"). No PixiJS, no DOM, no timers: `TurnView.tsx` drives a `PlaybackQueue`
// from its own `requestAnimationFrame`/ticker loop, but the scheduling and the queue transitions themselves are
// plain data so they're testable without a browser.
//
// `SceneClip`s (packages/sim/src/scene.ts) already arrive in tick order; this module only decides how long each
// clip stays on screen at a given speed, and how the queue empties.

import type { SceneClip } from "@borgata/sim";

/** 1x or 2x (design 07 §2.2's speed controls; "skip" is a queue operation below, not a speed). */
export type PlaybackSpeed = 1 | 2;

/** A clip's screen time, per this component's own rule (design 07 §2.2: "The view has no state of its own
 *  beyond the playhead" — the duration is UI pacing, not sim data). */
export const BASE_BEAT_MS = 900;

export type ScheduledBeat = { clip: SceneClip; durationMs: number };

/** Given clips (already in tick order) and a speed, the sequence of beats and their durations. Pure, and the
 *  thing atlas.test.ts's sibling, playback.test.ts, exercises directly. */
export function scheduleClips(clips: readonly SceneClip[], speed: PlaybackSpeed): ScheduledBeat[] {
  const durationMs = Math.max(1, Math.round(BASE_BEAT_MS / speed));
  return clips.map((clip) => ({ clip, durationMs }));
}

/** The schedule's total screen time, for a progress indicator. */
export function totalDurationMs(schedule: readonly ScheduledBeat[]): number {
  return schedule.reduce((sum, beat) => sum + beat.durationMs, 0);
}

/** The playhead: the beat currently showing (or null before the first / after the last) plus the beats still
 *  queued behind it. `TurnView` holds one of these in local state and calls `advanceQueue` when the current
 *  beat's timer elapses, or `skipQueue` when the player presses "skip". */
export type PlaybackQueue = { readonly queue: readonly ScheduledBeat[]; readonly current: ScheduledBeat | null };

/** Builds a fresh queue from clips and a speed, with the first beat already current (matches how `startQueue`
 *  is used: call once when the place or the turn's clips change). */
export function startQueue(clips: readonly SceneClip[], speed: PlaybackSpeed): PlaybackQueue {
  return advanceQueue({ queue: scheduleClips(clips, speed), current: null });
}

/** Pops the next beat off the queue into `current`. Once the queue is empty this just returns `current: null`
 *  again (idempotent at the end), so a caller can keep calling it without checking first. */
export function advanceQueue(state: PlaybackQueue): PlaybackQueue {
  const [next, ...rest] = state.queue;
  return { queue: rest, current: next ?? null };
}

/** "Skip" (design 07 §2.2's third speed control): drops every remaining beat at once. The clip list itself
 *  (the log) is untouched — only the playhead moves to the end. */
export function skipQueue(_state: PlaybackQueue): PlaybackQueue {
  return { queue: [], current: null };
}

/** True once nothing is playing and nothing is queued: the natural end of a place's clips, or the state right
 *  after `skipQueue`. */
export function isQueueEmpty(state: PlaybackQueue): boolean {
  return state.current === null && state.queue.length === 0;
}
