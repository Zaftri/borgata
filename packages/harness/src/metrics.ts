// Career metrics (design 08 §3, §9). Collects per-turn observations while stepping a single career
// (a seed run driven by the AI player) and aggregates them across seeds into min/median/max bands.
// Pure functions over the core's public API; arithmetic here is plain JS numbers (floats allowed outside sim).

import {
  InvariantViolationError,
  initialWorld,
  projectView,
  step,
  type Content,
  type Fact,
  type GameSetup,
  type Lifestyle,
  type ProcessInstance,
  type World,
} from "@borgata/sim";
import type { AiPlayer } from "./ai-player.js";

// ---------------------------------------------------------------------------------------------------------------
// Small, reusable pieces of the instance-to-template tracking this file's `collectCareer` already does (design
// 08 §9's first-ranks tracking, above). `coverage.ts` (build plan §5b item 8c, "harness coverage") reuses these
// instead of re-deriving the same (instanceId -> templateId) map and the same "does this instance involve the
// player" check from scratch.
// ---------------------------------------------------------------------------------------------------------------

/** Records `instanceId -> templateId` from a `ProcessSpawn` fact, as it streams through a turn log. `ProcessResolve`
 * and `ProcessDecide` only carry the instance id, not the template, so every reader of those needs this map. */
export function trackTemplateId(f: Fact, into: Map<string, string>): void {
  if (f.kind === "ProcessSpawn") into.set(f.instance.id, f.instance.templateId);
}

/** Task brief's own definition for "player-facing" (harness coverage): the instance binds the player character
 * to one of its roles. Simpler than, and independent from, the sim's own broader `isPlayerFacing` (engine/
 * scheduler.ts, unexported), which also counts the player's family/crew/town -- that one decides what becomes a
 * request or a report line; this one is only for the coverage report's own player/all split. */
export function isPlayerFacingInstance(instance: ProcessInstance, playerId: string): boolean {
  return Object.values(instance.roles).some((r) => r.kind === "character" && r.id === playerId);
}

export type Stat = { min: number; median: number; max: number };

// First-ranks metrics (design 09 §10, first-ranks-requirements §8). Templates and outcome ids are
// packages/content/src/templates/associate-week.ts; this module only owns the harness side.
const FAVOR_TEMPLATE_IDS = new Set(["assoc.favor.drive", "assoc.favor.note", "assoc.favor.door"]);
// A favor's accept outcome id names an arrest, a witness, a murder or a death when it contains one of these
// (associate-week.ts's actual outcome ids: stopped, witnessed, killingSurvives/killingDead, policeArriveSurvives/
// policeArriveDead, intercepted). "declined" is excluded upstream by only counting non-declined outcomes.
const BAD_FAVOR_OUTCOME_PATTERN = /stopped|policeArrive|witnessed|killing|intercepted/;
const GAME_STAKE_TEMPLATE_ID = "assoc.game.stake";
// The three outcome ids that only ever fire when the player chose "bankSelf" (their `when` guards, associate-week.ts).
const GAME_STAKE_BANKED_OUTCOMES = new Set(["bankGood", "bankBad", "bankBigNight"]);
// bankBad's MoneyDestroy sink, unique to this template (grep confirms no other template uses it).
const GAME_LOSS_SINK = "gamblers";

// The district (design 13 §3, §4). Two other agents own these templates (packages/content/src/templates/
// district.ts, war.ts); until they are registered, `templateIdByInstance` never maps an instance to one of
// these ids, so every counter that keys off them simply stays 0 (task brief: "if a file is missing when you
// test, the metrics simply report zeros").
const DISPUTE_CREW_TEMPLATE_ID = "dispute.stall.crew";
const DISPUTE_FAMILY_TEMPLATE_ID = "dispute.claim";
const DISPUTE_DISTRICT_TEMPLATE_ID = "dispute.district.sitdown";
const WAR_MEETING_TEMPLATE_ID = "war.meeting";
/** `war.meeting`'s own resolve outcomes (packages/content/src/templates/war.ts, `warMeetingOutcomes`): every
 * war ends through this one template, not through a separate "ended by exhaustion" template -- `war.exhaustion`
 * only ever tags the head's memory (`suesForPeace`), which `war.meeting` reads to force `peaceForced` at the
 * *next* meeting rather than ending the war itself. "Peace by meeting" is a voluntary or offered acceptance
 * (`acceptedByPlayer`, the player's own family head/underboss decided; `peaceOffered`, the AI's flat-probability
 * accept); "peace by exhaustion" is `peaceForced`, the guaranteed accept once the head is suing for peace.
 * `refusedByPlayer`/`standoff` do not end the war and are not counted in either bucket. */
const WAR_MEETING_PEACE_BY_MEETING_OUTCOMES = new Set(["acceptedByPlayer", "peaceOffered"]);
const WAR_MEETING_PEACE_BY_EXHAUSTION_OUTCOME = "peaceForced";
/** A district sit-down counts as "followed by war" when a war.declare spawns within this many turns after it. */
const DISTRICT_WAR_FOLLOW_WINDOW_TURNS = 3;

