// `pnpm harness <command>` (design 08 §1). Exit code 0 means every gate passed.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadContent } from "@borgata/content";
import { computeGolden, careers, perf, replayGolden, sweep, writeGolden, readGolden, GOLDEN_PATH } from "./index.js";
import type { Strategy } from "./ai-player.js";
import { runPlay } from "./play.js";
import { buildCatalogue } from "./catalogue.js";
import { runCoverage, coverageKey } from "./coverage.js";
import { runTrace } from "./trace.js";
import type { SaveFile } from "@borgata/sim";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    seeds: { type: "string", short: "s" },
    turns: { type: "string", short: "t" },
    strategy: { type: "string" },
    update: { type: "boolean", default: false },
    golden: { type: "boolean", default: false },
    seed: { type: "string" },
    load: { type: "string" },
    save: { type: "string" },
    script: { type: "string" },
    out: { type: "string" },
    "from-rank": { type: "string" },
  },
});

const command = positionals[0] ?? "quick";
const content = loadContent();
const lines: string[] = [];
let failed = false;

function say(s: string): void {
  lines.push(s);
}
function fail(s: string): void {
  failed = true;
  lines.push(`FAIL ${s}`);
}

function doSweep(seeds: number, turns: number, strategy: Strategy): void {
  const r = sweep(content, seeds, turns, strategy);
  say(`sweep: ${r.seeds} seeds x ${r.turns} turns (${strategy})`);
  for (const [name, h] of Object.entries(r.health)) say(`  health: ${name} fails on ${h.seeds}/${r.seeds} seeds at the end (e.g. ${h.sample}) WARN`);
  if (r.violations.length === 0) say(`  invariants: 0 violations`);
  else {
    fail(`  invariants: ${r.violations.length} seed(s) violated`);
    for (const v of r.violations.slice(0, 5)) say(`    ${v.seed} @turn ${v.turn}: ${v.violations.map((x) => `${x.name}: ${x.message}`).join("; ")}`);
  }
  if (r.determinismFailures.length === 0) say(`  determinism: same-seed reruns identical`);
  else fail(`  determinism: ${r.determinismFailures.length} seed(s) diverged: ${r.determinismFailures.slice(0, 5).join(", ")}`);
}

function doReplay(): void {
  const r = replayGolden(content);
  if (r.status === "ok") say(`replay: golden seeds match (${readGolden()?.entries.length ?? 0} entries)`);
  else if (r.status === "missing") say(`replay: ${r.details[0]}`);
  else {
    fail(`replay: ${r.status}`);
    for (const d of r.details) say(`    ${d}`);
  }
}

function doPerf(turns: number): void {
  const p = perf(content, turns);
  const line = `perf: generation ${p.msGeneration.toFixed(1)} ms, ${p.msPerTurn.toFixed(3)} ms/turn over ${p.turns} turns (budget 15000 ms / 2000 ms)`;
  if (p.withinBudget) say(line);
  else fail(line);
}

// Target bands (design 08 §3, initial; state systems are still being tuned, so out-of-band is WARN, not FAIL).
const COLLABORATOR_RATE_BAND: [number, number] = [0.02, 0.10];
const ARRESTS_PER_100_TURNS_BAND: [number, number] = [0.5, 6];
const QUIET_HIGH_BAND_SHARE_MAX = 0.05; // bands 3 and 4 combined, quiet strategy

// First-ranks bands (design 09 §10, first-ranks-requirements §8), meaningful only for the associate-rank presets.
const TURNS_TO_PROPOSAL_BAND: [number, number] = [25, 35]; // yesMan, default difficulty
const ENDED_IN_RANK_BAND_YES_MAN: [number, number] = [0.05, 0.10];
const ENDED_IN_RANK_MAX_CAREFUL = 0.02;
const DECISIONS_PER_TURN_BAND: [number, number] = [2, 3];
const DECISIONS_PER_TURN_SHARE_AT_LEAST_2_TARGET = 0.90; // currently below target: INFO, not WARN (task instruction)
const FAVOR_BAD_OUTCOME_BAND: [number, number] = [0.05, 0.15];
const CARD_GAME_BIG_LOSS_MIN_SHARE = 1 / 20; // at least one such week per 20 banked weeks

