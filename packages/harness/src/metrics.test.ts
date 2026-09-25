// Tests for career metrics (design 08 §3, §9): aggregate on hand-built data, and collectCareer on a short
// run of the real starter world so a state-system change that breaks the loop is caught quickly.

import { describe, expect, it } from "vitest";
import { loadContent } from "@borgata/content";
import type { GameSetup } from "@borgata/sim";
import { aggregate, collectCareer, type CareerMetrics } from "./metrics.js";
import { makeAiPlayer } from "./ai-player.js";
import { careers } from "./index.js";

const SETUP: GameSetup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false };

function career(overrides: Partial<CareerMetrics>): CareerMetrics {
  return {
    seed: "s",
    turnsRequested: 10,
    turnsRun: 10,
    totalMinted: 0,
    finalTreasury: 0,
    arrests: 0,
    cooperations: 0,
    everSoldierOrAssociate: 1,
    collaboratorRate: 0,
    bandOccupancy: [1, 0, 0, 0, 0],
    peakHeatByTown: {},
    loyaltyMean: 0,
    detainedAtEnd: 0,
    violation: null,
    turnsToProposal: null,
    endedInRank: false,
    decisionsPerTurn: [],
    favorAccepts: 0,
    favorBadOutcomes: 0,
    cardGameBankedWeeks: 0,
    cardGameBigLossWeeks: 0,
    arrestsOfPlayer: 0,
    obligationsOpened: 0,
    obligationsMet: 0,
    obligationsMissed: 0,
    detentionsSupported: 0,
    detentionsSupportedFlipped: 0,
    detentionsUnsupported: 0,
    detentionsUnsupportedFlipped: 0,
    familyWeakenedTurns: 0,
    lifestyleAtEnd: "modest",
    lifestyleSpend: 0,
    disputesCrewResolved: 0,
    disputesFamilyResolved: 0,
    disputesDistrictResolved: 0,
    districtSitdownsFollowedByWar: 0,
    warsDeclared: 0,
    warLengths: [],
    peaceByMeeting: 0,
    peaceByExhaustion: 0,
    ...overrides,
  };
}

describe("aggregate", () => {
  it("computes min/median/max across seeds for scalar metrics", () => {
    const list = [
      career({ seed: "a", totalMinted: 100, finalTreasury: 10, arrests: 2, cooperations: 1, turnsRun: 100 }),
      career({ seed: "b", totalMinted: 300, finalTreasury: 30, arrests: 4, cooperations: 3, turnsRun: 100 }),
      career({ seed: "c", totalMinted: 200, finalTreasury: 20, arrests: 6, cooperations: 5, turnsRun: 100 }),
    ];
    const d = aggregate(list);
    expect(d.seeds).toBe(3);
    expect(d.totalMinted).toEqual({ min: 100, median: 200, max: 300 });
    expect(d.finalTreasury).toEqual({ min: 10, median: 20, max: 30 });
    expect(d.arrests).toEqual({ min: 2, median: 4, max: 6 });
    expect(d.cooperations).toEqual({ min: 1, median: 3, max: 5 });
    // 2/100, 4/100, 6/100 turns -> per-100-turns rate equals the raw count here
    expect(d.arrestsPer100Turns).toEqual({ min: 2, median: 4, max: 6 });
  });

  it("averages the even-length median of two middle values", () => {
    const list = [career({ arrests: 1 }), career({ arrests: 2 }), career({ arrests: 3 }), career({ arrests: 4 })];
    expect(aggregate(list).arrests.median).toBe(2.5);
  });

  it("aggregates band occupancy per band and peak heat per town", () => {
    const list = [
      career({ seed: "a", bandOccupancy: [0.9, 0.1, 0, 0, 0], peakHeatByTown: { "town-1": 100, "town-2": 50 } }),
      career({ seed: "b", bandOccupancy: [0.7, 0.2, 0.1, 0, 0], peakHeatByTown: { "town-1": 300 } }),
    ];
    const d = aggregate(list);
    expect(d.bandOccupancy[0]).toEqual({ min: 0.7, median: 0.8, max: 0.9 });
    expect(d.bandOccupancy[2]).toEqual({ min: 0, median: 0.05, max: 0.1 });
    expect(d.peakHeatByTown["town-1"]).toEqual({ min: 100, median: 200, max: 300 });
    // seed "b" never observed town-2, so it counts as 0 for that seed.
    expect(d.peakHeatByTown["town-2"]).toEqual({ min: 0, median: 25, max: 50 });
  });

  it("collects invariant violations and leaves them out of no-violation runs", () => {
    const clean = aggregate([career({ seed: "a" }), career({ seed: "b" })]);
    expect(clean.violations).toEqual([]);

    const withViolation = aggregate([career({ seed: "a" }), career({ seed: "b", violation: { turn: 7, names: ["ledger.conservation"] } })]);
    expect(withViolation.violations).toEqual([{ seed: "b", turn: 7, names: ["ledger.conservation"] }]);
  });

  it("returns zeroed stats for an empty list", () => {
    const d = aggregate([]);
    expect(d.seeds).toBe(0);
    expect(d.arrests).toEqual({ min: 0, median: 0, max: 0 });
  });
});

