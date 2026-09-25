import { describe, expect, it } from "vitest";
import { mintId, tableInsert, type BlockId, type BusinessId, type CharacterId, type ClaimId, type TownId } from "@borgata/shared";
import { addCharacter, createEmptyWorld, type Business, type Block, type Character, type Town, type World } from "./world.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { claimOnSubject, claimsHeldBy } from "./reducers/claims.js";
import { runInvariants } from "./invariants/all.js";
import { EMPTY_CONTENT } from "./content-types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function freshWorld(): World {
  return createEmptyWorld("claims-test", setup, EMPTY_CONTENT.version);
}

/** A Town with a Block with a Business, all with valid fields per world.ts, for business-claim fixtures. */
function addTownBlockBusiness(world: World): { town: Town; block: Block; business: Business } {
  const townId = mintId<"TownId">(world.meta.ids, "town") as TownId;
  const town: Town = { id: townId, name: "Testville", archetype: "farm", provinceId: null, districtId: null, isNeighborhood: false, familyId: null, blockIds: [], population: 100 };
  tableInsert(world.geo.towns, townId, town);

  const blockId = mintId<"BlockId">(world.meta.ids, "block") as BlockId;
  const block: Block = { id: blockId, townId, crewId: null, businessIds: [] };
  tableInsert(world.geo.blocks, blockId, block);
  town.blockIds.push(blockId);

  const businessId = mintId<"BusinessId">(world.meta.ids, "biz") as BusinessId;
  const business: Business = { id: businessId, blockId, type: "shop", size: 1, ownerId: null, compliance: 500, fear: 0, refusalStage: 0 };
  tableInsert(world.geo.businesses, businessId, business);
  block.businessIds.push(businessId);

  return { town, block, business };
}

function addSoldier(world: World, name = "Soldier"): Character {
  return addCharacter(world, { name, rank: "soldier" });
}

function addAssociate(world: World, name = "Associate"): Character {
  return addCharacter(world, { name, rank: "associate" });
}

function newClaimId(world: World): ClaimId {
  return mintId<"ClaimId">(world.meta.ids, "claim") as ClaimId;
}

function applyOne(world: World, fact: Parameters<typeof applyFacts>[1][number]): { applied: number; log: TurnLogBuilder } {
  const log = new TurnLogBuilder(world.meta.turn);
  const applied = applyFacts(world, [fact], log);
  return { applied, log };
}

function rejectionReason(log: TurnLogBuilder): string | undefined {
  return log.entries.find((e) => e.kind === "rejected")?.reason;
}

describe("claims reducer: ClaimSet", () => {
  it("sets a claim on a business", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder = addSoldier(world);
    const claimId = newClaimId(world);

    const { applied } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "business", id: business.id },
      holderId: holder.id,
      cause,
    });

    expect(applied).toBe(1);
    const claim = world.claims.byId[claimId];
    expect(claim).toBeDefined();
    expect(claim!.holderId).toBe(holder.id);
    expect(claim!.since).toBe(world.meta.turn);
    expect(claimOnSubject(world, { kind: "business", id: business.id })).toBe(claim);
    expect(claimsHeldBy(world, holder.id)).toEqual([claim]);
  });

  it("sets a claim on an associate and puts them on record with the holder", () => {
    const world = freshWorld();
    const holder = addSoldier(world);
    const associate = addAssociate(world);
    const claimId = newClaimId(world);

    const { applied } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "associate", id: associate.id },
      holderId: holder.id,
      cause,
    });

    expect(applied).toBe(1);
    expect(world.characters.byId[associate.id]!.onRecordWith).toBe(holder.id);
  });

  it("rejects a claimId that already exists", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder = addSoldier(world);
    const claimId = newClaimId(world);
    applyOne(world, { kind: "ClaimSet", claimId, subject: { kind: "business", id: business.id }, holderId: holder.id, cause });

    const other = addTownBlockBusiness(world).business;
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "business", id: other.id },
      holderId: holder.id,
      cause,
    });

    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/already exists/);
  });

  it("rejects an unknown holder", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const claimId = newClaimId(world);
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "business", id: business.id },
      holderId: "chr-nope" as CharacterId,
      cause,
    });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/unknown holder/);
  });

  it("rejects a dead holder", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder = addCharacter(world, { name: "Dead Man", rank: "soldier", alive: false });
    const claimId = newClaimId(world);
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "business", id: business.id },
      holderId: holder.id,
      cause,
    });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/dead/);
  });

  it("rejects a civilian holder", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder = addCharacter(world, { name: "Civilian", rank: "civilian" });
    const claimId = newClaimId(world);
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "business", id: business.id },
      holderId: holder.id,
      cause,
    });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/civilian/);
  });

  it("rejects a business subject that does not exist", () => {
    const world = freshWorld();
    const holder = addSoldier(world);
    const claimId = newClaimId(world);
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "business", id: "biz-nope" as BusinessId },
      holderId: holder.id,
      cause,
    });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/unknown business/);
  });

  it("rejects an associate subject that does not exist", () => {
    const world = freshWorld();
    const holder = addSoldier(world);
    const claimId = newClaimId(world);
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "associate", id: "chr-nope" as CharacterId },
      holderId: holder.id,
      cause,
    });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/unknown associate/);
  });

  it("rejects an associate subject that is not rank associate", () => {
    const world = freshWorld();
    const holder = addSoldier(world);
    const notAnAssociate = addCharacter(world, { name: "Bystander", rank: "civilian" });
    const claimId = newClaimId(world);
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "associate", id: notAnAssociate.id },
      holderId: holder.id,
      cause,
    });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/not rank associate/);
  });

  it("rejects an associate subject that is the holder", () => {
    const world = freshWorld();
    const associate = addAssociate(world);
    const claimId = newClaimId(world);
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId,
      subject: { kind: "associate", id: associate.id },
      holderId: associate.id,
      cause,
    });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/own claim/);
  });

  it("rejects a second claim on a subject that already has one", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder1 = addSoldier(world, "Holder1");
    const holder2 = addSoldier(world, "Holder2");
    applyOne(world, {
      kind: "ClaimSet",
      claimId: newClaimId(world),
      subject: { kind: "business", id: business.id },
      holderId: holder1.id,
      cause,
    });
    const { applied, log } = applyOne(world, {
      kind: "ClaimSet",
      claimId: newClaimId(world),
      subject: { kind: "business", id: business.id },
      holderId: holder2.id,
      cause,
    });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/already has a claim/);
  });
});

