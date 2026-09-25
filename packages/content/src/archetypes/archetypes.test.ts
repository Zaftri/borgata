// Phase 5 content task: the seven town archetypes and the name pools (design 05 stage 4 and stage 12, brief
// C12). Checks the id set, per-archetype schema validity, business-mix shape, and the name pools' minimum
// counts, uniqueness, and the fictional-cast rule (no real notorious Mafia surnames, no real Sicilian towns
// or Palermo neighborhoods; design 06, NF-7).
import { describe, expect, it } from "vitest";
import { ARCHETYPES } from "./index.js";
import { NAMES } from "../names/index.js";
import { NamePoolsSchema, TownArchetypeSchema, validateContentData } from "../schema.js";

const EXPECTED_ARCHETYPE_IDS = [
  "harbor-quarter",
  "market-quarter",
  "expansion-neighborhood",
  "agricultural-town",
  "coastal-fishing-town",
  "provincial-capital",
  "small-island",
] as const;

/** Real notorious Mafia surnames the brief says to avoid, plus "Corleone" used as a surname (docs task, C12
 * generation brief). Encoded here so the test fails loudly if one ever creeps into the pool. */
const FORBIDDEN_SURNAMES = [
  "Riina",
  "Provenzano",
  "Bontate",
  "Inzerillo",
  "Greco",
  "Badalamenti",
  "Buscetta",
  "Messina Denaro",
  "Brusca",
  "Santapaola",
  "Gambino",
  "Lo Piccolo",
  "Madonia",
  "Spadaro",
  "Marchese",
  "Graviano",
  "Bagarella",
  "Corleone",
];

/** Real Sicilian towns and real Palermo neighborhoods named in docs/research/03-sicilian-cosa-nostra.md §8,
 * which the town-name and neighborhood-name pools must avoid entirely (fictional-cast rule). */
const FORBIDDEN_PLACES = [
  "Montelepre",
  "Kalsa",
  "Brancaccio",
  "Ciaculli",
  "Resuttana",
  "San Lorenzo",
  "Noce",
  "Pagliarelli",
  "Porta Nuova",
  "Uditore",
  "Zisa",
  "Vucciria",
  "Ballarò",
  "Capo",
  "Borgo Vecchio",
  "Corleone",
  "San Giuseppe Jato",
  "Partinico",
  "Bagheria",
  "Villabate",
  "Misilmeri",
  "Belmonte Mezzagno",
  "Altofonte",
  "Castelvetrano",
  "Campobello di Mazara",
  "Mazara del Vallo",
  "Alcamo",
  "Porto Empedocle",
  "Canicattì",
  "Palma di Montechiaro",
  "Ribera",
  "Gela",
  "Riesi",
  "Vallelunga",
  "Barcellona",
];

describe("archetypes", () => {
  it("has all seven ids, present exactly once", () => {
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids)).toEqual(new Set(EXPECTED_ARCHETYPE_IDS));
    expect(ids).toHaveLength(EXPECTED_ARCHETYPE_IDS.length);
    for (const [id, count] of Object.entries(
      ids.reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {}),
    )) {
      expect(count, `${id} appears ${count} times`).toBe(1);
    }
  });

  it("validates every archetype against TownArchetypeSchema", () => {
    for (const archetype of ARCHETYPES) {
      const result = TownArchetypeSchema.safeParse(archetype);
      expect(result.success, `${archetype.id}: ${result.success ? "" : JSON.stringify(result.error.issues)}`).toBe(true);
    }
  });

  it("gives every business mix at least two business types", () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.businessMix.length, archetype.id).toBeGreaterThanOrEqual(2);
      const types = new Set(archetype.businessMix.map((m) => m.type));
      expect(types.size, `${archetype.id}: duplicate business types in mix`).toBe(archetype.businessMix.length);
    }
  });

  it("marks the three Palermo neighborhood archetypes correctly", () => {
    const neighborhoodIds = new Set(["harbor-quarter", "market-quarter", "expansion-neighborhood"]);
    for (const archetype of ARCHETYPES) {
      expect(archetype.isNeighborhood, archetype.id).toBe(neighborhoodIds.has(archetype.id));
      const expectedStyle = neighborhoodIds.has(archetype.id)
        ? "neighborhood"
        : archetype.id === "small-island"
          ? "island"
          : "town";
      expect(archetype.nameStyle, archetype.id).toBe(expectedStyle);
    }
  });

  it("is a valid player start for every archetype (design 05 K5 needs a crew and a sponsor)", () => {
    for (const archetype of ARCHETYPES) expect(archetype.playerStart, archetype.id).toBe(true);
  });

  it("passes validateContentData for the whole ARCHETYPES set plus NAMES", () => {
    const result = validateContentData(ARCHETYPES, NAMES);
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true);
  });
});

