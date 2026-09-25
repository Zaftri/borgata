// Naming helpers for generation (design 05 stage 12, K1/K2). Every draw comes from a named stream so
// the same seed always produces the same names. Uniqueness is best-effort: with small content pools
// (as in tests) the generator falls back to allowing a repeat rather than looping forever, since no
// invariant in this phase depends on strict uniqueness (design 05's province-wide uniqueness rule is
// deferred past phase 5).

import type { Stream } from "../rng.js";
import type { NamePools, TownArchetype } from "../content-types.js";

/** Pick a value from a pool, retrying up to the pool's size to avoid a value already in `used`, then
 * giving up and accepting the repeat. Deterministic: every attempt still consumes the stream. */
function pickUnique(stream: Stream, pool: readonly string[], used: Set<string>): string {
  if (pool.length === 0) throw new Error("name pool is empty");
  const maxAttempts = pool.length;
  let value = stream.pick(pool);
  for (let i = 1; i < maxAttempts && used.has(value); i++) value = stream.pick(pool);
  used.add(value);
  return value;
}

/** A place name (town, capital neighborhood or island) for the given archetype's `nameStyle`, unique
 * within the world where the pool allows it. */
export function pickPlaceName(stream: Stream, names: NamePools, archetype: TownArchetype, used: Set<string>): string {
  const pool = archetype.nameStyle === "neighborhood" ? names.neighborhoodNames : archetype.nameStyle === "island" ? names.islandNames : names.townNames;
  return pickUnique(stream, pool, used);
}

export type GeneratedPersonName = { given: string; surname: string; nickname: string | null; full: string };

/** A man's given name and surname, unique within `used` where the pools allow it, plus a one-in-four
 * chance of a nickname (design 05 stage 12). Formatted as `Given "Nickname" Surname` or `Given Surname`. */
export function pickManName(stream: Stream, names: NamePools, used: Set<string>): GeneratedPersonName {
  const maxAttempts = Math.max(1, names.givenMale.length * names.surnames.length);
  let given = stream.pick(names.givenMale);
  let surname = stream.pick(names.surnames);
  let key = `${given} ${surname}`;
  for (let i = 1; i < maxAttempts && used.has(key); i++) {
    given = stream.pick(names.givenMale);
    surname = stream.pick(names.surnames);
    key = `${given} ${surname}`;
  }
  used.add(key);

  const nickname = names.nicknames.length > 0 && stream.chance(2500) ? stream.pick(names.nicknames) : null;
  const full = nickname ? `${given} "${nickname}" ${surname}` : `${given} ${surname}`;
  return { given, surname, nickname, full };
}

/** The family's own name: "Famiglia di <town>", occasionally extended with a suffix from the pool
 * (design 05 stage 12: families are named for their town, never for a surname). */
export function pickFamilyName(stream: Stream, names: NamePools, townName: string): string {
  const base = `Famiglia di ${townName}`;
  if (names.familyNameSuffixes.length === 0 || !stream.chance(3000)) return base;
  return `${base} ${stream.pick(names.familyNameSuffixes)}`;
}
