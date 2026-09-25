// Story test (build-plan §5b item 10; first-ranks-requirements §8 story 7; design 09 §6): the soldier's first
// ten weeks, run through the REAL pipeline (`initialWorld`/`buildStarterWorld` -> `step` -> `projectView`) with
// the shipped content (`loadContent()`), on the starter world and on three generated seeds. Unlike
// soldier.test.ts (which isolates one template per content array to test its own mechanics), this file loads
// every template so the player's week looks the way a real playthrough does, and asserts on what the player
// SAW (the view), the way build-plan §5b demands.
//
// The table (task brief):
//   week 0  the player is made a soldier under the crew chief (loanBook layer unlocked, as soldier.test.ts's
//           own `promoteToSoldier` fixture does -- generation, not a system, per that file's convention).
//   week 1  the player asks to open the book and to make an associate.
//   week 3  the chief has answered both asks (grant or refusal are both valid text).
//   week 4  if granted, the loan shows in the book as a debt and the balance rose.
//   week 10 an associate is on the book, a stall is on the book, and at least one week 5-10 shows income.
//   +3wks   a lend, once the lend action exists, produces an interest line or a loan roll.
//
// Every generated seed's chief may start with favor(chief->me) < 0 (a fresh soldier has no history with him),
// which would take the refusal branch on both asks; the task brief's own instruction is to lift favor with a
// `FavorDelta` (via `injectFacts`) at week 0 so the granted path is what these seeds exercise, and to cover the
// refusal branch once, explicitly, on the starter world instead (below, in its own describe block). The chief's
// personal account is topped up the same way (a `MoneyMint`, not a raw field write, so `money.conservation`
// stays honest under `runInvariants`): the design's grant condition only reads favor and `intakeOpen`, not
// account balance, but `soldier.openBook`'s own reducer (reducers/ledger.ts) independently rejects a `LoanOpen`
// the lender cannot afford (soldier.test.ts's own header note on this), and a generated chief's own starting
// purse is not part of this story's contract.
import { describe, expect, it } from "vitest";
import { loadContent } from "../../../content/src/index.js";
import { step } from "../step.js";
import type { PlayerAction } from "../step.js";
import { buildStarterWorld } from "../starter.js";
import { initialWorld } from "../replay.js";
import { favorKey } from "../world.js";
import type { Character, GameSetup, World } from "../world.js";
import type { Fact } from "../facts.js";
import type { TurnLog } from "../log.js";
import { projectView } from "../view.js";
import { runHealthChecks } from "../invariants/all.js";

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const content = loadContent();
// `debug: false`, not every other test file's `true`: this story already discovers (see the "known defect"
// describe block below) that two of this same task's new economy invariants (`economy.treasuryCanFundBook`,
// `economy.madeManHasStall`) are genuinely violated by ordinary play well within this story's own 10-week
// window, and `step()`'s debug mode throws on the first violation (packages/sim/src/step.ts) -- which would
// abort the narrative before this file's OWN assertions (the point of this story) ever ran. The dedicated
// "known defect" tests below turn debug back on (via `runInvariants` directly) specifically to document that.
const opts = { debug: false };

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

/** Same convention as soldier.test.ts's own `promoteToSoldier`, generalized: a soldier's superior IS the crew
 * chief (world.ts's `addCrew`), so it works unchanged on a generated world's sponsor/chief pair too. */
function promoteToSoldier(world: World): { meId: string; chief: Character } {
  const meId = world.player.characterId;
  const player = world.characters.byId[meId]!;
  const sponsor = world.characters.byId[player.superiorId!]!;
  const chief = world.characters.byId[sponsor.superiorId ?? sponsor.id]!;
  player.rank = "soldier";
  player.superiorId = chief.id;
  player.crewId = chief.crewId;
  if (chief.crewId) {
    const crew = world.crews.byId[chief.crewId]!;
    if (!crew.memberIds.includes(meId)) crew.memberIds.push(meId);
  }
  if (!world.player.uiLayersUnlocked.includes("loanBook")) world.player.uiLayersUnlocked.push("loanBook");
  return { meId, chief };
}

/** Lifts favor(chief -> me) to at least `min` via an injected `FavorDelta`, only if it is currently short of it
 * (the task brief's own instruction: "lift favor... so the story tests the granted path"). */
function ensureFavorAtLeast(world: World, chiefId: string, meId: string, min: number): { world: World; log: TurnLog } | null {
  const current = world.favors[favorKey(chiefId as never, meId as never)] ?? 0;
  if (current >= min) return null;
  return { ...step(world, [], content, { ...opts, injectFacts: [{ kind: "FavorDelta", from: chiefId as never, to: meId as never, delta: min - current, cause: { rule: "story-setup" } }] }) };
}

