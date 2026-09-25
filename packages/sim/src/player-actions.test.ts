import { describe, expect, it } from "vitest";
import { mintId, tableInsert, type BusinessId, type CharacterId, type ClaimId } from "@borgata/shared";
import { EMPTY_CONTENT } from "./content-types.js";
import { addBlock, addBusiness, addTown } from "./fixtures.js";
import { buildStarterWorld } from "./starter.js";
import { step } from "./step.js";
import { ingestPlayerActions } from "./systems/player-actions.js";
import { addCharacter, createEmptyWorld, playerCharacter, type Crew, type World } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

function freshWorld(seed: string): World {
  return createEmptyWorld(seed, setup, EMPTY_CONTENT.version);
}

function crewParts(world: World): { crew: Crew; soldier1Id: string; soldier2Id: string } {
  const crew = world.crews.byId[world.crews.order[0]!]!;
  const [soldier1Id, soldier2Id] = crew.memberIds;
  return { crew, soldier1Id: soldier1Id!, soldier2Id: soldier2Id! };
}

/** Fixture: make the player a soldier already assigned to the starter crew (skips the promotion facts). */
function promoteToSoldier(world: World): Crew {
  const player = playerCharacter(world);
  const { crew } = crewParts(world);
  player.rank = "soldier";
  player.crewId = crew.id;
  return crew;
}

/** Adds an associate whose claim is held by `holderId` (mirrors starter.ts's direct fixture style). */
function addAssociateOnRecord(world: World, holderId: CharacterId, name: string): void {
  const associate = addCharacter(world, { name, rank: "associate", onRecordWith: holderId });
  const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: associate.id }, holderId, since: 0 });
}

describe("ingestPlayerActions: setShare", () => {
  it("accepts a share rule for a direct subordinate", () => {
    const world = freshWorld("share-ok");
    const player = playerCharacter(world);
    const sub = addCharacter(world, { name: "Nephew", rank: "associate", superiorId: player.id });

    const { facts, rejected } = ingestPlayerActions(world, [{ kind: "setShare", subordinateId: sub.id, rule: { fixedPerTurn: 10, percent: 400 } }]);

    expect(rejected).toEqual([]);
    expect(facts).toEqual([
      { kind: "ShareRuleSet", superiorId: player.id, subordinateId: sub.id, rule: { fixedPerTurn: 10, percent: 400 }, cause: { rule: "player.setShare", actorId: player.id } },
    ]);
  });

  it("rejects an unknown subordinate", () => {
    const world = freshWorld("share-unknown");
    const { facts, rejected } = ingestPlayerActions(world, [{ kind: "setShare", subordinateId: "chr-nope", rule: { fixedPerTurn: 0, percent: 0 } }]);
    expect(facts).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatch(/unknown subordinate/);
  });

  it("rejects a character who does not report to the player", () => {
    const world = freshWorld("share-not-mine");
    const other = addCharacter(world, { name: "Someone else's man", rank: "associate" });
    const { facts, rejected } = ingestPlayerActions(world, [{ kind: "setShare", subordinateId: other.id, rule: { fixedPerTurn: 0, percent: 0 } }]);
    expect(facts).toEqual([]);
    expect(rejected[0]!.reason).toMatch(/does not report to the player/);
  });

  it("rejects an out-of-range percent and a negative fixedPerTurn", () => {
    const world = freshWorld("share-invalid");
    const player = playerCharacter(world);
    const sub = addCharacter(world, { name: "Nephew", rank: "associate", superiorId: player.id });

    const { rejected: badPercent } = ingestPlayerActions(world, [{ kind: "setShare", subordinateId: sub.id, rule: { fixedPerTurn: 0, percent: 1001 } }]);
    expect(badPercent[0]!.reason).toMatch(/percent invalid/);

    const { rejected: badFixed } = ingestPlayerActions(world, [{ kind: "setShare", subordinateId: sub.id, rule: { fixedPerTurn: -1, percent: 0 } }]);
    expect(badFixed[0]!.reason).toMatch(/fixedPerTurn invalid/);
  });
});

describe("ingestPlayerActions: claimBusiness", () => {
  it("rejects an associate outright", () => {
    const world = buildStarterWorld("claim-associate", setup, EMPTY_CONTENT);
    const { crew } = crewParts(world);
    const businessId = world.geo.blocks.byId[crew.blockIds[0]!]!.businessIds[0]!;
    const { rejected } = ingestPlayerActions(world, [{ kind: "claimBusiness", businessId }]);
    expect(rejected).toEqual([{ action: { kind: "claimBusiness", businessId }, reason: "associates cannot hold claims" }]);
  });

  it("accepts an unclaimed business on the player's crew's blocks, once the player is a soldier", () => {
    const world = buildStarterWorld("claim-ok", setup, EMPTY_CONTENT);
    const crew = promoteToSoldier(world);
    const newBusiness = addBusiness(world, crew.blockIds[0]!, { type: "stall", size: 1 });
    const player = playerCharacter(world);

    const { facts, rejected } = ingestPlayerActions(world, [{ kind: "claimBusiness", businessId: newBusiness.id }]);

    expect(rejected).toEqual([]);
    expect(facts).toHaveLength(1);
    const fact = facts[0]!;
    if (fact.kind !== "ClaimSet") throw new Error(`expected ClaimSet, got ${fact.kind}`);
    expect(fact.subject).toEqual({ kind: "business", id: newBusiness.id });
    expect(fact.holderId).toBe(player.id);
  });

  it("rejects an unknown business", () => {
    const world = buildStarterWorld("claim-unknown", setup, EMPTY_CONTENT);
    promoteToSoldier(world);
    const { rejected } = ingestPlayerActions(world, [{ kind: "claimBusiness", businessId: "biz-nope" }]);
    expect(rejected[0]!.reason).toMatch(/unknown business/);
  });

  it("rejects a business that already has a claim", () => {
    const world = buildStarterWorld("claim-taken", setup, EMPTY_CONTENT);
    const crew = promoteToSoldier(world);
    const businessId = world.geo.blocks.byId[crew.blockIds[0]!]!.businessIds[0]!;
    const { rejected } = ingestPlayerActions(world, [{ kind: "claimBusiness", businessId }]);
    expect(rejected[0]!.reason).toMatch(/already claimed/);
  });

  it("rejects a business outside the player's crew's blocks", () => {
    const world = buildStarterWorld("claim-outside", setup, EMPTY_CONTENT);
    promoteToSoldier(world);
    const town = addTown(world, { name: "Elsewhere", archetype: "farm" });
    const block = addBlock(world, town.id);
    const outsider = addBusiness(world, block.id, { type: "stall", size: 1 });

    const { rejected } = ingestPlayerActions(world, [{ kind: "claimBusiness", businessId: outsider.id }]);
    expect(rejected[0]!.reason).toMatch(/not on the player's crew's blocks/);
  });
});

