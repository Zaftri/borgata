// `pnpm harness coverage` (build plan §5b item 8c, design 08 §9's outcome catalogue): runs careers-style loops
// and records which (templateId, optionId) pairs the player ever chose and which (templateId, outcomeId) pairs
// ever resolved, so the CLI can list the ones a story never reached. Pure over the core's public API, same shape
// as `metrics.ts`'s `collectCareer` (stepping directly, not `sweep`/`run`, so every turn's log is inspectable).

import { InvariantViolationError, initialWorld, step, type Content } from "@borgata/sim";
import { placesForPlayer, projectScene } from "@borgata/sim";
import { makeAiPlayer, type Strategy } from "./ai-player.js";
import { trackTemplateId, isPlayerFacingInstance } from "./metrics.js";
import { DEFAULT_SETUP } from "./index.js";

/** `${templateId}::${optionId | outcomeId}`, exported so the CLI builds the same key when it looks a pair up. */
export function coverageKey(templateId: string, id: string): string {
  return `${templateId}::${id}`;
}

export type CoverageResult = {
  seeds: number;
  turns: number;
  strategy: Strategy;
  /** (templateId, optionId) from ProcessDecide facts (only ever emitted for the player's own decisions, engine/
   *  scheduler.ts's `resolveInstanceNow`: an AI-held decision resolves by its default with no ProcessDecide fact). */
  optionsChosen: Set<string>;
  /** (templateId, outcomeId) from ProcessResolve facts, player-facing instances only (roles include the player). */
  playerFacingOutcomesReached: Set<string>;
  /** Beat kinds the animated turn showed on the player's place (design 11 §1): a kind never seen has no story. */
  beatsReached: Set<string>;
  /** (templateId, outcomeId) from ProcessResolve facts, every instance. */
  allOutcomesReached: Set<string>;
};

/** Run `seeds` careers of `turns` turns each under `strategy`, recording coverage as in `CoverageResult`. A career
 * that hits an invariant violation stops early (like `sweep`/`careers`) rather than failing the whole run: this
 * command is a report, not a gate (task brief: "exit code stays 0"). */
export function runCoverage(content: Content, seeds: number, turns: number, strategy: Strategy, seedPrefix = "coverage"): CoverageResult {
  const optionsChosen = new Set<string>();
  const playerFacingOutcomesReached = new Set<string>();
  const beatsReached = new Set<string>();
  const allOutcomesReached = new Set<string>();

  for (let i = 0; i < seeds; i++) {
    const seed = `${seedPrefix}-${strategy}-${i}`;
    const ai = makeAiPlayer(strategy);
    let world = initialWorld(seed, DEFAULT_SETUP, content);
    const playerId = world.player.characterId;
    const templateIdByInstance = new Map<string, string>();
    const playerFacingByInstance = new Map<string, boolean>();

    for (let t = 0; t < turns; t++) {
      const actions = ai.act(world, t);
      let result;
      try {
        result = step(world, actions, content, { debug: true, hash: false });
      } catch (e) {
        if (e instanceof InvariantViolationError) break;
        throw e;
      }
      world = result.world;
      const place = placesForPlayer(world)[0];
      if (place) for (const clip of projectScene(world, result.log, content, place.id)?.clips ?? []) beatsReached.add(clip.kind);

      for (const entry of result.log.entries) {
        if (entry.kind !== "fact") continue;
        const f = entry.fact;
        trackTemplateId(f, templateIdByInstance);
        if (f.kind === "ProcessSpawn") playerFacingByInstance.set(f.instance.id, isPlayerFacingInstance(f.instance, playerId));

        if (f.kind === "ProcessDecide") {
          const templateId = templateIdByInstance.get(f.instanceId);
          if (templateId) optionsChosen.add(coverageKey(templateId, f.optionId));
        }
        if (f.kind === "ProcessResolve") {
          const templateId = templateIdByInstance.get(f.instanceId);
          if (templateId) {
            allOutcomesReached.add(coverageKey(templateId, f.outcomeId));
            if (playerFacingByInstance.get(f.instanceId)) playerFacingOutcomesReached.add(coverageKey(templateId, f.outcomeId));
          }
        }
      }
    }
  }

  return { seeds, turns, strategy, optionsChosen, playerFacingOutcomesReached, allOutcomesReached, beatsReached };
}
