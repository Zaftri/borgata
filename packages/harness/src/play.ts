// The command-line play loop's core (build plan phase 4b; design 07 §2-§5, the terminal precursor to the
// text interface). `runPlay` is pure-ish: it takes an action source and an output sink so it can be driven
// by `node:readline` (interactive, wired in cli.ts) or by a plain string array (tests, scripted replay).
//
// Per turn: (1) print last turn's Report lines, the calendar, rank, weight, personal balance, the player's
// own loyalty and his sponsor's name, and the unlocked UI layers; (2) print the request queue and any
// pending decisions whose deciding role (design 04's `decision.role`) is bound to the player; (3) print the
// actions available at the player's rank; (4) read commands until `end` (or `quit`/input exhaustion),
// accumulating PlayerActions, then call `step`. Rejected-action notes surface in `report.lines` (log.ts)
// and so are printed at the top of the following turn, alongside everything else from the last step.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION, SNAPSHOT_EVERY_TURNS } from "@borgata/shared";
import {
  initialWorld,
  load,
  playerCharacter,
  resolveDeciderRoleName,
  step,
  type Content,
  type GameSetup,
  type PlayerAction,
  type Report,
  type SaveFile,
  type World,
} from "@borgata/sim";

/** One process template, pulled out of `Content` so this file needn't import `ProcessTemplate` directly. */
type Template = Content["templates"][number];

const DEFAULT_SETUP: GameSetup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false };

export type RunPlayOptions = {
  seed: string;
  content: Content;
  /** One command per yielded string. A plain array for scripts and tests; an async iterable (e.g. readline) for interactive play. */
  input: AsyncIterable<string> | string[];
  output: (line: string) => void;
  /** Resume from this SaveFile (via `load`, design 01 §6) instead of starting a fresh world. */
  save?: SaveFile;
  /** Stop after this many completed turns. Omit to run until `quit` or the input is exhausted. */
  maxTurns?: number;
  /** Where the `save` command persists the SaveFile. Defaults to `packages/harness/out/play-<seed>.json`. */
  savePath?: string;
};

export type RunPlayResult = { world: World; save: SaveFile };

function defaultSavePath(seed: string): string {
  return fileURLToPath(new URL(`../out/play-${seed}.json`, import.meta.url));
}

function persistSave(save: SaveFile, savePath: string, output: (line: string) => void): void {
  mkdirSync(dirname(savePath), { recursive: true });
  writeFileSync(savePath, JSON.stringify(save, null, 2) + "\n");
  output(`Saved to ${savePath}`);
}

/** Pulls one command at a time from either source, uniformly. */
function makePuller(input: AsyncIterable<string> | string[]): () => Promise<string | undefined> {
  if (Array.isArray(input)) {
    let i = 0;
    return async () => (i < input.length ? input[i++] : undefined);
  }
  const it = input[Symbol.asyncIterator]();
  return async () => {
    const r = await it.next();
    return r.done ? undefined : r.value;
  };
}

function isSoldierOrAbove(rank: string): boolean {
  return rank !== "civilian" && rank !== "associate";
}

function printHeader(world: World, lastReport: Report | null, output: (line: string) => void): void {
  const p = playerCharacter(world);
  output("");
  output(`===== Turn ${world.meta.turn} =====`);
  output("--- Report (last turn) ---");
  if (!lastReport || lastReport.lines.length === 0) output("(nothing to report)");
  else for (const line of lastReport.lines) output(line);

  output(`Anno ${world.meta.calendar.year}, settimana ${world.meta.calendar.week} (turn: ${world.meta.turnLength} week${world.meta.turnLength === 1 ? "" : "s"})`);
  output(`Rank: ${p.rank}   Weight: ${p.weight}`);
  const account = world.ledger.accounts.byId[p.accounts.personal];
  output(`Personal balance: dirty ${account?.dirty ?? 0} kL, clean ${account?.clean ?? 0} kL`);
  const sponsor = p.superiorId ? world.characters.byId[p.superiorId] : undefined;
  output(`Loyalty (toward ${sponsor ? sponsor.name : "no one; you have no superior"}): ${p.loyalty}`);
  output(`Unlocked: ${world.player.uiLayersUnlocked.join(", ") || "(none)"}`);
}

