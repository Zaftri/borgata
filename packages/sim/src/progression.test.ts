import { describe, expect, it } from "vitest";
import { mintId, tableInsert, type CharacterId, type ClaimId } from "@borgata/shared";
import { EMPTY_CONTENT } from "./content-types.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { buildStarterWorld } from "./starter.js";
import { computeWeight, progressionStep, RANK_THRESHOLDS, UI_LAYERS_BY_RANK } from "./systems/progression.js";
import { addCharacter, favorKey, type Character, type World } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

function crewParts(world: World) {
  const crew = world.crews.byId[world.crews.order[0]!]!;
  const chief = world.characters.byId[crew.chiefId]!;
  const [soldier1Id, soldier2Id] = crew.memberIds;
  const soldier1 = world.characters.byId[soldier1Id!]!;
  const soldier2 = world.characters.byId[soldier2Id!]!;
  return { crew, chief, soldier1, soldier2 };
}

/** Adds an associate whose claim is held by `holderId` (mirrors starter.ts's direct fixture style). */
function addAssociateOnRecord(world: World, holderId: CharacterId, name: string): Character {
  const associate = addCharacter(world, { name, rank: "associate", onRecordWith: holderId });
  const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: associate.id }, holderId, since: 0 });
  return associate;
}

describe("computeWeight", () => {
  it("ranks the starter world's soldiers, chief and head by menOnRecord, territory and tribute", () => {
    const world = buildStarterWorld("weight-seed", setup, EMPTY_CONTENT);
    const { chief, soldier1, soldier2 } = crewParts(world);
    const head = world.characters.byId[world.families.byId[world.families.order[0]!]!.headId!]!;

    const wSoldier1 = computeWeight(world, soldier1.id);
    const wSoldier2 = computeWeight(world, soldier2.id);
    const wChief = computeWeight(world, chief.id);
    const wHead = computeWeight(world, head.id);

    // soldier1 has the player on record plus 6 business claims (blockA); soldier2 has 5 business claims, no associate.
    expect(wSoldier1).toBeGreaterThan(wSoldier2);
    // the chief's territory is both blocks and his menOnRecord includes the whole crew chain.
    expect(wChief).toBeGreaterThan(wSoldier1);
    expect(wChief).toBeGreaterThan(wSoldier2);
    // the head's menOnRecord includes the chief's whole chain; territory is the same two blocks.
    expect(wHead).toBeGreaterThanOrEqual(wChief);
  });

  it("returns 0 for an unknown character id", () => {
    const world = buildStarterWorld("weight-unknown", setup, EMPTY_CONTENT);
    expect(computeWeight(world, "chr-does-not-exist" as CharacterId)).toBe(0);
  });
});

describe("RANK_THRESHOLDS", () => {
  it("matches design 03 §1 (illustrative)", () => {
    expect(RANK_THRESHOLDS).toEqual({ soldier: 100, chief: 250, underboss: 450, head: 600 });
  });
});

describe("UI_LAYERS_BY_RANK", () => {
  it("gives each rank the layers this phase supports (design 07 §1, narrowed to the UiLayer union)", () => {
    expect(UI_LAYERS_BY_RANK.associate).toEqual(["block"]);
    expect(UI_LAYERS_BY_RANK.soldier).toEqual(["loanBook"]);
    expect(UI_LAYERS_BY_RANK.chief).toEqual(["crew", "territory"]);
    expect(UI_LAYERS_BY_RANK.head).toEqual(["commission", "politics"]);
  });
});