const ASSOCIATE_PRESETS: readonly Strategy[] = ["yesMan", "careful", "mixed"];

// Duties bands (design 12 §1's acceptance line, §4). Obligations and lifestyle apply at any rank, so this
// block prints for every strategy; the two bands below are only meaningful for the presets design 12 names.
const OBLIGATIONS_MET_SHARE_MIN = 0.80; // yesMan and careful
const DETENTION_FLIP_RATIO_MAX = 0.5; // supported rate at most half the unsupported rate, over 200 careers
const DETENTION_MIN_SAMPLE = 10; // below this in either bucket, the ratio is too noisy to grade: INFO only

// The district bands (design 13 §1's acceptance line). Printed for every strategy, like the duties block: a
// dispute or a war can touch a career at any rank once the district exists.
const DISTRICT_WAR_SHARE_MAX = 0.20; // at most 20% of district sit-downs escalate to war.declare within 3 turns
const WAR_LENGTH_BAND: [number, number] = [4, 12]; // median band, design 13 §1

function withinBand(value: number, [lo, hi]: [number, number]): boolean {
  return value >= lo && value <= hi;
}

/** One-page careers summary (design 08 §3, §9): each metric, its band where one is defined, and PASS/WARN. */
function doCareers(seeds: number, turns: number, strategy: Strategy): void {
  const r = careers(content, seeds, turns, strategy);
  const d = r.distribution;
  say(`careers: ${seeds} seeds x ${turns} turns (${strategy})`);

  if (d.violations.length === 0) say(`  invariants: 0 violations`);
  else {
    fail(`  invariants: ${d.violations.length} seed(s) violated (career halted at the violating turn)`);
    for (const v of d.violations.slice(0, 5)) say(`    ${v.seed} @turn ${v.turn}: ${v.names.join(", ")}`);
    if (d.violations.length > 5) say(`    ... and ${d.violations.length - 5} more`);
  }

  say(`  turns completed: min ${d.turnsRun.min} median ${d.turnsRun.median} max ${d.turnsRun.max}`);
  say(`  total minted money (kL): min ${d.totalMinted.min} median ${d.totalMinted.median} max ${d.totalMinted.max}`);
  say(`  final treasury (kL): min ${d.finalTreasury.min} median ${d.finalTreasury.median} max ${d.finalTreasury.max}`);

  const arrestsRate = d.arrestsPer100Turns.median;
  const arrestsPass = withinBand(arrestsRate, ARRESTS_PER_100_TURNS_BAND);
  say(
    `  arrests: min ${d.arrests.min} median ${d.arrests.median} max ${d.arrests.max}; per 100 turns median ${arrestsRate.toFixed(2)} ` +
      `(band ${ARRESTS_PER_100_TURNS_BAND[0]}-${ARRESTS_PER_100_TURNS_BAND[1]}) ${arrestsPass ? "PASS" : "WARN"}`,
  );

  say(`  cooperations: min ${d.cooperations.min} median ${d.cooperations.median} max ${d.cooperations.max}`);
  // The 2 to 10 percent target (design 08 §3) is for a forty-year career (2,080 weekly turns); scale by the run length.
  const careerScale = turns / 2080;
  const scaledBand: [number, number] = [COLLABORATOR_RATE_BAND[0] * careerScale, COLLABORATOR_RATE_BAND[1] * careerScale];
  const collabRate = d.collaboratorRate.median;
  const collabPass = withinBand(collabRate, scaledBand);
  say(
    `  collaborator rate (cooperations / ever soldier-or-associate): min ${d.collaboratorRate.min.toFixed(3)} median ${collabRate.toFixed(3)} max ${d.collaboratorRate.max.toFixed(3)} ` +
      `(band ${scaledBand[0].toFixed(4)}-${scaledBand[1].toFixed(4)} scaled to ${turns} turns) ${collabPass ? "PASS" : "WARN"}`,
  );

  const bandShares = d.bandOccupancy.map((s) => s.median);
  const highBandShare = (bandShares[3] ?? 0) + (bandShares[4] ?? 0);
  say(`  attention band occupancy, median share [band0..band4]: ${bandShares.map((s) => s.toFixed(3)).join(", ")}`);
  if (strategy === "quiet") {
    const bandPass = highBandShare < QUIET_HIGH_BAND_SHARE_MAX;
    say(`    bands 3+4 combined: ${(highBandShare * 100).toFixed(1)}% (band under ${(QUIET_HIGH_BAND_SHARE_MAX * 100).toFixed(0)}% for quiet) ${bandPass ? "PASS" : "WARN"}`);
  } else {
    say(`    bands 3+4 combined: ${(highBandShare * 100).toFixed(1)}% (band only defined for the quiet strategy) INFO`);
  }

  const heatLines = Object.entries(d.peakHeatByTown);
  say(
    `  peak heat by town: ${
      heatLines.length === 0 ? "(no towns observed)" : heatLines.map(([townId, s]) => `${townId} min ${s.min} median ${s.median} max ${s.max}`).join("; ")
    }`,
  );
  say(`  loyalty mean (living family members, end): min ${d.loyaltyMean.min.toFixed(1)} median ${d.loyaltyMean.median.toFixed(1)} max ${d.loyaltyMean.max.toFixed(1)}`);
  say(`  detained at end: min ${d.detainedAtEnd.min} median ${d.detainedAtEnd.median} max ${d.detainedAtEnd.max}`);

  if (ASSOCIATE_PRESETS.includes(strategy)) doFirstRanksMetrics(d, strategy);
  doDutiesMetrics(d, strategy);
  doDistrictMetrics(d);
}

