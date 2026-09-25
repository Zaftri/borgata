// Scenario tests for the soldier opening (design 09 §6): the loan book, making an associate, standing behind a
// man who gets arrested, and the chief's two demands. One scenario per template driven through `step()`, plus
// the requirement's story 7 (both permission asks resolved within ten turns of the ceremony). Content lives in
// packages/content; sim may not import it for production code (design 01 §2), but this test file is exempt
// (eslint.config.js ignores packages/sim/src/**/*.test.ts from the sim-only-imports-@borgata/shared rule), the
// same exemption associate-week.test.ts and associate-people.test.ts already rely on.
import { EMPTY_CONTENT } from "./content-types.js";
import { describe, expect, it } from "vitest";
import { addCharacter, favorKey } from "./world.js";
import type { Character, GameSetup, World } from "./world.js";
import { mintId, tableInsert } from "@borgata/shared";
import type { CharacterId, ClaimId } from "@borgata/shared";
import type { Fact } from "./facts.js";
import type { TurnLog } from "./log.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import type { ProcessTemplate } from "./engine/types.js";
import { SOLDIER_TEMPLATES } from "../../content/src/templates/soldier.js";

const [openBook, askAssociate, askAssociateClaim, chiefDemandEnvelope, chiefDemandMan] = SOLDIER_TEMPLATES;

const setup: GameSetup = { archetype: null, background: "family", difficulty: "normal", ironman: false };
const opts = { debug: true };

function contentOf(templates: ProcessTemplate[]) {
  return { ...EMPTY_CONTENT, version: "t", templates };
}

function factsOf(logs: readonly TurnLog[]): Fact[] {
  const out: Fact[] = [];
  for (const log of logs) for (const e of log.entries) if (e.kind === "fact") out.push(e.fact);
  return out;
}

/** The starter world's chief, "Turi Lo Cascio" (starter.ts, design 02 §4). */
function findByName(world: World, name: string): Character {
  const cid = world.characters.order.find((id) => world.characters.byId[id]!.name === name);
  if (!cid) throw new Error(`starter world has no character named "${name}"`);
  return world.characters.byId[cid]!;
}

/** Fast-forwards the starter world's player past the ceremony (design 09 §4's `assoc.proposal`, a parallel
 * task's own file) directly to soldier, sponsored by the starter crew's chief: generation, not a system, so
 * fields are set directly, the same convention `starter.ts` itself uses for the player's associate setup. */
function promoteToSoldier(world: World): { meId: CharacterId; chief: Character } {
  const meId = world.player.characterId;
  const player = world.characters.byId[meId]!;
  const chief = findByName(world, "Turi Lo Cascio");
  player.rank = "soldier";
  player.superiorId = chief.id;
  player.crewId = chief.crewId;
  if (chief.crewId) {
    const crew = world.crews.byId[chief.crewId]!;
    if (!crew.memberIds.includes(meId)) crew.memberIds.push(meId);
  }
  // `invariants/progression.ts`'s `rankLayersConsistent` expects every layer `UI_LAYERS_BY_RANK` lists for a
  // rank at or below the player's own to already be unlocked; the real path (`assoc.proposal`'s `RankChange`,
  // or `systems/progression.ts`'s own promotion hook) unlocks it as a side effect this direct-mutation fixture
  // bypasses, so it is set here instead (the same "generation, not a system" convention `starter.ts` itself
  // uses for the player's associate setup).
  if (!world.player.uiLayersUnlocked.includes("loanBook")) world.player.uiLayersUnlocked.push("loanBook");
  return { meId, chief };
}

/** An associate on record with `superiorId`, with the matching `Claim` `invariants/claims.ts`'s
 * `associateOnRecordConsistent` requires (design 02 §9): `starter.ts`'s own convention for the player's
 * associate setup, generation rather than a system. */