/** Tops up the chief's personal purse with a `MoneyMint` so `soldier.openBook`'s reducer-level affordability
 * check (soldier.test.ts's header) never blocks the grant this story is testing for. */
function ensureChiefFunded(world: World, chief: Character, min: number): { world: World; log: TurnLog } | null {
  const account = world.ledger.accounts.byId[chief.accounts.personal]!;
  if (account.dirty >= min) return null;
  return { ...step(world, [], content, { ...opts, injectFacts: [{ kind: "MoneyMint", to: chief.accounts.personal, amount: min - account.dirty, money: "dirty", source: "storySetup", cause: { rule: "story-setup" } }] }) };
}

function awaiting(world: World, templateId: string) {
  return world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === templateId && p.state === "awaitingDecision");
}

type Fixture = { name: string; build: () => World };

const FIXTURES: Fixture[] = [
  { name: "starter", build: () => buildStarterWorld("soldier-first-weeks-starter", setup, content) },
  { name: "story-1", build: () => initialWorld("story-1", setup, content) },
  { name: "story-2", build: () => initialWorld("story-2", setup, content) },
  { name: "story-3", build: () => initialWorld("story-3", setup, content) },
];

describe("soldier's first weeks, granted path (design 09 §6, first-ranks §8 story 7)", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: both asks are answered by week 3, the book and a man are on the book by week 10, money moves every week`, () => {
      let world = fixture.build();
      const { meId, chief } = promoteToSoldier(world);

      const logs: TurnLog[] = [];
      const setupA = ensureFavorAtLeast(world, chief.id, meId, 150);
      if (setupA) { world = setupA.world; logs.push(setupA.log); }
      const setupB = ensureChiefFunded(world, chief, 400);
      if (setupB) { world = setupB.world; logs.push(setupB.log); }

      const startTurn = world.meta.turn;
      const initialDirty = world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty;
      const balances: number[] = [initialDirty];

      // Week 1: ask for both.
      const r1 = step(world, [{ kind: "askPermission", what: "openBook" }, { kind: "askPermission", what: "makeAssociate" }], content, opts);
      world = r1.world;
      logs.push(r1.log);
      balances.push(world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty);

      // Weeks 2-3 (design 09 §7 item 4's spawnFrom fires within a turn; duration 0 offers the decision in the
      // same run it spawns, per soldier.ts's own header): answer "ask" (the only option) as soon as each is
      // awaiting, resolving both by week 3.
      let bookResolvedTurn: number | null = null;
      let assocResolvedTurn: number | null = null;
      for (let i = 0; i < 5 && (bookResolvedTurn === null || assocResolvedTurn === null); i++) {
        const b = awaiting(world, "soldier.openBook");
        const a = awaiting(world, "soldier.askAssociate");
        const actions: PlayerAction[] = [];
        if (b) actions.push({ kind: "decide", instanceId: b.id, optionId: "ask" });
        if (a) actions.push({ kind: "decide", instanceId: a.id, optionId: "ask" });
        const r = step(world, actions, content, opts);
        world = r.world;
        logs.push(r.log);
        balances.push(world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty);
        const facts = factsOf([r.log]);
        if (bookResolvedTurn === null && facts.some((f) => f.kind === "ProcessResolve" && f.cause.templateId === "soldier.openBook")) bookResolvedTurn = world.meta.turn;
        if (assocResolvedTurn === null && facts.some((f) => f.kind === "ProcessResolve" && f.cause.templateId === "soldier.askAssociate")) assocResolvedTurn = world.meta.turn;
      }
      expect(bookResolvedTurn, `${fixture.name}: soldier.openBook never resolved`).not.toBeNull();
      expect(assocResolvedTurn, `${fixture.name}: soldier.askAssociate never resolved`).not.toBeNull();
      expect(bookResolvedTurn! - startTurn, fixture.name).toBeLessThanOrEqual(3);
      expect(assocResolvedTurn! - startTurn, fixture.name).toBeLessThanOrEqual(3);

      // "The report contains the chief's answer line for each ask": both grantedFull/grantedShort/denied texts
      // for openBook mention "book"; askAssociate's granted text mentions "man" (its denied text does not, but
      // this fixture forced favor >= 0 and intakeOpen defaults true, so granted is the branch actually taken).
      const reportTexts = factsOf(logs)
        .filter((f): f is Extract<Fact, { kind: "ReportNote" }> => f.kind === "ReportNote")
        .map((f) => f.text);
      expect(reportTexts.some((t) => /book/i.test(t)), `${fixture.name}: ${JSON.stringify(reportTexts)}`).toBe(true);
      expect(reportTexts.some((t) => /\bman\b/i.test(t)), `${fixture.name}: ${JSON.stringify(reportTexts)}`).toBe(true);

      // Week 4: the loan is on the book as a debt, and the balance rose (forced-granted, this fixture's header).
      while (world.meta.turn < startTurn + 4) {
        const r = step(world, [], content, opts);
        world = r.world;
        logs.push(r.log);
        balances.push(world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty);
      }
      let view = projectView(world, logs.at(-1)!, content);
      expect(view.book.debts.length, `${fixture.name}: ${JSON.stringify(view.book.debts)} report=${JSON.stringify(reportTexts)}`).toBeGreaterThan(0);
      expect(view.book.debts.some((d) => d.lenderName === chief.name), fixture.name).toBe(true);
      expect(view.you.dirty, fixture.name).toBeGreaterThan(initialDirty);

      // The lend form (design 09 §6, view.ts's `buildActions` "lend" spec): once memory tag "bookOpen" landed
      // (part of every granted `soldier.openBook` outcome), lend 100 kL at 4 points to the first lendable
      // business, and within 3 weeks a roll happened (design 09 §6, systems/loans.ts rolls every week).
      let lendSpec = view.actions.find((a): a is Extract<(typeof view.actions)[number], { kind: "lend" }> => a.kind === "lend");
      for (let i = 0; i < 3 && (!lendSpec || lendSpec.businesses.length === 0); i++) {
        const r = step(world, [], content, opts);
        world = r.world;
        logs.push(r.log);
        balances.push(world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty);
        view = projectView(world, logs.at(-1)!, content);
        lendSpec = view.actions.find((a): a is Extract<(typeof view.actions)[number], { kind: "lend" }> => a.kind === "lend");
      }
      expect(lendSpec, `${fixture.name}: no "lend" action spec appeared after the book opened`).toBeDefined();
      if (lendSpec && lendSpec.businesses.length > 0) {
        const target = lendSpec.businesses[0]!;
        const rLend = step(world, [{ kind: "lend", businessId: target.id, principal: 100, points: 4 }], content, opts);
        world = rLend.world;
        logs.push(rLend.log);
        balances.push(world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty);

        let sawRoll = false;
        for (let i = 0; i < 3 && !sawRoll; i++) {
          const r = step(world, [], content, opts);
          world = r.world;
          logs.push(r.log);
          balances.push(world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty);
          const v = projectView(world, r.log, content);
          const interestLine = v.report.lines.some((l) => l.includes("Interest came in"));
          const loanRolled = v.book.loans[0] && (v.book.loans[0]!.lastTurn === "paid" || v.book.loans[0]!.lastTurn === "missed");
          if (interestLine || loanRolled) sawRoll = true;
        }
        expect(sawRoll, `${fixture.name}: no loan roll ("Interest came in" or a paid/missed loan) within 3 weeks of lending`).toBe(true);
      }

      // Continue to week 10 (relative to the ceremony), watching weeks 5-10 for a share received or a stall
      // collection, and tracking the balance every week throughout for the "never 5 weeks flat" assertion below.
      let sawIncome = false;
      while (world.meta.turn < startTurn + 10) {
        const r = step(world, [], content, opts);
        world = r.world;
        logs.push(r.log);
        balances.push(world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty);
        if (world.meta.turn - startTurn >= 5) {
          const v = projectView(world, r.log, content);
          const shareLine = v.report.lines.some((l) => /^Received \d+ kL \(share\)\.?$/.test(l));
          const stallPaid = v.book.stalls.some((s) => s.lastTurn === "paid");
          if (shareLine || stallPaid) sawIncome = true;
        }
      }
      const view10 = projectView(world, logs.at(-1)!, content);
      expect(view10.book.men.some((m) => m.rank === "associate"), `${fixture.name}: ${JSON.stringify(view10.book.men)}`).toBe(true);
      expect(view10.book.stalls.length, `${fixture.name}: ${JSON.stringify(view10.book.stalls)}`).toBeGreaterThan(0);
      expect(sawIncome, `${fixture.name}: no share or stall payment reported in weeks 5-10`).toBe(true);

      // "The player's balance never sits unchanged for 5 consecutive weeks": scan the recorded per-week
      // balances (week 1 through the end of this run) for the longest run of identical consecutive values.
      let longestFlatRun = 1;
      let currentFlatRun = 1;
      for (let i = 1; i < balances.length; i++) {
        currentFlatRun = balances[i] === balances[i - 1] ? currentFlatRun + 1 : 1;
        longestFlatRun = Math.max(longestFlatRun, currentFlatRun);
      }
      expect(longestFlatRun, `${fixture.name}: balances ${JSON.stringify(balances)}`).toBeLessThan(5);
    });
  }
});

// DEFECT (not this task's system to fix; economy.ts is packages/sim/src/invariants/economy.ts, added by this
// same task, item 2; reported per CLAUDE.md rule "do not paper over"): running this exact story out to week 25
// on a generated seed reliably trips two of the new economy invariants. `economy.treasuryCanFundBook` (every
// family treasury >= 150 kL dirty after turn 20) fails on every fixture, including the hand-built starter
// world with no player lending at all -- the family treasury genuinely runs under 150 kL in ordinary play, not
// only once a soldier's book draws on it. `economy.madeManHasStall` (every soldier of 10+ turns holds a
// business claim) fails on the generated seeds because `economy.shopsPerSoldier`'s own turn-0 finding is
// already true there (see packages/content/src/archetypes/archetypes.test.ts and generation.test.ts for the
// generation-time numbers): several crews are generated with fewer than 1.5 businesses per soldier, so the
// family AI's one-donor-per-turn stall handoff (ai/family-ai.ts) can never catch every soldier up -- some are
// structurally unstallable. Both are real content/tuning gaps, not test bugs; left failing rather than
// loosened. (The main story above runs with `debug: false` specifically so these two known violations do not
// abort the narrative assertions that ARE this file's job; see this file's own `opts`.)
describe("known defect: economy invariants do not hold by week 25 of this same story", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: no economy health-check failure by week 25`, () => {
      let world = fixture.build();
      const { meId, chief } = promoteToSoldier(world);
      const setupA = ensureFavorAtLeast(world, chief.id, meId, 150);
      if (setupA) world = setupA.world;
      const setupB = ensureChiefFunded(world, chief, 400);
      if (setupB) world = setupB.world;
      for (let i = 0; i < 25; i++) world = step(world, [], content, { debug: false }).world;
      expect(runHealthChecks(world).map((v) => `${v.name}: ${v.message}`)).toEqual([]);
    });
  }
});