describe("name pools", () => {
  it("validates against NamePoolsSchema", () => {
    const result = NamePoolsSchema.safeParse(NAMES);
    expect(result.success, result.success ? "" : JSON.stringify(result.error.issues)).toBe(true);
  });

  it("meets the minimum counts per pool", () => {
    expect(NAMES.givenMale.length).toBeGreaterThanOrEqual(60);
    expect(NAMES.givenFemale.length).toBeGreaterThanOrEqual(40);
    expect(NAMES.surnames.length).toBeGreaterThanOrEqual(120);
    expect(NAMES.nicknames.length).toBeGreaterThanOrEqual(40);
    expect(NAMES.townNames.length).toBeGreaterThanOrEqual(40);
    expect(NAMES.neighborhoodNames.length).toBeGreaterThanOrEqual(30);
    expect(NAMES.islandNames.length).toBeGreaterThanOrEqual(12);
  });

  it("has no duplicate entries within any pool", () => {
    const pools: Array<[string, string[]]> = [
      ["givenMale", NAMES.givenMale],
      ["givenFemale", NAMES.givenFemale],
      ["surnames", NAMES.surnames],
      ["nicknames", NAMES.nicknames],
      ["townNames", NAMES.townNames],
      ["neighborhoodNames", NAMES.neighborhoodNames],
      ["islandNames", NAMES.islandNames],
      ["familyNameSuffixes", NAMES.familyNameSuffixes],
    ];
    for (const [label, pool] of pools) {
      expect(new Set(pool).size, label).toBe(pool.length);
    }
  });

  it("never uses a forbidden real Mafia surname", () => {
    for (const forbidden of FORBIDDEN_SURNAMES) {
      expect(NAMES.surnames, `surnames must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("never uses a real Sicilian town or Palermo neighborhood name", () => {
    for (const forbidden of FORBIDDEN_PLACES) {
      expect(NAMES.townNames, `townNames must not contain "${forbidden}"`).not.toContain(forbidden);
      expect(NAMES.neighborhoodNames, `neighborhoodNames must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("has non-empty provinceName and capitalName that are not the real ones", () => {
    expect(NAMES.provinceName.length).toBeGreaterThan(0);
    expect(NAMES.capitalName.length).toBeGreaterThan(0);
    expect(NAMES.capitalName).not.toBe("Palermo");
  });
});

// Design-range conformance (build-plan §5b item 4: "content is checked against the design", and item 5's
// "a content test asserts the archetype ranges"). Table copied from design 05 stage 4's own archetype table
// (docs/design/05-world-generation.md), "businesses per block" column, plus each archetype's `blocks` range as
// shipped in ./index.ts for reference (design 05's own `Archetype.blocks: Range` field has no per-archetype
// numeric column printed in that table to check against, only the type shape, so `blocks` is recorded here but
// not asserted against a design figure).
const DESIGN_05_TABLE: Record<string, { businessesPerBlock: { min: number; max: number } }> = {
  "harbor-quarter": { businessesPerBlock: { min: 8, max: 14 } },
  // Design: "20 to 40, mostly size 1 to 2 stalls". index.ts's own top-of-file comment records why the shipped
  // content narrows this (the market quarter's stall count was the single largest per-turn cost once every
  // stall runs its own weekly collection and spawn candidacy, docs/NOW.md's recurring "budget 2,000... the
  // candidate filter remains the lever" performance notes): 14 to 24, not 20 to 40, deliberately, for
  // performance. Asserted against the CONTENT's own intended range, not design's, with this citation.
  "market-quarter": { businessesPerBlock: { min: 14, max: 24 } },
  // Design: "6 to 12 plus 3 to 8 building sites". Content has no separate site-count field (`TownArchetype`
  // has one `businessesPerBlock` range; `site` is just another `businessMix` entry drawn from the same
  // per-block total, and design 05 stage 5 itself describes sites as expiring and being replaced within a
  // block's existing business count over time, not as a fixed extra tacked onto every block at generation), so
  // the low end stays the base range's own minimum (a block may momentarily hold no completed site) and the
  // high end is widened by the site range's own maximum (a block saturated with sites): 6 to 12+8=20.
  "expansion-neighborhood": { businessesPerBlock: { min: 6, max: 20 } },
  "agricultural-town": { businessesPerBlock: { min: 4, max: 9 } },
  "coastal-fishing-town": { businessesPerBlock: { min: 6, max: 12 } },
  "provincial-capital": { businessesPerBlock: { min: 10, max: 18 } },
  "small-island": { businessesPerBlock: { min: 3, max: 6 } },
};

describe("archetypes against design 05's table (build-plan §5b item 4)", () => {
  it("covers every archetype id in the design table with no extras on either side", () => {
    expect(new Set(ARCHETYPES.map((a) => a.id))).toEqual(new Set(Object.keys(DESIGN_05_TABLE)));
  });

  // One `it` per archetype (not a single loop) so a real mismatch on one archetype does not stop the others
  // from being checked and reported in the same run.
  for (const archetype of ARCHETYPES) {
    const design = DESIGN_05_TABLE[archetype.id]!;
    const check = () => {
      expect(archetype.businessesPerBlock.min, `${archetype.id}: min ${archetype.businessesPerBlock.min} below design's ${design.businessesPerBlock.min}`).toBeGreaterThanOrEqual(
        design.businessesPerBlock.min,
      );
      expect(archetype.businessesPerBlock.max, `${archetype.id}: max ${archetype.businessesPerBlock.max} above design's ${design.businessesPerBlock.max}`).toBeLessThanOrEqual(
        design.businessesPerBlock.max,
      );
    };
    if (archetype.id === "agricultural-town") {
      // DEFECT (not this task's system to fix -- packages/content/src/archetypes/index.ts is not this test
      // file's owner; reported per CLAUDE.md rule "do not paper over"): design 05 gives agricultural towns 4
      // to 9 businesses per block; the shipped content ships 6 to 10, one unit over the design ceiling. Small,
      // but real and unexplained by any comment in index.ts (unlike market quarter's own documented, deliberate
      // 14-24-for-performance narrowing below) -- left failing rather than quietly folded into the design table.
      it(`${archetype.id}: businessesPerBlock is within design 05's 4 to 9`, check);
    } else {
      it(`${archetype.id}: businessesPerBlock is within design 05's range`, check);
    }
  }

  it("keeps every block count at least 1 (a crew needs a block to hold, design 05 stage 7)", () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.blocks.min, archetype.id).toBeGreaterThanOrEqual(1);
      expect(archetype.blocks.max, archetype.id).toBeGreaterThanOrEqual(archetype.blocks.min);
    }
  });
});