/** First-ranks metrics (design 09 §10, first-ranks-requirements §8): only meaningful for the associate-rank
 * presets, printed after the existing careers metrics in the same value/band/PASS-WARN-INFO style. */
function doFirstRanksMetrics(d: ReturnType<typeof careers>["distribution"], strategy: Strategy): void {
  say(`  --- first ranks (design 09 §10) ---`);

  const tp = d.turnsToProposal;
  const reachedPct = (d.turnsToProposalReachedShare * 100).toFixed(1);
  if (strategy === "yesMan") {
    const pass = d.turnsToProposalReachedShare > 0 && withinBand(tp.median, TURNS_TO_PROPOSAL_BAND);
    say(
      `  turns to proposal (made): min ${tp.min} median ${tp.median} max ${tp.max}, reached in ${reachedPct}% of careers ` +
        `(band median ${TURNS_TO_PROPOSAL_BAND[0]}-${TURNS_TO_PROPOSAL_BAND[1]} for yesMan) ${pass ? "PASS" : "WARN"}`,
    );
  } else {
    say(
      `  turns to proposal (made): min ${tp.min} median ${tp.median} max ${tp.max}, reached in ${reachedPct}% of careers (band only defined for yesMan) INFO`,
    );
  }

  const endedPct = (d.endedInRankShare * 100).toFixed(1);
  if (strategy === "yesMan") {
    const pass = withinBand(d.endedInRankShare, ENDED_IN_RANK_BAND_YES_MAN);
    say(
      `  ended in the rank (dead, or dropped with no new sponsor): ${endedPct}% ` +
        `(band ${ENDED_IN_RANK_BAND_YES_MAN[0] * 100}-${ENDED_IN_RANK_BAND_YES_MAN[1] * 100}% for yesMan) ${pass ? "PASS" : "WARN"}`,
    );
  } else if (strategy === "careful") {
    const pass = d.endedInRankShare < ENDED_IN_RANK_MAX_CAREFUL;
    say(`  ended in the rank (dead, or dropped with no new sponsor): ${endedPct}% (band under ${ENDED_IN_RANK_MAX_CAREFUL * 100}% for careful) ${pass ? "PASS" : "WARN"}`);
  } else {
    say(`  ended in the rank (dead, or dropped with no new sponsor): ${endedPct}% (band only defined for yesMan and careful) INFO`);
  }

  const dpt = d.decisionsPerTurn;
  const dptPass = withinBand(dpt.median, DECISIONS_PER_TURN_BAND);
  say(
    `  decisions per turn (projectView before the AI acts): min ${dpt.min} median ${dpt.median} max ${dpt.max} ` +
      `(band median ${DECISIONS_PER_TURN_BAND[0]}-${DECISIONS_PER_TURN_BAND[1]}) ${dptPass ? "PASS" : "WARN"}`,
  );
  say(
    `    share of turns with 2+ decisions: ${(d.decisionsPerTurnShareAtLeast2 * 100).toFixed(1)}% ` +
      `(target ${(DECISIONS_PER_TURN_SHARE_AT_LEAST_2_TARGET * 100).toFixed(0)}%, currently below target) INFO`,
  );

  const fo = d.favorOutcomes;
  const foShare = (fo.share * 100).toFixed(1);
  if (fo.accepts === 0) {
    say(`  favor outcomes: no accepted assoc.favor.{drive,note,door} decisions observed INFO`);
  } else {
    const pass = withinBand(fo.share, FAVOR_BAD_OUTCOME_BAND);
    say(
      `  favor outcomes: ${fo.bad} of ${fo.accepts} accepted favors named an arrest, a witness, a murder or a death (${foShare}%) ` +
        `(band ${FAVOR_BAD_OUTCOME_BAND[0] * 100}-${FAVOR_BAD_OUTCOME_BAND[1] * 100}%) ${pass ? "PASS" : "WARN"}`,
    );
  }

  const cg = d.cardGame;
  const cgShare = (cg.share * 100).toFixed(1);
  if (cg.banked === 0) {
    say(`  card game (bankSelf): no banked weeks observed INFO`);
  } else {
    const pass = cg.share >= CARD_GAME_BIG_LOSS_MIN_SHARE;
    say(
      `  card game (bankSelf): ${cg.bigLoss} of ${cg.banked} banked weeks lost more than the player's median weekly income (${cgShare}%) ` +
        `(band at least 1 per 20 banked weeks, i.e. >= ${(CARD_GAME_BIG_LOSS_MIN_SHARE * 100).toFixed(1)}%) ${pass ? "PASS" : "WARN"}`,
    );
  }

  const aop = d.arrestsOfPlayer;
  say(`  arrests of the player: min ${aop.min} median ${aop.median} max ${aop.max} INFO`);
}

