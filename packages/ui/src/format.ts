// Presentation-only helpers. Nothing here computes an outcome; it only turns PlayerView/Report data that
// already exists into text (design 07 §4: "the renderer never composes sentences" applies to game text —
// grouping and labelling existing lines and values is layout, not simulation).

import type { PlayerAction } from "@borgata/sim";
import type { Estimate, Lifestyle, Precision } from "@borgata/sim";

export type MeterView = { precision: Precision; value?: number; band?: Estimate };

/** Text marker for a precision level. Never color alone (design 07 §6). */
export function precisionMark(p: Precision): string {
  switch (p) {
    case "exact":
      return "";
    case "estimate":
      return "~";
    case "rumor":
      return "rumor:";
    case "hidden":
      return "";
  }
}

/** Render a meter (loyalty, exposure, weight, compliance, fear...) as text, honoring its precision. */
export function formatMeter(m: MeterView): string {
  if (m.precision === "hidden") return "unknown";
  if (m.value !== undefined) return `${precisionMark(m.precision)}${m.value}`.trim();
  if (m.band) return `${precisionMark(m.precision)}${m.band.low}-${m.band.high}`.trim();
  return m.precision;
}

const REFUSAL_MARKS = ["$", "x1", "x2", "x3", "x4"] as const;

/** The wireframe's one-letter business marker (design 07 §2.1): $ paying, x refusing at its stage. */
export function refusalMark(stage: number | null): string {
  if (stage === null) return "?";
  return REFUSAL_MARKS[stage] ?? `x${stage}`;
}

/** Group report lines the way the Report page does (design 07 §2.3): envelopes/money, family/people,
 *  the state, and everything else as notes. Pure text classification of lines `projectReport` already wrote. */
export type ReportGroup = "money" | "people" | "state" | "notes";