export type CareerMetrics = {
  seed: string;
  turnsRequested: number;
  /** Turns actually completed before an invariant violation stopped the career, if any. */
  turnsRun: number;
  /** Families in the world at the end; arrests per 100 turns is normalized by it. */
  familyCount?: number;
  /** Cumulative money minted over the career (world.ledger.minted at the end). */
  totalMinted: number;
  /** Sum of dirty+clean across every family's treasury account at the end. */
  finalTreasury: number;
  /** Count of StatusChange facts with status "arrested" across every turn log. */
  arrests: number;
  /** Count of CooperationSet facts across every turn log. */
  cooperations: number;
  /** Characters that were ever a soldier or associate of a family, at any point in the career. */
  everSoldierOrAssociate: number;
  /** cooperations / max(1, everSoldierOrAssociate). */
  collaboratorRate: number;
  /** Share of turns each family spent in Attention bands 0..4, averaged across families. */
  bandOccupancy: [number, number, number, number, number];
  /** Peak Attention heat observed per town over the career. */
  peakHeatByTown: Record<string, number>;
  /** Mean loyalty of living family members at the end. */
  loyaltyMean: number;
  /** Number of characters with status arrested or jailed at the end. */
  detainedAtEnd: number;
  /** Invariant violation that stopped the career, if any. */
  violation: { turn: number; names: string[] } | null;

  // --- First-ranks metrics (design 09 §10). Meaningful for the associate-rank presets (yesMan, careful, mixed);
  // computed unconditionally here, printed conditionally by the CLI. ---
  /** Turn of the first RankChange fact moving the player off "associate" (being made), or null if it never fires. */
  turnsToProposal: number | null;
  /** True when the career ends with the player still an associate: dead, or dropped with no new sponsor. */
  endedInRank: boolean;
  /** Count of `projectView(...).decisions` observed each turn, before the AI acts on that turn's world. */
  decisionsPerTurn: number[];
  /** Accepted assoc.favor.{drive,note,door} decisions (ProcessResolve outcome id not "declined"). */
  favorAccepts: number;
  /** Of those accepts, outcomes naming an arrest, a witness, a murder or a death. */
  favorBadOutcomes: number;
  /** assoc.game.stake weeks resolved with bankSelf (bankGood/bankBad/bankBigNight). */
  cardGameBankedWeeks: number;
  /** Of those banked weeks, ones whose loss (MoneyDestroy sink "gamblers") exceeds the player's median positive turnIncome. */
  cardGameBigLossWeeks: number;
  /** Count of StatusChange facts with status "arrested" naming the player specifically. */
  arrestsOfPlayer: number;

  // --- Duties metrics (design 12 §1, §4). Computed unconditionally (like the first-ranks block above), but
  // printed for every strategy, not only the associate presets: obligations and lifestyle apply at any rank. ---
  /** Count of `ObligationOpen` facts across the career. */
  obligationsOpened: number;
  /** Count of `ObligationMet` facts across the career. */
  obligationsMet: number;
  /** Count of `ObligationMissed` facts across the career. */
  obligationsMissed: number;
  /** Detention episodes (a `StatusChange` "arrested" of a character whose direct superior is the player, i.e.
   * one of the player's own men) where a `prisonerSupport` obligation naming that character as beneficiary was
   * met (`ObligationMet`) at least once before release. */
  detentionsSupported: number;
  /** Of those supported episodes, ones where a `CooperationSet` fact for that same character fired before
   * release (the flip the family's support was meant to prevent). */
  detentionsSupportedFlipped: number;
  /** Detention episodes of the player's men with no such obligation ever met before release. */
  detentionsUnsupported: number;
  /** Of those unsupported episodes, ones that flipped. */
  detentionsUnsupportedFlipped: number;
  /** Turns where the player's own family (`world.families.byId[player.familyId].state`) was "weakened". */
  familyWeakenedTurns: number;
  /** The player's `Character.lifestyle` at the end of the career. */
  lifestyleAtEnd: Lifestyle;
  /** Sum of `MoneyDestroy` sink "lifestyle" amounts charged to the player's own personal account. */
  lifestyleSpend: number;

  // --- The district metrics (design 13 §1, §2, §4). Computed unconditionally, printed for every strategy (like
  // the duties block above): disputes and war can touch a career at any rank once the district exists. Content
  // ids (`dispute.stall.crew`, `dispute.claim`, `dispute.district.sitdown`, `war.declare`, `war.meeting`,
  // `war.exhaustion`) belong to two other agents' in-flight templates (design 13 §3, §4 wave a/b); until those
  // templates are registered, `templateIdByInstance` never maps to them, so every counter below simply stays 0. ---
  /** `ProcessResolve` count for templateId `dispute.stall.crew` (a crew's own stall quarrel, held by the chief). */
  disputesCrewResolved: number;
  /** `ProcessResolve` count for templateId `dispute.claim` (the existing poach-and-hold, family level). */
  disputesFamilyResolved: number;
  /** `ProcessResolve` count for templateId `dispute.district.sitdown` (the district head's ruling). */
  disputesDistrictResolved: number;
  /** Of `disputesDistrictResolved`, how many were followed by a `war.declare` `ProcessSpawn` within 3 turns
   * (the turn of the sit-down's resolve through 3 turns later, inclusive). Temporal, not matched by family:
   * the same simplification the rest of this file uses for pooled shares (design 13 §1's acceptance line asks
   * for "settle without war", not "settle without any war anywhere"). */
  districtSitdownsFollowedByWar: number;
  /** Count of `ProcessSpawn` facts with templateId `war.declare`. */
  warsDeclared: number;
  /** One entry per war this career saw end: turns from the `WarStateSet` that first named an enemy for a family
   * to the next `WarStateSet` naming `null` for that same family (design 13 §2's own phrasing, "from war.declare
   * to the first WarStateSet with null for either party" -- the non-null WarStateSet is war.declare's own effect,
   * so tracking it directly avoids a second, looser correlation by turn). */
  warLengths: number[];
  /** `war.meeting` resolves ending in peace by an ordinary or offered acceptance (`acceptedByPlayer` or
   * `peaceOffered` -- see `WAR_MEETING_PEACE_BY_MEETING_OUTCOMES`'s own header comment for why every peace,
   * forced or not, resolves through this one template rather than a separate one). */
  peaceByMeeting: number;
  /** `war.meeting` resolves ending in peace because the weakened family's head was already suing for it
   * (outcome id `peaceForced`; design 13 §3's `war.exhaustion` only sets that up, it does not itself end
   * the war). */
  peaceByExhaustion: number;
};

