// World generation (design 05, build plan phase 5 task 1). Deterministic from the seed via named
// streams "generation.<stage>". Pipeline for a single full province (K0): province and towns (stage 1),
// districts (stage 2), blocks and businesses (stage 3), families and crews (stage 4), the player's
// placement and tutorial cast (stage 5), and the guaranteed K5 beats with their re-roll/relax policy
// (stage 6). Replaces `buildStarterWorld` behind `initialWorld` (replay.ts); `buildStarterWorld` itself
// stays as a test fixture.

import type { Content } from "../content-types.js";
import { buildStarterWorld } from "../starter.js";
import { createEmptyWorld, type GameSetup, type World } from "../world.js";
import type { Beats } from "./beats.js";
import { resolveBeats } from "./beats.js";
import { buildFamilies } from "./families.js";
import { assignShopkeeperOwners, placePlayer } from "./player.js";
import { buildDistricts, buildProvince } from "./province.js";
import { buildTownContent } from "./town-content.js";

export type GenerationReport = {
  seed: string;
  relaxations: string[];
  rerolls: number;
  archetype: string;
  beats: Beats;
};

const NO_BEATS_CONTENT: Beats = { neighbourWeakBorder: true, publicWorksReachable: true, earlyCollisionPlausible: true, earlyArrestPlausible: true };

export function generateWorld(seed: string, setup: GameSetup, content: Content): { world: World; report: GenerationReport } {
  // Content with no town archetypes cannot drive the pipeline below (stage 1 needs at least a
  // neighborhood and a town archetype). This is `EMPTY_CONTENT`, used throughout the test suite to
  // exercise a single system in isolation without pulling in the real content package; for it, fall back
  // to the pre-generator hand-built world (starter.ts) exactly as `initialWorld` did before phase 5.
  if (content.archetypes.length === 0) {
    return {
      world: buildStarterWorld(seed, setup, content),
      report: { seed, relaxations: [], rerolls: 0, archetype: setup.archetype ?? "market-quarter", beats: NO_BEATS_CONTENT },
    };
  }

  const world = createEmptyWorld(seed, setup, content.version);

  // Stage 1: the province, its capital neighborhoods and its provincial towns.
  const { province, towns } = buildProvince(world, setup, content);
  // Stage 2: group the towns into districts.
  buildDistricts(world, province, towns);
  // Stage 3: blocks and businesses per town.
  buildTownContent(world, content, towns);
  // Stage 4: one family per town with its crews, sharing the same towns' blocks out among them.
  const headSurnames = buildFamilies(world, content, towns);
  // Stage 5: the start town, the player on record with a sponsor, and the sponsor's exposed chief.
  const placement = placePlayer(world, content, setup, towns, headSurnames);
  // Stage 6: guarantee and record the K5 beats.
  const { beats, rerolls, relaxations } = resolveBeats(world, content, province.id, placement);
  assignDistrictHeads(world);

  // Design 09 §5, docs/event-storming-2026-09-25.md §3 hotspot 1: a civilian owner for every shop on the
  // sponsor's crew's blocks, run after stage 6 (not inline in stage 5's `placePlayer`) because stage 6 can
  // regenerate the start town's businesses from scratch to guarantee the early-collision beat -- see
  // `assignShopkeeperOwners`'s own comment in player.ts.
  assignShopkeeperOwners(world, content, placement);

  // Stage 7: the report.
  const report: GenerationReport = {
    seed,
    relaxations,
    rerolls,
    archetype: placement.startTown.archetype,
    beats,
  };

  return { world, report };
}

/** Design 13: each district's head is the family with the most made men and business claims (a proxy for total
 *  Weight at turn 0, when Weight is not yet computed). Generation writes state directly, as for the crews. */
function assignDistrictHeads(world: World): void {
  for (const id of world.geo.districts.order) {
    const district = world.geo.districts.byId[id]!;
    let best: { familyId: string; score: number } | null = null;
    for (const familyId of district.familyIds) {
      let score = 0;
      for (const cid of world.characters.order) {
        const c = world.characters.byId[cid]!;
        if (c.alive && c.familyId === familyId && c.rank !== "civilian" && c.rank !== "associate") score += 3;
      }
      for (const clid of world.claims.order) {
        const cl = world.claims.byId[clid]!;
        const holder = world.characters.byId[cl.holderId];
        if (holder?.familyId === familyId && cl.subject.kind === "business") score += 1;
      }
      if (!best || score > best.score) best = { familyId, score };
    }
    if (best) district.districtHeadFamilyId = best.familyId as never;
  }
}