describe("claims reducer: ClaimTransfer", () => {
  function setBusinessClaim(world: World, holderId: CharacterId, businessId: BusinessId): { claimId: ClaimId } {
    const claimId = newClaimId(world);
    applyOne(world, { kind: "ClaimSet", claimId, subject: { kind: "business", id: businessId }, holderId, cause });
    return { claimId };
  }

  it("transfers a business claim to a new holder", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder1 = addSoldier(world, "Holder1");
    const holder2 = addSoldier(world, "Holder2");
    const { claimId } = setBusinessClaim(world, holder1.id, business.id);

    const { applied } = applyOne(world, { kind: "ClaimTransfer", claimId, toHolderId: holder2.id, cause });

    expect(applied).toBe(1);
    expect(world.claims.byId[claimId]!.holderId).toBe(holder2.id);
    expect(claimsHeldBy(world, holder1.id)).toEqual([]);
    expect(claimsHeldBy(world, holder2.id)).toHaveLength(1);
  });

  it("transfers an associate claim and updates onRecordWith", () => {
    const world = freshWorld();
    const holder1 = addSoldier(world, "Holder1");
    const holder2 = addSoldier(world, "Holder2");
    const associate = addAssociate(world);
    const claimId = newClaimId(world);
    applyOne(world, { kind: "ClaimSet", claimId, subject: { kind: "associate", id: associate.id }, holderId: holder1.id, cause });

    const { applied } = applyOne(world, { kind: "ClaimTransfer", claimId, toHolderId: holder2.id, cause });

    expect(applied).toBe(1);
    expect(world.characters.byId[associate.id]!.onRecordWith).toBe(holder2.id);
  });

  it("rejects a transfer of an unknown claim", () => {
    const world = freshWorld();
    const holder = addSoldier(world);
    const { applied, log } = applyOne(world, { kind: "ClaimTransfer", claimId: "claim-nope" as ClaimId, toHolderId: holder.id, cause });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/unknown claim/);
  });

  it("rejects a transfer to an unknown, dead or civilian holder", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder1 = addSoldier(world, "Holder1");
    const { claimId } = setBusinessClaim(world, holder1.id, business.id);

    const unknown = applyOne(world, { kind: "ClaimTransfer", claimId, toHolderId: "chr-nope" as CharacterId, cause });
    expect(unknown.applied).toBe(0);
    expect(rejectionReason(unknown.log)).toMatch(/unknown holder/);

    const dead = addCharacter(world, { name: "Dead", rank: "soldier", alive: false });
    const deadResult = applyOne(world, { kind: "ClaimTransfer", claimId, toHolderId: dead.id, cause });
    expect(deadResult.applied).toBe(0);
    expect(rejectionReason(deadResult.log)).toMatch(/dead/);

    const civilian = addCharacter(world, { name: "Civ", rank: "civilian" });
    const civResult = applyOne(world, { kind: "ClaimTransfer", claimId, toHolderId: civilian.id, cause });
    expect(civResult.applied).toBe(0);
    expect(rejectionReason(civResult.log)).toMatch(/civilian/);
  });

  it("rejects a transfer to the same holder", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder = addSoldier(world);
    const { claimId } = setBusinessClaim(world, holder.id, business.id);

    const { applied, log } = applyOne(world, { kind: "ClaimTransfer", claimId, toHolderId: holder.id, cause });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/already held by/);
  });
});