export type Distribution = {
  seeds: number;
  turnsRun: Stat;
  totalMinted: Stat;
  finalTreasury: Stat;
  arrests: Stat;
  arrestsPer100Turns: Stat;
  cooperations: Stat;
  collaboratorRate: Stat;
  bandOccupancy: [Stat, Stat, Stat, Stat, Stat];
  peakHeatByTown: Record<string, Stat>;
  loyaltyMean: Stat;
  detainedAtEnd: Stat;
  violations: Array<{ seed: string; turn: number; names: string[] }>;

  // --- First-ranks metrics (design 09 §10). ---
  /** Stat over careers that ever left "associate" (nulls excluded); see `turnsToProposalReachedShare` for how many did. */
  turnsToProposal: Stat;
  /** Share of careers with a RankChange fact moving the player off "associate" at all. */
  turnsToProposalReachedShare: number;
  /** Share of careers ending with the player still an associate (dead, or dropped with no new sponsor). */
  endedInRankShare: number;
  /** Stat over every turn's decision count, pooled across every career. */
  decisionsPerTurn: Stat;
  /** Share of those turn-observations with 2 or more decisions. */
  decisionsPerTurnShareAtLeast2: number;
  /** Accepted favors, bad outcomes among them, and the pooled share, summed across every career. */
  favorOutcomes: { accepts: number; bad: number; share: number };
  /** Banked card-game weeks, big-loss weeks among them, and the pooled share, summed across every career. */
  cardGame: { banked: number; bigLoss: number; share: number };
  /** Stat over arrests of the player specifically, per career. */
  arrestsOfPlayer: Stat;

  // --- Duties metrics (design 12 §1, §4). ---
  /** Obligations opened, met and missed, summed across every career, with the pooled met share
   * (met / (met + missed); 0 when none came due). */
  obligations: { opened: number; met: number; missed: number; metShare: number };
  /** The flip rate of the player's detained men whose family was supported versus not (design 12 §1's
   * acceptance line), pooled across every career: counts, per-bucket flip rate, and their ratio (supported
   * rate / unsupported rate; null when the unsupported rate is 0, to avoid a division by zero). */
  detentionFlip: {
    supportedCount: number;
    supportedFlips: number;
    supportedRate: number;
    unsupportedCount: number;
    unsupportedFlips: number;
    unsupportedRate: number;
    ratio: number | null;
  };
  /** Stat over careers of the share of turns the player's own family spent "weakened". */
  familyWeakenedShare: Stat;
  /** Careers ending with the player at each lifestyle, out of `seeds`. */
  lifestyleAtEnd: Record<Lifestyle, number>;
  /** Stat over careers of the total kL spent on the player's own lifestyle. */
  lifestyleSpend: Stat;

  // --- The district metrics (design 13 §1, §2, §4). ---
  district: {
    /** Disputes resolved per 100 turns at each level, one `Stat` per career (design 13's three levels). */
    disputesCrewPer100Turns: Stat;
    disputesFamilyPer100Turns: Stat;
    disputesDistrictPer100Turns: Stat;
    /** Total district sit-downs resolved, pooled across careers, and the pooled share of them followed by a
     * war.declare within 3 turns (design 13 §1's acceptance line: "settle without war in at least 80% of cases"). */
    districtSitdownsTotal: number;
    districtWarShare: number;
    /** Wars declared per 100 turns, one `Stat` per career, and the pooled total. */
    warsPer100Turns: Stat;
    warsDeclaredTotal: number;
    /** War length in turns, pooled across every war that concluded in any career (median band 4-12, design 13 §1). */
    warLength: Stat;
    warsEndedTotal: number;
    /** Wars ended by an accepted meeting versus by exhaustion, pooled across careers (INFO only, design 13 §2). */
    peaceByMeeting: number;
    peaceByExhaustion: number;
  };
};

