// Crew chiefs run their crews autonomously (design 01 §3 step 2, A4, build plan next task 2).
// This system only reads the world and mints ids for the facts it emits; only owner reducers write state
// (repo rule 1). No randomness is needed: slot filling and share defaults are unconditional, not rolled.

import { mintId, type CharacterId } from "@borgata/shared";
import type { Content } from "../content-types.js";
import type { Cause, Fact } from "../facts.js";
import { claimsHeldBy } from "../reducers/claims.js";
import type { ChainInstance, Character, Crew, SlotFiller, World } from "../world.js";

const PROTECTION_TAX_TEMPLATE = "chain.protectionTax";

function isCollectorEligible(c: Character): boolean {
  return c.alive && c.status === "free" && (c.rank === "soldier" || c.rank === "associate");
}

function findChiefChain(world: World, chiefId: CharacterId): ChainInstance | undefined {
  for (const id of world.chains.order) {
    const chain = world.chains.byId[id]!;
    if (chain.templateId === PROTECTION_TAX_TEMPLATE && chain.ownerId === chiefId) return chain;
  }
  return undefined;
}

function hasFiller(slot: readonly SlotFiller[] | undefined, filler: SlotFiller): boolean {
  return !!slot?.some((f) => f.kind === filler.kind && f.id === filler.id);
}

/** Ensure the crew's protection-tax chain exists and is filled, and vacate collectors who fell out. */
function ensureChain(world: World, crew: Crew, chief: Character, cause: Cause): Fact[] {
  const facts: Fact[] = [];
  // Collectors are the crew's men plus the associates on record with them: a sponsor puts his associate to work
  // on his block (gameplay walkthrough, the associate rank). Added 2026-09-23 so the player earns as an associate.
  const eligibleMembers = crew.memberIds.filter((id) => {
    const m = world.characters.byId[id];
    return !!m && isCollectorEligible(m);
  });
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (c.rank !== "associate" || !c.onRecordWith || !isCollectorEligible(c)) continue;
    if (!crew.memberIds.includes(c.onRecordWith)) continue;
    if (!eligibleMembers.includes(c.id)) eligibleMembers.push(c.id);
  }

  const existing = findChiefChain(world, chief.id);
  if (!existing) {
    const chainId = mintId<"ChainInstanceId">(world.meta.ids, "chn");
    facts.push({
      kind: "ChainCreate",
      chainId,
      templateId: PROTECTION_TAX_TEMPLATE,
      familyId: crew.familyId,
      ownerId: chief.id,
      slotNames: ["collectors", "blocks"],
      cause,
    });
    for (const memberId of eligibleMembers) {
      facts.push({ kind: "ChainSlotFill", chainId, slot: "collectors", filler: { kind: "character", id: memberId }, cause });
    }
    for (const blockId of crew.blockIds) {
      facts.push({ kind: "ChainSlotFill", chainId, slot: "blocks", filler: { kind: "block", id: blockId }, cause });
    }
    return facts;
  }

  const chainId = existing.id;
  const collectorSlot = existing.slots["collectors"];
  const blockSlot = existing.slots["blocks"];

  for (const memberId of eligibleMembers) {
    const filler: SlotFiller = { kind: "character", id: memberId };
    if (!hasFiller(collectorSlot, filler)) facts.push({ kind: "ChainSlotFill", chainId, slot: "collectors", filler, cause });
  }
  for (const blockId of crew.blockIds) {
    const filler: SlotFiller = { kind: "block", id: blockId };
    if (!hasFiller(blockSlot, filler)) facts.push({ kind: "ChainSlotFill", chainId, slot: "blocks", filler, cause });
  }

  for (const filler of collectorSlot ?? []) {
    if (filler.kind !== "character") continue;
    const member = world.characters.byId[filler.id];
    const stillEligible = !!member && member.alive && member.status === "free";
    if (!stillEligible) facts.push({ kind: "ChainSlotVacate", chainId, slot: "collectors", filler, cause });
  }

  return facts;
}

