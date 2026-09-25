// Effect resolution (design 04 §1): "$role" references and `$expr` into Facts.

import { mintId, roundHalfAway, type BusinessId, type CharacterId } from "@borgata/shared";
import type { Effect, FromRelation, Predicate, RefValue } from "./types.js";
import type { ClaimSubject, Fact, Cause } from "../facts.js";
import { OWNER_OF_FACT } from "../facts.js";
import { claimOnSubject } from "../reducers/claims.js";
import type { World } from "../world.js";
import { pathValue, resolveTownId, type Bindings } from "./predicates.js";

export type EffectContext = { roles: Bindings; turn: number; instanceId: string; templateId: string; causeChainId: string; cause: Cause };
export type ResolvedEffect =
  | { kind: "fact"; fact: Fact }
  | {
      kind: "schedule";
      templateId: string;
      delay: number;
      /** The full range, when the effect gave one; the scheduler draws its own random delay from it. */
      delayRange?: { min: number; max: number };
      probability: number;
      bind: Record<string, string>;
      priority: number;
    }
  | { kind: "cancel"; templateId: string; boundTo?: string; reason: string }
  | { kind: "crisis"; flag: string; ttl: number; active: boolean }
  | { kind: "request"; text: string }
  // Extension 4 of the phase-4 migration: the raw `each` spec, unresolved. Nothing here needs `$`-resolution
  // (`from`/`relation`/`as`/`where`/`effects` are all data, not RefValues); the scheduler expands it by binding
  // `as` to each candidate in turn and recursively resolving/applying `effects` under that extended binding.
  | { kind: "each"; from: string; relation: FromRelation; as: string; where: Predicate[]; effects: Effect[] };

/** Thrown internally whenever a RefValue names a role that is not bound (or a target with no such field). Caught
 * by resolveEffect so the whole effect is skipped, per design 04 §1 (optional roles skip the effects that use them). */
class UnboundRoleError extends Error {}

type ExprSpec = { role: string; path: string; mul?: number; add?: number; min?: number; max?: number; div?: number };

function resolveExpr(world: World, roles: Bindings, expr: ExprSpec): number {
  const ref = roles[expr.role];
  if (!ref) throw new UnboundRoleError(`role ${expr.role} not bound`);
  const raw = pathValue(world, ref, expr.path);
  if (raw === undefined) throw new UnboundRoleError(`path ${expr.path} missing on role ${expr.role}`);

  const mul = expr.mul ?? 1;
  let scaled = expr.div !== undefined ? roundHalfAway(raw * mul, expr.div) : raw * mul;
  scaled += expr.add ?? 0;
  if (expr.min !== undefined) scaled = Math.max(scaled, expr.min);
  if (expr.max !== undefined) scaled = Math.min(scaled, expr.max);
  return scaled;
}

function accountOf(world: World, ref: { kind: string; id: string }): string {
  if (ref.kind === "character") {
    const c = world.characters.byId[ref.id];
    if (!c) throw new UnboundRoleError(`unknown character ${ref.id}`);
    return c.accounts.personal;
  }
  if (ref.kind === "family") {
    const f = world.families.byId[ref.id];
    if (!f) throw new UnboundRoleError(`unknown family ${ref.id}`);
    return f.treasury;
  }
  throw new UnboundRoleError(`no account for role kind ${ref.kind}`);
}

function familyIdOf(world: World, ref: { kind: string; id: string }): string {
  if (ref.kind === "character") {
    const c = world.characters.byId[ref.id];
    if (!c?.familyId) throw new UnboundRoleError(`no family for character ${ref.id}`);
    return c.familyId;
  }
  if (ref.kind === "crew") {
    const crew = world.crews.byId[ref.id];
    if (!crew) throw new UnboundRoleError(`unknown crew ${ref.id}`);
    return crew.familyId;
  }
  if (ref.kind === "town") {
    const town = world.geo.towns.byId[ref.id];
    if (!town?.familyId) throw new UnboundRoleError(`no family for town ${ref.id}`);
    return town.familyId;
  }
  throw new UnboundRoleError(`no family for role kind ${ref.kind}`);
}