function stat(values: readonly number[]): Stat {
  if (values.length === 0) return { min: 0, median: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return { min: sorted[0]!, median, max: sorted[sorted.length - 1]! };
}

function sumTreasuries(world: World): number {
  let sum = 0;
  for (const id of world.families.order) {
    const f = world.families.byId[id]!;
    const acct = world.ledger.accounts.byId[f.treasury];
    if (acct) sum += acct.dirty + acct.clean;
  }
  return sum;
}

function recordEverSoldierOrAssociate(world: World, into: Set<string>): void {
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (c.familyId !== null && (c.rank === "soldier" || c.rank === "associate")) into.add(c.id);
  }
}

function recordPeakHeat(world: World, into: Record<string, number>): void {
  for (const [townId, heat] of Object.entries(world.pressure.heatByTown)) {
    into[townId] = Math.max(into[townId] ?? 0, heat);
  }
}

function recordBandOccupancy(world: World, counts: Record<string, number[]>, turnsSeen: Record<string, number>): void {
  for (const id of world.families.order) {
    const f = world.families.byId[id]!;
    const arr = (counts[f.id] ??= [0, 0, 0, 0, 0]);
    arr[f.attentionBand] = (arr[f.attentionBand] ?? 0) + 1;
    turnsSeen[f.id] = (turnsSeen[f.id] ?? 0) + 1;
  }
}

function averageBandOccupancy(counts: Record<string, number[]>, turnsSeen: Record<string, number>): [number, number, number, number, number] {
  const familyIds = Object.keys(counts);
  if (familyIds.length === 0) return [0, 0, 0, 0, 0];
  const totals = [0, 0, 0, 0, 0];
  for (const familyId of familyIds) {
    const c = counts[familyId]!;
    const t = turnsSeen[familyId] || 1;
    for (let band = 0; band < 5; band++) totals[band] = (totals[band] ?? 0) + (c[band] ?? 0) / t;
  }
  return totals.map((x) => x / familyIds.length) as [number, number, number, number, number];
}

