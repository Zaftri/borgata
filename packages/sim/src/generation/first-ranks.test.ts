// Tests for the phase 6b generator additions (design 09 §5): the sponsor's personality, the family's
// bonesRequired policy, the rival associate, the kid, and the player's starting cash and memory.
// Content is a small inline set (as generation.test.ts uses), independent of packages/content.

import { describe, expect, it } from "vitest";
import type { Content, TownArchetype, NamePools } from "../content-types.js";
import { runInvariants } from "../invariants/all.js";
import type { GameSetup } from "../world.js";
import { generateWorld } from "./index.js";

const NAMES: NamePools = {
  givenMale: ["Salvatore", "Giuseppe", "Antonino", "Francesco", "Vincenzo", "Gaetano", "Calogero"],
  givenFemale: ["Maria", "Giuseppa", "Rosalia"],
  surnames: ["Ferrante", "Lo Cascio", "Bracco", "Randazzo", "Vassallo", "Cascino", "Butera"],
  nicknames: ["Curtu", "Zoppo", "Turco"],
  townNames: ["Borgo Piano", "Contrada Alta", "Villa Grande", "Case Nuove", "Poggio Secco"],
  neighborhoodNames: ["Kalsa", "Capo", "Zisa", "Brancaccio", "Noce"],
  islandNames: ["Isola Bella", "Scoglio Nero"],
  familyNameSuffixes: ["dei Cortili", "del Piano"],
  provinceName: "Provincia di Prova",
  capitalName: "Città di Prova",
};

const NEIGHBORHOOD_ARCHETYPE: TownArchetype = {
  id: "test-neighborhood",
  label: "Test neighborhood",
  isNeighborhood: true,
  population: { min: 6000, max: 15000 },
  blocks: { min: 2, max: 4 },
  businessesPerBlock: { min: 2, max: 4 },
  businessMix: [
    { type: "bar", weight: 3, sizes: [1, 2] },
    { type: "shop", weight: 2, sizes: [1, 2, 3] },
    { type: "workshop", weight: 1, sizes: [1, 2] },
  ],
  compliance: { min: 300, max: 800 },
  fear: { min: 100, max: 500 },
  institutions: ["contractTable"],
  nameStyle: "neighborhood",
  playerStart: true,
};

const TOWN_ARCHETYPE: TownArchetype = {
  id: "test-town",
  label: "Test town",
  isNeighborhood: false,
  population: { min: 5000, max: 15000 },
  blocks: { min: 2, max: 4 },
  businessesPerBlock: { min: 2, max: 5 },
  businessMix: [
    { type: "stall", weight: 3, sizes: [1, 2] },
    { type: "shop", weight: 2, sizes: [2, 3] },
    { type: "restaurant", weight: 1, sizes: [2, 3] },
  ],
  compliance: { min: 300, max: 800 },
  fear: { min: 100, max: 500 },
  institutions: ["contractTable"],
  nameStyle: "town",
  playerStart: true,
};

const ISLAND_ARCHETYPE: TownArchetype = {
  id: "test-island",
  label: "Test island",
  isNeighborhood: false,
  population: { min: 300, max: 4000 },
  blocks: { min: 1, max: 2 },
  businessesPerBlock: { min: 1, max: 3 },
  businessMix: [{ type: "stall", weight: 1, sizes: [1] }],
  compliance: { min: 300, max: 800 },
  fear: { min: 100, max: 500 },
  institutions: ["contractTable"],
  nameStyle: "island",
  playerStart: true,
};

const TEST_CONTENT: Content = {
  version: "test-1.0.0",
  templates: [],
  archetypes: [NEIGHBORHOOD_ARCHETYPE, TOWN_ARCHETYPE, ISLAND_ARCHETYPE],
  names: NAMES,
};

function setup(overrides: Partial<GameSetup> = {}): GameSetup {
  return { archetype: null, background: "outsider", difficulty: "normal", ironman: false, ...overrides };
}

const SPONSOR_PERSONALITIES = ["patient", "hothead", "schemer", "gambler"];