// Hand-built inputs for the first-ranks aggregation (design 09 §10, first-ranks-requirements §8). No
// full career run is exercised here: the smoke run below (`describe("careers")`) covers that.
describe("aggregate: first-ranks metrics", () => {
  it("pools turnsToProposal over careers that reached it and reports the reached share separately", () => {
    const list = [
      career({ seed: "a", turnsToProposal: 20 }),
      career({ seed: "b", turnsToProposal: 30 }),
      career({ seed: "c", turnsToProposal: null }), // never made in this run
      career({ seed: "d", turnsToProposal: null }),
    ];
    const d = aggregate(list);
    expect(d.turnsToProposal).toEqual({ min: 20, median: 25, max: 30 });
    expect(d.turnsToProposalReachedShare).toBe(0.5);
  });

  it("returns a zeroed turnsToProposal stat and a 0 reached share when nobody ever left associate", () => {
    const d = aggregate([career({ seed: "a" }), career({ seed: "b" })]);
    expect(d.turnsToProposal).toEqual({ min: 0, median: 0, max: 0 });
    expect(d.turnsToProposalReachedShare).toBe(0);
  });

  it("computes the share of careers ending in the rank", () => {
    const list = [
      career({ seed: "a", endedInRank: true }),
      career({ seed: "b", endedInRank: false }),
      career({ seed: "c", endedInRank: false }),
      career({ seed: "d", endedInRank: false }),
    ];
    expect(aggregate(list).endedInRankShare).toBe(0.25);
  });

  it("pools decisionsPerTurn across every turn of every career, not per-career", () => {
    const list = [career({ seed: "a", decisionsPerTurn: [1, 2, 3] }), career({ seed: "b", decisionsPerTurn: [2, 2] })];
    const d = aggregate(list);
    // pooled: [1, 2, 3, 2, 2] -> sorted [1, 2, 2, 2, 3] -> median 2
    expect(d.decisionsPerTurn).toEqual({ min: 1, median: 2, max: 3 });
    expect(d.decisionsPerTurnShareAtLeast2).toBeCloseTo(4 / 5, 10);
  });

  it("returns a 0 share when no turns were observed", () => {
    const d = aggregate([career({ seed: "a", decisionsPerTurn: [] })]);
    expect(d.decisionsPerTurn).toEqual({ min: 0, median: 0, max: 0 });
    expect(d.decisionsPerTurnShareAtLeast2).toBe(0);
  });

  it("sums favor accepts and bad outcomes across careers into a pooled share", () => {
    const list = [
      career({ seed: "a", favorAccepts: 8, favorBadOutcomes: 1 }),
      career({ seed: "b", favorAccepts: 12, favorBadOutcomes: 1 }),
    ];
    const d = aggregate(list);
    expect(d.favorOutcomes).toEqual({ accepts: 20, bad: 2, share: 0.1 });
  });

  it("reports a 0 favor share when no favors were ever accepted", () => {
    const d = aggregate([career({ seed: "a", favorAccepts: 0, favorBadOutcomes: 0 })]);
    expect(d.favorOutcomes).toEqual({ accepts: 0, bad: 0, share: 0 });
  });

  it("sums banked card-game weeks and big-loss weeks across careers into a pooled share", () => {
    const list = [
      career({ seed: "a", cardGameBankedWeeks: 15, cardGameBigLossWeeks: 1 }),
      career({ seed: "b", cardGameBankedWeeks: 25, cardGameBigLossWeeks: 1 }),
    ];
    const d = aggregate(list);
    expect(d.cardGame).toEqual({ banked: 40, bigLoss: 2, share: 0.05 });
  });

  it("aggregates arrestsOfPlayer per career like the other per-career stats", () => {
    const list = [career({ seed: "a", arrestsOfPlayer: 0 }), career({ seed: "b", arrestsOfPlayer: 1 }), career({ seed: "c", arrestsOfPlayer: 3 })];
    expect(aggregate(list).arrestsOfPlayer).toEqual({ min: 0, median: 1, max: 3 });
  });
});