function meanLoyaltyOfLivingFamilyMembers(world: World): number {
  let sum = 0;
  let n = 0;
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (c.alive && c.familyId !== null) {
      sum += c.loyalty;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function countDetainedAtEnd(world: World): number {
  let n = 0;
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (c.status === "arrested" || c.status === "jailed") n++;
  }
  return n;
}

/**
 * Run one career (a seed, driven by the AI player) for up to `turns` turns, stepping directly
 * (design 08 §2, §3) so every turn's log and world can be observed, not just the final one.
 * Stops early and records the violation if `step` throws InvariantViolationError.
 */
export function collectCareer(seed: string, setup: GameSetup, content: Content, turns: number, ai: AiPlayer): CareerMetrics {
  let world = initialWorld(seed, setup, content);

  const everSoldierOrAssociate = new Set<string>();
  const peakHeatByTown: Record<string, number> = {};
  const bandCounts: Record<string, number[]> = {};
  const bandTurnsSeen: Record<string, number> = {};
  let arrests = 0;
  let cooperations = 0;
  let violation: { turn: number; names: string[] } | null = null;
  let turnsRun = 0;

  // First-ranks tracking (design 09 §10): templateIdByInstance is built from ProcessSpawn facts as they appear
  // in the log, since ProcessResolve only carries the instanceId, not the template.
  const templateIdByInstance = new Map<string, string>();
  let turnsToProposal: number | null = null;
  const decisionsPerTurn: number[] = [];
  let favorAccepts = 0;
  let favorBadOutcomes = 0;
  let cardGameBankedWeeks = 0;
  const gameLossAmounts: number[] = [];
  let arrestsOfPlayer = 0;
  const personalIncomeSamples: number[] = [];

  // Duties tracking (design 12 §1, §4). `obligationInfoById` mirrors `templateIdByInstance` above: `ObligationMet`/
  // `ObligationMissed` only carry the obligation id, not its kind or beneficiary, so the kind and beneficiary are
  // captured off `ObligationOpen` as it streams through the log. `detentions` holds one entry per currently-open
  // detention episode of a character whose direct superior is the player (`superiorId === playerId`, the same
  // relation `oblig.prisoner.open`'s own `me`-from-`man` binding uses), keyed by that character's id; it is
  // opened on arrest and closed (into the supported/unsupported totals) on the next `StatusChange` away from
  // "arrested" for that same character.
  const obligationInfoById = new Map<string, { kind: string; beneficiaryId?: string }>();
  const detentions = new Map<string, { supported: boolean; flipped: boolean }>();
  let obligationsOpened = 0;
  let obligationsMet = 0;
  let obligationsMissed = 0;
  let detentionsSupported = 0;
  let detentionsSupportedFlipped = 0;
  let detentionsUnsupported = 0;
  let detentionsUnsupportedFlipped = 0;
  let familyWeakenedTurns = 0;
  let lifestyleSpend = 0;

  // The district tracking (design 13 §1, §2, §4). `warStartTurnByFamily` mirrors `detentions` above: one open
  // entry per family currently at war, keyed by familyId, opened on the WarStateSet that first names an enemy
  // and closed (into `warLengths`) on the next WarStateSet naming null for that same family. `districtSitdownTurns`
  // and `warDeclareTurns` are resolved into `districtSitdownsFollowedByWar` after the loop, since "followed
  // within 3 turns" needs turns that have not happened yet at the moment a sit-down resolves.
  const warStartTurnByFamily = new Map<string, number>();
  const districtSitdownTurns: number[] = [];
  const warDeclareTurns: number[] = [];
  let disputesCrewResolved = 0;
  let disputesFamilyResolved = 0;
  let disputesDistrictResolved = 0;
  const warLengths: number[] = [];
  let peaceByMeeting = 0;
  let peaceByExhaustion = 0;

  recordEverSoldierOrAssociate(world, everSoldierOrAssociate);
  recordPeakHeat(world, peakHeatByTown);
  recordBandOccupancy(world, bandCounts, bandTurnsSeen);

  for (let t = 0; t < turns; t++) {
    const playerId = world.player.characterId;
    // The AI reads the same world projectView does here, before it acts (design 09 §10's decisionsPerTurn).
    decisionsPerTurn.push(projectView(world, null, content).decisions.length);
    const actions = ai.act(world, t);

    let result;
    try {
      result = step(world, actions, content, { debug: true, hash: false });
    } catch (e) {
      if (e instanceof InvariantViolationError) {
        violation = { turn: e.turn, names: e.violations.map((v) => v.name) };
        break;
      }
      throw e;
    }
    world = result.world;
    turnsRun++;

    for (const entry of result.log.entries) {
      if (entry.kind !== "fact") continue;
      const f = entry.fact;
      if (f.kind === "StatusChange" && f.status === "arrested") {
        arrests++;
        if (f.characterId === playerId) arrestsOfPlayer++;
        // A detention episode of one of the player's own men (design 12 §1's acceptance line): the world here
        // is already this turn's post-step world, so `superiorId` reflects the arrest's own turn.
        const arrested = world.characters.byId[f.characterId];
        if (arrested && arrested.superiorId === playerId) detentions.set(f.characterId, { supported: false, flipped: false });
      } else if (f.kind === "StatusChange" && f.status !== "arrested") {
        // Any status other than "arrested" ends a tracked detention (release, death, and so on): close it out.
        const episode = detentions.get(f.characterId);
        if (episode) {
          if (episode.supported) {
            detentionsSupported++;
            if (episode.flipped) detentionsSupportedFlipped++;
          } else {
            detentionsUnsupported++;
            if (episode.flipped) detentionsUnsupportedFlipped++;
          }
          detentions.delete(f.characterId);
        }
      }
      if (f.kind === "CooperationSet") {
        cooperations++;
        const episode = detentions.get(f.characterId);
        if (episode) episode.flipped = true;
      }
      if (f.kind === "ObligationOpen") {
        obligationsOpened++;
        // `exactOptionalPropertyTypes`: only set `beneficiaryId` at all when there is one, rather than setting
        // it to `undefined` (a character beneficiary is the only kind this metric cares about; family/external
        // beneficiaries never match a `prisonerSupport` obligation's own contract in practice).
        const beneficiaryId = f.obligation.beneficiary.kind === "character" ? f.obligation.beneficiary.id : undefined;
        obligationInfoById.set(f.obligation.id, beneficiaryId === undefined ? { kind: f.obligation.kind } : { kind: f.obligation.kind, beneficiaryId });
      }
      if (f.kind === "ObligationMet") {
        obligationsMet++;
        const info = obligationInfoById.get(f.obligationId);
        if (info?.kind === "prisonerSupport" && info.beneficiaryId) {
          const episode = detentions.get(info.beneficiaryId);
          if (episode) episode.supported = true;
        }
      }
      if (f.kind === "ObligationMissed") obligationsMissed++;
      if (f.kind === "MoneyDestroy" && f.sink === "lifestyle") {
        const spender = world.characters.byId[playerId];
        if (spender && f.from === spender.accounts.personal) lifestyleSpend += f.amount;
      }
      // The district (design 13 §1, §2): war.declare's own spawn, and the WarStateSet pair it (and war.meeting/
      // war.exhaustion) write, tracked before `trackTemplateId` below so this reads the same fact once.
      if (f.kind === "ProcessSpawn" && f.instance.templateId === "war.declare") warDeclareTurns.push(result.log.turn);
      if (f.kind === "WarStateSet") {
        if (f.enemyFamilyId !== null) {
          if (!warStartTurnByFamily.has(f.familyId)) warStartTurnByFamily.set(f.familyId, result.log.turn);
        } else {
          const start = warStartTurnByFamily.get(f.familyId);
          if (start !== undefined) {
            warLengths.push(result.log.turn - start);
            warStartTurnByFamily.delete(f.familyId);
          }
        }
      }
      trackTemplateId(f, templateIdByInstance);
      if (f.kind === "RankChange" && f.characterId === playerId && f.rank !== "associate" && turnsToProposal === null) {
        turnsToProposal = result.log.turn;
      }
      if (f.kind === "ProcessResolve") {
        const templateId = templateIdByInstance.get(f.instanceId);
        if (templateId && FAVOR_TEMPLATE_IDS.has(templateId) && f.outcomeId !== "declined") {
          favorAccepts++;
          if (BAD_FAVOR_OUTCOME_PATTERN.test(f.outcomeId)) favorBadOutcomes++;
        }
        if (templateId === GAME_STAKE_TEMPLATE_ID && GAME_STAKE_BANKED_OUTCOMES.has(f.outcomeId)) cardGameBankedWeeks++;
        // The district (design 13 §3, §4): disputes per level, and the two ways a war ends.
        if (templateId === DISPUTE_CREW_TEMPLATE_ID) disputesCrewResolved++;
        if (templateId === DISPUTE_FAMILY_TEMPLATE_ID) disputesFamilyResolved++;
        if (templateId === DISPUTE_DISTRICT_TEMPLATE_ID) {
          disputesDistrictResolved++;
          districtSitdownTurns.push(result.log.turn);
        }
        if (templateId === WAR_MEETING_TEMPLATE_ID) {
          if (WAR_MEETING_PEACE_BY_MEETING_OUTCOMES.has(f.outcomeId)) peaceByMeeting++;
          else if (f.outcomeId === WAR_MEETING_PEACE_BY_EXHAUSTION_OUTCOME) peaceByExhaustion++;
        }
      }
      if (f.kind === "MoneyDestroy" && f.sink === GAME_LOSS_SINK) gameLossAmounts.push(f.amount);
    }

    const player = world.characters.byId[playerId];
    if (player) {
      const income = world.ledger.turnIncome[player.accounts.personal] ?? 0;
      if (income > 0) personalIncomeSamples.push(income);
      // Design 12 §1: the share of turns the player's own family spent "weakened" (income below its duties).
      const family = player.familyId ? world.families.byId[player.familyId] : undefined;
      if (family?.state === "weakened") familyWeakenedTurns++;
    }

    recordEverSoldierOrAssociate(world, everSoldierOrAssociate);
    recordPeakHeat(world, peakHeatByTown);
    recordBandOccupancy(world, bandCounts, bandTurnsSeen);
  }

  // A loss "larger than a normal week's collections" (first-ranks-requirements §8.6): the player's own median
  // positive weekly personal-account income, approximating turnIncome from chain collections (design 09 §10).
  const medianPersonalIncome = stat(personalIncomeSamples).median;
  const cardGameBigLossWeeks = gameLossAmounts.filter((loss) => loss > medianPersonalIncome).length;

  // The district (design 13 §1): resolved now that every turn's war.declare spawn turn is known.
  const districtSitdownsFollowedByWar = districtSitdownTurns.filter((st) =>
    warDeclareTurns.some((wt) => wt >= st && wt <= st + DISTRICT_WAR_FOLLOW_WINDOW_TURNS),
  ).length;

  const collaboratorRate = cooperations / Math.max(1, everSoldierOrAssociate.size);

  const finalPlayer = world.characters.byId[world.player.characterId];
  // Dropped-with-no-new-sponsor (design 09 §4 `assoc.sponsor.dropped` -> `assoc.run.ends`) tags "dropped" only on
  // the no-taken-on path, so checking onRecordWith is belt-and-braces, matching the task's literal definition.
  const endedInRank =
    !!finalPlayer && (finalPlayer.status === "dead" || (finalPlayer.memory.some((m) => m.tag === "dropped") && finalPlayer.onRecordWith === null));

  return {
    seed,
    turnsRequested: turns,
    turnsRun,
    familyCount: world.families.order.length,
    totalMinted: world.ledger.minted,
    finalTreasury: sumTreasuries(world),
    arrests,
    cooperations,
    everSoldierOrAssociate: everSoldierOrAssociate.size,
    collaboratorRate,
    bandOccupancy: averageBandOccupancy(bandCounts, bandTurnsSeen),
    peakHeatByTown,
    loyaltyMean: meanLoyaltyOfLivingFamilyMembers(world),
    detainedAtEnd: countDetainedAtEnd(world),
    violation,
    turnsToProposal,
    endedInRank,
    decisionsPerTurn,
    favorAccepts,
    favorBadOutcomes,
    cardGameBankedWeeks,
    cardGameBigLossWeeks,
    arrestsOfPlayer,
    obligationsOpened,
    obligationsMet,
    obligationsMissed,
    detentionsSupported,
    detentionsSupportedFlipped,
    detentionsUnsupported,
    detentionsUnsupportedFlipped,
    familyWeakenedTurns,
    // A detention still open when the career ends (the player caught inside the run's own window) has not been
    // released, so it was never finalized into either bucket above and does not appear here; only concluded
    // episodes count (this function's own header comment on `detentions`).
    lifestyleAtEnd: finalPlayer?.lifestyle ?? "modest",
    lifestyleSpend,
    disputesCrewResolved,
    disputesFamilyResolved,
    disputesDistrictResolved,
    districtSitdownsFollowedByWar,
    warsDeclared: warDeclareTurns.length,
    warLengths,
    peaceByMeeting,
    peaceByExhaustion,
  };
}

/** Aggregate a set of careers (one per seed) into min/median/max bands per metric (design 08 §9). */
export function aggregate(list: readonly CareerMetrics[]): Distribution {
  const bandStats = [0, 1, 2, 3, 4].map((band) => stat(list.map((m) => m.bandOccupancy[band] ?? 0))) as [Stat, Stat, Stat, Stat, Stat];

  const townIds = new Set<string>();
  for (const m of list) for (const townId of Object.keys(m.peakHeatByTown)) townIds.add(townId);
  const peakHeatByTown: Record<string, Stat> = {};
  for (const townId of townIds) peakHeatByTown[townId] = stat(list.map((m) => m.peakHeatByTown[townId] ?? 0));

  // Per family: the band in design 08 §3 is for one family; generated worlds hold several.
  const arrestsPer100 = list.map((m) => (m.turnsRun === 0 ? 0 : (m.arrests / m.turnsRun) * 100 / Math.max(1, m.familyCount ?? 1)));

  // First-ranks metrics (design 09 §10). turnsToProposal pools only careers that ever left "associate";
  // turnsToProposalReachedShare says what share of careers that Stat is drawn from.
  const turnsToProposalValues = list.map((m) => m.turnsToProposal).filter((v): v is number => v !== null);
  const turnsToProposalReachedShare = list.length === 0 ? 0 : turnsToProposalValues.length / list.length;
  const endedInRankShare = list.length === 0 ? 0 : list.filter((m) => m.endedInRank).length / list.length;

  const allDecisionCounts = list.flatMap((m) => m.decisionsPerTurn);
  const decisionsPerTurnShareAtLeast2 = allDecisionCounts.length === 0 ? 0 : allDecisionCounts.filter((c) => c >= 2).length / allDecisionCounts.length;

  const favorAcceptsTotal = list.reduce((a, m) => a + m.favorAccepts, 0);
  const favorBadTotal = list.reduce((a, m) => a + m.favorBadOutcomes, 0);
  const favorOutcomesShare = favorAcceptsTotal === 0 ? 0 : favorBadTotal / favorAcceptsTotal;

  const cardGameBankedTotal = list.reduce((a, m) => a + m.cardGameBankedWeeks, 0);
  const cardGameBigLossTotal = list.reduce((a, m) => a + m.cardGameBigLossWeeks, 0);
  const cardGameShare = cardGameBankedTotal === 0 ? 0 : cardGameBigLossTotal / cardGameBankedTotal;

  // Duties metrics (design 12 §1, §4): obligations pool like favorOutcomes/cardGame above (sums across
  // careers, then a pooled share).
  const obligationsOpenedTotal = list.reduce((a, m) => a + m.obligationsOpened, 0);
  const obligationsMetTotal = list.reduce((a, m) => a + m.obligationsMet, 0);
  const obligationsMissedTotal = list.reduce((a, m) => a + m.obligationsMissed, 0);
  const obligationsMetShare = obligationsMetTotal + obligationsMissedTotal === 0 ? 0 : obligationsMetTotal / (obligationsMetTotal + obligationsMissedTotal);

  const supportedCount = list.reduce((a, m) => a + m.detentionsSupported, 0);
  const supportedFlips = list.reduce((a, m) => a + m.detentionsSupportedFlipped, 0);
  const unsupportedCount = list.reduce((a, m) => a + m.detentionsUnsupported, 0);
  const unsupportedFlips = list.reduce((a, m) => a + m.detentionsUnsupportedFlipped, 0);
  const supportedRate = supportedCount === 0 ? 0 : supportedFlips / supportedCount;
  const unsupportedRate = unsupportedCount === 0 ? 0 : unsupportedFlips / unsupportedCount;
  const detentionRatio = unsupportedRate === 0 ? null : supportedRate / unsupportedRate;

  const familyWeakenedShareValues = list.map((m) => m.familyWeakenedTurns / Math.max(1, m.turnsRun));

  const lifestyleAtEnd: Record<Lifestyle, number> = { modest: 0, ordinary: 0, lavish: 0 };
  for (const m of list) lifestyleAtEnd[m.lifestyleAtEnd]++;

  // The district (design 13 §1, §2, §4): disputes and wars per 100 turns follow the arrestsPer100 pattern above
  // (per-career rate, then min/median/max); the war-follows-sitdown share and the peace-cause split pool like
  // obligations' metShare does (sums across careers, then one pooled share/ratio).
  const disputesCrewPer100 = list.map((m) => (m.turnsRun === 0 ? 0 : (m.disputesCrewResolved / m.turnsRun) * 100));
  const disputesFamilyPer100 = list.map((m) => (m.turnsRun === 0 ? 0 : (m.disputesFamilyResolved / m.turnsRun) * 100));
  const disputesDistrictPer100 = list.map((m) => (m.turnsRun === 0 ? 0 : (m.disputesDistrictResolved / m.turnsRun) * 100));
  const districtSitdownsTotal = list.reduce((a, m) => a + m.disputesDistrictResolved, 0);
  const districtSitdownsFollowedByWarTotal = list.reduce((a, m) => a + m.districtSitdownsFollowedByWar, 0);
  const districtWarShare = districtSitdownsTotal === 0 ? 0 : districtSitdownsFollowedByWarTotal / districtSitdownsTotal;
  const warsPer100 = list.map((m) => (m.turnsRun === 0 ? 0 : (m.warsDeclared / m.turnsRun) * 100));
  const warsDeclaredTotal = list.reduce((a, m) => a + m.warsDeclared, 0);
  const warLengthsPooled = list.flatMap((m) => m.warLengths);
  const peaceByMeetingTotal = list.reduce((a, m) => a + m.peaceByMeeting, 0);
  const peaceByExhaustionTotal = list.reduce((a, m) => a + m.peaceByExhaustion, 0);

  return {
    seeds: list.length,
    turnsRun: stat(list.map((m) => m.turnsRun)),
    totalMinted: stat(list.map((m) => m.totalMinted)),
    finalTreasury: stat(list.map((m) => m.finalTreasury)),
    arrests: stat(list.map((m) => m.arrests)),
    arrestsPer100Turns: stat(arrestsPer100),
    cooperations: stat(list.map((m) => m.cooperations)),
    collaboratorRate: stat(list.map((m) => m.collaboratorRate)),
    bandOccupancy: bandStats,
    peakHeatByTown,
    loyaltyMean: stat(list.map((m) => m.loyaltyMean)),
    detainedAtEnd: stat(list.map((m) => m.detainedAtEnd)),
    violations: list.filter((m) => m.violation !== null).map((m) => ({ seed: m.seed, turn: m.violation!.turn, names: m.violation!.names })),
    turnsToProposal: stat(turnsToProposalValues),
    turnsToProposalReachedShare,
    endedInRankShare,
    decisionsPerTurn: stat(allDecisionCounts),
    decisionsPerTurnShareAtLeast2,
    favorOutcomes: { accepts: favorAcceptsTotal, bad: favorBadTotal, share: favorOutcomesShare },
    cardGame: { banked: cardGameBankedTotal, bigLoss: cardGameBigLossTotal, share: cardGameShare },
    arrestsOfPlayer: stat(list.map((m) => m.arrestsOfPlayer)),
    obligations: { opened: obligationsOpenedTotal, met: obligationsMetTotal, missed: obligationsMissedTotal, metShare: obligationsMetShare },
    detentionFlip: {
      supportedCount,
      supportedFlips,
      supportedRate,
      unsupportedCount,
      unsupportedFlips,
      unsupportedRate,
      ratio: detentionRatio,
    },
    familyWeakenedShare: stat(familyWeakenedShareValues),
    lifestyleAtEnd,
    lifestyleSpend: stat(list.map((m) => m.lifestyleSpend)),
    district: {
      disputesCrewPer100Turns: stat(disputesCrewPer100),
      disputesFamilyPer100Turns: stat(disputesFamilyPer100),
      disputesDistrictPer100Turns: stat(disputesDistrictPer100),
      districtSitdownsTotal,
      districtWarShare,
      warsPer100Turns: stat(warsPer100),
      warsDeclaredTotal,
      warLength: stat(warLengthsPooled),
      warsEndedTotal: warLengthsPooled.length,
      peaceByMeeting: peaceByMeetingTotal,
      peaceByExhaustion: peaceByExhaustionTotal,
    },
  };
}
