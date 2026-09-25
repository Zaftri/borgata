// Blocks and businesses per block follow design 05's archetype table (2026-09-24: the shipped 4 to 9 per block
// left crews of nine men one block of four shops, and a made man with nothing to collect).
// The seven town archetypes (design 05 stage 4, brief C12, `TownArchetype` binding in
// packages/sim/src/content-types.ts). Each archetype expresses one of the seven starting-place economies from
// the brief: what an associate collects from, what a crew chief earns from, and which institution is the
// prize (materialized later, in phase 5's generator, not here). Ranges are grounded in design 05 stage 4's
// table and the brief's C12 economy descriptions; `businessMix` weights are relative, not probabilities, and
// are read by the generator's stage-5 draw (design 05 stage 5).
//
// `compliance` ranges follow the brief's gameable mechanic 5 (Ballarò-style markets near saturation; islands
// far looser): market quarter 800..950, small island 500..700, everywhere else 600..800. `fear` starts low
// everywhere (200..400) since fear is built by intimidation later, not seeded high at generation.
import type { TownArchetype } from "@borgata/sim";

export const ARCHETYPES: TownArchetype[] = [
  {
    id: "harbor-quarter",
    label: "Harbor Quarter",
    isNeighborhood: true,
    population: { min: 6_000, max: 20_000 },
    blocks: { min: 3, max: 5 },
    businessesPerBlock: { min: 8, max: 14 },
    // C12: porters, dockers' bars, cargo pilfering. Bars and workshops (standing in for warehouses, per the
    // task) dominate; stalls are the fish market; a few shops and one restaurant round out the quay.
    businessMix: [
      { type: "bar", weight: 30, sizes: [1, 2, 3] },
      { type: "workshop", weight: 25, sizes: [2, 3, 4] },
      { type: "stall", weight: 25, sizes: [1, 2] },
      { type: "shop", weight: 15, sizes: [1, 2, 3] },
      { type: "restaurant", weight: 5, sizes: [1, 2] },
    ],
    compliance: { min: 600, max: 800 },
    fear: { min: 200, max: 400 },
    institutions: ["harbor", "fishMarket"],
    nameStyle: "neighborhood",
    playerStart: true,
  },
  {
    id: "market-quarter",
    label: "Market Quarter",
    isNeighborhood: true,
    population: { min: 6_000, max: 20_000 },
    blocks: { min: 3, max: 5 },
    businessesPerBlock: { min: 14, max: 24 },
    // C12: many small stall payers, a lottery book, loans to vendors. Stalls and shops carry the mix; a
    // handful of bars and workshops (moneylenders' backrooms) fill the rest.
    businessMix: [
      { type: "stall", weight: 45, sizes: [1, 2] },
      { type: "shop", weight: 35, sizes: [1, 2, 3] },
      { type: "bar", weight: 10, sizes: [1, 2] },
      { type: "workshop", weight: 10, sizes: [1, 2, 3] },
    ],
    // Market near saturation (brief mechanic 5: Ballarò-style markets near 100 percent compliance).
    compliance: { min: 800, max: 950 },
    fear: { min: 200, max: 400 },
    institutions: ["wholesaleMarket"],
    nameStyle: "neighborhood",
    playerStart: true,
  },
  {
    id: "expansion-neighborhood",
    label: "Expansion Neighborhood",
    isNeighborhood: true,
    population: { min: 6_000, max: 20_000 },
    blocks: { min: 3, max: 5 },
    businessesPerBlock: { min: 8, max: 14 },
    // C12: site tax, selling site jobs, site guarding, materials theft. Building sites and shops dominate;
    // workshops (contractors) and bars fill out the mix.
    businessMix: [
      { type: "site", weight: 35, sizes: [2, 3, 4, 5] },
      { type: "shop", weight: 30, sizes: [1, 2, 3] },
      { type: "workshop", weight: 20, sizes: [1, 2, 3] },
      { type: "bar", weight: 15, sizes: [1, 2] },
    ],
    compliance: { min: 600, max: 800 },
    fear: { min: 200, max: 400 },
    institutions: ["planningOffice", "constructionPipeline"],
    nameStyle: "neighborhood",
    playerStart: true,
  },
  {
    id: "agricultural-town",
    label: "Agricultural Town",
    isNeighborhood: false,
    population: { min: 3_000, max: 12_000 },
    blocks: { min: 3, max: 6 },
    businessesPerBlock: { min: 5, max: 9 },
    // C12: estate guarding, water fees, livestock brokerage. Stalls (the produce market), shops and
    // workshops (estate suppliers), plus bars for the piazza.
    businessMix: [
      { type: "stall", weight: 30, sizes: [1, 2] },
      { type: "shop", weight: 30, sizes: [1, 2, 3] },
      { type: "workshop", weight: 25, sizes: [1, 2, 3] },
      { type: "bar", weight: 15, sizes: [1, 2] },
    ],
    compliance: { min: 600, max: 800 },
    fear: { min: 200, max: 400 },
    institutions: ["waterConsortium", "market"],
    nameStyle: "town",
    playerStart: true,
  },
  {
    id: "coastal-fishing-town",
    label: "Coastal Fishing Town",
    isNeighborhood: false,
    population: { min: 3_000, max: 15_000 },
    blocks: { min: 3, max: 6 },
    businessesPerBlock: { min: 6, max: 12 },
    // C12: boat and fuel tax, a share of landings, crew work on a run. Bars (the boat crews' haunts), stalls
    // (fish sold off the quay) and workshops (boatyards); a building site only rarely.
    businessMix: [
      { type: "bar", weight: 30, sizes: [1, 2, 3] },
      { type: "stall", weight: 30, sizes: [1, 2] },
      { type: "workshop", weight: 30, sizes: [1, 2, 3] },
      { type: "site", weight: 10, sizes: [1, 2] },
    ],
    compliance: { min: 600, max: 800 },
    fear: { min: 200, max: 400 },
    institutions: ["harbor", "fleet"],
    nameStyle: "town",
    playerStart: true,
  },
  {
    id: "provincial-capital",
    label: "Provincial Capital",
    isNeighborhood: false,
    // Design 05 stage 4 gives 20k..80k across the eventual generator; the task narrows this to a single town
    // record for now (a full capital would be several generated neighborhoods, phase 5's later stages).
    population: { min: 25_000, max: 60_000 },
    blocks: { min: 5, max: 8 },
    businessesPerBlock: { min: 10, max: 18 },
    // C12: cafe and shop tax, brokering public jobs, a betting book. Restaurants (the cafes) and shops
    // dominate; sites (public works) and supermarkets carry the bigger money; bars round it out.
    businessMix: [
      { type: "restaurant", weight: 25, sizes: [2, 3, 4] },
      { type: "shop", weight: 30, sizes: [1, 2, 3, 4] },
      { type: "site", weight: 20, sizes: [2, 3, 4, 5] },
      { type: "supermarket", weight: 15, sizes: [3, 4, 5] },
      { type: "bar", weight: 10, sizes: [1, 2, 3] },
    ],
    compliance: { min: 600, max: 800 },
    fear: { min: 200, max: 400 },
    institutions: ["prefecture", "contractTable", "procurement"],
    nameStyle: "town",
    playerStart: true,
  },
  {
    id: "small-island",
    label: "Small Island",
    isNeighborhood: false,
    population: { min: 800, max: 4_000 },
    blocks: { min: 1, max: 2 },
    businessesPerBlock: { min: 3, max: 6 },
    // C12: season tax, boat services, landing fees. Stalls and bars only; a small island has no room for more.
    businessMix: [
      { type: "stall", weight: 60, sizes: [1, 2] },
      { type: "bar", weight: 40, sizes: [1, 2] },
    ],
    // Looser than the mainland (brief mechanic 5's low end): an island runs on the route, not on saturation.
    compliance: { min: 500, max: 700 },
    fear: { min: 200, max: 400 },
    institutions: ["landing"],
    nameStyle: "island",
    playerStart: true,
  },
];
