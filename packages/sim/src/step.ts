// The one public operation of the core (design 01 §3): world + actions + content -> next world + log + report.

import { canonicalJson, hash64 } from "@borgata/shared";
import type { Content } from "./content-types.js";
import type { Fact } from "./facts.js";
import { TurnLogBuilder, projectReport, type Report, type TurnLog } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { advanceCalendar } from "./reducers/calendar.js";
import { runInvariants } from "./invariants/all.js";
import { familyAi } from "./ai/family-ai.js";
import { runChains } from "./systems/chains.js";
import { applyShares } from "./systems/shares.js";
import { decayLoyalty, decayFavors, decayStanding } from "./reducers/relationships.js";
import { decaySentiment } from "./reducers/towns.js";
import { releaseDetainees } from "./reducers/characters.js";
import { sweepRequests } from "./reducers/progression.js";
import { exposureFromActivity } from "./systems/exposure-sources.js";
import { decayPressure, recomputeBands } from "./systems/pressure.js";
import { runScheduler, type PlayerDecision } from "./engine/scheduler.js";
import { ingestPlayerActions } from "./systems/player-actions.js";
import { progressionStep } from "./systems/progression.js";
import { recordStep } from "./systems/record.js";
import { loansStep } from "./systems/loans.js";
import { obligationsStep } from "./systems/obligations.js";
import { successionStep } from "./systems/succession.js";
import type { RecentFact } from "./engine/types.js";
import type { World } from "./world.js";

/** Player actions. Phase 0 has only the empty action; later phases add the real ones (design 07). */
export type PlayerAction =
  | { kind: "noop" }
  | { kind: "decide"; instanceId: string; optionId: string }
  | { kind: "setShare"; subordinateId: string; rule: { fixedPerTurn: number; percent: number } }
  | { kind: "claimBusiness"; businessId: string }
  | { kind: "releaseClaim"; claimId: string }
  | { kind: "askPermission"; what: "makeAssociate" | "openBook"; targetId?: string }
  | { kind: "lend"; businessId: string; principal: number; points: number }
  | { kind: "setLifestyle"; lifestyle: "modest" | "ordinary" | "lavish" }; // design 12

export type StepOptions = {
  /** Run all invariants and halt on violation. Default true; the harness turns it off for speed sweeps. */
  debug?: boolean;
  /** Facts injected before apply. For tests and the harness only; never used by the UI. */
  injectFacts?: readonly Fact[];
  /** Compute the world hash after the step (about 5 ms on a full province). Default true; bulk harness runs turn it off
   *  and hash only the final world. */
  hash?: boolean;
};

export type StepResult = { world: World; log: TurnLog; report: Report; hash: string };

export class InvariantViolationError extends Error {
  constructor(readonly turn: number, readonly violations: ReadonlyArray<{ name: string; message: string }>) {
    super(`invariant violations at turn ${turn}: ${violations.map((v) => `${v.name} (${v.message})`).join("; ")}`);
  }
}

export function worldHash(world: World): string {
  return hash64(canonicalJson(world));
}

export function step(world: World, actions: readonly PlayerAction[], content: Content, opts: StepOptions = {}): StepResult {
  const debug = opts.debug ?? true;
  const w: World = structuredClone(world);
  const log = new TurnLogBuilder(w.meta.turn);
  const facts: Fact[] = [];

  // 1. Ingest actions: decisions go to the engine; everything else becomes Facts via the player-actions system.
  const decisions: PlayerDecision[] = [];
  const others: PlayerAction[] = [];
  for (const a of actions) {
    if (a.kind === "decide") decisions.push({ instanceId: a.instanceId, optionId: a.optionId });
    else if (a.kind !== "noop") others.push(a);
  }
  const ingested = ingestPlayerActions(w, others);
  for (const r of ingested.rejected) log.note(`action ${r.action.kind} rejected: ${r.reason}`, "player");
  facts.push(...ingested.facts);

  w.ledger.turnIncome = {};

  // Lane 1 (design 04 §4): the state reacts to last turn's facts before anyone acts this turn. Phase 4 moved
  // this from a hand-written system onto templates (state.raid.*, state.patrol.arrest); the scheduler below
  // runs lane "state" first, so this comment's ordering promise still holds even though the call moved.
  // 2. Family AI: every non-player family and crew decides (fills slots, sets shares).
  facts.push(...familyAi(w, content));
  // 3. Scheduler (design 04) arrives in phase 3. Chains are the first processes: they run every turn.
  facts.push(...runChains(w, content));
  facts.push(...exposureFromActivity(w, content));
  // 3. The event engine (design 04): six lanes, due instances then spawns, follow-ups re-validated at fire time.
  facts.push(...runScheduler(w, content, decisions));
  if (opts.injectFacts) facts.push(...opts.injectFacts);

  // 4. Apply facts in owner order. Income first, then shares computed from this turn's income (design 03 §4).
  applyFacts(w, facts, log);
  applyFacts(w, applyShares(w), log);

  // 4b. Record and loan book (design 09 §2, §6): read this turn's already-decided income and loan state,
  // emit their Facts, apply the same way progressionStep's are below.
  applyFacts(w, recordStep(w, content), log);
  applyFacts(w, loansStep(w, content), log);
  applyFacts(w, obligationsStep(w, content), log); // design 12: duties, lifestyle, family health
  applyFacts(w, successionStep(w, content), log); // the dead leave the books before the invariants look

  // 5. Derived and slow values: decays by the weeks this turn covered (design 03 §5).
  decayLoyalty(w, w.meta.turnLength);
  decayFavors(w, w.meta.turnLength);
  decayStanding(w, w.meta.turnLength);
  decaySentiment(w, w.meta.turnLength);
  decayPressure(w, w.meta.turnLength);
  applyFacts(w, recomputeBands(w), log);
  applyFacts(w, progressionStep(w, content), log);
  applyFacts(w, releaseDetainees(w), log);
  applyFacts(w, sweepRequests(w), log);

  // Recent facts for `recent` predicates (design 04 §1): keep the last 26 turns of applied fact kinds and subjects.
  recordRecentFacts(w, log);

  // 8. Calendar advance runs before invariants so turnLength consistency is checked on the state we return.
  advanceCalendar(w, log);

  // 6. Invariants.
  if (debug) {
    const violations = runInvariants(w);
    for (const v of violations) log.invariant(v.name, v.message);
    if (violations.length > 0) throw new InvariantViolationError(w.meta.turn, violations);
  }

  // 7. Log and report.
  const turnLog = log.build();
  const report = projectReport(w, turnLog);
  return { world: w, log: turnLog, report, hash: opts.hash === false ? "" : worldHash(w) };
}

