// Pure-helper tests for design 12's Book/Shell wording (format.ts). No store, no world: these functions take
// plain values and return text, same contract as the rest of format.ts.

import { describe, expect, it } from "vitest";
import { dutyDueLabel, dutyKindLabel, familyStateLabel, formatStanding, formatTreasury, standingBandLabel } from "./format.js";

describe("dutyKindLabel", () => {
  it("names the beneficiary for prisonerSupport", () => {
    expect(dutyKindLabel("prisonerSupport", "Turi")).toBe("support for Turi's family");
  });

  it("names the beneficiary for lawyer when one is known", () => {
    expect(dutyKindLabel("lawyer", "Turi")).toBe("a lawyer for Turi");
  });

  it("falls back to the kind alone for lawyer when the beneficiary is the external account", () => {
    expect(dutyKindLabel("lawyer", "the account")).toBe("a lawyer");
  });

  it("reads funeral and feast by kind alone regardless of beneficiary", () => {
    expect(dutyKindLabel("funeral", "the account")).toBe("the funeral");
    expect(dutyKindLabel("feast", "the account")).toBe("the feast");
  });

  it("falls back to the raw kind for an unrecognized kind", () => {
    expect(dutyKindLabel("somethingNew", "the account")).toBe("somethingNew");
  });
});

describe("dutyDueLabel", () => {
  it("reads 'this week' for zero or negative dueIn", () => {
    expect(dutyDueLabel(0)).toBe("this week");
    expect(dutyDueLabel(-1)).toBe("this week");
  });

  it("pluralizes weeks correctly", () => {
    expect(dutyDueLabel(1)).toBe("in 1 week");
    expect(dutyDueLabel(3)).toBe("in 3 weeks");
  });
});

describe("familyStateLabel", () => {
  it("words healthy and weakened", () => {
    expect(familyStateLabel("healthy")).toBe("in salute (healthy)");
    expect(familyStateLabel("weakened")).toBe("indebolita (weakened)");
  });

  it("passes through an unrecognized state as given", () => {
    expect(familyStateLabel("regency")).toBe("regency");
  });
});

describe("formatTreasury", () => {
  it("renders an exact value for the head", () => {
    expect(formatTreasury({ precision: "exact", value: 540 })).toBe("540 kL");
  });

  it("renders a band as 'about low to high kL' below the head", () => {
    expect(formatTreasury({ precision: "estimate", band: { low: 400, high: 700 } })).toBe("about 400 to 700 kL");
  });
});

// Design 13 (disputes to the district, war): standing as a band word, task brief thresholds (below -400, -400
// to -100, -100 to 100, 100 to 400, above 400). A boundary shared by two adjacent ranges (e.g. -400, which is
// both "below -400"'s edge and "-400 to -100"'s edge) resolves to the cooler/lower-numbered word, per
// standingBandLabel's own header comment.
describe("standingBandLabel", () => {
  it("reads the five bands from their centre", () => {
    expect(standingBandLabel(-1000)).toBe("cold");
    expect(standingBandLabel(-401)).toBe("cold");
    expect(standingBandLabel(-400)).toBe("cool"); // boundary: -400 to -100
    expect(standingBandLabel(-250)).toBe("cool");
    expect(standingBandLabel(-100)).toBe("cool"); // boundary: -100 to 100
    expect(standingBandLabel(-99)).toBe("even");
    expect(standingBandLabel(0)).toBe("even");
    expect(standingBandLabel(100)).toBe("even"); // boundary: 100 to 400
    expect(standingBandLabel(101)).toBe("warm");
    expect(standingBandLabel(250)).toBe("warm");
    expect(standingBandLabel(400)).toBe("warm"); // boundary: above 400
    expect(standingBandLabel(401)).toBe("close");
    expect(standingBandLabel(1000)).toBe("close");
  });
});

describe("formatStanding", () => {
  it("takes the band's exact centre as the word, and keeps the raw band as text", () => {
    // view.ts's own band is always raw ± 150, so the centre recovers raw exactly.
    expect(formatStanding({ low: -50, high: 350 })).toEqual({ word: "warm", raw: "-50 to 350" });
    expect(formatStanding({ low: -650, high: -350 })).toEqual({ word: "cold", raw: "-650 to -350" });
  });
});