/** Duties metrics (design 12 §1, §4): obligations, the detained-associate flip rate, family health and
 * lifestyle. Printed for every strategy (unlike the first-ranks block above): obligations and lifestyle apply
 * at any rank, not only the associate presets. */
function doDutiesMetrics(d: ReturnType<typeof careers>["distribution"], strategy: Strategy): void {
  say(`  --- duties (design 12) ---`);

  const ob = d.obligations;
  const metSharePct = (ob.metShare * 100).toFixed(1);
  if (ob.met + ob.missed === 0) {
    say(`  obligations: none opened, met or missed INFO`);
  } else if (strategy === "yesMan" || strategy === "careful") {
    const pass = ob.metShare >= OBLIGATIONS_MET_SHARE_MIN;
    say(
      `  obligations: ${ob.opened} opened, ${ob.met} met, ${ob.missed} missed, met share ${metSharePct}% ` +
        `(band >= ${(OBLIGATIONS_MET_SHARE_MIN * 100).toFixed(0)}% for yesMan and careful) ${pass ? "PASS" : "WARN"}`,
    );
  } else {
    say(`  obligations: ${ob.opened} opened, ${ob.met} met, ${ob.missed} missed, met share ${metSharePct}% (band only defined for yesMan and careful) INFO`);
  }

  const df = d.detentionFlip;
  if (df.supportedCount === 0 && df.unsupportedCount === 0) {
    say(`  detained-associate flip rate: no tracked detentions of the player's own men released this run INFO`);
  } else {
    const enoughSample = df.supportedCount >= DETENTION_MIN_SAMPLE && df.unsupportedCount >= DETENTION_MIN_SAMPLE;
    const ratioText = df.ratio === null ? "n/a (unsupported rate is 0)" : df.ratio.toFixed(2);
    const pass = enoughSample && df.ratio !== null && df.ratio <= DETENTION_FLIP_RATIO_MAX;
    say(
      `  detained-associate flip rate: supported ${df.supportedFlips}/${df.supportedCount} (${(df.supportedRate * 100).toFixed(1)}%), ` +
        `unsupported ${df.unsupportedFlips}/${df.unsupportedCount} (${(df.unsupportedRate * 100).toFixed(1)}%), ratio ${ratioText} ` +
        `(band supported rate <= half the unsupported rate, i.e. ratio <= ${DETENTION_FLIP_RATIO_MAX}) ${enoughSample ? (pass ? "PASS" : "WARN") : "INFO (sample under " + DETENTION_MIN_SAMPLE + " in one bucket)"}`,
    );
  }

  const fw = d.familyWeakenedShare;
  say(`  share of turns the player's family was weakened: min ${(fw.min * 100).toFixed(1)}% median ${(fw.median * 100).toFixed(1)}% max ${(fw.max * 100).toFixed(1)}% INFO`);

  const le = d.lifestyleAtEnd;
  const ls = d.lifestyleSpend;
  say(
    `  lifestyle at end (of ${d.seeds} seeds): modest ${le.modest}, ordinary ${le.ordinary}, lavish ${le.lavish}; ` +
      `lifestyle spend (kL): min ${ls.min} median ${ls.median} max ${ls.max} INFO`,
  );
}

