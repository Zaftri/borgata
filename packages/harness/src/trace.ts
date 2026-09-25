// `pnpm harness trace` (build plan §5b items 6+7, design 08 §9's trace-as-a-tool requirement): runs one game
// with an AI preset acting and prints, per turn, what the player was offered, chose, saw and earned. Plain text,
// no colors (task brief). `runTrace` takes an output sink so the CLI can print to stdout and a test can capture
// lines, the same shape `play.ts`'s `runPlay` already uses.

import { initialWorld, projectView, step, type Content, type PlayerAction, type TurnLog, type World } from "@borgata/sim";
import { makeAiPlayer, type Strategy } from "./ai-player.js";
import { DEFAULT_SETUP } from "./index.js";

export type TraceOptions = {
  seed: string;
  turns: number;
  content: Content;
  strategy?: Strategy;
  /** Sets the player up as a soldier before turn 1 and queues both permission asks on turn 1 (task brief). */
  fromRankSoldier?: boolean;
  output: (line: string) => void;
};

/** The soldier's crew chief: any character of rank "chief" in the player's family. Every generated family has
 * exactly one (generation/families.ts always mints a crew chief), so this works on any seed, not only the
 * hand-built starter world `soldier.test.ts`'s own `promoteToSoldier` fixture names by its literal character name. */
function findCrewChief(world: World) {
  const p = world.characters.byId[world.player.characterId]!;
  const chief = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.familyId === p.familyId && c.rank === "chief");
  if (!chief) throw new Error("trace --from-rank soldier: no crew chief found in the player's family");
  return chief;
}

/** Sets the player up as a soldier before turn 1, the way `packages/sim/src/soldier.test.ts`'s own
 * `promoteToSoldier` fixture does: rank, superior = the crew chief, crew membership, and the loanBook UI layer
 * (`invariants/progression.ts`'s rank-layers-consistent invariant expects it already unlocked at soldier+).
 * Generation, not a system, may mutate `World` directly -- the same convention `starter.ts` itself uses for the
 * player's associate setup, and the one `promoteToSoldier`'s own comment cites. */
function setupFromRankSoldier(world: World): void {
  const meId = world.player.characterId;
  const player = world.characters.byId[meId]!;
  const chief = findCrewChief(world);
  player.rank = "soldier";
  player.superiorId = chief.id;
  player.crewId = chief.crewId;
  if (chief.crewId) {
    const crew = world.crews.byId[chief.crewId]!;
    if (!crew.memberIds.includes(meId)) crew.memberIds.push(meId);
  }
  if (!world.player.uiLayersUnlocked.includes("loanBook")) world.player.uiLayersUnlocked.push("loanBook");
}

/** Income by source into the player's own account this turn (task brief): `MoneyMint` grouped by `source`,
 * `MoneyMove` grouped by `cause.rule` (renamed "share received" for the share rule, matching `view.ts`'s
 * `buildBook`, which special-cases the same rule name for the same reason -- it is the book's own income line). */
function incomeSummary(world: World, log: TurnLog): string {
  const player = world.characters.byId[world.player.characterId];
  if (!player) return "Income: (no player)";
  const myAccount = player.accounts.personal;
  const bySource = new Map<string, number>();
  for (const entry of log.entries) {
    if (entry.kind !== "fact") continue;
    const f = entry.fact;
    if (f.kind === "MoneyMint" && f.to === myAccount) bySource.set(f.source, (bySource.get(f.source) ?? 0) + f.amount);
    if (f.kind === "MoneyMove" && f.to === myAccount) {
      const label = f.cause.rule === "share" ? "share received" : f.cause.rule;
      bySource.set(label, (bySource.get(label) ?? 0) + f.amount);
    }
  }
  if (bySource.size === 0) return "Income: none";
  return `Income: ${[...bySource.entries()].map(([k, v]) => `${k} ${v} kL`).join(", ")}`;
}

/** Runs one game for `turns` turns under `strategy` (default yesMan), printing one block per turn to `output`.
 * Returns the final world so a caller (or a test) can assert on it after the trace prints. */
export function runTrace(opts: TraceOptions): World {
  const { content, output, turns } = opts;
  const strategy = opts.strategy ?? "yesMan";
  const ai = makeAiPlayer(strategy);

  let world = initialWorld(opts.seed, DEFAULT_SETUP, content);
  if (opts.fromRankSoldier) setupFromRankSoldier(world);

  for (let t = 0; t < turns; t++) {
    // Decisions are read off the world before this turn's `step()` (the same moment `projectView` normally
    // renders to the player, and `metrics.ts`'s own `decisionsPerTurn` first-ranks tracking reads it too).
    const view = projectView(world, null, content);
    output(`\n=== Turn ${world.meta.turn} (year ${world.meta.calendar.year}, week ${world.meta.calendar.week}) ===`);
    output(`Rank: ${view.you.rank}   Dirty: ${view.you.dirty} kL`);

    const actions: PlayerAction[] = [...ai.act(world, t)];
    if (opts.fromRankSoldier && t === 0) {
      actions.push({ kind: "askPermission", what: "openBook" }, { kind: "askPermission", what: "makeAssociate" });
    }
    const chosenByInstance = new Map(
      actions.filter((a): a is Extract<PlayerAction, { kind: "decide" }> => a.kind === "decide").map((a) => [a.instanceId, a.optionId]),
    );

    if (view.decisions.length === 0) {
      output("Decisions offered: (none)");
    } else {
      output("Decisions offered:");
      for (const d of view.decisions) {
        output(`  [${d.templateId}] ${d.prompt}`);
        output(`    chose: ${chosenByInstance.get(d.instanceId) ?? "(no option matched this preset; awaiting timeout)"}`);
      }
    }

    const result = step(world, actions, content, { debug: true, hash: false });
    world = result.world;

    output("Report:");
    if (result.report.lines.length === 0) output("  (nothing to report)");
    else for (const line of result.report.lines) output(`  ${line}`);

    output(incomeSummary(world, result.log));
  }

  return world;
}