describe("generator additions (design 09 §5)", () => {
  it("gives the sponsor exactly one personality trait", () => {
    for (let i = 0; i < 30; i++) {
      const seed = `first-ranks-sponsor-${i}`;
      const { world } = generateWorld(seed, setup(), TEST_CONTENT);
      const player = world.characters.byId[world.player.characterId]!;
      const sponsor = world.characters.byId[player.superiorId!]!;
      const personalityTraits = sponsor.traits.filter((t) => SPONSOR_PERSONALITIES.includes(t));
      expect(personalityTraits, seed).toHaveLength(1);
    }
  });

  it("guarantees a rival associate on record with the sponsor", () => {
    const { world } = generateWorld("first-ranks-rival", setup(), TEST_CONTENT);
    const player = world.characters.byId[world.player.characterId]!;
    const sponsor = world.characters.byId[player.superiorId!]!;

    // The sponsor may already have ordinary associates on record from stage 4 (families.ts); the
    // guaranteed rival is identified by its "ambitious" trait, not merely by being on record with him.
    const rivals = world.characters.order
      .map((id) => world.characters.byId[id]!)
      .filter((c) => c.rank === "associate" && c.onRecordWith === sponsor.id && c.traits.includes("ambitious"));

    expect(rivals, "exactly one ambitious rival on record with the sponsor").toHaveLength(1);
    const rival2 = rivals[0]!;
    expect(rival2.superiorId).toBe(sponsor.id);
    expect(rival2.traits).toContain("ambitious");
    expect(rival2.familyId).toBe(player.familyId);

    const claim = world.claims.order.map((id) => world.claims.byId[id]!).find((c) => c.subject.kind === "associate" && c.subject.id === rival2.id);
    expect(claim, "rival has a claim").toBeDefined();
    expect(claim!.holderId).toBe(sponsor.id);

    expect(sponsor.shareRules[rival2.id]).toEqual({ fixedPerTurn: 0, percent: 500 });
  });

  it("guarantees a kid, a civilian errand boy on record with the player", () => {
    const { world } = generateWorld("first-ranks-kid", setup(), TEST_CONTENT);
    const player = world.characters.byId[world.player.characterId]!;

    const kids = world.characters.order.map((id) => world.characters.byId[id]!).filter((c) => c.traits.includes("kid"));
    expect(kids).toHaveLength(1);
    const kid = kids[0]!;
    expect(kid.rank).toBe("civilian");
    expect(kid.age).toBeGreaterThanOrEqual(14);
    expect(kid.age).toBeLessThanOrEqual(17);
    expect(kid.onRecordWith).toBe(player.id);
    expect(kid.superiorId).toBe(player.id);
    expect(kid.familyId).toBe(player.familyId);
    expect(player.shareRules[kid.id]).toBeUndefined();
  });

  it("gives the player 20 kL of dirty cash and the runsGame memory", () => {
    const { world } = generateWorld("first-ranks-cash", setup(), TEST_CONTENT);
    const player = world.characters.byId[world.player.characterId]!;
    const account = world.ledger.accounts.byId[player.accounts.personal]!;
    expect(account.dirty).toBe(20);
    expect(player.memory).toContainEqual({ tag: "runsGame", weight: 100, turn: 0 });
  });

  it("sets bonesRequired between 20 and 40 percent of the time over 200 seeds", () => {
    let trueCount = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const { world } = generateWorld(`first-ranks-bones-${i}`, setup(), TEST_CONTENT);
      const player = world.characters.byId[world.player.characterId]!;
      const family = world.families.byId[player.familyId!]!;
      if (family.policy.bonesRequired) trueCount++;
    }
    const pct = (trueCount / N) * 100;
    expect(pct, `bonesRequired true ${trueCount}/${N}`).toBeGreaterThanOrEqual(20);
    expect(pct, `bonesRequired true ${trueCount}/${N}`).toBeLessThanOrEqual(40);
  });

  it(
    "passes every invariant over a 300-seed probe with the new generator additions",
    () => {
      for (let i = 0; i < 300; i++) {
        const seed = `first-ranks-probe-${i}`;
        const { world } = generateWorld(seed, setup(i % 2 === 0 ? { background: "family" } : { background: "outsider" }), TEST_CONTENT);
        const violations = runInvariants(world);
        expect(violations, `${seed}: ${JSON.stringify(violations)}`).toEqual([]);
      }
    },
    30_000,
  );
});

