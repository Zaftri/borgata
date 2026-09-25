// Predicate evaluation (design 04 §1) and the `fn` registry. A small JSON expression language evaluated
// against the world and the bound roles. Never mutates the world.

import type { CmpOp, EntityKind, EntityRef, Predicate } from "./types.js";
import { standingKey, type AttentionBand, type CharStatus, type Character, type Family, type Rank, type ToolId, type World } from "../world.js";
import { getStream } from "../rng.js";
import type { FamilyId } from "@borgata/shared";
import { prisonerSupported } from "../systems/obligations.js";

export type Bindings = Record<string, EntityRef>;
export type PredicateFn = (world: World, roles: Bindings, args: Record<string, number | string | boolean>) => boolean;

/**
 * Extra, non-world context for evaluating an outcome's `when` (disputes wave, dispute.claim's `decided`
 * predicate): the option chosen for the instance currently resolving, if any. Threaded through as an optional
 * final argument rather than a reserved `$instance` role (design 04 §1 already gives `$instance` a different
 * meaning, the process instance id, in effects.ts) -- the least invasive way to let a `resolve[].when` see the
 * decision outcome, per engine/scheduler.ts's `resolveInstanceNow` (the only caller that ever passes one).
 */
export type EvalContext = { decidedOptionId?: string };

const registry = new Map<string, PredicateFn>();
export function registerPredicateFn(name: string, fn: PredicateFn): void {
  registry.set(name, fn);
}
export function predicateFnNames(): string[] {
  return [...registry.keys()].sort();
}

// Built-ins (design 04 §1: "the few cases the DSL cannot express" also cover trivial always/never gates
// used by templates and tests).
registerPredicateFn("always", () => true);
registerPredicateFn("never", () => false);

// ---------------------------------------------------------------------------------------------------------------
// `state.` fn predicates (phase-4 migration, docs/NOW.md next tasks item 1): the state's raid/patrol templates
// (packages/content/src/templates/state.ts) need the flip roll from the old systems/state-actions.ts. A `fn`
// predicate is the documented, accepted exception to "predicates never mutate/never draw" (design 04 §1: "a
// named predicate registered in code for the few cases the DSL cannot express"): `state.flipRoll` draws from
// its own named stream ("state.flip"), exactly like a system would, rather than reading a precomputed value.
// ---------------------------------------------------------------------------------------------------------------

/** Design 03 §3's flip-roll constants, moved here from systems/state-actions.ts with the rest of the formula. */
const FLIP_INFORMANT_NETWORK_PRESSURE = 200;
const FLIP_MURDER_MEMORY_PRESSURE = 300;
const FLIP_FAMILY_SUPPORT_RESISTANCE = 200;
const FLIP_PRISONER_SUPPORT_RESISTANCE = 250; // design 12: the strongest anti-flip lever (P-1)
const FLIP_DRAW_MAX = 1000;

/**
 * A raid/patrol template offers this fn to both its "cooperates" outcome (`when: [..., { fn: { name:
 * "state.flipRoll" } }]`) and its "silent" outcome (`when: [..., { not: { fn: { name: "state.flipRoll" } } }]`)
 * so the two are mutually exclusive without ever double-matching (engine/scheduler.ts `resolveInstanceNow`
 * evaluates every outcome's `when` and weighted-picks among however many hold, so an unmemoized coin flip
 * evaluated twice could disagree with itself and either double- or zero-match). Both evaluations happen within
 * the same `resolveInstanceNow` call against the very same `roles` object (`inst.roles`, never mutated in
 * between), so memoizing by that object's identity gives exactly one draw from "state.flip" per resolution:
 * a fresh `roles` object (a new spawn, or a later firing's freshly bound roles) always misses the cache and
 * draws again, but the two "when" evaluations of one resolution never do. */
const flipRollMemo = new WeakMap<Bindings, boolean>();