function crewIdOf(world: World, ref: { kind: string; id: string }): string {
  if (ref.kind === "character") {
    const c = world.characters.byId[ref.id];
    if (!c?.crewId) throw new UnboundRoleError(`no crew for character ${ref.id}`);
    return c.crewId;
  }
  if (ref.kind === "block") {
    const block = world.geo.blocks.byId[ref.id];
    if (!block?.crewId) throw new UnboundRoleError(`no crew for block ${ref.id}`);
    return block.crewId;
  }
  throw new UnboundRoleError(`no crew for role kind ${ref.kind}`);
}

function superiorIdOf(world: World, ref: { kind: string; id: string }): string {
  if (ref.kind === "character") {
    const c = world.characters.byId[ref.id];
    if (!c?.superiorId) throw new UnboundRoleError(`no superior for character ${ref.id}`);
    return c.superiorId;
  }
  throw new UnboundRoleError(`no superior for role kind ${ref.kind}`);
}

/** `$role.claim` (disputes wave): the claim id on a business or associate role, via reducers/claims.ts
 * claimOnSubject -- the one addition to effects.ts the task brief calls for, instead of a new relation. */
function claimIdOf(world: World, ref: { kind: string; id: string }): string {
  let subject: ClaimSubject | undefined;
  if (ref.kind === "business") subject = { kind: "business", id: ref.id as BusinessId };
  else if (ref.kind === "character") subject = { kind: "associate", id: ref.id as CharacterId };
  if (!subject) throw new UnboundRoleError(`no claim for role kind ${ref.kind}`);
  const claim = claimOnSubject(world, subject);
  if (!claim) throw new UnboundRoleError(`no claim on subject ${ref.kind}:${ref.id}`);
  return claim.id;
}

function resolveRoleRef(world: World, roles: Bindings, ctx: EffectContext, token: string): unknown {
  if (token === "$turn") return ctx.turn;
  if (token === "$instance") return ctx.instanceId;
  if (token === "$template") return ctx.templateId;
  if (token === "$chainRef") return ctx.causeChainId;
  // "$mint:chr" -> a freshly minted id (design 09 §7 item 1). The same token resolves to the same id within one effect
  // list by memoizing on ctx (so CharacterCreate and the ClaimSet that follows agree); a new effect list mints anew.
  if (token.startsWith("$mint:")) {
    const prefix = token.slice(6);
    const memo = (ctx as unknown as { minted?: Record<string, string> });
    memo.minted ??= {};
    memo.minted[prefix] ??= mintId(world.meta.ids, prefix);
    return memo.minted[prefix];
  }

  const body = token.slice(1); // drop leading "$"
  const dot = body.indexOf(".");
  const roleName = dot < 0 ? body : body.slice(0, dot);
  const suffix = dot < 0 ? "" : body.slice(dot + 1);

  const ref = roles[roleName];
  if (!ref) throw new UnboundRoleError(`role ${roleName} not bound`);

  switch (suffix) {
    case "":
      return ref.id;
    case "account":
      return accountOf(world, ref);
    case "family":
      return familyIdOf(world, ref);
    case "town": {
      const townId = resolveTownId(world, ref) ?? (ref.kind === "crew" || ref.kind === "family" ? fallbackTown(world, ref) : null);
      if (townId === null) throw new UnboundRoleError(`no town for role ${roleName}`);
      return townId;
    }
    case "crew":
      return crewIdOf(world, ref);
    case "superior":
      return superiorIdOf(world, ref);
    case "claim":
      return claimIdOf(world, ref);
    default:
      throw new Error(`unrecognized role reference suffix "${suffix}" in "${token}"`);
  }
}

/** `resolveTownId` (predicates.ts) does not cover crew/family; extend for `$role.town` on those two kinds. */
function fallbackTown(world: World, ref: { kind: string; id: string }): string | null {
  if (ref.kind === "crew") {
    const crew = world.crews.byId[ref.id];
    const blockId = crew?.blockIds[0];
    if (!blockId) return null;
    return world.geo.blocks.byId[blockId]?.townId ?? null;
  }
  if (ref.kind === "family") {
    const family = world.families.byId[ref.id];
    return family?.townIds[0] ?? null;
  }
  return null;
}

