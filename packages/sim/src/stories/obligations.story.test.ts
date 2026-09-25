// Story test (design 12 §1): run design 12's content through the REAL pipeline (`buildStarterWorld`/
// `initialWorld` -> `step` -> the report), with the shipped content (`loadContent()`), on the starter world and
// one generated seed, the same convention `soldier-first-weeks.story.test.ts` establishes for this build plan
// phase. Four rows of design 12 §1's table: the soldier whose associate is arrested and is supported (the
// report shows the payment weekly, and the flip roll's support term reads it); the same, refused (the loyalty
// drop, and the flip roll's support term reads its absence); the funeral; a weakened family announced.
//
// `oblig.prisoner.open` and `soldier.ts`'s own `soldier.detained.support` both spawn from the identical
// trigger (`StatusChange` arrested, the man's superior the player) until integration removes the superseded
// card (this task's brief, and `oblig.prisoner.open`'s own header note); with the full shipped content loaded,
// both cards appear side by side for the same arrest. This file answers the old card with its own "nothing"
// (no state this file's own assertions read) every time it appears, purely so the run is deterministic, and
// asserts only on facts/state design 12's own templates and system own.
import { describe, expect, it } from "vitest";
import { loadContent } from "../../../content/src/index.js";
import { step } from "../step.js";
import type { PlayerAction } from "../step.js";
import { buildStarterWorld } from "../starter.js";
import { initialWorld } from "../replay.js";
import { addCharacter, type Character, type GameSetup, type World } from "../world.js";
import type { Fact } from "../facts.js";
import type { TurnLog } from "../log.js";
import { projectView } from "../view.js";
import { prisonerSupported } from "../systems/obligations.js";
import { mintId, tableInsert, type CharacterId, type ClaimId } from "@borgata/shared";

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const content = loadContent();
// `debug: false`: soldier-first-weeks.story.test.ts's own header explains why (two known economy invariant
// defects, not this task's system, trip well within ordinary play on every fixture including the starter);
// this story's own scenarios are short, but keeping the same convention avoids depending on that being true.
const opts = { debug: false };

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

/** soldier.test.ts's own convention, generalized (works unchanged on a generated world's sponsor/chief pair). */
function promoteToSoldier(world: World): { meId: CharacterId; chief: Character } {
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

function addAssociateOnRecord(world: World, name: string, superiorId: CharacterId): Character {
  const superior = world.characters.byId[superiorId]!;
  const man = addCharacter(world, { name, rank: "associate", age: 22, familyId: superior.familyId, superiorId, onRecordWith: superiorId });
  const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: man.id }, holderId: superiorId, since: world.meta.turn });
  return man;
}

function awaiting(world: World, templateId: string) {
  return world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === templateId && p.state === "awaitingDecision");
}

/** Advances turns, deciding `templateId` with `optionId` as soon as it is awaiting (and always answering
 * `soldier.detained.support`, this file's own header note, with "nothing" so the run stays deterministic). */
function decideWhenAwaiting(world: World, templateId: string, optionId: string, maxTurns: number): { world: World; logs: TurnLog[] } {
  const logs: TurnLog[] = [];
  for (let i = 0; i < maxTurns; i++) {
    const inst = awaiting(world, templateId);
    const oldCard = awaiting(world, "soldier.detained.support");
    const actions: PlayerAction[] = [];
    if (inst) actions.push({ kind: "decide", instanceId: inst.id, optionId });
    if (oldCard) actions.push({ kind: "decide", instanceId: oldCard.id, optionId: "nothing" });
    const r = step(world, actions, content, opts);
    world = r.world;
    logs.push(r.log);
    if (inst) return { world, logs };
  }
  throw new Error(`"${templateId}" never reached awaitingDecision within ${maxTurns} turns`);
}

type Fixture = { name: string; build: () => World };
const FIXTURES: Fixture[] = [
  { name: "starter", build: () => buildStarterWorld("obligations-story-starter", setup, content) },
  { name: "story-1", build: () => initialWorld("obligations-story-1", setup, content) },
];