function addAssociateOnRecord(world: World, name: string, superiorId: CharacterId): Character {
  const superior = world.characters.byId[superiorId]!;
  const man = addCharacter(world, { name, rank: "associate", age: 22, familyId: superior.familyId, superiorId, onRecordWith: superiorId });
  const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: man.id }, holderId: superiorId, since: world.meta.turn });
  return man;
}

/** The player's kid (design 09 §5, generation/player.ts): a civilian on record with `superiorId` (the player),
 * trait `kid`, with the matching claim generation itself would give him (this file's own convention above for
 * `addAssociateOnRecord`, and `situations-a.test.ts`'s own `addKid`, which does not need the claim for its own
 * templates' purposes but generation always creates one -- soldier.ts's grantedKid outcome, this task, depends
 * on it already existing so it never emits a fresh `ClaimSet`; see soldier.ts's header, deviation 7). */
function addKidOnRecord(world: World, superiorId: CharacterId, age: number, loyalty: number): Character {
  const superior = world.characters.byId[superiorId]!;
  const kid = addCharacter(world, {
    name: "Turiddu",
    rank: "civilian",
    age,
    loyalty,
    familyId: superior.familyId,
    superiorId,
    onRecordWith: superiorId,
    traits: ["kid"],
  });
  const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: kid.id }, holderId: superiorId, since: world.meta.turn });
  return kid;
}

/** Retargets the first business claim in the starter world (design 02 §4: pre-claimed by one of the two
 * soldiers) onto the player, so the protection-tax chain (systems/chains.ts) has a shop of the player's OWN to
 * assign among "the associates on record with him" -- otherwise every starter-world business is already
 * claimed by a soldier with no associates of his own, and the round-robin fallback never reaches an associate
 * on record with the player either (chains.ts's own collector-assignment comment). Direct mutation, not a
 * `ClaimTransfer` fact: the same "generation, not a system" convention this file's other fixtures already use. */
function givePlayerAClaimedShop(world: World, meId: CharacterId): void {
  const claim = world.claims.byId[world.claims.order.find((id) => world.claims.byId[id]!.subject.kind === "business")!]!;
  claim.holderId = meId;
}

/** Steps up to `maxTurns` times until an instance of `templateId` is `awaitingDecision`. Mirrors associate-
 * people.test.ts's own `stepUntilAwaitingDecision`. */
function stepUntilAwaitingDecision(
  world: World,
  content: ReturnType<typeof contentOf>,
  templateId: string,
  maxTurns: number,
): { world: World; logs: TurnLog[]; instanceId: string } {
  const logs: TurnLog[] = [];
  let instanceId: string | undefined;
  for (let i = 0; i < maxTurns && !instanceId; i++) {
    const r = step(world, [], content, opts);
    world = r.world;
    logs.push(r.log);
    const inst = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === templateId && p.state === "awaitingDecision");
    if (inst) instanceId = inst.id;
  }
  if (!instanceId) throw new Error(`no "${templateId}" instance reached awaitingDecision within ${maxTurns} turns`);
  return { world, logs, instanceId };
}