describe("claims reducer: ClaimRelease", () => {
  it("removes a business claim", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder = addSoldier(world);
    const claimId = newClaimId(world);
    applyOne(world, { kind: "ClaimSet", claimId, subject: { kind: "business", id: business.id }, holderId: holder.id, cause });

    const { applied } = applyOne(world, { kind: "ClaimRelease", claimId, cause });

    expect(applied).toBe(1);
    expect(world.claims.byId[claimId]).toBeUndefined();
    expect(world.claims.order).not.toContain(claimId);
  });

  it("releasing an associate claim clears onRecordWith", () => {
    const world = freshWorld();
    const holder = addSoldier(world);
    const associate = addAssociate(world);
    const claimId = newClaimId(world);
    applyOne(world, { kind: "ClaimSet", claimId, subject: { kind: "associate", id: associate.id }, holderId: holder.id, cause });
    expect(world.characters.byId[associate.id]!.onRecordWith).toBe(holder.id);

    const { applied } = applyOne(world, { kind: "ClaimRelease", claimId, cause });

    expect(applied).toBe(1);
    expect(world.characters.byId[associate.id]!.onRecordWith).toBeNull();
  });

  it("rejects releasing an unknown claim", () => {
    const world = freshWorld();
    const { applied, log } = applyOne(world, { kind: "ClaimRelease", claimId: "claim-nope" as ClaimId, cause });
    expect(applied).toBe(0);
    expect(rejectionReason(log)).toMatch(/unknown claim/);
  });
});

describe("claims invariants", () => {
  it("are silent on a well-formed world", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder = addSoldier(world);
    const associate = addAssociate(world);
    applyOne(world, {
      kind: "ClaimSet",
      claimId: newClaimId(world),
      subject: { kind: "business", id: business.id },
      holderId: holder.id,
      cause,
    });
    applyOne(world, {
      kind: "ClaimSet",
      claimId: newClaimId(world),
      subject: { kind: "associate", id: associate.id },
      holderId: holder.id,
      cause,
    });

    const violations = runInvariants(world).filter((v) => v.name.startsWith("claims."));
    expect(violations).toEqual([]);
  });

  it("claims.oneHolderPerSubject fires when two claims share a subject", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const holder1 = addSoldier(world, "Holder1");
    const holder2 = addSoldier(world, "Holder2");
    const claim1 = newClaimId(world);
    const claim2 = newClaimId(world);
    // Plant the violation directly: two claims on the same business, bypassing the reducer's own check.
    tableInsert(world.claims, claim1, { id: claim1, subject: { kind: "business", id: business.id }, holderId: holder1.id, since: 0 });
    tableInsert(world.claims, claim2, { id: claim2, subject: { kind: "business", id: business.id }, holderId: holder2.id, since: 0 });

    const violations = runInvariants(world).filter((v) => v.name === "claims.oneHolderPerSubject");
    expect(violations).toHaveLength(1);
  });

  it("claims.holderValid fires for a missing, dead or civilian holder", () => {
    const world = freshWorld();
    const { business } = addTownBlockBusiness(world);
    const claimId = newClaimId(world);
    tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "business", id: business.id }, holderId: "chr-nope" as CharacterId, since: 0 });

    let violations = runInvariants(world).filter((v) => v.name === "claims.holderValid");
    expect(violations).toHaveLength(1);

    const civilian = addCharacter(world, { name: "Civ", rank: "civilian" });
    world.claims.byId[claimId]!.holderId = civilian.id;
    violations = runInvariants(world).filter((v) => v.name === "claims.holderValid");
    expect(violations).toHaveLength(1);
  });

  it("claims.associateOnRecordConsistent fires when onRecordWith disagrees with the claim", () => {
    const world = freshWorld();
    const holder = addSoldier(world);
    const associate = addAssociate(world);
    const claimId = newClaimId(world);
    applyOne(world, { kind: "ClaimSet", claimId, subject: { kind: "associate", id: associate.id }, holderId: holder.id, cause });

    // Corrupt the field directly without going through the reducer's release/transfer.
    world.characters.byId[associate.id]!.onRecordWith = null;

    const violations = runInvariants(world).filter((v) => v.name === "claims.associateOnRecordConsistent");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("claims.associateOnRecordConsistent fires when onRecordWith is set with no backing claim", () => {
    const world = freshWorld();
    const holder = addSoldier(world);
    const associate = addAssociate(world);
    world.characters.byId[associate.id]!.onRecordWith = holder.id;

    const violations = runInvariants(world).filter((v) => v.name === "claims.associateOnRecordConsistent");
    expect(violations.length).toBeGreaterThan(0);
  });
});
