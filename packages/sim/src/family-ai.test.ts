import { describe, expect, it } from "vitest";
import { buildStarterWorld } from "./starter.js";
import { familyAi } from "./ai/family-ai.js";
import { applyFacts } from "./reducers/index.js";
import { TurnLogBuilder } from "./log.js";
import { runInvariants } from "./invariants/all.js";
import { EMPTY_CONTENT } from "./content-types.js";
import { run } from "./replay.js";
import type { Character, Crew, World } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

function crewParts(world: World): { crew: Crew; chief: Character; soldier1: Character; soldier2: Character } {
  const crew = world.crews.byId[world.crews.order[0]!]!;
  const chief = world.characters.byId[crew.chiefId]!;
  const [soldier1Id, soldier2Id] = crew.memberIds;
  const soldier1 = world.characters.byId[soldier1Id!]!;
  const soldier2 = world.characters.byId[soldier2Id!]!;
  return { crew, chief, soldier1, soldier2 };
}

describe("familyAi", () => {
  it("on the starter world, creates the crew's protection-tax chain filled with the two soldiers, the associate on record, and both blocks", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    const facts = familyAi(world, EMPTY_CONTENT);

    // The world now has two families with two crews (starter.ts); familyAi runs both. Scope the
    // assertions to the first crew (the player's family's crew) by its chief's id.
    const { chief } = crewParts(world);
    const creates = facts.filter((f) => f.kind === "ChainCreate" && f.ownerId === chief.id);
    expect(creates).toHaveLength(1);
    const chainId = (creates[0] as Extract<(typeof facts)[number], { kind: "ChainCreate" }>).chainId;

    const collectors = facts.filter((f) => f.kind === "ChainSlotFill" && f.slot === "collectors" && f.chainId === chainId);
    const blocks = facts.filter((f) => f.kind === "ChainSlotFill" && f.slot === "blocks" && f.chainId === chainId);
    const shares = facts.filter((f) => f.kind === "ShareRuleSet");

    expect(collectors).toHaveLength(3); // two soldiers plus the player, an associate on record with soldier 1
    expect(blocks).toHaveLength(2);
    // The starter already sets every share rule the AI would set for both families
    // (chief -> soldiers, soldier1 -> the player, chief2 -> soldier3, head -> chief, head2 -> chief2).
    expect(shares).toHaveLength(0);
  });

  it("emits nothing on a second call once the first call's facts are applied", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    const log = new TurnLogBuilder(world.meta.turn);
    applyFacts(world, familyAi(world, EMPTY_CONTENT), log);

    expect(familyAi(world, EMPTY_CONTENT)).toEqual([]);
  });

  it("vacates a collector who dies", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    const log = new TurnLogBuilder(world.meta.turn);
    applyFacts(world, familyAi(world, EMPTY_CONTENT), log);

    const { soldier1 } = crewParts(world);
    soldier1.alive = false;
    soldier1.status = "dead";

    const facts = familyAi(world, EMPTY_CONTENT);
    expect(facts).toHaveLength(1);
    const vacate = facts[0]!;
    if (vacate.kind !== "ChainSlotVacate") throw new Error(`expected a ChainSlotVacate fact, got ${vacate.kind}`);
    expect(vacate.slot).toBe("collectors");
    expect(vacate.filler).toEqual({ kind: "character", id: soldier1.id });
  });

  it("emits nothing for a crew whose chief is player-controlled", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    const { chief } = crewParts(world);
    chief.playerControlled = true;

    // The second family's crew still runs its own AI; scope to facts caused by this chief only.
    const facts = familyAi(world, EMPTY_CONTENT).filter((f) => f.cause.actorId === chief.id);
    expect(facts).toEqual([]);
  });
});

describe("families invariants", () => {
  it("are silent on the starter world", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    expect(runInvariants(world).filter((v) => v.name.startsWith("families."))).toEqual([]);
  });

  it("families.crewsConsistent fires when a member's superiorId disagrees with the chief", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    const { soldier1 } = crewParts(world);
    soldier1.superiorId = null;

    const violations = runInvariants(world).filter((v) => v.name === "families.crewsConsistent");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("families.townsOwned fires when a family's town no longer points back at it", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    const family = world.families.byId[world.families.order[0]!]!;
    const town = world.geo.towns.byId[family.townIds[0]!]!;
    town.familyId = null;

    const violations = runInvariants(world).filter((v) => v.name === "families.townsOwned");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("families.treasuryExists fires when the treasury account is missing", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    const family = world.families.byId[world.families.order[0]!]!;
    delete world.ledger.accounts.byId[family.treasury];
    world.ledger.accounts.order = world.ledger.accounts.order.filter((id) => id !== family.treasury);

    const violations = runInvariants(world).filter((v) => v.name === "families.treasuryExists");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("families.superiorAlive fires when a living character's superior is dead", () => {
    const world = buildStarterWorld("ai-seed", setup, EMPTY_CONTENT);
    const { chief } = crewParts(world);
    chief.alive = false;
    chief.status = "dead";

    const violations = runInvariants(world).filter((v) => v.name === "families.superiorAlive");
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe("family-ai e2e", () => {
  it("runs 8 turns from the starter world with no invariant violations, one chain per crew", () => {
    const result = run("e2e", setup, EMPTY_CONTENT, 8, () => []);
    // Two families, two crews (starter.ts): each crew's chief runs its own protection-tax chain.
    expect(result.world.chains.order).toHaveLength(2);
    expect(result.hashes).toHaveLength(8);
  });
});