describe("progressionStep", () => {
  it("emits WeightSet only when the computed value differs from the stored one", () => {
    const world = buildStarterWorld("progression-seed", setup, EMPTY_CONTENT);
    const log = new TurnLogBuilder(world.meta.turn);

    const first = progressionStep(world, EMPTY_CONTENT);
    expect(first.filter((f) => f.kind === "WeightSet").length).toBeGreaterThan(0);
    applyFacts(world, first, log);

    const second = progressionStep(world, EMPTY_CONTENT);
    expect(second).toEqual([]);
  });

  it("promotes the player from associate to soldier once enough associates are on record with him", () => {
    const world = buildStarterWorld("promotion-soldier", setup, EMPTY_CONTENT);
    const playerId = world.player.characterId;
    addAssociateOnRecord(world, playerId, "A1");
    addAssociateOnRecord(world, playerId, "A2");
    addAssociateOnRecord(world, playerId, "A3"); // lnScaled120(3) = 166 >= RANK_THRESHOLDS.soldier

    const facts = progressionStep(world, EMPTY_CONTENT);

    const rankChange = facts.find((f) => f.kind === "RankChange" && f.characterId === playerId);
    expect(rankChange && rankChange.kind === "RankChange" && rankChange.rank).toBe("soldier");
    expect(facts.some((f) => f.kind === "CrewMemberAdd" && f.characterId === playerId)).toBe(true);
    expect(facts.some((f) => f.kind === "SuperiorSet" && f.characterId === playerId)).toBe(true);
    expect(facts.some((f) => f.kind === "RequestPush" && f.request.text === "You were made.")).toBe(true);
    expect(facts.some((f) => f.kind === "UiLayerUnlock" && f.layer === "loanBook")).toBe(true);
  });

  it("does not promote to soldier when the family's intake is closed", () => {
    const world = buildStarterWorld("promotion-intake-closed", setup, EMPTY_CONTENT);
    const playerId = world.player.characterId;
    world.families.byId[world.families.order[0]!]!.policy.intakeOpen = false;
    addAssociateOnRecord(world, playerId, "A1");
    addAssociateOnRecord(world, playerId, "A2");
    addAssociateOnRecord(world, playerId, "A3");

    const facts = progressionStep(world, EMPTY_CONTENT);
    expect(facts.some((f) => f.kind === "RankChange" && f.characterId === playerId)).toBe(false);
  });

  it("does not promote to soldier when the sponsor's favor toward the player is negative", () => {
    const world = buildStarterWorld("promotion-favor-negative", setup, EMPTY_CONTENT);
    const playerId = world.player.characterId;
    const player = world.characters.byId[playerId]!;
    world.favors[favorKey(player.superiorId!, playerId)] = -50;
    addAssociateOnRecord(world, playerId, "A1");
    addAssociateOnRecord(world, playerId, "A2");
    addAssociateOnRecord(world, playerId, "A3");

    const facts = progressionStep(world, EMPTY_CONTENT);
    expect(facts.some((f) => f.kind === "RankChange" && f.characterId === playerId)).toBe(false);
  });

  it("promotes the player from soldier to chief on Weight and a crew vacancy", () => {
    const world = buildStarterWorld("promotion-chief", setup, EMPTY_CONTENT);
    const playerId = world.player.characterId;
    const player = world.characters.byId[playerId]!;
    player.rank = "soldier"; // fixture: skip the associate->soldier step, as generation would for a soldier start.
    for (let i = 0; i < 8; i++) addAssociateOnRecord(world, playerId, `A${i}`); // lnScaled120(8) = 264 >= 250

    const { chief } = crewParts(world);
    chief.alive = false;
    chief.status = "dead"; // opens a vacancy in the player's family (design 03 §1: "a vacancy").

    const facts = progressionStep(world, EMPTY_CONTENT);

    const rankChange = facts.find((f) => f.kind === "RankChange" && f.characterId === playerId);
    expect(rankChange && rankChange.kind === "RankChange" && rankChange.rank).toBe("chief");
    expect(facts.some((f) => f.kind === "RequestPush" && f.request.text === "A crew is yours.")).toBe(true);
    expect(facts.some((f) => f.kind === "UiLayerUnlock" && f.layer === "crew")).toBe(true);
    expect(facts.some((f) => f.kind === "UiLayerUnlock" && f.layer === "territory")).toBe(true);
  });

  it("does not promote to chief without a vacancy", () => {
    const world = buildStarterWorld("promotion-chief-no-vacancy", setup, EMPTY_CONTENT);
    const playerId = world.player.characterId;
    const player = world.characters.byId[playerId]!;
    player.rank = "soldier";
    for (let i = 0; i < 8; i++) addAssociateOnRecord(world, playerId, `A${i}`);

    const facts = progressionStep(world, EMPTY_CONTENT);
    expect(facts.some((f) => f.kind === "RankChange" && f.characterId === playerId)).toBe(false);
  });
});