// docs/event-storming-2026-09-25.md §3 hotspot 1: a civilian owner (with a shopkeeper trait) for every
// business on the player's sponsor's crew's blocks.
const SHOPKEEPER_TRAITS = ["reporter", "proud", "latePayer"];

function sponsorCrewBlockIds(world: ReturnType<typeof generateWorld>["world"]): string[] {
  const player = world.characters.byId[world.player.characterId]!;
  const sponsor = world.characters.byId[player.superiorId!]!;
  const crew = world.crews.order.map((id) => world.crews.byId[id]!).find((c) => c.chiefId === sponsor.id || c.memberIds.includes(sponsor.id));
  if (!crew) throw new Error("no crew found for the player's sponsor");
  return crew.blockIds;
}

describe("shopkeeper owners on the sponsor's crew's blocks (design 09 §5, hotspot 1)", () => {
  it("gives every shop on those blocks a civilian owner (age 30 to 65, no family) with at most one shopkeeper trait", () => {
    for (let i = 0; i < 30; i++) {
      const seed = `first-ranks-owners-${i}`;
      const { world } = generateWorld(seed, setup(), TEST_CONTENT);
      for (const blockId of sponsorCrewBlockIds(world)) {
        const block = world.geo.blocks.byId[blockId]!;
        for (const businessId of block.businessIds) {
          const business = world.geo.businesses.byId[businessId]!;
          expect(business.ownerId, `${seed}: business ${businessId} has no owner`).not.toBeNull();
          const owner = world.characters.byId[business.ownerId!]!;
          expect(owner.rank, seed).toBe("civilian");
          expect(owner.age, seed).toBeGreaterThanOrEqual(30);
          expect(owner.age, seed).toBeLessThanOrEqual(65);
          expect(owner.familyId, seed).toBeNull();
          const traits = owner.traits.filter((t) => SHOPKEEPER_TRAITS.includes(t));
          expect(traits.length, `${seed}: owner ${owner.id} traits ${JSON.stringify(owner.traits)}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("leaves shops off the sponsor's crew's blocks ownerless (lazy, later, per design 09 §5)", () => {
    const { world } = generateWorld("first-ranks-owners-other-blocks", setup(), TEST_CONTENT);
    const ownBlockIds = new Set(sponsorCrewBlockIds(world));
    let checkedAny = false;
    for (const townId of world.geo.towns.order) {
      const town = world.geo.towns.byId[townId]!;
      for (const blockId of town.blockIds) {
        if (ownBlockIds.has(blockId)) continue;
        const block = world.geo.blocks.byId[blockId]!;
        for (const businessId of block.businessIds) {
          checkedAny = true;
          expect(world.geo.businesses.byId[businessId]!.ownerId).toBeNull();
        }
      }
    }
    expect(checkedAny, "expected at least one business off the sponsor's crew's blocks in this content").toBe(true);
  });

  it("draws reporter/proud/latePayer/none near design 09 §5's weights (reporter 10 to 20 percent) over 100 seeds", () => {
    let reporterCount = 0;
    let total = 0;
    const N = 100;
    for (let i = 0; i < N; i++) {
      const seed = `first-ranks-owner-traits-${i}`;
      const { world } = generateWorld(seed, setup(), TEST_CONTENT);
      for (const blockId of sponsorCrewBlockIds(world)) {
        const block = world.geo.blocks.byId[blockId]!;
        for (const businessId of block.businessIds) {
          const owner = world.characters.byId[world.geo.businesses.byId[businessId]!.ownerId!]!;
          total++;
          if (owner.traits.includes("reporter")) reporterCount++;
        }
      }
    }
    const pct = (reporterCount / total) * 100;
    expect(pct, `reporter ${reporterCount}/${total}`).toBeGreaterThanOrEqual(10);
    expect(pct, `reporter ${reporterCount}/${total}`).toBeLessThanOrEqual(20);
  });
});
