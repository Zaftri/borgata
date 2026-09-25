// Role binding (design 04 §1): candidates, `from` relations, `where`, `pick`.

import type { BusinessId, CharacterId } from "@borgata/shared";
import type { FromRelation, PickRule, RoleSelector, EntityKind, EntityRef } from "./types.js";
import type { ClaimSubject } from "../facts.js";
import { claimOnSubject } from "../reducers/claims.js";
import type { World } from "../world.js";
import type { Stream } from "../rng.js";
import { evaluateAll, pathValue, type Bindings } from "./predicates.js";

function ref(kind: EntityKind, id: string): EntityRef {
  return { kind, id };
}

function allOfKind(world: World, kind: EntityKind): EntityRef[] {
  switch (kind) {
    case "character":
      return world.characters.order.map((id) => ref("character", id));
    case "family":
      return world.families.order.map((id) => ref("family", id));
    case "crew":
      return world.crews.order.map((id) => ref("crew", id));
    case "town":
      return world.geo.towns.order.map((id) => ref("town", id));
    case "block":
      return world.geo.blocks.order.map((id) => ref("block", id));
    case "business":
      return world.geo.businesses.order.map((id) => ref("business", id));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// CandidateIndex (phase 5 perf task, docs/NOW.md next tasks item 3): a per-`runScheduler`-call cache of the
// full entity list per kind, in the same table order `allOfKind` produces, so repeated calls into `candidates()`
// (once per unbound role, once per spawn-scope candidate) don't each rebuild the same `order.map(...)` array.
// Every function below takes the index as a trailing optional parameter and falls back to building one lazily
// (scoped to that single call, exactly like the old behaviour) when the caller doesn't pass one -- existing
// direct callers (tests, and any future one) keep working unchanged. Only the scheduler, which builds one real
// index per `runScheduler` call and threads it through, actually benefits from the cache.
// ---------------------------------------------------------------------------------------------------------------
export type CandidateIndex = { byKind: Record<EntityKind, readonly EntityRef[]> };

export function buildCandidateIndex(world: World): CandidateIndex {
  return {
    byKind: {
      character: allOfKind(world, "character"),
      family: allOfKind(world, "family"),
      crew: allOfKind(world, "crew"),
      town: allOfKind(world, "town"),
      block: allOfKind(world, "block"),
      business: allOfKind(world, "business"),
    },
  };
}

/** The full entity list for a kind: the shared cached array when an index is given (never mutated by any
 * caller in this module or in scheduler.ts), else a freshly built one-off array (old behaviour, safe for
 * callers -- tests -- that never pass an index). */
function kindArray(world: World, kind: EntityKind, index?: CandidateIndex): readonly EntityRef[] {
  return index ? index.byKind[kind] : allOfKind(world, kind);
}

/** Candidate entities of a kind, optionally restricted by a relation to a bound role. Deterministic order. */
export function candidates(
  world: World,
  kind: EntityKind,
  from: RoleSelector["from"],
  roles: Bindings,
  index?: CandidateIndex,
): EntityRef[] {
  // When an index is given, this returns the shared cached array: nothing in this module or scheduler.ts
  // mutates a candidates() result, so aliasing it (rather than copying) is safe. Without an index, this is
  // exactly the old behaviour: a fresh array from allOfKind's own `.map`.
  if (!from) return kindArray(world, kind, index) as EntityRef[];

  const anchor = roles[from.role];
  if (!anchor) return [];

  switch (from.relation) {
    case "inTown": {
      if (anchor.kind !== "town") return [];
      const town = world.geo.towns.byId[anchor.id];
      if (!town) return [];
      const townBlocks = new Set<string>(town.blockIds);
      if (kind === "block") {
        return kindArray(world, "block", index).filter((r) => townBlocks.has(r.id)) as EntityRef[];
      }
      if (kind === "business") {
        return kindArray(world, "business", index).filter((r) => townBlocks.has(world.geo.businesses.byId[r.id]!.blockId)) as EntityRef[];
      }
      if (kind === "character") {
        const crewIds = new Set<string>();
        for (const blockId of town.blockIds) {
          const block = world.geo.blocks.byId[blockId];
          if (block?.crewId) crewIds.add(block.crewId);
        }
        const charIds = new Set<string>();
        for (const crewId of crewIds) {
          const crew = world.crews.byId[crewId];
          if (!crew) continue;
          charIds.add(crew.chiefId);
          for (const m of crew.memberIds) charIds.add(m);
        }
        return kindArray(world, "character", index).filter((r) => charIds.has(r.id)) as EntityRef[];
      }
      return [];
    }

    case "inCrew": {
      if (anchor.kind !== "crew" || kind !== "character") return [];
      const crew = world.crews.byId[anchor.id];
      if (!crew) return [];
      const memberIds = new Set<string>(crew.memberIds);
      memberIds.add(crew.chiefId);
      return kindArray(world, "character", index).filter((r) => memberIds.has(r.id)) as EntityRef[];
    }

    case "inFamily": {
      if (anchor.kind !== "family") return [];
      const family = world.families.byId[anchor.id];
      if (!family) return [];
      if (kind === "character") {
        return kindArray(world, "character", index).filter((r) => world.characters.byId[r.id]!.familyId === family.id) as EntityRef[];
      }
      if (kind === "crew") {
        return kindArray(world, "crew", index).filter((r) => world.crews.byId[r.id]!.familyId === family.id) as EntityRef[];
      }
      if (kind === "town") {
        return kindArray(world, "town", index).filter((r) => world.geo.towns.byId[r.id]!.familyId === family.id) as EntityRef[];
      }
      return [];
    }

    case "superiorOf": {
      if (anchor.kind !== "character" || kind !== "character") return [];
      const c = world.characters.byId[anchor.id];
      if (!c?.superiorId || !world.characters.byId[c.superiorId]) return [];
      return [ref("character", c.superiorId)];
    }

    case "subordinatesOf": {
      if (anchor.kind !== "character" || kind !== "character") return [];
      return kindArray(world, "character", index).filter((r) => world.characters.byId[r.id]!.superiorId === anchor.id) as EntityRef[];
    }

    case "businessesOf": {
      if (kind !== "business") return [];
      if (anchor.kind === "block") {
        return kindArray(world, "business", index).filter((r) => world.geo.businesses.byId[r.id]!.blockId === anchor.id) as EntityRef[];
      }
      if (anchor.kind === "town") {
        const town = world.geo.towns.byId[anchor.id];
        if (!town) return [];
        const blockIds = new Set(town.blockIds);
        return kindArray(world, "business", index).filter((r) => blockIds.has(world.geo.businesses.byId[r.id]!.blockId)) as EntityRef[];
      }
      if (anchor.kind === "crew") {
        const crew = world.crews.byId[anchor.id];
        if (!crew) return [];
        const blockIds = new Set(crew.blockIds);
        return kindArray(world, "business", index).filter((r) => blockIds.has(world.geo.businesses.byId[r.id]!.blockId)) as EntityRef[];
      }
      return [];
    }

    case "townOf": {
      if (kind !== "town") return [];
      let blockId: string | undefined;
      if (anchor.kind === "block") {
        blockId = anchor.id;
        const block = world.geo.blocks.byId[blockId];
        return block ? [ref("town", block.townId)] : [];
      }
      if (anchor.kind === "business") {
        const business = world.geo.businesses.byId[anchor.id];
        if (!business) return [];
        blockId = business.blockId;
      } else if (anchor.kind === "crew") {
        const crew = world.crews.byId[anchor.id];
        blockId = crew?.blockIds[0];
      } else if (anchor.kind === "character") {
        const c = world.characters.byId[anchor.id];
        if (!c?.crewId) return [];
        const crew = world.crews.byId[c.crewId];
        blockId = crew?.blockIds[0];
      } else {
        return [];
      }
      if (!blockId) return [];
      const block = world.geo.blocks.byId[blockId];
      return block ? [ref("town", block.townId)] : [];
    }

    case "crewOf": {
      if (kind !== "crew") return [];
      if (anchor.kind === "character") {
        const c = world.characters.byId[anchor.id];
        return c?.crewId && world.crews.byId[c.crewId] ? [ref("crew", c.crewId)] : [];
      }
      if (anchor.kind === "block") {
        const block = world.geo.blocks.byId[anchor.id];
        return block?.crewId && world.crews.byId[block.crewId] ? [ref("crew", block.crewId)] : [];
      }
      // A business's crew, via its block (extension 2 of the phase-4 migration: no direct business -> crew
      // relation existed before; civil.ts's file header documented this gap, worked around through townOf/inTown).
      if (anchor.kind === "business") {
        const business = world.geo.businesses.byId[anchor.id];
        const block = business ? world.geo.blocks.byId[business.blockId] : undefined;
        return block?.crewId && world.crews.byId[block.crewId] ? [ref("crew", block.crewId)] : [];
      }
      return [];
    }

    // A business's own block, or a character's crew's first block (extension 2). There was previously no
    // relation at all from a business to its block.
    case "blockOf": {
      if (kind !== "block") return [];
      if (anchor.kind === "business") {
        const business = world.geo.businesses.byId[anchor.id];
        return business ? [ref("block", business.blockId)] : [];
      }
      if (anchor.kind === "character") {
        const c = world.characters.byId[anchor.id];
        const crew = c?.crewId ? world.crews.byId[c.crewId] : undefined;
        const blockId = crew?.blockIds[0];
        return blockId ? [ref("block", blockId)] : [];
      }
      return [];
    }

    // The chief character of a crew, or of the crew that holds a block or a business (extension 2).
    case "chiefOf": {
      if (kind !== "character") return [];
      let crewId: string | undefined;
      if (anchor.kind === "crew") {
        crewId = anchor.id;
      } else if (anchor.kind === "block") {
        crewId = world.geo.blocks.byId[anchor.id]?.crewId ?? undefined;
      } else if (anchor.kind === "business") {
        const business = world.geo.businesses.byId[anchor.id];
        const block = business ? world.geo.blocks.byId[business.blockId] : undefined;
        crewId = block?.crewId ?? undefined;
      } else {
        return [];
      }
      const crew = crewId ? world.crews.byId[crewId] : undefined;
      return crew && world.characters.byId[crew.chiefId] ? [ref("character", crew.chiefId)] : [];
    }

    // A crew's members, excluding its chief (extension 2; `crew.memberIds` already excludes the chief, who is
    // tracked separately as `crew.chiefId`, so this is a direct lookup, not a filter).
    case "membersOf": {
      if (kind !== "character" || anchor.kind !== "crew") return [];
      const crew = world.crews.byId[anchor.id];
      if (!crew) return [];
      const memberIds = new Set<string>(crew.memberIds);
      return kindArray(world, "character", index).filter((r) => memberIds.has(r.id)) as EntityRef[];
    }

    // The character currently on record for a business or an associate character (disputes wave, design 02 §9's
    // one-holder-per-subject rule via reducers/claims.ts claimOnSubject). Yields at most one candidate.
    case "claimHolderOf": {
      if (kind !== "character") return [];
      let subject: ClaimSubject | undefined;
      if (anchor.kind === "business") subject = { kind: "business", id: anchor.id as BusinessId };
      else if (anchor.kind === "character") subject = { kind: "associate", id: anchor.id as CharacterId };
      else return [];
      const claim = claimOnSubject(world, subject);
      return claim ? [ref("character", claim.holderId)] : [];
    }

    // A business's civilian owner (docs/event-storming-2026-09-25.md §3 hotspot 1): `Business.ownerId`,
    // unbound when null (a role selector using this relation must be `optional` unless the caller already
    // knows the business has an owner). Owners are lazily generated -- world generation sets `ownerId`
    // directly for the player's sponsor's crew's blocks (design 09 §5); other shops stay ownerless for now.
    case "ownerOf": {
      if (kind !== "character" || anchor.kind !== "business") return [];
      const business = world.geo.businesses.byId[anchor.id];
      if (!business?.ownerId || !world.characters.byId[business.ownerId]) return [];
      return [ref("character", business.ownerId)];
    }

    // A family's warWith counterpart (design 13 §3, war.ts): the family it is currently at war with, or none.
    // Yields at most one candidate, unbound when `Family.warWith` is null or (should it ever go stale) names a
    // family that no longer exists -- the same "unbound rather than throw" contract as claimHolderOf/ownerOf.
    case "warWithOf": {
      if (kind !== "family" || anchor.kind !== "family") return [];
      const family = world.families.byId[anchor.id];
      if (!family?.warWith || !world.families.byId[family.warWith]) return [];
      return [ref("family", family.warWith)];
    }

    // The district head family of a family's own district (design 13 §3, disputes-to-the-district wave):
    // Family.districtId -> District.districtHeadFamilyId. Unbound when the family has no district (starter
    // worlds and any world with no generation-assigned districts) or the district has no head assigned yet --
    // the same "unbound rather than throw" contract as claimHolderOf/ownerOf/warWithOf.
    case "districtHeadOf": {
      if (kind !== "family" || anchor.kind !== "family") return [];
      const family = world.families.byId[anchor.id];
      const district = family?.districtId ? world.geo.districts.byId[family.districtId] : undefined;
      const headFamilyId = district?.districtHeadFamilyId;
      return headFamilyId && world.families.byId[headFamilyId] ? [ref("family", headFamilyId)] : [];
    }

    // A family's own head character (design 13 §3): Family.headId. Unbound when null (a family between heads).
    case "headOf": {
      if (kind !== "character" || anchor.kind !== "family") return [];
      const family = world.families.byId[anchor.id];
      return family?.headId && world.characters.byId[family.headId] ? [ref("character", family.headId)] : [];
    }

    case "familyOf": {
      if (kind !== "family") return [];
      if (anchor.kind === "character") {
        const c = world.characters.byId[anchor.id];
        return c?.familyId && world.families.byId[c.familyId] ? [ref("family", c.familyId)] : [];
      }
      if (anchor.kind === "crew") {
        const crew = world.crews.byId[anchor.id];
        return crew?.familyId && world.families.byId[crew.familyId] ? [ref("family", crew.familyId)] : [];
      }
      if (anchor.kind === "town") {
        const town = world.geo.towns.byId[anchor.id];
        return town?.familyId && world.families.byId[town.familyId] ? [ref("family", town.familyId)] : [];
      }
      return [];
    }

    default:
      return [];
  }
}

function pickFrom(cands: readonly EntityRef[], pick: PickRule, world: World, stream: Stream): EntityRef {
  if (pick === "first") return cands[0]!;
  if (pick === "random") return stream.pick(cands);

  const isHighest = pick.startsWith("highest:");
  const isLowest = pick.startsWith("lowest:");
  if (isHighest || isLowest) {
    const path = pick.slice(pick.indexOf(":") + 1);
    let best = cands[0]!;
    let bestValue = pathValue(world, best, path) ?? (isHighest ? -Infinity : Infinity);
    for (let i = 1; i < cands.length; i++) {
      const candidate = cands[i]!;
      const value = pathValue(world, candidate, path) ?? (isHighest ? -Infinity : Infinity);
      if (isHighest ? value > bestValue : value < bestValue) {
        best = candidate;
        bestValue = value;
      }
    }
    return best;
  }
  // Exhaustive per PickRule; unreachable for well-formed content.
  throw new Error(`unrecognized pick rule: ${pick as string}`);
}

/** Resolve every unbound role of `selectors` in declaration order; returns null if a required role cannot be bound. */
export function bindRoles(
  world: World,
  selectors: Record<string, RoleSelector>,
  prebound: Bindings,
  stream: Stream,
  index?: CandidateIndex,
): Bindings | null {
  const bindings: Bindings = { ...prebound };

  for (const [roleName, selector] of Object.entries(selectors)) {
    if (roleName in bindings) continue;

    const raw = candidates(world, selector.entity, selector.from, bindings, index);
    const filtered = selector.where
      ? raw.filter((candidate) => evaluateAll(world, { ...bindings, $candidate: candidate }, selector.where!))
      : raw;

    if (filtered.length === 0) {
      if (selector.optional) continue;
      return null;
    }

    bindings[roleName] = pickFrom(filtered, selector.pick, world, stream);
  }

  return bindings;
}

// ---------------------------------------------------------------------------------------------------------------
// `each` effect support (extension 4 of the phase-4 migration, engine/types.ts `Effect`'s `each` variant):
// candidates related to an already-bound role by a relation, for the scheduler to expand inner effects over.
// Every relation resolves to exactly one entity kind (unlike a role selector's `from`, which is disambiguated
// by the selector's own `entity` field); relations that can resolve to more than one kind depending on the
// requested entity (inTown, inCrew, inFamily) are not meaningful for `each` and are simply unsupported here.
// ---------------------------------------------------------------------------------------------------------------
const EACH_RELATION_KIND: Partial<Record<FromRelation, EntityKind>> = {
  crewOf: "crew",
  familyOf: "family",
  townOf: "town",
  blockOf: "block",
  chiefOf: "character",
  membersOf: "character",
  superiorOf: "character",
  subordinatesOf: "character",
  businessesOf: "business",
};

/** Candidates for an `each` effect: same deterministic order as `candidates()` (table order), since it is the
 * function this delegates to once the relation's fixed target kind is known. */
export function eachCandidates(
  world: World,
  roles: Bindings,
  from: { role: string; relation: FromRelation },
  index?: CandidateIndex,
): EntityRef[] {
  const kind = EACH_RELATION_KIND[from.relation];
  if (!kind) return [];
  return candidates(world, kind, from, roles, index);
}