function resolveValue(world: World, roles: Bindings, ctx: EffectContext, value: RefValue): unknown {
  if (typeof value === "string") {
    return value.startsWith("$") ? resolveRoleRef(world, roles, ctx, value) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => resolveValue(world, roles, ctx, v));
  if (value && typeof value === "object") {
    if ("$expr" in value) return resolveExpr(world, roles, value.$expr as ExprSpec);
    // Extension 3 of the phase-4 migration: `ctx.turn + n`, for fields like `untilTurn` that need "N turns
    // from now" without a role to scale from (unlike `$expr`, which always reads a role's numeric path).
    if ("$turnPlus" in value) return ctx.turn + (value.$turnPlus as number);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, RefValue>)) out[k] = resolveValue(world, roles, ctx, v);
    return out;
  }
  return value;
}

function resolveCause(ctx: EffectContext, rawCause: unknown): Cause {
  const base: Cause = { ...ctx.cause, instanceId: ctx.instanceId, templateId: ctx.templateId };
  if (rawCause && typeof rawCause === "object" && !Array.isArray(rawCause)) {
    const rule = (rawCause as Record<string, unknown>).rule;
    if (typeof rule === "string") return { ...base, rule };
  }
  return base;
}

function resolveFactEffect(world: World, effect: { fact: string; [field: string]: RefValue }, ctx: EffectContext): ResolvedEffect | null {
  try {
    const out: Record<string, unknown> = { kind: effect.fact };
    let rawCause: unknown;
    for (const [key, value] of Object.entries(effect)) {
      if (key === "fact") continue;
      if (key === "cause") {
        rawCause = value;
        continue;
      }
      out[key] = resolveValue(world, ctx.roles, ctx, value);
    }
    out["cause"] = resolveCause(ctx, rawCause);

    const factKind = effect.fact;
    if (!(factKind in OWNER_OF_FACT)) throw new Error(`effect produced an unknown fact kind "${factKind}"`);
    return { kind: "fact", fact: out as unknown as Fact };
  } catch (e) {
    if (e instanceof UnboundRoleError) return null;
    throw e;
  }
}

function midpoint(delay: number | { min: number; max: number }): { delay: number; delayRange?: { min: number; max: number } } {
  if (typeof delay === "number") return { delay };
  return { delay: roundHalfAway(delay.min + delay.max, 2), delayRange: { min: delay.min, max: delay.max } };
}

/** Resolve one effect. Returns null when it refers to an unbound optional role (the effect is skipped). */
export function resolveEffect(world: World, effect: Effect, ctx: EffectContext): ResolvedEffect | null {
  if ("fact" in effect) return resolveFactEffect(world, effect as { fact: string; [field: string]: RefValue }, ctx);

  if ("schedule" in effect) {
    const s = effect.schedule;
    const { delay, delayRange } = midpoint(s.delay);
    return {
      kind: "schedule",
      templateId: s.templateId,
      delay,
      ...(delayRange ? { delayRange } : {}),
      probability: s.probability ?? 10_000,
      bind: s.bind ?? {},
      priority: s.priority ?? 0,
    };
  }

  if ("cancel" in effect) {
    const c = effect.cancel;
    return { kind: "cancel", templateId: c.templateId, reason: c.reason, ...(c.boundTo !== undefined ? { boundTo: c.boundTo } : {}) };
  }

  if ("crisis" in effect) {
    const c = effect.crisis;
    return { kind: "crisis", flag: c.flag, ttl: c.ttl, active: c.active };
  }

  if ("request" in effect) {
    return { kind: "request", text: effect.request.text };
  }

  if ("each" in effect) {
    const e = effect.each;
    return { kind: "each", from: e.from, relation: e.relation, as: e.as, where: e.where ?? [], effects: e.effects };
  }

  throw new Error(`unrecognized effect: ${JSON.stringify(effect)}`);
}