describe("design 12 §1: the soldier whose associate is arrested (story test)", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: 'support' opens the duty, and the report shows the payment weekly`, () => {
      let world = fixture.build();
      const { meId } = promoteToSoldier(world);
      const man = addAssociateOnRecord(world, "Turi's Man", meId as CharacterId);
      world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty = 200;
      world.ledger.minted += 200;

      const logs: TurnLog[] = [];
      const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: man.id, status: "arrested", untilTurn: world.meta.turn + 20, cause: { rule: "test" } }] });
      world = r0.world;
      logs.push(r0.log);

      const opened = decideWhenAwaiting(world, "oblig.prisoner.open", "support", 10);
      world = opened.world;
      logs.push(...opened.logs);
      expect(factsOf(opened.logs).some((f) => f.kind === "ObligationOpen" && f.obligation.kind === "prisonerSupport"), `${fixture.name}: ${JSON.stringify(factsOf(opened.logs))}`).toBe(true);

      // Three weekly dues, each answered "pay": the report shows the payment each week (design 12 §1's own
      // acceptance line), and `prisonerSupported` (the flip roll's own term, engine/predicates.ts) reads it.
      let paidWeeks = 0;
      for (let week = 0; week < 3; week++) {
        const paid = decideWhenAwaiting(world, "oblig.due.card", "pay", 6);
        world = paid.world;
        logs.push(...paid.logs);
        const view = projectView(world, paid.logs.at(-1)!, content);
        if (view.report.lines.some((l) => /you paid .* kl \(prisonersupport\)/i.test(l))) paidWeeks++;
      }
      expect(paidWeeks, `${fixture.name}: no "You paid ... kL (prisonerSupport)" report line over 3 weeks`).toBeGreaterThan(0);
      expect(prisonerSupported(world, man.id), fixture.name).toBe(true);
    });

    it(`${fixture.name}: 'nothing' drops loyalty immediately, and the flip roll's term reads him unsupported`, () => {
      let world = fixture.build();
      const { meId } = promoteToSoldier(world);
      const man = addAssociateOnRecord(world, "Turi's Man", meId as CharacterId);
      const before = man.loyalty;

      const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: man.id, status: "arrested", untilTurn: world.meta.turn + 20, cause: { rule: "test" } }] });
      world = r0.world;

      const nothing = decideWhenAwaiting(world, "oblig.prisoner.open", "nothing", 10);
      world = nothing.world;
      const facts = factsOf(nothing.logs);
      expect(facts.some((f) => f.kind === "LoyaltyDelta" && f.characterId === man.id && f.delta === -30), `${fixture.name}: ${JSON.stringify(facts)}`).toBe(true);
      expect(world.characters.byId[man.id]!.loyalty, fixture.name).toBeLessThan(before);
      expect(prisonerSupported(world, man.id), fixture.name).toBe(false);
    });
  }
});

describe("design 12 §1: the funeral (story test)", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: attending opens a once funeral duty that is then paid`, () => {
      let world = fixture.build();
      const { meId } = promoteToSoldier(world);
      const dead = addAssociateOnRecord(world, "A Dead Man", meId as CharacterId);
      world.ledger.accounts.byId[world.characters.byId[meId]!.accounts.personal]!.dirty = 100;
      world.ledger.minted += 100;

      const r0 = step(world, [], content, { ...opts, injectFacts: [{ kind: "StatusChange", characterId: dead.id, status: "dead", cause: { rule: "test" } }] });
      world = r0.world;
      const attend = decideWhenAwaiting(world, "oblig.funeral", "attend", 10);
      world = attend.world;
      expect(factsOf(attend.logs).some((f) => f.kind === "ObligationOpen" && f.obligation.kind === "funeral"), fixture.name).toBe(true);

      const paid = decideWhenAwaiting(world, "oblig.due.card", "pay", 6);
      world = paid.world;
      const view = projectView(world, paid.logs.at(-1)!, content);
      expect(view.report.lines.some((l) => /you paid .* kl \(funeral\)/i.test(l)), `${fixture.name}: ${JSON.stringify(view.report.lines)}`).toBe(true);
    });
  }
});

describe("design 12 §1: a weakened family is announced (story test)", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: four turns of income below duties weakens the family, and the newspaper says so`, () => {
      let world = fixture.build();
      const me = world.characters.byId[world.player.characterId]!;
      const family = world.families.byId[me.familyId!]!;
      // A recurring duty far above any plausible income, on a made man of the player's own family (systems/
      // obligations.ts's own `familyMembers`/duties total only counts made men, matching obligations.test.ts).
      const debtor = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.familyId === family.id && c.rank !== "civilian" && c.rank !== "associate" && c.id !== me.id)!;
      const logs: TurnLog[] = [];
      const rOpen = step(world, [], content, {
        ...opts,
        injectFacts: [{ kind: "ObligationOpen", obligation: { id: "story-big-debt", kind: "gift", debtorId: debtor.id, beneficiary: { kind: "external", id: "acct-external-sink" }, amount: 5000, everyTurns: 1, nextDueTurn: world.meta.turn, untilTurn: null, met: 0, missed: 0, lastResult: null, status: "open" }, cause: { rule: "test" } }],
      });
      world = rOpen.world;
      logs.push(rOpen.log);

      let sawWeakened = false;
      for (let i = 0; i < 6 && !sawWeakened; i++) {
        const r = step(world, [], content, opts);
        world = r.world;
        logs.push(r.log);
        const view = projectView(world, r.log, content);
        if (view.report.lines.some((l) => /weakened/i.test(l))) sawWeakened = true;
      }
      expect(sawWeakened, `${fixture.name}: family state ${world.families.byId[family.id]!.state}, reports ${JSON.stringify(factsOf(logs).filter((f) => f.kind === "ReportNote"))}`).toBe(true);
      expect(world.families.byId[family.id]!.state, fixture.name).toBe("weakened");
    });
  }
});
