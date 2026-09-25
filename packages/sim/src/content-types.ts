// The content shape the core consumes. Defined here because sim may not import the content package
// (dependency direction, design 01 §2); the content package produces a value of this type after validation.

import type { ProcessTemplate } from "./engine/types.js";
import type { BusinessType, BusinessSize } from "./world.js";

/** A starting-place and town archetype (design 05 stage 4, brief C12, K1). */
export type TownArchetype = {
  id: string;                               // "harbor-quarter" | "market-quarter" | "expansion-neighborhood" | "agricultural-town" | "coastal-fishing-town" | "provincial-capital" | "small-island" (content may add more)
  label: string;
  isNeighborhood: boolean;                  // a capital neighborhood rather than a separate town
  population: { min: number; max: number };
  blocks: { min: number; max: number };
  businessesPerBlock: { min: number; max: number };
  /** Weighted business mix; weights are relative integers. */
  businessMix: Array<{ type: BusinessType; weight: number; sizes: BusinessSize[] }>;
  /** Starting compliance and fear ranges for businesses here. */
  compliance: { min: number; max: number };
  fear: { min: number; max: number };
  /** Institution type ids present (harbor, market, waterConsortium, contractTable, planningOffice ...); phase 5 records them on the town only. */
  institutions: string[];
  /** Name fragments for towns of this archetype, e.g. ["Borgo", "Contrada"]; neighborhoods use capital neighborhood names. */
  nameStyle: "town" | "neighborhood" | "island";
  /** Is this archetype a valid player start (design 05 constraints need at least one crew and a sponsor). */
  playerStart: boolean;
};

export type NamePools = {
  givenMale: string[];
  givenFemale: string[];
  surnames: string[];
  nicknames: string[];
  townNames: string[];            // provincial towns
  neighborhoodNames: string[];    // capital neighborhoods
  islandNames: string[];
  familyNameSuffixes: string[];   // "dei Cortili", ... used as "Famiglia di <town>" alternatives
  provinceName: string;
  capitalName: string;
};

export type Content = {
  version: string;
  /** Process templates (design 04), validated by the content package (design 06). */
  templates: readonly ProcessTemplate[];
  archetypes: readonly TownArchetype[];
  names: NamePools;
};

export const EMPTY_NAMES: NamePools = {
  givenMale: ["Salvatore"], givenFemale: ["Maria"], surnames: ["Russo"], nicknames: [], townNames: ["Borgo"], neighborhoodNames: ["Kalsa"], islandNames: ["Isola"], familyNameSuffixes: [], provinceName: "Provincia", capitalName: "Città",
};

export const EMPTY_CONTENT: Content = { version: "0.0.0", templates: [], archetypes: [], names: EMPTY_NAMES };