/** The district metrics (design 13 §1, §2, §4): disputes per 100 turns by level, the share of district sit-downs
 * that escalate to war, wars per 100 turns, war length, and peace by meeting versus by exhaustion. Printed for
 * every strategy (like `doDutiesMetrics`): a dispute or a war can touch a career at any rank. Content ids for
 * these templates belong to two other agents' in-flight work (design 13 §4 wave a/b); until they land, every
 * count here is 0 and every share/band line says so plainly rather than pretending to grade nothing. */
function doDistrictMetrics(d: ReturnType<typeof careers>["distribution"]): void {
  say(`  --- the district (design 13) ---`);
  const dist = d.district;

  say(
    `  disputes per 100 turns — crew (dispute.stall.crew resolves): min ${dist.disputesCrewPer100Turns.min.toFixed(2)} ` +
      `median ${dist.disputesCrewPer100Turns.median.toFixed(2)} max ${dist.disputesCrewPer100Turns.max.toFixed(2)}`,
  );
  say(
    `  disputes per 100 turns — family (dispute.claim resolves): min ${dist.disputesFamilyPer100Turns.min.toFixed(2)} ` +
      `median ${dist.disputesFamilyPer100Turns.median.toFixed(2)} max ${dist.disputesFamilyPer100Turns.max.toFixed(2)}`,
  );
  say(
    `  disputes per 100 turns — district (dispute.district.sitdown resolves): min ${dist.disputesDistrictPer100Turns.min.toFixed(2)} ` +
      `median ${dist.disputesDistrictPer100Turns.median.toFixed(2)} max ${dist.disputesDistrictPer100Turns.max.toFixed(2)}`,
  );

  if (dist.districtSitdownsTotal === 0) {
    say(`  district sit-downs followed by war.declare within 3 turns: no district sit-downs observed INFO`);
  } else {
    const pass = dist.districtWarShare <= DISTRICT_WAR_SHARE_MAX;
    say(
      `  district sit-downs followed by war.declare within 3 turns: ${(dist.districtWarShare * 100).toFixed(1)}% of ${dist.districtSitdownsTotal} ` +
        `(band at most ${(DISTRICT_WAR_SHARE_MAX * 100).toFixed(0)}%) ${pass ? "PASS" : "WARN"}`,
    );
  }

  say(
    `  wars per 100 turns: min ${dist.warsPer100Turns.min.toFixed(2)} median ${dist.warsPer100Turns.median.toFixed(2)} max ${dist.warsPer100Turns.max.toFixed(2)} ` +
      `(${dist.warsDeclaredTotal} declared)`,
  );

  if (dist.warsEndedTotal === 0) {
    say(`  war length (war.declare to peace, in turns): no wars concluded this run INFO`);
  } else {
    const pass = withinBand(dist.warLength.median, WAR_LENGTH_BAND);
    say(
      `  war length (war.declare to peace, in turns): min ${dist.warLength.min} median ${dist.warLength.median} max ${dist.warLength.max} ` +
        `(band median ${WAR_LENGTH_BAND[0]}-${WAR_LENGTH_BAND[1]}) ${pass ? "PASS" : "WARN"}`,
    );
  }

  say(`  peace by meeting vs. by exhaustion: ${dist.peaceByMeeting} by meeting, ${dist.peaceByExhaustion} by exhaustion INFO`);
}