describe("ingestPlayerActions: releaseClaim", () => {
  it("releases a claim the player holds", () => {
    const world = buildStarterWorld("release-ok", setup, EMPTY_CONTENT);
    const crew = promoteToSoldier(world);
    const player = playerCharacter(world);
    const newBusiness = addBusiness(world, crew.blockIds[0]!, { type: "stall", size: 1 });
    const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
    tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "business", id: newBusiness.id }, holderId: player.id, since: 0 });

    const { facts, rejected } = ingestPlayerActions(world, [{ kind: "releaseClaim", claimId }]);
    expect(rejected).toEqual([]);
    expect(facts).toEqual([{ kind: "ClaimRelease", claimId, cause: { rule: "player.releaseClaim", actorId: player.id } }]);
  });

  it("rejects an unknown claim", () => {
    const world = buildStarterWorld("release-unknown", setup, EMPTY_CONTENT);
    const { rejected } = ingestPlayerActions(world, [{ kind: "releaseClaim", claimId: "clm-nope" }]);
    expect(rejected[0]!.reason).toMatch(/unknown claim/);
  });

  it("rejects a claim the player does not hold", () => {
    const world = buildStarterWorld("release-not-mine", setup, EMPTY_CONTENT);
    const { crew } = crewParts(world);
    const businessId = world.geo.blocks.byId[crew.blockIds[0]!]!.businessIds[0]!;
    const claim = Object.values(world.claims.byId).find((c) => c.subject.kind === "business" && c.subject.id === (businessId as BusinessId))!;

    const { rejected } = ingestPlayerActions(world, [{ kind: "releaseClaim", claimId: claim.id }]);
    expect(rejected[0]!.reason).toMatch(/not held by the player/);
  });
});

describe("ingestPlayerActions: askPermission", () => {
  it("is rejected for an associate and, for a soldier, logs the ask and pushes a request", () => {
    const world = buildStarterWorld("ask-permission", setup, EMPTY_CONTENT);
    const player = playerCharacter(world);
    expect(ingestPlayerActions(world, [{ kind: "askPermission", what: "makeAssociate" }]).rejected).toHaveLength(1);
    player.rank = "soldier";

    const { facts, rejected } = ingestPlayerActions(world, [{ kind: "askPermission", what: "makeAssociate" }]);
    expect(rejected).toEqual([]);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({ kind: "PermissionAsked", characterId: player.id, what: "makeAssociate" });
    const fact = facts[1]!;
    if (fact.kind !== "RequestPush") throw new Error(`expected RequestPush, got ${fact.kind}`);
    expect(fact.request.text).toBe("You asked your sponsor for permission to make an associate.");
    expect(fact.request.instanceId).toBeNull();
    expect(fact.cause.actorId).toBe(player.id);
  });
});

describe("player actions through step", () => {
  it("a setShare action changes a rule read back from the world", () => {
    const world = buildStarterWorld("e2e-setshare", setup, EMPTY_CONTENT);
    const player = playerCharacter(world);
    const sub = addCharacter(world, { name: "Nephew", rank: "associate", superiorId: player.id, familyId: player.familyId });

    const result = step(world, [{ kind: "setShare", subordinateId: sub.id, rule: { fixedPerTurn: 5, percent: 200 } }], EMPTY_CONTENT);

    const updatedPlayer = result.world.characters.byId[player.id]!;
    expect(updatedPlayer.shareRules[sub.id]).toEqual({ fixedPerTurn: 5, percent: 200 });
  });

  it("claimBusiness succeeds once promotion (through the same pipeline) has made the player a soldier", () => {
    let world = buildStarterWorld("e2e-promote-claim", setup, EMPTY_CONTENT);
    const playerId = world.player.characterId;
    addAssociateOnRecord(world, playerId, "A1");
    addAssociateOnRecord(world, playerId, "A2");
    addAssociateOnRecord(world, playerId, "A3");

    let result = step(world, [], EMPTY_CONTENT);
    world = result.world;
    const promotedPlayer = world.characters.byId[playerId]!;
    expect(promotedPlayer.rank).toBe("soldier");
    expect(promotedPlayer.crewId).not.toBeNull();

    const crew = world.crews.byId[promotedPlayer.crewId!]!;
    const newBusiness = addBusiness(world, crew.blockIds[0]!, { type: "stall", size: 1 });

    result = step(world, [{ kind: "claimBusiness", businessId: newBusiness.id }], EMPTY_CONTENT);
    const claim = Object.values(result.world.claims.byId).find((c) => c.subject.kind === "business" && c.subject.id === newBusiness.id);
    expect(claim?.holderId).toBe(playerId);
  });
});