const RECENT_FACT_TURNS = 26;

function subjectsOf(fact: Fact): string[] {
  const f = fact as unknown as Record<string, unknown>;
  const out: string[] = [];
  if (fact.kind === "ProcessSpawn") {
    // Every bound role: `spawn.cooldownTurns` (engine/scheduler.ts) asks "did this template spawn on this scope
    // entity recently", and a story asks that the same rare card does not return two weeks running.
    for (const ref of Object.values(fact.instance.roles)) out.push(ref.id);
    return out;
  }
  for (const k of ["characterId", "familyId", "townId", "businessId", "blockId", "crewId", "from", "to", "holderId", "subordinateId", "superiorId"]) {
    const v = f[k];
    if (typeof v === "string") out.push(v);
  }
  return out;
}

/** High-volume bookkeeping facts that no `recent` predicate needs; keeping them made the window 15,000 entries. */
const RECENT_FACT_EXCLUDED = new Set<string>([
  "MoneyMint", "MoneyMove", "MoneyDestroy", "Launder", "EvidenceAdd", "WeightSet", "HeatDelta", "ComplianceDelta", "FearDelta",
  "LoyaltyDelta", "SentimentDelta", "AttentionDelta", "ProcessProgress", "ScheduleAdd", "ScheduleRemove", "RequestPush", "RequestResolve", "RequestDefer", "ReportNote",
]);

/** Same id-valued fields `subjectsOf` flattens, but keyed by field name (design 09 §7 item 4): a `spawnFrom`
 *  rule names the field it wants (e.g. "businessId" on `CollectionMissed`) rather than picking blindly out of
 *  the flattened `subjects` list. "collectorId" is added to the key list `subjectsOf` uses since that field
 *  (not read by any `subjectsOf` caller so far) is exactly what `assoc.latePayer`'s `spawnFrom.field2` needs.
 *  Design 12 §3 adds "obligationId", "debtorId" and "obligationKind" (`ObligationDue`/`ObligationMissed`'s own
 *  fields, for `oblig.due.card`'s and `oblig.missed.prisoner`'s `spawnFrom`/`match`) plus "lifestyle" and
 *  "state" (`LifestyleSet`/`FamilyStateSet`'s own fields, for `lifestyle.fallen`'s and `family.*.news`'s
 *  `match`). "beneficiaryId" is not listed here: it is a `characterId`-shaped id, already covered below. */
function fieldsOf(fact: Fact): Record<string, string> {
  const f = fact as unknown as Record<string, unknown>;
  const out: Record<string, string> = {};
  if (fact.kind === "ProcessSpawn") out["templateId"] = fact.instance.templateId;
  for (const k of [
    "characterId", "familyId", "townId", "businessId", "blockId", "crewId", "from", "to", "holderId", "subordinateId", "superiorId", "collectorId", "what", "lenderId", "loanId", "status",
    "obligationId", "debtorId", "obligationKind", "lifestyle", "state", "beneficiaryId",
  ]) {
    const v = f[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function recordRecentFacts(w: World, log: TurnLogBuilder): void {
  const turn = w.meta.turn;
  const fresh: RecentFact[] = [];
  for (const e of log.entries)
    if (e.kind === "fact" && !RECENT_FACT_EXCLUDED.has(e.fact.kind)) fresh.push({ turn, kind: e.fact.kind, subjects: subjectsOf(e.fact), fields: fieldsOf(e.fact) });
  w.history.recentFacts = [...w.history.recentFacts.filter((r) => r.turn > turn - RECENT_FACT_TURNS), ...fresh];
}