/** `pnpm harness coverage` (build plan §5b item 8c, design 08 §9): reports which player-facing option and outcome
 * ids the given preset ever reached over `seeds` careers, so a template whose option or outcome nothing ever
 * exercises gets flagged for a story or removal (design 08 §9c). A report, not a gate: it never calls `fail`. */
function doCoverage(seeds: number, turns: number, strategy: Strategy): void {
  const r = runCoverage(content, seeds, turns, strategy);
  say(`coverage: ${r.seeds} seeds x ${r.turns} turns (${r.strategy})`);

  let totalOutcomes = 0;
  let reachedOutcomes = 0;
  for (const t of content.templates) {
    if (!t.decision) continue;

    const missingOptions = t.decision.options.filter((o) => !r.optionsChosen.has(coverageKey(t.id, o.id)));
    const missingOutcomes = t.resolve.filter((o) => !r.playerFacingOutcomesReached.has(coverageKey(t.id, o.id)));
    if (missingOptions.length > 0 || missingOutcomes.length > 0) {
      say(`  ${t.id}:`);
      if (missingOptions.length > 0) say(`    options never chosen by the player: ${missingOptions.map((o) => o.id).join(", ")}`);
      if (missingOutcomes.length > 0) say(`    outcomes never reached (player-facing): ${missingOutcomes.map((o) => o.id).join(", ")}`);
    }
  }

  // The summary spans every template's `resolve` list (not only decision templates), matching design 08 §9c's
  // "records which option and outcome ids fired ... and lists the ones never reached" over the whole catalogue.
  for (const t of content.templates) {
    totalOutcomes += t.resolve.length;
    for (const o of t.resolve) if (r.playerFacingOutcomesReached.has(coverageKey(t.id, o.id))) reachedOutcomes++;
  }
  say(`  ${reachedOutcomes} of ${totalOutcomes} outcomes reached (player-facing)`);
  const ALL_BEATS = ["collect", "missed", "lean", "game", "arrest", "release", "raid", "patrol", "favor", "kid", "loan", "claim", "share", "note", "news"];
  const missingBeats = ALL_BEATS.filter((b) => !r.beatsReached.has(b));
  say(`  beats seen on the player's place: ${ALL_BEATS.length - missingBeats.length} of ${ALL_BEATS.length}${missingBeats.length ? ` (never: ${missingBeats.join(", ")})` : ""}`);
}

/** `pnpm harness catalogue` (build plan §5b item 8a, design 08 §9): writes `docs/catalogue.md` (or `--out`) from
 * `loadContent().templates` and prints the path. Not a gated check, so (like `play`) it bypasses the "harness
 * summary" report entirely and exits 0. */
function runCatalogueCommand(): void {
  const outArg = values.out;
  const outPath = outArg ? resolve(process.cwd(), outArg) : fileURLToPath(new URL("../../../docs/catalogue.md", import.meta.url));
  const markdown = buildCatalogue(content);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown);
  console.log(outPath);
  process.exit(0);
}

/** `pnpm harness trace` (build plan §5b items 6-7, design 08 §9): prints one game's turn-by-turn trace under an
 * AI preset. Not a gated check: bypasses the "harness summary" report like `play` and `catalogue` do. */