function printQueue(world: World, content: Content, output: (line: string) => void): void {
  output("--- Requests ---");
  if (world.player.requestQueue.length === 0) output("(none)");
  for (const r of world.player.requestQueue) output(`  [${r.id}] ${r.text}`);

  const player = playerCharacter(world);
  const templatesById = new Map<string, Template>(content.templates.map((t) => [t.id, t]));
  const mine: Array<{ instanceId: string; options: string[]; template: Template }> = [];
  for (const id of world.processes.order) {
    const inst = world.processes.byId[id]!;
    if (inst.state !== "awaitingDecision" || !inst.decision) continue;
    const template = templatesById.get(inst.templateId);
    if (!template?.decision) continue;
    const deciderRef = inst.roles[resolveDeciderRoleName(world, template.decision.role, inst.roles)];
    if (deciderRef?.kind === "character" && deciderRef.id === player.id) {
      mine.push({ instanceId: inst.id, options: inst.decision.options, template });
    }
  }
  if (mine.length > 0) {
    output("--- Decisions ---");
    for (const { instanceId, options, template } of mine) {
      output(`  [${instanceId}] ${template.decision!.prompt}`);
      for (const optionId of options) {
        const option = template.decision!.options.find((o) => o.id === optionId);
        output(`      ${optionId}: ${option?.label ?? optionId}`);
      }
    }
  }
}

function printActions(world: World, output: (line: string) => void): void {
  const p = playerCharacter(world);
  const soldierPlus = isSoldierOrAbove(p.rank);
  output("--- Actions ---");
  output("  end                                        end the turn");
  output("  decide <instanceId> <optionId>              answer a pending decision");
  if (soldierPlus) {
    output("  share <subordinateId> <fixed> <percent>     set a subordinate's share rule (soldier+)");
    output("  claim <businessId>                          claim a business (soldier+)");
    output("  lend <businessId> <principal> <points>       open the book to a business (soldier+)");
  }
  output("  release <claimId>                           release a claim you hold");
  output("  ask makeAssociate|openBook                   ask your sponsor for permission");
  output("  who                                          list family members");
  output("  map                                          list blocks and businesses");
  output("  save                                         save the game");
  output("  quit                                         quit");
}

function printWho(world: World, output: (line: string) => void): void {
  output("--- Family ---");
  const player = playerCharacter(world);
  if (!player.familyId) {
    output("(no family)");
    return;
  }
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (c.familyId !== player.familyId) continue;
    const marker = c.id === player.id ? " (you)" : "";
    output(`  ${c.name}${marker} [${c.id}] rank=${c.rank} status=${c.status} loyalty=${c.loyalty} weight=${c.weight}`);
  }
}

/** Local lookup (claims-reducer internals are not part of `@borgata/sim`'s public surface). */
function claimHolderName(world: World, businessId: string): string {
  for (const id of world.claims.order) {
    const claim = world.claims.byId[id]!;
    if (claim.subject.kind === "business" && claim.subject.id === businessId) {
      const holder = world.characters.byId[claim.holderId];
      return holder ? holder.name : claim.holderId;
    }
  }
  return "unclaimed";
}

function printMap(world: World, output: (line: string) => void): void {
  output("--- Territory ---");
  const player = playerCharacter(world);
  const family = player.familyId ? world.families.byId[player.familyId] : undefined;
  if (!family) {
    output("(no family)");
    return;
  }
  for (const townId of family.townIds) {
    const town = world.geo.towns.byId[townId];
    if (!town) continue;
    output(`  Town: ${town.name}`);
    for (const blockId of town.blockIds) {
      const block = world.geo.blocks.byId[blockId];
      if (!block) continue;
      output(`    Block [${block.id}] crew=${block.crewId ?? "none"}`);
      for (const businessId of block.businessIds) {
        const b = world.geo.businesses.byId[businessId];
        if (!b) continue;
        output(
          `      [${b.id}] ${b.type} size=${b.size} compliance=${b.compliance} fear=${b.fear} refusal=${b.refusalStage} holder=${claimHolderName(world, b.id)}`,
        );
      }
    }
  }
}

type CommandResult = "end" | "quit" | "continue";