registerPredicateFn("state.flipRoll", (world, roles) => {
  const memoized = flipRollMemo.get(roles);
  if (memoized !== undefined) return memoized;

  const suspectRef = roles["suspect"];
  const candidate = suspectRef && suspectRef.kind === "character" ? world.characters.byId[suspectRef.id] : undefined;
  if (!candidate) {
    flipRollMemo.set(roles, false);
    return false;
  }

  const family = candidate.familyId ? world.families.byId[candidate.familyId] : undefined;
  const hasInformantNetwork = !!family && family.attentionBand >= 1;
  const hasMurderMemory = candidate.memory.some((m) => m.tag === "murder");
  const pressure =
    candidate.exposure + (hasInformantNetwork ? FLIP_INFORMANT_NETWORK_PRESSURE : 0) + (hasMurderMemory ? FLIP_MURDER_MEMORY_PRESSURE : 0);

  const superior = candidate.superiorId ? world.characters.byId[candidate.superiorId] : undefined;
  const hasLivingSuperior = !!superior && superior.alive;
  // Design 12: a prisoner whose family is being supported (an obligation met this turn) resists; one left alone does not.
  const supported = prisonerSupported(world, candidate.id);
  const resistance = candidate.loyalty + (hasLivingSuperior ? FLIP_FAMILY_SUPPORT_RESISTANCE : 0) + (supported ? FLIP_PRISONER_SUPPORT_RESISTANCE : 0);

  const r = getStream(world.rng, "state.flip").nextInt(FLIP_DRAW_MAX);
  const cooperates = pressure - resistance > r && !candidate.playerControlled;
  flipRollMemo.set(roles, cooperates);
  return cooperates;
});

// ---------------------------------------------------------------------------------------------------------------
// Shared entity/path resolution, reused by roles.ts (pick "highest:path"/"lowest:path") and effects.ts ($expr,
// $role.town). Kept here since predicates.ts owns the notion of "read a path off a bound entity".
// ---------------------------------------------------------------------------------------------------------------

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function numericPath(obj: unknown, path: string): number | undefined {
  const v = getPath(obj, path);
  return typeof v === "number" ? v : undefined;
}

function characterOf(world: World, ref: EntityRef | undefined): Character | undefined {
  if (!ref || ref.kind !== "character") return undefined;
  return world.characters.byId[ref.id];
}

function familyOf(world: World, ref: EntityRef | undefined): Family | undefined {
  if (!ref) return undefined;
  if (ref.kind === "family") return world.families.byId[ref.id];
  if (ref.kind === "character") {
    const c = world.characters.byId[ref.id];
    return c?.familyId ? world.families.byId[c.familyId] : undefined;
  }
  return undefined;
}

/** The town id for an entity: the entity itself if a town, else resolved via block/business/crew/character (design 04 §1: heat). */
export function resolveTownId(world: World, ref: EntityRef | undefined): string | null {
  if (!ref) return null;
  switch (ref.kind) {
    case "town":
      return world.geo.towns.byId[ref.id] ? ref.id : null;
    case "block": {
      const block = world.geo.blocks.byId[ref.id];
      return block ? block.townId : null;
    }
    case "business": {
      const business = world.geo.businesses.byId[ref.id];
      if (!business) return null;
      const block = world.geo.blocks.byId[business.blockId];
      return block ? block.townId : null;
    }
    case "crew": {
      const crew = world.crews.byId[ref.id];
      const blockId = crew?.blockIds[0];
      if (!blockId) return null;
      const block = world.geo.blocks.byId[blockId];
      return block ? block.townId : null;
    }
    case "character": {
      const c = world.characters.byId[ref.id];
      if (!c?.crewId) return null;
      const crew = world.crews.byId[c.crewId];
      const blockId = crew?.blockIds[0];
      if (!blockId) return null;
      const block = world.geo.blocks.byId[blockId];
      return block ? block.townId : null;
    }
    default:
      return null;
  }
}