/** For every crew member without a share rule from the chief, set the default 40 percent. */
function ensureCrewShares(crew: Crew, chief: Character, cause: Cause): Fact[] {
  const facts: Fact[] = [];
  for (const memberId of crew.memberIds) {
    if (chief.shareRules[memberId]) continue;
    facts.push({
      kind: "ShareRuleSet",
      superiorId: chief.id,
      subordinateId: memberId,
      rule: { fixedPerTurn: 0, percent: 400 },
      cause,
    });
  }
  return facts;
}

/** Every soldier (not the player) sets a default 50 percent share for each associate he has on record. */
function ensureSoldierAssociateShares(world: World): Fact[] {
  const facts: Fact[] = [];
  for (const id of world.characters.order) {
    const soldier = world.characters.byId[id]!;
    if (soldier.rank !== "soldier" || soldier.playerControlled) continue;
    for (const claim of claimsHeldBy(world, soldier.id)) {
      if (claim.subject.kind !== "associate") continue;
      const associateId = claim.subject.id;
      if (soldier.shareRules[associateId]) continue;
      facts.push({
        kind: "ShareRuleSet",
        superiorId: soldier.id,
        subordinateId: associateId,
        rule: { fixedPerTurn: 0, percent: 500 },
        cause: { rule: "ai.soldier.shareRule", actorId: soldier.id },
      });
    }
  }
  return facts;
}

/** A made man gets a stall (design 03 §4; 2026-09-24, found when a freshly made player collected nothing):
 *  generation hands every shop on the crew's blocks to the soldiers of the day, so a soldier made later holds no
 *  claim and neither he nor his associate has a round. The chief moves one business claim per turn from the
 *  crewmate holding the most (at least two) to a living, free soldier of the crew who holds none. */
function ensureSoldierHasStall(world: World, crew: Crew, chief: Character): Fact[] {
  const facts: Fact[] = [];
  const soldiers = crew.memberIds
    .map((id) => world.characters.byId[id])
    .filter((c): c is Character => !!c && c.alive && c.status === "free" && c.rank === "soldier");
  const businessClaims = new Map(soldiers.map((s) => [s.id, claimsHeldBy(world, s.id).filter((c) => c.subject.kind === "business")]));
  for (const soldier of soldiers) {
    if ((businessClaims.get(soldier.id)?.length ?? 0) > 0) continue;
    let donor: Character | undefined;
    for (const other of soldiers) {
      if (other.id === soldier.id) continue;
      const n = businessClaims.get(other.id)?.length ?? 0;
      if (n >= 2 && n > (donor ? businessClaims.get(donor.id)!.length : 0)) donor = other;
    }
    if (!donor) continue;
    const claim = businessClaims.get(donor.id)!.pop()!;
    businessClaims.set(soldier.id, [claim]);
    facts.push({ kind: "ClaimTransfer", claimId: claim.id, toHolderId: soldier.id, cause: { rule: "ai.crew.stallForNewSoldier", actorId: chief.id } });
  }
  return facts;
}

export function familyAi(world: World, _content: Content): Fact[] {
  const facts: Fact[] = [];

  for (const crewId of world.crews.order) {
    const crew = world.crews.byId[crewId]!;
    const chief = world.characters.byId[crew.chiefId];
    if (!chief || !chief.alive || chief.status !== "free" || chief.playerControlled) continue;

    const cause: Cause = { rule: "ai.crew.ensureChain", actorId: chief.id };
    facts.push(...ensureChain(world, crew, chief, cause));
    facts.push(...ensureCrewShares(crew, chief, { rule: "ai.crew.shareRule", actorId: chief.id }));
    facts.push(...ensureSoldierHasStall(world, crew, chief));
  }

  facts.push(...ensureSoldierAssociateShares(world));

  return facts;
}
