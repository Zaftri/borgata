// Invariants for the generator (design 05, build plan phase 5 task 2), registered by importing this
// module from ./all.ts. Structural, so they run every turn like the others: nothing later in the game
// removes a province, a district or the one-family-per-town rule.

import { registerInvariant, type Violation } from "../invariants.js";

registerInvariant({
  name: "generation.townsHaveProvince",
  check(world): Violation[] {
    // Worlds with no province at all predate the generator (packages/sim/src/starter.ts, kept as a test
    // fixture per docs/NOW.md phase 5): nothing to check for them. A generated world always has exactly
    // one full province (design 05, K0), so every one of its towns is expected to name it.
    if (world.geo.provinces.order.length === 0) return [];
    const out: Violation[] = [];
    for (const id of world.geo.towns.order) {
      const town = world.geo.towns.byId[id]!;
      if (!town.provinceId) {
        out.push({ name: "generation.townsHaveProvince", message: `town ${id} has no province` });
        continue;
      }
      if (!world.geo.provinces.byId[town.provinceId]) {
        out.push({ name: "generation.townsHaveProvince", message: `town ${id} references unknown province ${town.provinceId}` });
      }
    }
    for (const id of world.geo.provinces.order) {
      const province = world.geo.provinces.byId[id]!;
      for (const townId of province.capitalTownIds) {
        const town = world.geo.towns.byId[townId];
        if (!town) {
          out.push({ name: "generation.townsHaveProvince", message: `province ${id} lists capital neighborhood ${townId} which does not exist` });
        } else if (!town.isNeighborhood || town.provinceId !== id) {
          out.push({
            name: "generation.townsHaveProvince",
            message: `province ${id} lists capital neighborhood ${townId} which is not its neighborhood (isNeighborhood ${town.isNeighborhood}, provinceId ${String(town.provinceId)})`,
          });
        }
      }
    }
    return out;
  },
});

registerInvariant({
  name: "generation.districtsCoherent",
  check(world): Violation[] {
    const out: Violation[] = [];
    const onlyDistrict = world.geo.districts.order.length === 1;
    for (const id of world.geo.districts.order) {
      const district = world.geo.districts.byId[id]!;
      for (const familyId of district.familyIds) {
        const family = world.families.byId[familyId];
        if (!family) {
          out.push({ name: "generation.districtsCoherent", message: `district ${id} lists family ${familyId} which does not exist` });
        } else if (family.districtId !== id) {
          out.push({
            name: "generation.districtsCoherent",
            message: `district ${id} lists family ${familyId} whose districtId is ${String(family.districtId)}`,
          });
        }
      }
      if (district.familyIds.length < 3 && !onlyDistrict) {
        out.push({ name: "generation.districtsCoherent", message: `district ${id} has ${district.familyIds.length} families, fewer than 3` });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "generation.oneFamilyPerTown",
  check(world): Violation[] {
    // Same exemption as generation.townsHaveProvince: hand-built fixtures that never call the generator
    // (createEmptyWorld plus addFamily/addTown directly, several system test suites) are free to build
    // townless families or familyless towns to probe a single reducer; a generated world never is.
    if (world.geo.provinces.order.length === 0) return [];
    const out: Violation[] = [];
    for (const id of world.families.order) {
      const family = world.families.byId[id]!;
      if (family.townIds.length !== 1) {
        out.push({ name: "generation.oneFamilyPerTown", message: `family ${id} owns ${family.townIds.length} towns, expected exactly 1` });
      }
    }
    const ownerOf = new Map<string, string>();
    for (const id of world.geo.towns.order) {
      const town = world.geo.towns.byId[id]!;
      if (!town.familyId) {
        out.push({ name: "generation.oneFamilyPerTown", message: `town ${id} has no family` });
        continue;
      }
      const existing = ownerOf.get(town.familyId);
      if (existing) {
        out.push({ name: "generation.oneFamilyPerTown", message: `family ${town.familyId} owns both town ${existing} and town ${id}` });
      } else {
        ownerOf.set(town.familyId, id);
      }
    }
    return out;
  },
});
