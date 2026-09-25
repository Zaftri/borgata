// Territory reducer (design 02 §6 row 8). Phase 1: block assignment and crew membership.

import type { Fact } from "../facts.js";
import type { World } from "../world.js";
import type { Reducer, Rejection } from "./index.js";

export const territoryReducer: Reducer = {
  owner: "territory",
  apply(world: World, fact: Fact): Rejection | null {
    switch (fact.kind) {
      case "BlockAssign": {
        const block = world.geo.blocks.byId[fact.blockId];
        if (!block) return { reason: `unknown block ${fact.blockId}` };
        if (fact.crewId !== null) {
          const crew = world.crews.byId[fact.crewId];
          if (!crew) return { reason: `unknown crew ${fact.crewId}` };
          const town = world.geo.towns.byId[block.townId];
          if (town && town.familyId !== crew.familyId) return { reason: `block ${fact.blockId} is in a town of another family` };
          if (!crew.blockIds.includes(fact.blockId)) crew.blockIds.push(fact.blockId);
        }
        if (block.crewId && block.crewId !== fact.crewId) {
          const old = world.crews.byId[block.crewId];
          if (old) old.blockIds = old.blockIds.filter((b) => b !== fact.blockId);
        }
        block.crewId = fact.crewId;
        return null;
      }
      case "CrewMemberAdd": {
        const crew = world.crews.byId[fact.crewId];
        const c = world.characters.byId[fact.characterId];
        if (!crew) return { reason: `unknown crew ${fact.crewId}` };
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (!c.alive) return { reason: `character ${fact.characterId} is dead` };
        if (c.rank !== "soldier" && c.rank !== "associate") return { reason: `only soldiers and associates join crews (${c.rank})` };
        if (c.crewId && c.crewId !== fact.crewId) return { reason: `character already in crew ${c.crewId}` };
        if (!crew.memberIds.includes(fact.characterId)) crew.memberIds.push(fact.characterId);
        c.crewId = fact.crewId;
        c.familyId = crew.familyId;
        return null;
      }
      case "CrewMemberRemove": {
        const crew = world.crews.byId[fact.crewId];
        const c = world.characters.byId[fact.characterId];
        if (!crew) return { reason: `unknown crew ${fact.crewId}` };
        if (!c) return { reason: `unknown character ${fact.characterId}` };
        if (!crew.memberIds.includes(fact.characterId)) return { reason: `not a member` };
        crew.memberIds = crew.memberIds.filter((m) => m !== fact.characterId);
        if (c.crewId === fact.crewId) c.crewId = null;
        return null;
      }
      case "WarStateSet": {
        const family = world.families.byId[fact.familyId];
        if (!family) return { reason: `unknown family ${fact.familyId}` };
        if (fact.enemyFamilyId !== null && !world.families.byId[fact.enemyFamilyId]) return { reason: `unknown enemy ${fact.enemyFamilyId}` };
        if (fact.enemyFamilyId === fact.familyId) return { reason: "a family cannot war with itself" };
        family.warWith = fact.enemyFamilyId;
        return null;
      }
      case "DistrictHeadSet": {
        const district = world.geo.districts.byId[fact.districtId];
        if (!district) return { reason: `unknown district ${fact.districtId}` };
        if (!district.familyIds.includes(fact.familyId)) return { reason: `family ${fact.familyId} is not in district ${fact.districtId}` };
        district.districtHeadFamilyId = fact.familyId;
        return null;
      }
      case "FamilyShortfallSet": {
        const family = world.families.byId[fact.familyId];
        if (!family) return { reason: `unknown family ${fact.familyId}` };
        if (!Number.isSafeInteger(fact.streak)) return { reason: "streak must be an integer" };
        family.shortfallStreak = fact.streak;
        return null;
      }
      case "FamilyStateSet": {
        const family = world.families.byId[fact.familyId];
        if (!family) return { reason: `unknown family ${fact.familyId}` };
        family.state = fact.state;
        return null;
      }
      case "CrewChiefSet": {
        const crew = world.crews.byId[fact.crewId];
        const c = world.characters.byId[fact.chiefId];
        if (!crew) return { reason: `unknown crew ${fact.crewId}` };
        if (!c || !c.alive) return { reason: `chief ${fact.chiefId} missing or dead` };
        if (c.rank !== "chief") return { reason: `new chief must hold rank chief (${c.rank})` };
        if (crew.chiefId === fact.chiefId) return { reason: "already the chief" };
        const family = world.families.byId[crew.familyId];
        crew.memberIds = crew.memberIds.filter((m) => m !== fact.chiefId);
        crew.chiefId = fact.chiefId;
        c.crewId = crew.id;
        c.familyId = crew.familyId;
        c.superiorId = family?.headId && family.headId !== c.id ? family.headId : null;
        for (const m of crew.memberIds) {
          const member = world.characters.byId[m];
          if (member) member.superiorId = fact.chiefId;
        }
        return null;
      }
      default:
        return { reason: `territory does not own ${fact.kind}` };
    }
  },
};