/** Numeric path resolution used by `cmp` and by role-selector `pick: "highest:path"/"lowest:path"`. */
export function pathValue(world: World, ref: EntityRef | undefined, path: string): number | undefined {
  if (!ref) return undefined;
  switch (ref.kind) {
    case "character":
      return numericPath(world.characters.byId[ref.id], path);
    case "family":
      return numericPath(world.families.byId[ref.id], path);
    case "crew":
      return numericPath(world.crews.byId[ref.id], path);
    case "block":
      return numericPath(world.geo.blocks.byId[ref.id], path);
    case "business":
      return numericPath(world.geo.businesses.byId[ref.id], path);
    case "town": {
      // TownState (sentiment, pettyCrime) is checked first, then the Town record (population, ...).
      const fromState = numericPath(world.towns.byId[ref.id], path);
      if (fromState !== undefined) return fromState;
      return numericPath(world.geo.towns.byId[ref.id], path);
    }
    default:
      return undefined;
  }
}

function cmpOp(op: CmpOp, a: number, b: number): boolean {
  switch (op) {
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "eq":
      return a === b;
    case "ne":
      return a !== b;
  }
}

function bandOf(world: World, ref: EntityRef | undefined): AttentionBand | undefined {
  const family = familyOf(world, ref);
  return family?.attentionBand;
}

// ---------------------------------------------------------------------------------------------------------------
// evaluate
// ---------------------------------------------------------------------------------------------------------------