export function categorizeReportLine(line: string): ReportGroup {
  if (/\bkL\b/.test(line)) return "money";
  if (/arrested|is out\.|talking|now [a-z]/i.test(line)) return "people";
  if (/state's interest|Attention|band/i.test(line)) return "state";
  return "notes";
}

export function groupReportLines(lines: readonly string[]): Record<ReportGroup, string[]> {
  const out: Record<ReportGroup, string[]> = { money: [], people: [], state: [], notes: [] };
  for (const line of lines) out[categorizeReportLine(line)].push(line);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Design 12: obligations, the treasury and lifestyle. Pure text helpers over `view.book.duties`, `view.family`
// and `view.you.lifestyle`; nothing here computes an outcome, same rule as the rest of this file.
// ---------------------------------------------------------------------------------------------------------------

/** Tenore di vita (lifestyle) in words, shared by the header stat (Shell.tsx) and the Ordini form
 *  (Planning.tsx's `LifestyleForm`). */
export const LIFESTYLE_WORDS: Record<Lifestyle, string> = {
  modest: "Modesto (modest)",
  ordinary: "Ordinario (ordinary)",
  lavish: "Sfarzoso (lavish)",
};

/** The account an obligation's beneficiary resolves to when it has no character or family on it
 *  (view.ts's own fallback string for `beneficiary.kind === "external"`). Kept here, not re-derived, so this
 *  file and view.ts agree on the one case a duty's "to whom" names no one in particular. */
const NO_NAMED_BENEFICIARY = "the account";

/** A duty's kind in words (design 12 §1: "what" column of the Book's "I miei doveri"). `prisonerSupport` is
 *  the only kind whose beneficiary is a character today (view.ts), so it is the only one that names someone;
 *  the rest (a lawyer's fee, a funeral, a feast) pay an external account once the obligation is met
 *  (packages/content/src/templates/obligations.ts's own header, gap 3), so they read by kind alone unless a
 *  future template binds them to a person, in which case this still names them. */
export function dutyKindLabel(kind: string, beneficiaryName: string): string {
  const named = beneficiaryName !== NO_NAMED_BENEFICIARY;
  switch (kind) {
    case "prisonerSupport":
      return `support for ${beneficiaryName}'s family`;
    case "lawyer":
      return named ? `a lawyer for ${beneficiaryName}` : "a lawyer";
    case "funeral":
      return "the funeral";
    case "feast":
      return "the feast";
    case "fugitiveUpkeep":
      return named ? `upkeep for ${beneficiaryName}` : "upkeep for a fugitive";
    case "gift":
      return named ? `a gift for ${beneficiaryName}` : "a gift";
    case "charity":
      return "charity";
    default:
      return kind;
  }
}

/** "Due in N weeks" or "this week" (design 12 §1's story text), from `BookView.duties[].dueIn`. */
export function dutyDueLabel(dueIn: number): string {
  if (dueIn <= 0) return "this week";
  return `in ${dueIn} week${dueIn === 1 ? "" : "s"}`;
}

/** The family's state in words (design 12 §1/§2): healthy and weakened are named in the design; any other
 *  value (regency, dormant — "later" per design 12 §1's table) is shown as the core gives it rather than
 *  guessing its wording. */
export function familyStateLabel(state: string): string {
  if (state === "healthy") return "in salute (healthy)";
  if (state === "weakened") return "indebolita (weakened)";
  return state;
}

/** The treasury as an exact value (the head) or a band (everyone else), design 12 §2. */
export function formatTreasury(treasury: { precision: Precision; value?: number; band?: Estimate }): string {
  if (treasury.value !== undefined) return `${treasury.value} kL`;
  if (treasury.band) return `about ${treasury.band.low} to ${treasury.band.high} kL`;
  return formatMeter(treasury);
}

// ---------------------------------------------------------------------------------------------------------------
// Design 13 (disputes to the district, war): pure text helpers over `view.district`. Nothing here computes a
// standing value; `view.district[].standing` is already the core's band (view.ts's own ±150 rumor width).
// ---------------------------------------------------------------------------------------------------------------

/** Standing as a band word, from the band's centre (task brief): below -400 cold, -400 to -100 cool, -100 to
 *  100 even, 100 to 400 warm, above 400 close. Boundaries go to the cooler/lower-numbered word of the two
 *  ranges they sit between (a plain, documented choice; the design gives no tie-break of its own). The raw
 *  band (`Estimate.low`-`Estimate.high`) is shown on hover by the caller (Territory.tsx), not here: this
 *  function only ever returns the word. */
export function standingBandLabel(centre: number): string {
  if (centre < -400) return "cold";
  if (centre <= -100) return "cool";
  if (centre <= 100) return "even";
  if (centre <= 400) return "warm";
  return "close";
}

/** A family's standing with the player's own, from the band the core gives (`Estimate`): the word, and the raw
 *  band as a separate string for a hover title. The centre is exact from `low`/`high` (view.ts's own band is
 *  always `raw ± 150`, so `(low + high) / 2` recovers `raw` precisely; this file still computes it generically
 *  rather than assuming that width, in case the core's band ever changes). */
export function formatStanding(standing: Estimate): { word: string; raw: string } {
  const centre = (standing.low + standing.high) / 2;
  return { word: standingBandLabel(centre), raw: `${standing.low} to ${standing.high}` };
}

/** A short label for a queued PlayerAction, for the pending-actions list in Planning. */
export function describeAction(a: PlayerAction): string {
  switch (a.kind) {
    case "noop":
      return "do nothing";
    case "decide":
      return `decide ${a.instanceId}: ${a.optionId}`;
    case "setShare":
      return `set share for ${a.subordinateId}: ${a.rule.fixedPerTurn} kL + ${a.rule.percent / 10}%`;
    case "claimBusiness":
      return `claim business ${a.businessId}`;
    case "releaseClaim":
      return `release claim ${a.claimId}`;
    case "askPermission":
      return `ask sponsor: ${a.what}`;
    case "lend":
      return `prestito (loan) to ${a.businessId}: ${a.principal} kL at ${a.points} points`;
    case "setLifestyle":
      return `tenore di vita (lifestyle): ${a.lifestyle}`;
  }
}
