// Pressure derived steps (owner: pressure, design 03 §2). `decayPressure` is the owner function for
// heat and Attention decay and mutates pressure values directly, the same way `decaySentiment` and
// `decayLoyalty` do for their owners. `recomputeBands` is a pure function that reads Attention and
// returns Facts for band changes and tool unlocks; only the reducer (../reducers/pressure.js) writes
// `attentionBand` and `toolsByFamily`.

import { clampMeter, decayToward, lnScaled120, roundHalfAway } from "@borgata/shared";
import type { Fact } from "../facts.js";
import type { AttentionBand, ToolId, World } from "../world.js";

/** Local heat decays toward 0 with a half-life of 4 weeks (design 03 §2). */
const HEAT_HALF_LIFE_WEEKS = 4;
/** Family Attention decays toward its floor with a half-life of 104 weeks (design 03 §2). */
const ATTENTION_HALF_LIFE_WEEKS = 104;
/** Attention inflow from a family's towns is the sum of their heat divided by 16. Design 03 §2 said 8; tuned 2026-09-23 because routine collection heat (about 50) saturated Attention near 900 against the 104-week decay, while 32 plateaued at 173 (band 0, informants never unlock). At 16 a quiet one-crew family settles near 266: Noticed, band 1. */
const HEAT_INFLOW_DIVISOR = 16;
/** `lnScaled120(size) / 6` approximates `20 * ln(familySize)`, since `lnScaled120` is `120 * ln(1+n)`. */
const FLOOR_DIVISOR = 6;

/** Bands enter at these lower bounds; band 0 has no lower bound (design 03 §2). */
const BAND_ENTER_THRESHOLD: Record<AttentionBand, number> = { 0: 0, 1: 200, 2: 400, 3: 600, 4: 800 };
/** A band is left only when Attention falls this far below the band's lower bound (hysteresis). */
const BAND_HYSTERESIS = 50;
const MAX_BAND: AttentionBand = 4;

/** Tools unlocked by band, in table order (design 03 §2). */
export const TOOLS_BY_BAND: Record<AttentionBand, readonly ToolId[]> = {
  0: ["patrols"],
  1: ["informants", "squad"],
  2: ["magistrate", "wiretaps"],
  3: ["seizures", "collaboratorProgram"],
  4: ["army", "hardPrison"],
};

/**
 * Heat and Attention decay for the weeks this turn covered (design 03 §2). Owner function: mutates
 * `world.pressure.heatByTown` and `family.attention` directly, the same way `decaySentiment` and
 * `decayLoyalty` mutate their owned values.
 */
export function decayPressure(world: World, elapsedWeeks: number): void {
  if (!Number.isSafeInteger(elapsedWeeks) || elapsedWeeks <= 0) return;

  // Snapshot heat before it decays: this week's Attention inflow is drawn from the heat level that
  // was live this turn, not from what it decays to below (design 03 §2).
  const heatBeforeDecay: Record<string, number> = { ...world.pressure.heatByTown };

  // Local heat per town decays toward 0; delete the key once it reaches 0 so the world stays
  // canonical (no zero-valued heat entries).
  for (const townId of Object.keys(world.pressure.heatByTown)) {
    const heat = world.pressure.heatByTown[townId]!;
    const next = clampMeter(decayToward(heat, 0, HEAT_HALF_LIFE_WEEKS, elapsedWeeks));
    if (next === 0) delete world.pressure.heatByTown[townId];
    else world.pressure.heatByTown[townId] = next;
  }

  // Family size: count of living characters with familyId equal to the family (design 03 §2).
  const familySize: Record<string, number> = {};
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.alive || !c.familyId) continue;
    familySize[c.familyId] = (familySize[c.familyId] ?? 0) + 1;
  }

  for (const id of world.families.order) {
    const family = world.families.byId[id]!;

    // Inflow first: sum of heat of the family's towns, divided by 8, rounded half away from zero.
    let heatSum = 0;
    for (const townId of family.townIds) heatSum += heatBeforeDecay[townId] ?? 0;
    const inflow = roundHalfAway(heatSum, HEAT_INFLOW_DIVISOR);

    // Floor: a big family is never quiet (design 03 §2).
    const size = familySize[id] ?? 0;
    const floor = roundHalfAway(lnScaled120(size), FLOOR_DIVISOR);

    let attention = clampMeter(family.attention + inflow);
    attention = decayToward(attention, floor, ATTENTION_HALF_LIFE_WEEKS, elapsedWeeks);
    if (attention < floor) attention = floor; // never below the floor, even after integer rounding
    family.attention = clampMeter(attention);
  }
}

/**
 * The band for an Attention value given the current band, with hysteresis (design 03 §2): a band is
 * entered at its lower bound but left only 50 below it, so a family does not flicker.
 */
export function bandFor(attention: number, currentBand: AttentionBand): AttentionBand {
  // Rising: the highest band whose lower bound Attention has reached, entered immediately.
  let riseBand: AttentionBand = 0;
  for (let b = MAX_BAND; b >= 0; b--) {
    const band = b as AttentionBand;
    if (attention >= BAND_ENTER_THRESHOLD[band]) {
      riseBand = band;
      break;
    }
  }
  if (riseBand > currentBand) return riseBand;

  // Falling: leave the current band, and any band below it, only once Attention drops more than
  // the hysteresis margin under that band's lower bound.
  let band = currentBand;
  while (band > 0 && attention < BAND_ENTER_THRESHOLD[band] - BAND_HYSTERESIS) {
    band = (band - 1) as AttentionBand;
  }
  return band;
}

/**
 * Recompute each family's band from Attention with hysteresis; return `BandChange` and, on a rise
 * (including the very first recompute, so band 0's `patrols` gets unlocked), `ToolUnlock` facts for
 * every tool of every band up to the new band not yet unlocked. Pure: never mutates World. Table
 * order throughout, no randomness.
 */
export function recomputeBands(world: World): Fact[] {
  const facts: Fact[] = [];
  for (const id of world.families.order) {
    const family = world.families.byId[id]!;
    const before = family.attentionBand;
    const band = bandFor(family.attention, before);
    // Before any recompute has ever run for this family there is no tools entry yet: treat that as
    // an implicit rise into `band`, so band 0's patrols always gets unlocked on the first pass.
    const firstRecompute = world.pressure.toolsByFamily[family.id] === undefined;

    if (band !== before) {
      facts.push({
        kind: "BandChange",
        familyId: family.id,
        from: before,
        to: band,
        cause: { rule: band > before ? "attention.rose" : "attention.eased" },
      });
    }

    if (band > before || firstRecompute) {
      const existing = world.pressure.toolsByFamily[family.id] ?? [];
      for (let b = 0; b <= band; b++) {
        for (const tool of TOOLS_BY_BAND[b as AttentionBand]) {
          if (!existing.includes(tool)) {
            facts.push({ kind: "ToolUnlock", familyId: family.id, tool, cause: { rule: "pressure.bandTools" } });
          }
        }
      }
    }
  }
  return facts;
}