export function evaluate(world: World, roles: Bindings, p: Predicate, ctx?: EvalContext): boolean {
  if ("all" in p) return p.all.every((x) => evaluate(world, roles, x, ctx));
  if ("any" in p) return p.any.some((x) => evaluate(world, roles, x, ctx));
  if ("not" in p) return !evaluate(world, roles, p.not, ctx);

  if ("cmp" in p) {
    const { role, path, op, value } = p.cmp;
    const v = pathValue(world, roles[role], path);
    if (v === undefined) return false;
    return cmpOp(op, v, value);
  }

  if ("band" in p) {
    const { role, gte, lte } = p.band;
    const band = bandOf(world, roles[role]);
    if (band === undefined) return false;
    if (gte !== undefined && band < gte) return false;
    if (lte !== undefined && band > lte) return false;
    return true;
  }

  if ("heat" in p) {
    const { role, gte, lte } = p.heat;
    const townId = resolveTownId(world, roles[role]);
    if (townId === null) return false;
    const heat = world.pressure.heatByTown[townId] ?? 0;
    if (gte !== undefined && heat < gte) return false;
    if (lte !== undefined && heat > lte) return false;
    return true;
  }

  if ("has" in p) {
    const { role, trait, tool, memoryTag } = p.has;
    const ref = roles[role];
    if (!ref) return false;
    if (trait !== undefined) {
      const c = characterOf(world, ref);
      return !!c && c.traits.includes(trait);
    }
    if (tool !== undefined) {
      const family = familyOf(world, ref);
      if (!family) return false;
      const tools = world.pressure.toolsByFamily[family.id];
      return !!tools && tools.includes(tool as ToolId);
    }
    if (memoryTag !== undefined) {
      const c = characterOf(world, ref);
      return !!c && c.memory.some((m) => m.tag === memoryTag);
    }
    return false;
  }

  if ("status" in p) {
    const c = characterOf(world, roles[p.status.role]);
    if (!c) return false;
    const is = p.status.is;
    return Array.isArray(is) ? (is as CharStatus[]).includes(c.status) : c.status === is;
  }

  if ("rank" in p) {
    const c = characterOf(world, roles[p.rank.role]);
    if (!c) return false;
    return (p.rank.in as Rank[]).includes(c.rank);
  }

  if ("alive" in p) {
    const c = characterOf(world, roles[p.alive.role]);
    return !!c && c.alive;
  }

  if ("playerControlled" in p) {
    const c = characterOf(world, roles[p.playerControlled.role]);
    if (!c) return false;
    return c.playerControlled === p.playerControlled.is;
  }

  if ("recent" in p) {
    const { factKind, role, withinTurns } = p.recent;
    let subjectId: string | undefined;
    if (role !== undefined) {
      const ref = roles[role];
      if (!ref) return false;
      subjectId = ref.id;
    }
    const threshold = world.meta.turn - withinTurns;
    return world.history.recentFacts.some(
      (f) => f.kind === factKind && f.turn >= threshold && (subjectId === undefined || f.subjects.includes(subjectId!)),
    );
  }

  if ("flag" in p) {
    const found = world.meta.crises.some((c) => c.flag === p.flag.name);
    return found === p.flag.active;
  }

  if ("activeTemplate" in p) {
    const { templateId, role, exists } = p.activeTemplate;
    const roleRef = role !== undefined ? roles[role] : undefined;
    // If a role was named but is unbound, no instance's roles can be matched against it: found stays false.
    let found = false;
    if (role === undefined || roleRef) {
      for (const id of world.processes.order) {
        const inst = world.processes.byId[id]!;
        if (inst.templateId !== templateId) continue;
        if (roleRef) {
          const match = Object.values(inst.roles).some((r) => r.kind === roleRef.kind && r.id === roleRef.id);
          if (!match) continue;
        }
        found = true;
        break;
      }
    }
    return found === exists;
  }

  if ("sameEntity" in p) {
    const { a, b, is } = p.sameEntity;
    const refA = roles[a];
    const refB = roles[b];
    const same = !!refA && !!refB && refA.kind === refB.kind && refA.id === refB.id;
    return same === is;
  }

  if ("bound" in p) {
    const { role, is } = p.bound;
    return !!roles[role] === is;
  }

  if ("cmpRoles" in p) {
    const { a, pathA, b, pathB, op } = p.cmpRoles;
    const va = pathValue(world, roles[a], pathA);
    const vb = pathValue(world, roles[b], pathB);
    if (va === undefined || vb === undefined) return false;
    return cmpOp(op, va, vb);
  }

  if ("sameFamily" in p) {
    const { a, b, is } = p.sameFamily;
    const familyA = familyOf(world, roles[a]);
    const familyB = familyOf(world, roles[b]);
    const same = !!familyA && !!familyB && familyA.id === familyB.id;
    return same === is;
  }

  if ("decided" in p) {
    return ctx?.decidedOptionId === p.decided.optionId;
  }

  if ("fn" in p) {
    const fn = registry.get(p.fn.name);
    if (!fn) throw new Error(`unknown predicate fn "${p.fn.name}"`);
    return fn(world, roles, p.fn.args ?? {});
  }

  // Exhaustive per the Predicate union; content validation guarantees only known shapes reach here.
  throw new Error(`unrecognized predicate: ${JSON.stringify(p)}`);
}

export function evaluateAll(world: World, roles: Bindings, ps: readonly Predicate[], ctx?: EvalContext): boolean {
  return ps.every((p) => evaluate(world, roles, p, ctx));
}

// Exported for role-selector `from` resolution reuse in roles.ts.
export type { EntityKind };

/** `{ fn: { name: "relationships.standing", args: { a: "holderFamily", b: "poacherFamily", op: "gte" | "lte", value } } }`:
 *  family-to-family standing (design 13), roles bound to families. Unbound roles evaluate false. */
registerPredicateFn("relationships.standing", (world, roles, args) => {
  const a = roles[String(args["a"] ?? "")];
  const b = roles[String(args["b"] ?? "")];
  if (!a || !b || a.kind !== "family" || b.kind !== "family") return false;
  const value = world.standing[standingKey(a.id as FamilyId, b.id as FamilyId)] ?? 0;
  const threshold = Number(args["value"] ?? 0);
  return args["op"] === "lte" ? value <= threshold : value >= threshold;
});