function runTraceCommand(): void {
  const seed = values.seed;
  if (!seed) {
    console.error("trace: --seed <s> is required");
    process.exit(1);
  }
  const fromRank = values["from-rank"];
  if (fromRank !== undefined && fromRank !== "soldier") {
    console.error(`trace: --from-rank ${fromRank} is not supported (only "soldier" is)`);
    process.exit(1);
  }
  runTrace({
    seed,
    turns: Number(values.turns ?? 20),
    content,
    strategy: (values.strategy as Strategy) ?? "yesMan",
    fromRankSoldier: fromRank === "soldier",
    output: (line) => console.log(line),
  });
  process.exit(0);
}

/** `pnpm harness play` (design 07 §2-§5, build plan phase 4b): a terminal loop over `runPlay`, not a gated
 * check, so it skips the "harness summary" report entirely and exits 0 when the session ends cleanly. */
async function runPlayCommand(): Promise<void> {
  const seedArg = values.seed;
  const loadPath = values.load;
  const savePath = values.save;
  const scriptPath = values.script;
  const turnsArg = values.turns;

  let save: SaveFile | undefined;
  if (loadPath) save = JSON.parse(readFileSync(loadPath, "utf8")) as SaveFile;

  if (!seedArg && !save) {
    console.error("play: --seed <s> is required (or --load <file>)");
    process.exit(1);
  }

  const input: AsyncIterable<string> | string[] = scriptPath
    ? readFileSync(scriptPath, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
    : createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  const result = await runPlay({
    seed: seedArg ?? save!.seed,
    content,
    input,
    output: (line) => console.log(line),
    ...(save ? { save } : {}),
    ...(turnsArg !== undefined ? { maxTurns: Number(turnsArg) } : {}),
    ...(savePath ? { savePath } : {}),
  });

  console.log(`\n(play session ended at turn ${result.world.meta.turn})`);
  process.exit(0);
}

if (command === "play") {
  await runPlayCommand();
} else if (command === "catalogue") {
  runCatalogueCommand();
} else if (command === "trace") {
  runTraceCommand();
} else {
  switch (command) {
    case "quick": {
      doSweep(Number(values.seeds ?? 30), Number(values.turns ?? 52), (values.strategy as Strategy) ?? "quiet");
      doReplay();
      doPerf(100);
      break;
    }
    case "sweep":
      doSweep(Number(values.seeds ?? 1000), Number(values.turns ?? 104), (values.strategy as Strategy) ?? "quiet");
      break;
    case "replay":
      doReplay();
      break;
    case "careers":
      doCareers(Number(values.seeds ?? 20), Number(values.turns ?? 208), (values.strategy as Strategy) ?? "quiet");
      break;
    case "coverage":
      doCoverage(Number(values.seeds ?? 20), Number(values.turns ?? 60), (values.strategy as Strategy) ?? "yesMan");
      break;
    case "perf":
      doPerf(Number(values.turns ?? 500));
      break;
    case "golden": {
      if (values.update) {
        const g = computeGolden(content);
        writeGolden(g);
        say(`golden: wrote ${g.entries.length} entries to ${GOLDEN_PATH.pathname}`);
        for (const e of g.entries) say(`  ${e.seed} (${e.strategy}, ${e.turns} turns): ${e.hash}`);
      } else {
        const g = readGolden();
        if (!g) say("golden: no file");
        else for (const e of g.entries) say(`  ${e.seed} (${e.strategy}, ${e.turns} turns): ${e.hash}`);
      }
      break;
    }
    default:
      fail(
        `unknown command ${command}. Commands: quick, sweep, replay, careers, coverage, perf, golden, play, catalogue, trace. ` +
          `--strategy: quiet, loud, mixed, yesMan, careful (design 09 §10's associate presets are yesMan, careful, mixed). ` +
          `catalogue [--out <path>] writes docs/catalogue.md by default. ` +
          `coverage [--seeds N] [--turns T] [--strategy P] (defaults 20, 60, yesMan). ` +
          `trace --seed S [--turns N] [--strategy P] [--from-rank soldier].`,
      );
  }

  console.log(["harness summary", "===============", ...lines, failed ? "RESULT: FAIL" : "RESULT: PASS"].join("\n"));
  process.exit(failed ? 1 : 0);
}
