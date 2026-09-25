// Invariants for progression (design 03 §1; design 07 §1; G2, G3), registered by importing this module
// from ./all.ts. Weight stays an integer in range, UI layers are unlocked at most once, and once the
// tutorial has started (layer "block" present) the player's unlocked layers never skip a rank tier.

import { registerInvariant, type Violation } from "../invariants.js";
import { RANK_TIER_ORDER, UI_LAYERS_BY_RANK } from "../systems/progression.js";

const RECORD_FIELDS = ["weeksPaid", "weeksMissed", "jobsDone", "jobsRefused", "jobsBotched", "arrests", "streakPaid", "streakRefused"] as const;

registerInvariant({
  name: "progression.weightInRange",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      if (!Number.isSafeInteger(c.weight) || c.weight < 0 || c.weight > 1000) {
        out.push({ name: "progression.weightInRange", message: `character ${id} weight out of range: ${c.weight}` });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "progression.uiLayersUnique",
  check(world): Violation[] {
    const out: Violation[] = [];
    const seen = new Set<string>();
    for (const layer of world.player.uiLayersUnlocked) {
      if (seen.has(layer)) out.push({ name: "progression.uiLayersUnique", message: `layer ${layer} unlocked more than once` });
      seen.add(layer);
    }
    return out;
  },
});

registerInvariant({
  name: "progression.rankLayersConsistent",
  check(world): Violation[] {
    if (!world.player.uiLayersUnlocked.includes("block")) return [];
    const player = world.characters.byId[world.player.characterId];
    // No family means no rank ladder to be consistent with (phase 0 worlds, and harness fixtures that
    // inject a bare RankChange to probe unrelated systems such as turn length); nothing to check.
    if (!player || player.rank === "civilian" || player.familyId === null) return [];
    const playerRank = player.rank;

    const tierIndex = RANK_TIER_ORDER.findIndex((tier) => tier.includes(playerRank));
    if (tierIndex < 0) return [];

    const out: Violation[] = [];
    for (let t = 0; t <= tierIndex; t++) {
      for (const rank of RANK_TIER_ORDER[t]!) {
        for (const layer of UI_LAYERS_BY_RANK[rank]) {
          if (!world.player.uiLayersUnlocked.includes(layer)) {
            out.push({ name: "progression.rankLayersConsistent", message: `player rank ${playerRank} missing layer ${layer} (from rank ${rank})` });
          }
        }
      }
    }
    return out;
  },
});

/** Design 09 §2: `record` is a table of cumulative counters; a reducer that let one go negative would be a bug
 * (the reducer itself already rejects a delta that would; this just confirms no other path put one there). */
registerInvariant({
  name: "progression.recordNonNegative",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      for (const field of RECORD_FIELDS) {
        const value = c.record[field];
        if (!Number.isSafeInteger(value) || value < 0) {
          out.push({ name: "progression.recordNonNegative", message: `character ${id} record.${field} is ${value}` });
        }
      }
    }
    return out;
  },
});