function handleCommand(
  line: string,
  actions: PlayerAction[],
  world: World,
  output: (line: string) => void,
  persist: () => void,
): CommandResult {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "continue";
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]!;

  switch (cmd) {
    case "end":
      return "end";
    case "quit":
      return "quit";
    case "save":
      persist();
      return "continue";
    case "who":
      printWho(world, output);
      return "continue";
    case "map":
      printMap(world, output);
      return "continue";
    case "decide": {
      const instanceId = parts[1];
      const optionId = parts[2];
      if (!instanceId || !optionId) output("usage: decide <instanceId> <optionId>");
      else actions.push({ kind: "decide", instanceId, optionId });
      return "continue";
    }
    case "share": {
      const subordinateId = parts[1];
      const fixedPerTurn = Number(parts[2]);
      const percent = Number(parts[3]);
      if (!subordinateId || !Number.isFinite(fixedPerTurn) || !Number.isFinite(percent)) {
        output("usage: share <subordinateId> <fixed> <percent>");
      } else {
        actions.push({ kind: "setShare", subordinateId, rule: { fixedPerTurn, percent } });
      }
      return "continue";
    }
    case "claim": {
      const businessId = parts[1];
      if (!businessId) output("usage: claim <businessId>");
      else actions.push({ kind: "claimBusiness", businessId });
      return "continue";
    }
    case "lend": {
      const businessId = parts[1];
      const principal = Number(parts[2]);
      const points = Number(parts[3]);
      if (!businessId || !Number.isFinite(principal) || !Number.isFinite(points)) {
        output("usage: lend <businessId> <principal> <points>");
      } else {
        actions.push({ kind: "lend", businessId, principal, points });
      }
      return "continue";
    }
    case "release": {
      const claimId = parts[1];
      if (!claimId) output("usage: release <claimId>");
      else actions.push({ kind: "releaseClaim", claimId });
      return "continue";
    }
    case "ask": {
      const what = parts[1];
      if (what !== "makeAssociate" && what !== "openBook") output("usage: ask makeAssociate|openBook");
      else actions.push({ kind: "askPermission", what });
      return "continue";
    }
    default:
      output(`unknown command: ${trimmed}`);
      return "continue";
  }
}

export async function runPlay(opts: RunPlayOptions): Promise<RunPlayResult> {
  const { content, output } = opts;

  let world: World;
  let save: SaveFile;
  if (opts.save) {
    save = structuredClone(opts.save);
    world = load(save, content).world;
  } else {
    save = { schemaVersion: SCHEMA_VERSION, contentVersion: content.version, seed: opts.seed, setup: DEFAULT_SETUP, actions: [], snapshots: [] };
    world = initialWorld(opts.seed, DEFAULT_SETUP, content);
  }

  const savePath = opts.savePath ?? defaultSavePath(save.seed);
  const pull = makePuller(opts.input);

  let lastReport: Report | null = null;
  let turnsRun = 0;
  let stop = false;

  while (!stop && (opts.maxTurns === undefined || turnsRun < opts.maxTurns)) {
    printHeader(world, lastReport, output);
    printQueue(world, content, output);
    printActions(world, output);

    const actions: PlayerAction[] = [];
    let sawLine = false;
    let ended = false;
    let quitNow = false;

    while (!ended && !quitNow) {
      const line = await pull();
      if (line === undefined) {
        if (!sawLine) quitNow = true; // nothing left at all: stop cleanly without stepping a phantom turn
        else ended = true; // ran out mid-turn: finish this turn with whatever was accumulated
        break;
      }
      sawLine = true;
      const result = handleCommand(line, actions, world, output, () => persistSave(save, savePath, output));
      if (result === "end") ended = true;
      else if (result === "quit") quitNow = true;
    }

    if (quitNow && !ended) {
      stop = true;
      break;
    }

    const stepResult = step(world, actions, content, { debug: true });
    world = stepResult.world;
    lastReport = stepResult.report;
    save.actions.push({ turn: save.actions.length, actions });
    if (world.meta.turn % SNAPSHOT_EVERY_TURNS === 0) {
      save.snapshots.push({ turn: world.meta.turn, world: structuredClone(world), hash: stepResult.hash });
    }
    turnsRun++;

    if (quitNow) stop = true;
  }

  return { world, save };
}
