// Hand-built templates exercising the schema and the referential-integrity rules (design 06 §5). Every failing
// case supplies exactly one violation so the resulting error can be checked for naming both the template and
// the specific problem.

import { describe, expect, it } from "vitest";
import { validateTemplates } from "./schema.js";

const FACT_KINDS = ["HeatDelta", "MoneyMint"] as const;
const FN_NAMES = ["always", "never"] as const;
const OPTS = { factKinds: FACT_KINDS, fnNames: FN_NAMES };

/** A minimal, otherwise-valid template, loosely typed since several tests deliberately feed it invalid data
 * (an unknown fact kind, a dangling template id, ...) that a `ProcessTemplate`-typed fixture could not express.
 * Each test clones it and overrides exactly the field under test. */
function baseTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "state.raid.den",
    version: 1,
    kind: "event",
    scope: "town",
    lane: "state",
    roles: { town: { entity: "town", pick: "first" } },
    preconditions: [],
    duration: 3,
    resolve: [
      {
        id: "success",
        effects: [{ fact: "HeatDelta", townId: "$town", delta: 10 }],
        report: { sign: "The block got hotter.", visibility: "sign" },
      },
    ],
    followUps: [],
    tags: ["state"],
    ...overrides,
  };
}

describe("ProcessTemplateSchema / validateTemplates", () => {
  it("accepts a minimal valid template", () => {
    const result = validateTemplates([baseTemplate()], OPTS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0]!.id).toBe("state.raid.den");
    }
  });

  it("rejects a bad id format", () => {
    const result = validateTemplates([baseTemplate({ id: "BadId" })], OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("BadId"))).toBe(true);
    }
  });

  it("rejects a duration range with min > max", () => {
    const result = validateTemplates([baseTemplate({ duration: { min: 10, max: 5 } })], OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("state.raid.den"))).toBe(true);
    }
  });

  it("rejects an unknown fact kind", () => {
    const result = validateTemplates(
      [baseTemplate({ resolve: [{ id: "success", effects: [{ fact: "NotARealFact", townId: "$town" }] }] })],
      OPTS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("state.raid.den") && e.includes("NotARealFact"))).toBe(true);
    }
  });

  it("rejects an unknown predicate fn", () => {
    const result = validateTemplates(
      [baseTemplate({ preconditions: [{ fn: { name: "totallyUnregistered" } }] })],
      OPTS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("state.raid.den") && e.includes("totallyUnregistered"))).toBe(true);
    }
  });

  it("rejects a dangling followUp templateId", () => {
    const result = validateTemplates(
      [baseTemplate({ followUps: [{ templateId: "missing.template.id", delay: 1 }] })],
      OPTS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("state.raid.den") && e.includes("missing.template.id"))).toBe(true);
    }
  });

  it("rejects an undeclared role in an effect ($victim)", () => {
    const result = validateTemplates(
      [
        baseTemplate({
          resolve: [
            {
              id: "success",
              effects: [{ fact: "HeatDelta", townId: "$town", extra: "$victim" }],
            },
          ],
        }),
      ],
      OPTS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("state.raid.den") && e.includes("victim"))).toBe(true);
    }
  });

  it("rejects an undeclared role in a predicate", () => {
    const result = validateTemplates([baseTemplate({ preconditions: [{ alive: { role: "ghost" } }] })], OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("state.raid.den") && e.includes("ghost"))).toBe(true);
    }
  });

  it("rejects a decision aiDefault that is not an option id", () => {
    const result = validateTemplates(
      [
        baseTemplate({
          decision: {
            role: "town",
            prompt: "choose",
            options: [
              { id: "a", label: "A", effects: [] },
              { id: "b", label: "B", effects: [] },
            ],
            aiDefault: "c",
            timeoutTurns: 2,
            timeoutOption: "a",
          },
        }),
      ],
      OPTS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("state.raid.den") && e.includes("aiDefault"))).toBe(true);
    }
  });

  it("rejects duplicate template ids", () => {
    const result = validateTemplates([baseTemplate(), baseTemplate()], OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("state.raid.den") && e.includes("duplicate"))).toBe(true);
    }
  });

  // build-plan §5b item 8(b): "no silent consequences" -- an option without a hint, an outcome that changes
  // state without a report line, and a decision template with no top-level report text.

  it("rejects a decision option with no hint", () => {
    const result = validateTemplates(
      [
        baseTemplate({
          decision: {
            role: "town",
            prompt: "choose",
            options: [
              { id: "a", label: "A", effects: [] }, // no hint
              { id: "b", label: "B", hint: "Costs nothing, does nothing.", effects: [] },
            ],
            aiDefault: "a",
            timeoutTurns: 2,
            timeoutOption: "a",
          },
          report: { sign: "Someone must choose.", visibility: "sign" },
        }),
      ],
      OPTS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('state.raid.den: option a has no hint');
    }
  });

  it("rejects an outcome with a fact effect and no report line", () => {
    const result = validateTemplates(
      [
        baseTemplate({
          resolve: [{ id: "success", effects: [{ fact: "HeatDelta", townId: "$town", delta: 10 }] }],
        }),
      ],
      OPTS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("state.raid.den: outcome success changes state without a report line");
    }
  });

  it("allows a silent outcome when the template's own report visibility is none", () => {
    const result = validateTemplates(
      [
        baseTemplate({
          resolve: [{ id: "success", effects: [{ fact: "HeatDelta", townId: "$town", delta: 10 }] }],
          report: { visibility: "none" },
        }),
      ],
      OPTS,
    );
    expect(result.ok).toBe(true);
  });

  it("allows a silent outcome when the template is tagged internal", () => {
    const result = validateTemplates(
      [
        baseTemplate({
          resolve: [{ id: "success", effects: [{ fact: "HeatDelta", townId: "$town", delta: 10 }] }],
          tags: ["state", "internal"],
        }),
      ],
      OPTS,
    );
    expect(result.ok).toBe(true);
  });

  it("allows an outcome with no effects to stay silent", () => {
    const result = validateTemplates([baseTemplate({ resolve: [{ id: "success", effects: [] }] })], OPTS);
    expect(result.ok).toBe(true);
  });

  it("rejects a decision template with no top-level report text", () => {
    const result = validateTemplates(
      [
        baseTemplate({
          decision: {
            role: "town",
            prompt: "choose",
            options: [{ id: "a", label: "A", hint: "Costs nothing, does nothing.", effects: [] }],
            aiDefault: "a",
            timeoutTurns: 2,
            timeoutOption: "a",
          },
          // no top-level report
        }),
      ],
      OPTS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("state.raid.den: decision template has no report text");
    }
  });
});