describe("soldier.openBook (design 09 §6)", () => {
  it("asks for permission, and the chief grants the full 400 when he can afford it and holds no grudge", () => {
    const content = contentOf([openBook!]);
    let world = buildStarterWorld("open-book-1", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    const meAccount = world.characters.byId[meId]!.accounts.personal;
    world.ledger.accounts.byId[chief.accounts.personal]!.dirty = 500;
    world.ledger.minted += 500; // keep money.conservation honest about this fixture-injected cash

    const r0 = step(world, [{ kind: "askPermission", what: "openBook" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.openBook", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    world = rDecide.world;
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);

    const loanOpen = facts.find((f): f is Extract<Fact, { kind: "LoanOpen" }> => f.kind === "LoanOpen");
    expect(loanOpen).toBeDefined();
    expect(loanOpen!.loan.lenderId).toBe(chief.id);
    expect(loanOpen!.loan.borrower).toEqual({ kind: "character", id: meId });
    expect(loanOpen!.loan.principal).toBe(400);
    expect(world.characters.byId[chief.id]!.loans.some((l) => l.id === loanOpen!.loan.id)).toBe(true);
    // Not an exact balance: `loansStep` (systems/loans.ts) rolls this same brand-new loan's first weekly
    // interest+principal payment in this very `step()` call (it sees the loan the instant `LoanOpen` applies),
    // so the player's final balance is 400 minus that same-turn payment, not 400 outright.
    expect(world.ledger.accounts.byId[meAccount]!.dirty).toBeGreaterThan(0);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === meId && f.memory.tag === "bookOpen")).toBe(true);
  });

  it("falls back to a 150 loan when the chief cannot fund the full 400 (this file's header, deviation 4)", () => {
    const content = contentOf([openBook!]);
    let world = buildStarterWorld("open-book-2", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    // Between the two thresholds (150 and 400): short of the full loan, but enough to fund the fallback amount
    // itself -- `reducers/ledger.ts`'s own `LoanOpen` case rejects the fact outright if the lender can't cover
    // even the smaller principal, so the fixture must clear that bar too, not just fail the higher one.
    world.ledger.accounts.byId[chief.accounts.personal]!.dirty = 200;
    world.ledger.minted += 200;

    const r0 = step(world, [{ kind: "askPermission", what: "openBook" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.openBook", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);

    const loanOpen = facts.find((f): f is Extract<Fact, { kind: "LoanOpen" }> => f.kind === "LoanOpen");
    expect(loanOpen).toBeDefined();
    expect(loanOpen!.loan.principal).toBe(150);
    expect(loanOpen!.loan.borrower).toEqual({ kind: "character", id: meId });
  });

  it("denies the book and costs favor when the chief already holds a grudge", () => {
    const content = contentOf([openBook!]);
    let world = buildStarterWorld("open-book-3", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    world.favors[favorKey(chief.id, meId)] = -50;

    const r0 = step(world, [{ kind: "askPermission", what: "openBook" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.openBook", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);

    expect(facts.some((f) => f.kind === "LoanOpen")).toBe(false);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === chief.id && f.to === meId && f.delta === -10)).toBe(true);
  });
});

describe("soldier.askAssociate and soldier.askAssociate.claim (design 09 §6)", () => {
  it("creates a new associate on the player's own book, then claims and shares him a turn later", () => {
    const content = contentOf([askAssociate!, askAssociateClaim!]);
    let world = buildStarterWorld("ask-associate-1", setup, content);
    const { meId } = promoteToSoldier(world);

    const r0 = step(world, [{ kind: "askPermission", what: "makeAssociate" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.askAssociate", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    world = rDecide.world;
    let facts = factsOf([r0.log, ...logs1, rDecide.log]);

    const created = facts.find((f): f is Extract<Fact, { kind: "CharacterCreate" }> => f.kind === "CharacterCreate");
    expect(created).toBeDefined();
    expect(created!.rank).toBe("associate");
    expect(created!.superiorId).toBe(meId);
    // Not yet on record with anyone (this file's header, deviation 2): `onRecordWith` stays null until the
    // claim lands a turn later, so the world stays `claims.associateOnRecordConsistent` in between.
    expect(created!.onRecordWith).toBeNull();
    const associateId = created!.id;
    expect(world.characters.byId[associateId]!.onRecordWith).toBeNull();

    // The claim and share rule land one turn after the character does (this file's header, deviation 2).
    const followLogs: TurnLog[] = [];
    for (let i = 0; i < 3; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      followLogs.push(r.log);
    }
    facts = [...facts, ...factsOf(followLogs)];

    expect(facts.some((f) => f.kind === "ClaimSet" && f.subject.kind === "associate" && f.subject.id === associateId && f.holderId === meId)).toBe(true);
    expect(facts.some((f) => f.kind === "ShareRuleSet" && f.superiorId === meId && f.subordinateId === associateId && f.rule.percent === 500)).toBe(true);
    expect(world.characters.byId[associateId]!.onRecordWith).toBe(meId);
  });

  it("denies and costs favor when the family's books are closed (intakeOpen false)", () => {
    const content = contentOf([askAssociate!, askAssociateClaim!]);
    let world = buildStarterWorld("ask-associate-2", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    const family = world.families.byId[world.characters.byId[meId]!.familyId!]!;
    family.policy.intakeOpen = false;

    const r0 = step(world, [{ kind: "askPermission", what: "makeAssociate" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.askAssociate", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);

    expect(facts.some((f) => f.kind === "CharacterCreate")).toBe(false);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === chief.id && f.to === meId && f.delta === -10)).toBe(true);
  });
});

// ===================================================================================================================
// event-storming §4's last row: "when a made man asks for an associate, the kid he kept becomes his first man by
// name." `soldier.askAssociate`'s `grantedKid` outcome (this task, soldier.ts).
// ===================================================================================================================

describe("soldier.askAssociate: the kid becomes the first man (event-storming §4, design 09 §5/§6)", () => {
  it("a kid old enough (17) and loyal enough (600) is made an associate on record with the player, with a share rule, and the report names him -- no new man is created", () => {
    const content = contentOf([askAssociate!, askAssociateClaim!]);
    let world = buildStarterWorld("kid-made-1", setup, content);
    const { meId } = promoteToSoldier(world);
    const kid = addKidOnRecord(world, meId, 17, 600);

    const r0 = step(world, [{ kind: "askPermission", what: "makeAssociate" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.askAssociate", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    world = rDecide.world;
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);

    expect(facts.some((f) => f.kind === "ProcessResolve" && f.instanceId === instanceId && f.outcomeId === "grantedKid")).toBe(true);
    expect(facts.some((f) => f.kind === "CharacterCreate")).toBe(false); // no new man: the kid was ready

    expect(facts.some((f) => f.kind === "RankChange" && f.characterId === kid.id && f.rank === "associate")).toBe(true);
    expect(world.characters.byId[kid.id]!.rank).toBe("associate");
    expect(world.characters.byId[kid.id]!.onRecordWith).toBe(meId); // already true from generation; still true after
    expect(facts.some((f) => f.kind === "ShareRuleSet" && f.superiorId === meId && f.subordinateId === kid.id && f.rule.percent === 500)).toBe(true);
    expect(facts.some((f) => f.kind === "MemoryAdd" && f.characterId === kid.id && f.memory.tag === "made")).toBe(true);

    // The report names him (design 09 §8, event-storming §4's own last row: "by name").
    const named = facts.some((f) => f.kind === "ReportNote" && f.text.includes(kid.name));
    expect(named).toBe(true);
  });

  it("falls back to a new man when the kid is too young (15): the kid stays a civilian", () => {
    const content = contentOf([askAssociate!, askAssociateClaim!]);
    let world = buildStarterWorld("kid-made-2", setup, content);
    const { meId } = promoteToSoldier(world);
    const kid = addKidOnRecord(world, meId, 15, 600);

    const r0 = step(world, [{ kind: "askPermission", what: "makeAssociate" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.askAssociate", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    world = rDecide.world;
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);

    expect(facts.some((f) => f.kind === "ProcessResolve" && f.instanceId === instanceId && f.outcomeId === "grantedKid")).toBe(false);
    const created = facts.find((f): f is Extract<Fact, { kind: "CharacterCreate" }> => f.kind === "CharacterCreate");
    expect(created).toBeDefined();
    expect(created!.rank).toBe("associate");
    expect(world.characters.byId[kid.id]!.rank).toBe("civilian"); // the kid himself is untouched
  });

  it("falls back to a new man when the kid's loyalty (400) is too low, even though he is old enough (17)", () => {
    const content = contentOf([askAssociate!, askAssociateClaim!]);
    let world = buildStarterWorld("kid-made-3", setup, content);
    const { meId } = promoteToSoldier(world);
    const kid = addKidOnRecord(world, meId, 17, 400);

    const r0 = step(world, [{ kind: "askPermission", what: "makeAssociate" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.askAssociate", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    world = rDecide.world;
    const facts = factsOf([r0.log, ...logs1, rDecide.log]);

    expect(facts.some((f) => f.kind === "ProcessResolve" && f.instanceId === instanceId && f.outcomeId === "grantedKid")).toBe(false);
    expect(facts.some((f) => f.kind === "CharacterCreate")).toBe(true);
    expect(world.characters.byId[kid.id]!.rank).toBe("civilian");
  });

  it("the made kid collects for the player within three turns of the ceremony (chains.ts's collector round-robin, ai/family-ai.ts's ensureChain)", () => {
    const content = contentOf([askAssociate!]);
    let world = buildStarterWorld("kid-made-4", setup, content);
    const { meId } = promoteToSoldier(world);
    const kid = addKidOnRecord(world, meId, 17, 600);
    // The starter world's own businesses are all pre-claimed by the two soldiers, with no associates of their
    // own (this file's `givePlayerAClaimedShop`'s own comment): give the player one, so the chain has a shop of
    // his to assign among "the associates on record with him", which after this turn is the kid alone.
    givePlayerAClaimedShop(world, meId);

    const r0 = step(world, [{ kind: "askPermission", what: "makeAssociate" }], content, opts);
    world = r0.world;
    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "soldier.askAssociate", 10);
    world = w1;

    const rDecide = step(world, [{ kind: "decide", instanceId, optionId: "ask" }], content, opts);
    world = rDecide.world;
    expect(factsOf([...logs1, rDecide.log]).some((f) => f.kind === "ProcessResolve" && f.instanceId === instanceId && f.outcomeId === "grantedKid")).toBe(true);

    // Turn 1: `ai/family-ai.ts`'s `ensureChain` sweeps the now-associate kid into the chief's crew's
    // protection-tax chain (a `ChainSlotFill`, `collectors`). Turn 2: `systems/chains.ts`'s `runChains` runs
    // against that updated chain and assigns him the player's shop (deterministic: the player has exactly one
    // associate on record, so the round-robin always lands on the kid, regardless of the compliance coin flip
    // that decides whether the shop actually pays -- either a `MoneyMint` or a `CollectionMissed` names him as
    // the collector). Three `step()` calls covers both turns with a turn to spare, matching the task brief's own
    // "within three turns".
    const followLogs: TurnLog[] = [];
    for (let i = 0; i < 3; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      followLogs.push(r.log);
    }
    const facts = factsOf(followLogs);

    const kidCollected = facts.some(
      (f) => (f.kind === "MoneyMint" && f.cause.actorId === kid.id) || (f.kind === "CollectionMissed" && f.collectorId === kid.id),
    );
    const playerGotShare = facts.some((f) => f.kind === "MoneyMove" && f.cause.actorId === kid.id && f.to === world.characters.byId[meId]!.accounts.personal);
    expect(kidCollected || playerGotShare).toBe(true);
  });
});

// `soldier.detained.support` tests removed 2026-09-25: the card is superseded by `oblig.prisoner.open` (obligations-cards.test.ts).
describe("chief.demand.envelope (design 09 §6)", () => {
  it("spawns for a soldier, and 'accept' moves money and lifts favor", () => {
    const content = contentOf([chiefDemandEnvelope!]);
    let world = buildStarterWorld("demand-envelope-1", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    const meAccount = world.characters.byId[meId]!.accounts.personal;
    world.ledger.accounts.byId[meAccount]!.dirty = 200;
    world.ledger.minted += 200;

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "chief.demand.envelope", 200);
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "accept" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(facts.some((f) => f.kind === "MoneyMove" && f.from === meAccount && f.to === chief.accounts.personal && f.amount === 60)).toBe(true);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === chief.id && f.to === meId && f.delta === 20)).toBe(true);
  });
});

describe("chief.demand.man (design 09 §6)", () => {
  it("spawns only when the soldier has an associate on record, and 'lend' records a job and favor", () => {
    const content = contentOf([chiefDemandMan!]);
    let world = buildStarterWorld("demand-man-1", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    const man = addAssociateOnRecord(world, "Man On The Book", meId);

    const { world: w1, logs: logs1, instanceId } = stepUntilAwaitingDecision(world, content, "chief.demand.man", 200);
    world = w1;

    const r = step(world, [{ kind: "decide", instanceId, optionId: "lend" }], content, opts);
    const facts = factsOf([...logs1, r.log]);

    expect(facts.some((f) => f.kind === "RecordDelta" && f.characterId === man.id && f.field === "jobsDone" && f.delta === 1)).toBe(true);
    expect(facts.some((f) => f.kind === "FavorDelta" && f.from === chief.id && f.to === meId && f.delta === 30)).toBe(true);
  });

  it("does not spawn for a soldier with no associate on record", () => {
    const content = contentOf([chiefDemandMan!]);
    let world = buildStarterWorld("demand-man-2", setup, content);
    promoteToSoldier(world);

    const logs: TurnLog[] = [];
    for (let i = 0; i < 15; i++) {
      const r = step(world, [], content, opts);
      world = r.world;
      logs.push(r.log);
    }
    const spawned = world.processes.order.map((id) => world.processes.byId[id]!).some((p) => p.templateId === "chief.demand.man");
    expect(spawned).toBe(false);
  });
});

// ===================================================================================================================
// Story 7 (first-ranks-requirements.md): both the loan book and a new associate are available, asked for, and
// answered within ten turns of the ceremony.
// ===================================================================================================================

describe("story 7: both the book and a new associate resolve within ten turns of the ceremony (design 09 §6)", () => {
  it("rank soldier at turn 0, both asked on turn 1, both resolved by turn 10", () => {
    const content = contentOf([openBook!, askAssociate!, askAssociateClaim!]);
    let world = buildStarterWorld("story-7-1", setup, content);
    const { meId, chief } = promoteToSoldier(world);
    const startTurn = world.meta.turn;
    world.ledger.accounts.byId[chief.accounts.personal]!.dirty = 500;
    world.ledger.minted += 500;

    const r0 = step(world, [{ kind: "askPermission", what: "openBook" }, { kind: "askPermission", what: "makeAssociate" }], content, opts);
    world = r0.world;
    const logs: TurnLog[] = [r0.log];

    let bookResolved = false;
    let associateResolved = false;
    while (world.meta.turn - startTurn < 10 && (!bookResolved || !associateResolved)) {
      // Answer whichever decision is awaiting, as soon as it is.
      const awaitingBook = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === "soldier.openBook" && p.state === "awaitingDecision");
      const awaitingAssoc = world.processes.order.map((id) => world.processes.byId[id]!).find((p) => p.templateId === "soldier.askAssociate" && p.state === "awaitingDecision");
      const actions = [
        ...(awaitingBook ? [{ kind: "decide" as const, instanceId: awaitingBook.id, optionId: "ask" }] : []),
        ...(awaitingAssoc ? [{ kind: "decide" as const, instanceId: awaitingAssoc.id, optionId: "ask" }] : []),
      ];
      const r = step(world, actions, content, opts);
      world = r.world;
      logs.push(r.log);
      const facts = factsOf(logs);
      bookResolved = facts.some((f) => f.kind === "ProcessResolve" && f.cause.templateId === "soldier.openBook");
      associateResolved = facts.some((f) => f.kind === "ProcessResolve" && f.cause.templateId === "soldier.askAssociate");
    }

    expect(bookResolved).toBe(true);
    expect(associateResolved).toBe(true);
    expect(world.meta.turn - startTurn).toBeLessThanOrEqual(10);
    void meId;
  });
});
