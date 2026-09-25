// The state's lane-1 actions (design 03 §2, §3; design 04 §4 lane 1; brainstorm D4, user story 3) used to live
// here as a hand-written system. Phase 4 migrated raids (state.raid.low/lowSquad/high/highSquad), band-1 patrol
// arrests (state.patrol.arrest) and the flip roll onto event-engine templates and a `fn` predicate
// (docs/NOW.md phase 4 task 1): see packages/content/src/templates/state.ts (the templates) and
// engine/predicates.ts's `state.flipRoll` (the flip roll itself, registered under the `state.` fn prefix).
// `step.ts` no longer calls a `stateActions` function; the templates run inside the scheduler's lane 1 like any
// other process. What remains here are the constants still read from outside this file: the harness's
// `flipOdds` (design 08) and the two heat thresholds the templates' preconditions encode as data.

import { clamp, type PerTenThousand } from "@borgata/shared";

/** Local heat at or above this triggers a raid roll (design 03 §2); mirrored in state.raid.low's precondition. */
export const RAID_HEAT_THRESHOLD = 300;
/** Below the raid threshold, a town with heat >= this under an informant network sees a street arrest
 * (design 03 §2); mirrored in state.patrol.arrest's precondition. */
export const PATROL_HEAT_THRESHOLD = 20; // lowered from 40 on 2026-09-23 with per-town routine heat

/** Pure odds function for the harness (design 03 §3): per ten thousand chance of cooperation. Same formula the
 * `state.flipRoll` fn predicate uses internally, exposed here (unscaled by exposure/loyalty inputs) so the
 * harness can report the shape of the curve without re-deriving it. */
export function flipOdds(pressure: number, resistance: number): PerTenThousand {
  return clamp((pressure - resistance) * 10, 0, 10_000);
}