describe("soldier's first weeks, refused path (design 09 §6, explicit negative favor)", () => {
  it("starter: a chief holding a grudge (favor < 0) refuses both asks, and the refusal is reported in words", () => {
    let world = buildStarterWorld("soldier-first-weeks-refused", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    world.favors[favorKey(chief.id as never, meId as never)] = -50;

    const logs: TurnLog[] = [];
    const r1 = step(world, [{ kind: "askPermission", what: "openBook" }, { kind: "askPermission", what: "makeAssociate" }], content, opts);
    world = r1.world;
    logs.push(r1.log);

    let bookResolved = false;
    let assocResolved = false;
    for (let i = 0; i < 5 && (!bookResolved || !assocResolved); i++) {
      const b = awaiting(world, "soldier.openBook");
      const a = awaiting(world, "soldier.askAssociate");
      const actions: PlayerAction[] = [];
      if (b) actions.push({ kind: "decide", instanceId: b.id, optionId: "ask" });
      if (a) actions.push({ kind: "decide", instanceId: a.id, optionId: "ask" });
      const r = step(world, actions, content, opts);
      world = r.world;
      logs.push(r.log);
      const facts = factsOf([r.log]);
      bookResolved ||= facts.some((f) => f.kind === "ProcessResolve" && f.cause.templateId === "soldier.openBook");
      assocResolved ||= facts.some((f) => f.kind === "ProcessResolve" && f.cause.templateId === "soldier.askAssociate");
    }
    expect(bookResolved).toBe(true);
    expect(assocResolved).toBe(true);

    const facts = factsOf(logs);
    expect(facts.some((f) => f.kind === "LoanOpen")).toBe(false);
    expect(facts.some((f) => f.kind === "CharacterCreate")).toBe(false);
    const reportTexts = facts.filter((f): f is Extract<Fact, { kind: "ReportNote" }> => f.kind === "ReportNote").map((f) => f.text);
    expect(reportTexts.some((t) => /no book|books are closed/i.test(t)), JSON.stringify(reportTexts)).toBe(true);

    const view = projectView(world, logs.at(-1)!, content);
    expect(view.book.debts).toHaveLength(0);
  });
});