// Hand-built inputs for the duties aggregation (design 12 §1, §4). No full career run is exercised here: the
// smoke run below (`describe("careers")`) covers that.
describe("aggregate: duties metrics", () => {
  it("pools obligations opened/met/missed across careers into a pooled met share", () => {
    const list = [
      career({ seed: "a", obligationsOpened: 5, obligationsMet: 3, obligationsMissed: 1 }),
      career({ seed: "b", obligationsOpened: 2, obligationsMet: 1, obligationsMissed: 1 }),
    ];
    const d = aggregate(list);
    expect(d.obligations.opened).toBe(7);
    expect(d.obligations.met).toBe(4);
    expect(d.obligations.missed).toBe(2);
    expect(d.obligations.metShare).toBeCloseTo(4 / 6, 10);
  });

  it("reports a 0 met share when no obligations ever came due", () => {
    const d = aggregate([career({ seed: "a" })]);
    expect(d.obligations).toEqual({ opened: 0, met: 0, missed: 0, metShare: 0 });
  });

  it("computes the supported/unsupported detention flip rates and their ratio", () => {
    const list = [
      career({ seed: "a", detentionsSupported: 20, detentionsSupportedFlipped: 2, detentionsUnsupported: 20, detentionsUnsupportedFlipped: 8 }),
    ];
    const d = aggregate(list);
    expect(d.detentionFlip).toEqual({
      supportedCount: 20,
      supportedFlips: 2,
      supportedRate: 0.1,
      unsupportedCount: 20,
      unsupportedFlips: 8,
      unsupportedRate: 0.4,
      ratio: 0.25,
    });
  });

  it("sums detention counts across careers before taking the rate (pooled, not per-career averaged)", () => {
    const list = [
      career({ seed: "a", detentionsSupported: 10, detentionsSupportedFlipped: 1, detentionsUnsupported: 10, detentionsUnsupportedFlipped: 4 }),
      career({ seed: "b", detentionsSupported: 10, detentionsSupportedFlipped: 1, detentionsUnsupported: 10, detentionsUnsupportedFlipped: 4 }),
    ];
    const d = aggregate(list);
    expect(d.detentionFlip.supportedCount).toBe(20);
    expect(d.detentionFlip.supportedRate).toBeCloseTo(0.1, 10);
    expect(d.detentionFlip.unsupportedRate).toBeCloseTo(0.4, 10);
  });

  it("returns a null ratio when the unsupported rate is 0 (avoids dividing by zero)", () => {
    const d = aggregate([career({ seed: "a", detentionsSupported: 5, detentionsSupportedFlipped: 0, detentionsUnsupported: 5, detentionsUnsupportedFlipped: 0 })]);
    expect(d.detentionFlip.unsupportedRate).toBe(0);
    expect(d.detentionFlip.ratio).toBeNull();
  });

  it("returns zeroed detention rates when no detentions were ever tracked", () => {
    const d = aggregate([career({ seed: "a" })]);
    expect(d.detentionFlip).toEqual({
      supportedCount: 0,
      supportedFlips: 0,
      supportedRate: 0,
      unsupportedCount: 0,
      unsupportedFlips: 0,
      unsupportedRate: 0,
      ratio: null,
    });
  });

  it("computes the per-career share of turns the family was weakened as a Stat", () => {
    const list = [
      career({ seed: "a", familyWeakenedTurns: 5, turnsRun: 10 }),
      career({ seed: "b", familyWeakenedTurns: 0, turnsRun: 10 }),
    ];
    const d = aggregate(list);
    expect(d.familyWeakenedShare).toEqual({ min: 0, median: 0.25, max: 0.5 });
  });

  it("counts careers ending at each lifestyle", () => {
    const list = [
      career({ seed: "a", lifestyleAtEnd: "modest" }),
      career({ seed: "b", lifestyleAtEnd: "ordinary" }),
      career({ seed: "c", lifestyleAtEnd: "lavish" }),
      career({ seed: "d", lifestyleAtEnd: "modest" }),
    ];
    const d = aggregate(list);
    expect(d.lifestyleAtEnd).toEqual({ modest: 2, ordinary: 1, lavish: 1 });
  });

  it("computes a Stat over each career's total lifestyle spend", () => {
    const list = [career({ seed: "a", lifestyleSpend: 0 }), career({ seed: "b", lifestyleSpend: 100 }), career({ seed: "c", lifestyleSpend: 200 })];
    expect(aggregate(list).lifestyleSpend).toEqual({ min: 0, median: 100, max: 200 });
  });
});

