// Invariants for the families system (design 02 §4, §9), registered by importing this module from ./all.ts.
// Four checks: crews agree with their family and their chief and members; a family's towns point back at it;
// the treasury account exists and is owned by the family; every living character's superior is a living other.

import { registerInvariant, type Violation } from "../invariants.js";

registerInvariant({
  name: "families.crewsConsistent",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.crews.order) {
      const crew = world.crews.byId[id]!;
      const family = world.families.byId[crew.familyId];
      if (!family) {
        out.push({ name: "families.crewsConsistent", message: `crew ${id} family ${crew.familyId} does not exist` });
      } else if (!family.crewIds.includes(crew.id)) {
        out.push({ name: "families.crewsConsistent", message: `family ${family.id} does not list crew ${id}` });
      }

      const chief = world.characters.byId[crew.chiefId];
      if (!chief) {
        out.push({ name: "families.crewsConsistent", message: `crew ${id} chief ${crew.chiefId} does not exist` });
      } else if (chief.crewId !== crew.id) {
        out.push({ name: "families.crewsConsistent", message: `crew ${id} chief ${crew.chiefId} has crewId ${String(chief.crewId)}` });
      }

      for (const memberId of crew.memberIds) {
        const member = world.characters.byId[memberId];
        if (!member) {
          out.push({ name: "families.crewsConsistent", message: `crew ${id} member ${memberId} does not exist` });
          continue;
        }
        if (member.crewId !== crew.id) {
          out.push({ name: "families.crewsConsistent", message: `crew ${id} member ${memberId} has crewId ${String(member.crewId)}` });
        }
        if (member.familyId !== crew.familyId) {
          out.push({
            name: "families.crewsConsistent",
            message: `crew ${id} member ${memberId} has familyId ${String(member.familyId)}, crew family is ${crew.familyId}`,
          });
        }
        if (member.superiorId !== crew.chiefId) {
          out.push({
            name: "families.crewsConsistent",
            message: `crew ${id} member ${memberId} has superiorId ${String(member.superiorId)}, expected chief ${crew.chiefId}`,
          });
        }
      }
    }
    return out;
  },
});

registerInvariant({
  name: "families.townsOwned",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.families.order) {
      const family = world.families.byId[id]!;
      for (const townId of family.townIds) {
        const town = world.geo.towns.byId[townId];
        if (!town) {
          out.push({ name: "families.townsOwned", message: `family ${id} lists town ${townId} which does not exist` });
        } else if (town.familyId !== id) {
          out.push({ name: "families.townsOwned", message: `town ${townId} listed by family ${id} has familyId ${String(town.familyId)}` });
        }
      }
    }
    return out;
  },
});

registerInvariant({
  name: "families.treasuryExists",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.families.order) {
      const family = world.families.byId[id]!;
      const account = world.ledger.accounts.byId[family.treasury];
      if (!account) {
        out.push({ name: "families.treasuryExists", message: `family ${id} treasury ${family.treasury} does not exist` });
      } else if (account.ownerRef.kind !== "family" || account.ownerRef.id !== id) {
        out.push({
          name: "families.treasuryExists",
          message: `family ${id} treasury ${family.treasury} ownerRef is ${account.ownerRef.kind}:${account.ownerRef.id}`,
        });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "families.superiorAlive",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      if (!c.alive || c.superiorId === null) continue;
      if (c.superiorId === c.id) {
        out.push({ name: "families.superiorAlive", message: `character ${id} is his own superior` });
        continue;
      }
      const superior = world.characters.byId[c.superiorId];
      if (!superior) {
        out.push({ name: "families.superiorAlive", message: `character ${id} superior ${c.superiorId} does not exist` });
      } else if (!superior.alive) {
        out.push({ name: "families.superiorAlive", message: `character ${id} superior ${c.superiorId} is dead` });
      }
    }
    return out;
  },
});