// Hand-built inputs for the district aggregation (design 13 §1, §2, §4). No full career run is exercised here
// (the smoke run below covers that end to end); these pin the pooling rules on fixed numbers.
describe("aggregate: district metrics", () => {
  it("computes disputes per 100 turns by level as a per-career rate, then min/median/max", () => {
    const list = [
      career({ seed: "a", turnsRun: 100, disputesCrewResolved: 4, disputesFamilyResolved: 2, disputesDistrictResolved: 1 }),
      career({ seed: "b", turnsRun: 200, disputesCrewResolved: 4, disputesFamilyResolved: 2, disputesDistrictResolved: 1 }),
    ];
    const d = aggregate(list);
    // a: 4/100*100=4, 2/100*100=2, 1/100*100=1; b: 4/200*100=2, 2/200*100=1, 1/200*100=0.5
    expect(d.district.disputesCrewPer100Turns).toEqual({ min: 2, median: 3, max: 4 });
    expect(d.district.disputesFamilyPer100Turns).toEqual({ min: 1, median: 1.5, max: 2 });
    expect(d.district.disputesDistrictPer100Turns).toEqual({ min: 0.5, median: 0.75, max: 1 });
  });

  it("treats a zero-turn career as a zero rate rather than dividing by zero", () => {
    const d = aggregate([career({ seed: "a", turnsRun: 0, disputesCrewResolved: 3 })]);
    expect(d.district.disputesCrewPer100Turns).toEqual({ min: 0, median: 0, max: 0 });
  });

  it("pools district sit-downs and the ones followed by war into one share across careers", () => {
    const list = [
      career({ seed: "a", disputesDistrictResolved: 10, districtSitdownsFollowedByWar: 1 }),
      career({ seed: "b", disputesDistrictResolved: 10, districtSitdownsFollowedByWar: 3 }),
    ];
    const d = aggregate(list);
    expect(d.district.districtSitdownsTotal).toBe(20);
    expect(d.district.districtWarShare).toBeCloseTo(0.2, 10);
  });

  it("reports a 0 war share when no district sit-downs were observed", () => {
    const d = aggregate([career({ seed: "a" })]);
    expect(d.district.districtSitdownsTotal).toBe(0);
    expect(d.district.districtWarShare).toBe(0);
  });

  it("pools war lengths across every war any career saw conclude", () => {
    const list = [career({ seed: "a", warLengths: [4, 8] }), career({ seed: "b", warLengths: [12] })];
    const d = aggregate(list);
    expect(d.district.warLength).toEqual({ min: 4, median: 8, max: 12 });
    expect(d.district.warsEndedTotal).toBe(3);
  });

  it("returns a zeroed war length stat and 0 wars ended when no war ever concluded", () => {
    const d = aggregate([career({ seed: "a" }), career({ seed: "b" })]);
    expect(d.district.warLength).toEqual({ min: 0, median: 0, max: 0 });
    expect(d.district.warsEndedTotal).toBe(0);
  });

  it("sums wars declared into a per-100-turns rate and a pooled total", () => {
    const list = [career({ seed: "a", turnsRun: 100, warsDeclared: 2 }), career({ seed: "b", turnsRun: 100, warsDeclared: 4 })];
    const d = aggregate(list);
    expect(d.district.warsPer100Turns).toEqual({ min: 2, median: 3, max: 4 });
    expect(d.district.warsDeclaredTotal).toBe(6);
  });

  it("sums peace by meeting and by exhaustion across careers without turning them into a share", () => {
    const list = [
      career({ seed: "a", peaceByMeeting: 3, peaceByExhaustion: 1 }),
      career({ seed: "b", peaceByMeeting: 2, peaceByExhaustion: 0 }),
    ];
    const d = aggregate(list);
    expect(d.district.peaceByMeeting).toBe(5);
    expect(d.district.peaceByExhaustion).toBe(1);
  });
});

describe("collectCareer", () => {
  it("runs 12 turns of the starter world without invariant violations", () => {
    const content = loadContent();
    const ai = makeAiPlayer("quiet");
    const m = collectCareer("metrics-test-seed", SETUP, content, 12, ai);

    expect(m.violation).toBeNull();
    expect(m.turnsRun).toBe(12);
    expect(m.turnsRequested).toBe(12);
    expect(m.everSoldierOrAssociate).toBeGreaterThanOrEqual(1);
    expect(m.collaboratorRate).toBeGreaterThanOrEqual(0);
    expect(m.bandOccupancy).toHaveLength(5);
    // Shares of turns spent in bands 0..4, averaged across families, sum to ~1 per family.
    expect(m.bandOccupancy.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(m.loyaltyMean).toBeGreaterThanOrEqual(0);
    expect(m.detainedAtEnd).toBeGreaterThanOrEqual(0);
    expect(m.finalTreasury).toBeGreaterThanOrEqual(0);
    expect(m.totalMinted).toBeGreaterThanOrEqual(0);
    // Not asserting arrest/cooperation counts: the state systems that produce them are still being tuned.
  });
});

// One full careers run, short (10 turns is too few to hit the design 09 §10 bands, e.g. turnsToProposal's
// 25-35 window), just to prove the new fields wire together end to end without throwing.
describe("careers: first-ranks smoke run", () => {
  it("runs 3 seeds x 10 turns with yesMan and produces well-shaped first-ranks metrics", () => {
    const content = loadContent();
    const r = careers(content, 3, 10, "yesMan");

    expect(r.list).toHaveLength(3);
    for (const m of r.list) {
      expect(m.decisionsPerTurn).toHaveLength(m.turnsRun);
      expect(m.favorAccepts).toBeGreaterThanOrEqual(0);
      expect(m.favorBadOutcomes).toBeLessThanOrEqual(m.favorAccepts);
      expect(m.cardGameBigLossWeeks).toBeLessThanOrEqual(m.cardGameBankedWeeks);
      expect(m.arrestsOfPlayer).toBeGreaterThanOrEqual(0);
      expect(m.turnsToProposal === null || m.turnsToProposal >= 0).toBe(true);
    }

    const d = r.distribution;
    expect(d.decisionsPerTurn.min).toBeGreaterThanOrEqual(0);
    expect(d.decisionsPerTurnShareAtLeast2).toBeGreaterThanOrEqual(0);
    expect(d.decisionsPerTurnShareAtLeast2).toBeLessThanOrEqual(1);
    expect(d.favorOutcomes.bad).toBeLessThanOrEqual(d.favorOutcomes.accepts);
    expect(d.cardGame.bigLoss).toBeLessThanOrEqual(d.cardGame.banked);
    expect(d.turnsToProposalReachedShare).toBeGreaterThanOrEqual(0);
    expect(d.turnsToProposalReachedShare).toBeLessThanOrEqual(1);
    expect(d.endedInRankShare).toBeGreaterThanOrEqual(0);
    expect(d.endedInRankShare).toBeLessThanOrEqual(1);
  });
});

// A short smoke run (3 seeds x 20 turns, task brief item 3): 20 turns reaches the soldier opening and the
// yesMan-only lifestyle request often enough to prove the duties fields wire together end to end without
// throwing, though it is too short to say anything about the design 12 bands themselves (the CLI's own
// careers command, run separately over many more seeds and turns, reports those).
describe("careers: duties smoke run", () => {
  it("runs 3 seeds x 20 turns with yesMan and produces well-shaped duties metrics", () => {
    const content = loadContent();
    const r = careers(content, 3, 20, "yesMan");

    expect(r.list).toHaveLength(3);
    for (const m of r.list) {
      expect(m.obligationsOpened).toBeGreaterThanOrEqual(0);
      expect(m.obligationsMet).toBeGreaterThanOrEqual(0);
      expect(m.obligationsMissed).toBeGreaterThanOrEqual(0);
      expect(m.detentionsSupported).toBeGreaterThanOrEqual(0);
      expect(m.detentionsSupportedFlipped).toBeLessThanOrEqual(m.detentionsSupported);
      expect(m.detentionsUnsupported).toBeGreaterThanOrEqual(0);
      expect(m.detentionsUnsupportedFlipped).toBeLessThanOrEqual(m.detentionsUnsupported);
      expect(m.familyWeakenedTurns).toBeGreaterThanOrEqual(0);
      expect(m.familyWeakenedTurns).toBeLessThanOrEqual(m.turnsRun);
      expect(["modest", "ordinary", "lavish"]).toContain(m.lifestyleAtEnd);
      expect(m.lifestyleSpend).toBeGreaterThanOrEqual(0);
    }

    const d = r.distribution;
    expect(d.obligations.met).toBeLessThanOrEqual(d.obligations.opened + d.obligations.missed + d.obligations.met);
    expect(d.obligations.metShare).toBeGreaterThanOrEqual(0);
    expect(d.obligations.metShare).toBeLessThanOrEqual(1);
    expect(d.detentionFlip.supportedRate).toBeGreaterThanOrEqual(0);
    expect(d.detentionFlip.unsupportedRate).toBeGreaterThanOrEqual(0);
    expect(d.familyWeakenedShare.min).toBeGreaterThanOrEqual(0);
    expect(d.familyWeakenedShare.max).toBeLessThanOrEqual(1);
    expect(d.lifestyleAtEnd.modest + d.lifestyleAtEnd.ordinary + d.lifestyleAtEnd.lavish).toBe(3);
    expect(d.lifestyleSpend.min).toBeGreaterThanOrEqual(0);
  });
});

// A short smoke run for the district metrics (design 13, task brief item 3): proves the fields wire together
// end to end. As of this writing `dispute.stall.crew`, `dispute.claim`, `dispute.district.sitdown`, `war.declare`,
// `war.meeting` and `war.exhaustion` are two other agents' in-flight content (design 13 §4 wave a/b); until they
// are registered every count here is legitimately 0, which this test accepts rather than requiring content that
// may not exist yet.
describe("careers: district smoke run", () => {
  it("runs 3 seeds x 20 turns with yesMan and produces well-shaped district metrics (zeros if the content is not there yet)", () => {
    const content = loadContent();
    const r = careers(content, 3, 20, "yesMan");

    expect(r.list).toHaveLength(3);
    for (const m of r.list) {
      expect(m.disputesCrewResolved).toBeGreaterThanOrEqual(0);
      expect(m.disputesFamilyResolved).toBeGreaterThanOrEqual(0);
      expect(m.disputesDistrictResolved).toBeGreaterThanOrEqual(0);
      expect(m.districtSitdownsFollowedByWar).toBeLessThanOrEqual(m.disputesDistrictResolved);
      expect(m.warsDeclared).toBeGreaterThanOrEqual(0);
      expect(m.warLengths.every((n) => n >= 0)).toBe(true);
      expect(m.peaceByMeeting).toBeGreaterThanOrEqual(0);
      expect(m.peaceByExhaustion).toBeGreaterThanOrEqual(0);
    }

    const d = r.distribution.district;
    expect(d.districtSitdownsTotal).toBeGreaterThanOrEqual(0);
    expect(d.districtWarShare).toBeGreaterThanOrEqual(0);
    expect(d.districtWarShare).toBeLessThanOrEqual(1);
    expect(d.warsDeclaredTotal).toBeGreaterThanOrEqual(0);
    expect(d.warsEndedTotal).toBeGreaterThanOrEqual(0);
  });
});
