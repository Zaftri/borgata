// The scheduler (design 04 §3, §4): spawn pass, due firings, decisions, re-validation, locks, budget,
// exclusive tags. Returns Facts; the processes and progression reducers apply them (reducers/processes.ts,
// reducers/progression.ts). Never mutates the world except through named streams (events.spawn, events.roles,
// events.outcomes, events.delay) and the id counter (world.meta.ids), the same accepted exception as family-ai.ts.

import { mintId, type ProcessInstanceId, type TemplateId } from "@borgata/shared";
import type { Cause, Fact } from "../facts.js";
import { getStream } from "../rng.js";
import type { Stream } from "../rng.js";
import type { CrisisFlagName } from "../world.js";
import { playerCharacter, type World } from "../world.js";
import type { Content } from "../content-types.js";
import { evaluateAll } from "./predicates.js";
import type { Bindings } from "./predicates.js";
import { bindRoles, buildCandidateIndex, eachCandidates, type CandidateIndex } from "./roles.js";
import { resolveEffect } from "./effects.js";
import {
  LANE_ORDER,
  REQUEST_BUDGET_BY_RANK,
  type DecisionOption,
  type EntityRef,
  type Effect,
  type FollowUp,
  type Outcome,
  type Predicate,
  type ProcessInstance,
  type ProcessTemplate,
  type RoleSelector,
} from "./types.js";

export type PlayerDecision = { instanceId: string; optionId: string };

// Reset at the start of every call; read by the harness/log later this turn (design 04 §3 step 3).
let lastCancellations: string[] = [];
export function getLastCancellations(): readonly string[] {
  return lastCancellations;
}

function lockKeyOf(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

function omitKeys(selectors: Record<string, RoleSelector>, keys: readonly string[]): Record<string, RoleSelector> {
  const out: Record<string, RoleSelector> = {};
  for (const [name, sel] of Object.entries(selectors)) {
    if (!keys.includes(name)) out[name] = sel;
  }
  return out;
}

function resolveRange(value: number | { min: number; max: number }, stream: Stream): number {
  if (typeof value === "number") return value;
  return stream.nextRange(value.min, value.max);
}

/** Weighted pick among candidates with an optional `weight` (default 1). Deterministic given the stream. */
function pickWeighted<T extends { weight?: number }>(items: readonly T[], stream: Stream): T | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0];
  const total = items.reduce((sum, it) => sum + (it.weight ?? 1), 0);
  if (total <= 0) return items[0];
  let r = stream.nextInt(total);
  for (const it of items) {
    const w = it.weight ?? 1;
    if (r < w) return it;
    r -= w;
  }
  return items[items.length - 1];
}

function scopeRoleName(template: ProcessTemplate): string {
  for (const [name, sel] of Object.entries(template.roles)) {
    if (sel.entity === template.spawn?.per) return name;
  }
  return "scope";
}

/** Which bound role decides, for a `decision.role` that may be a single role name or a priority list (design 04
 * hotspot 5, 2026-09-25: "when the player is the party, the player decides"). A single string is unchanged. A
 * list resolves to the first role in it bound to a player-controlled character, else the last role in the list
 * (the existing NPC default) -- shared by both scheduler passes below, and mirrored by view.ts's decision
 * projection and the harness so a pending decision is always attributed to the same role its options affect. */
export function resolveDeciderRoleName(world: World, role: string | string[], roles: Bindings): string {
  if (typeof role === "string") return role;
  for (const roleName of role) {
    const ref = roles[roleName];
    const c = ref?.kind === "character" ? world.characters.byId[ref.id] : undefined;
    if (c?.playerControlled) return roleName;
  }
  return role[role.length - 1]!;
}

// ---------------------------------------------------------------------------------------------------------------
// Spawn-pass prefilter (phase 5 perf task, docs/NOW.md next tasks item 3, design 04 §3 step 2 vs step 3): the
// spawn pass used to call `bindRoles` (which may draw from "events.roles" for a "random"-pick role) and then
// `evaluateAll(preconditions)` for every scope-kind entity, even when a cheap, self-contained precondition on
// the scope role alone (a business's compliance or refusalStage, a town's heat, a family's band, a character's
// rank/status/alive) already guarantees the full check will fail. Skipping such an entity before `bindRoles`
// runs is only safe when doing so cannot drop a draw the original code would have made: if any *other* role the
// template still needs to bind uses `pick: "random"`, `bindRoles` draws from "events.roles" regardless of what
// the preconditions turn out to say (design's `Stream.pick` always consumes a value, even for a single
// candidate) -- and if any precondition anywhere in the list is a `fn` predicate, `evaluateAll` may draw too
// (`state.flipRoll` does). `templateSafeForPrefilter` is therefore a static, per-template check (not per
// entity): true only when neither of those can happen, for any entity, so skipping any subset of entities before
// `bindRoles` changes nothing about the draw sequence.
// ---------------------------------------------------------------------------------------------------------------

/** True if this predicate, when evaluated, might consume a random draw (only `fn` predicates can; the DSL's
 * own operators never do). Used to decide whether a template is safe for the spawn prefilter, not to run the
 * prefilter itself (the prefilter only ever evaluates predicates that pass `SCOPE_ONLY_PREDICATE_ROLE` below,
 * which excludes `fn`, so the prefilter itself never draws). */
function predicateMayDraw(p: Predicate): boolean {
  if ("fn" in p) return true;
  if ("all" in p) return p.all.some(predicateMayDraw);
  if ("any" in p) return p.any.some(predicateMayDraw);
  if ("not" in p) return predicateMayDraw(p.not);
  return false;
}

/** The single role a "cheap" top-level precondition reads, if it is one of the quick, commonly-used checks
 * (design 04 §1: business compliance/refusalStage and other meters via `cmp`; town heat; family band; character
 * rank/status/alive) -- i.e. exactly the fields approach 1's CandidateIndex targets. Anything else (combinators,
 * two-role comparisons, `recent`, `fn`, ...) returns undefined: the prefilter simply does not use it, which is
 * always safe (a smaller sound subset of the full AND, never an unsound one). */
function scopeOnlyPredicateRole(p: Predicate): string | undefined {
  if ("cmp" in p) return p.cmp.role;
  if ("band" in p) return p.band.role;
  if ("heat" in p) return p.heat.role;
  if ("status" in p) return p.status.role;
  if ("rank" in p) return p.rank.role;
  if ("alive" in p) return p.alive.role;
  return undefined;
}

/** Per-template, not per-entity (see block comment above): whether the spawn pass may prefilter this template's
 * scope entities at all. */
function templateSafeForPrefilter(template: ProcessTemplate, scopeRole: string): boolean {
  if (template.preconditions.some(predicateMayDraw)) return false;
  for (const [roleName, selector] of Object.entries(template.roles)) {
    if (roleName === scopeRole) continue;
    if (selector.pick === "random") return false;
    if (selector.where?.some(predicateMayDraw)) return false;
  }
  return true;
}

/** The subset of `preconditions` that reference only the scope role, in list order (design's preconditions
 * array is an implicit AND, so any sound subset can be checked in isolation: if one of these fails, the full
 * `evaluateAll` over every precondition necessarily fails too, since the scope role is already correctly bound
 * at this point -- see `templateSafeForPrefilter` for why it is also safe to check them before `bindRoles`). */
function scopeOnlyPreconditions(preconditions: readonly Predicate[], scopeRole: string): Predicate[] {
  return preconditions.filter((p) => scopeOnlyPredicateRole(p) === scopeRole);
}

export function runScheduler(world: World, content: Content, decisions: readonly PlayerDecision[]): Fact[] {
  lastCancellations = [];
  const facts: Fact[] = [];
  const turn = world.meta.turn;
  const templatesById = new Map(content.templates.map((t) => [t.id, t]));
  const player = playerCharacter(world);
  const playerRank = player.rank;

  // Built once per call (approach 1, docs/NOW.md next tasks item 3): the full entity list per kind, in table
  // order, threaded through bindRoles/candidates/eachCandidates so they stop rebuilding the same arrays for
  // every unbound role of every spawn candidate.
  const candidateIndex: CandidateIndex = buildCandidateIndex(world);

  // Per-call local trackers (design's "local Set" for handled instances and this-turn locks).
  const handledIds = new Set<string>();
  const lockedThisTurn = new Set<string>();
  const spawnedTagsThisCall = new Set<string>();
  const spawnedScopeCounts = new Map<string, number>();
  let playerFacingCount = 0;

  const existingLocks = new Set<string>();
  for (const id of world.processes.order) {
    for (const ref of world.processes.byId[id]!.locks) existingLocks.add(lockKeyOf(ref));
  }

  function isLocked(ref: EntityRef): boolean {
    const key = lockKeyOf(ref);
    return existingLocks.has(key) || lockedThisTurn.has(key);
  }

  function scopeRefForTemplate(template: ProcessTemplate, roles: Bindings): EntityRef | null {
    for (const ref of Object.values(roles)) {
      if (ref.kind === template.scope) return ref;
    }
    return null;
  }

  // Built once per call (approach 3): every existing instance's `exclusiveTag|scope` key, so
  // `exclusiveTagBlocked` below no longer scans `world.processes.order` (world.processes doesn't change during
  // a runScheduler call -- facts are only applied afterward, design 01 §3) on every trySpawnTemplate attempt.
  const existingExclusiveTagKeys = new Set<string>();
  for (const id of world.processes.order) {
    const inst = world.processes.byId[id]!;
    if (!inst.exclusiveTag) continue;
    const instTemplate = templatesById.get(inst.templateId);
    const instScopeRef = instTemplate ? scopeRefForTemplate(instTemplate, inst.roles) : null;
    const instScopeKey = instScopeRef ? lockKeyOf(instScopeRef) : "global";
    existingExclusiveTagKeys.add(`${inst.exclusiveTag}|${instScopeKey}`);
  }

  function exclusiveTagBlocked(template: ProcessTemplate, roles: Bindings): boolean {
    if (!template.exclusiveTag) return false;
    const scopeRef = scopeRefForTemplate(template, roles);
    const scopeKey = scopeRef ? lockKeyOf(scopeRef) : "global";
    const tagKey = `${template.exclusiveTag}|${scopeKey}`;
    return spawnedTagsThisCall.has(tagKey) || existingExclusiveTagKeys.has(tagKey);
  }

  // Built once per call (approach 3): how many active instances of each spawn template already occupy each of
  // its own scope entities, keyed exactly like `countActiveForScope`'s old per-call linear scan produced it
  // (`${templateId}|${scopeRoleName}|${scopeEntityKey}`). Without this, the spawn pass below re-scanned
  // `world.processes.order` once per (template, scope entity) candidate -- O(templates * scopeEntities *
  // activeProcesses) -- instead of once total here.
  const activeCountByScopeKey = new Map<string, number>();
  for (const id of world.processes.order) {
    const inst = world.processes.byId[id]!;
    const instTemplate = templatesById.get(inst.templateId);
    if (!instTemplate?.spawn) continue;
    const roleName = scopeRoleName(instTemplate);
    const ref = inst.roles[roleName];
    if (!ref) continue;
    const key = `${instTemplate.id}|${roleName}|${lockKeyOf(ref)}`;
    activeCountByScopeKey.set(key, (activeCountByScopeKey.get(key) ?? 0) + 1);
  }

  function isPlayerFacing(template: ProcessTemplate, roles: Bindings): boolean {
    if (!template.report || template.report.visibility === "none") return false;
    const familyId = player.familyId;
    const crewId = player.crewId;
    const family = familyId ? world.families.byId[familyId] : undefined;
    const townIds = family ? family.townIds : [];
    for (const ref of Object.values(roles)) {
      if (ref.kind === "character" && ref.id === player.id) return true;
      if (ref.kind === "crew" && crewId && ref.id === crewId) return true;
      if (ref.kind === "family" && familyId && ref.id === familyId) return true;
      if (ref.kind === "town" && (townIds as readonly string[]).includes(ref.id)) return true;
      // A business or block on the player's family's territory involves the player as much as the town does.
      if (ref.kind === "block") {
        const block = world.geo.blocks.byId[ref.id];
        if (block && (townIds as readonly string[]).includes(block.townId)) return true;
      }
      if (ref.kind === "business") {
        const business = world.geo.businesses.byId[ref.id];
        const block = business ? world.geo.blocks.byId[business.blockId] : undefined;
        if (block && (townIds as readonly string[]).includes(block.townId)) return true;
      }
    }
    return false;
  }

  /** Push a budgeted request (design 04 §4). Returns false when deferred (budget exhausted). */
  function emitBudgetedRequest(text: string, instanceId: string | null, priority: number, cause: Cause): boolean {
    const budget = REQUEST_BUDGET_BY_RANK[playerRank];
    const reqId = mintId<string>(world.meta.ids, "req");
    if (playerFacingCount < budget) {
      facts.push({ kind: "RequestPush", request: { id: reqId, turn, text, instanceId, priority }, cause });
      playerFacingCount++;
      return true;
    }
    // The spawn did not happen, so the deferral names no instance (2026-09-23: a stale id broke engine.requestsValid).
    facts.push({ kind: "RequestDefer", request: { id: reqId, turn, text, instanceId: null, priority: priority + 1 }, cause });
    return false;
  }

  function applyEffects(effects: readonly Effect[], inst: ProcessInstance, roles: Bindings, template: ProcessTemplate, cause: Cause): void {
    // One context per effect list so `$mint:<prefix>` resolves to the same id across the list (design 09 §7 item 1):
    // a CharacterCreate followed by a MemoryAdd on "$mint:chr" must name the same man.
    const ctx = { roles, turn, instanceId: inst.id, templateId: template.id, causeChainId: inst.causeChainId, cause };
    for (const effect of effects) {
      const resolved = resolveEffect(world, effect, ctx);
      if (resolved === null) continue;
      switch (resolved.kind) {
        case "fact":
          facts.push(resolved.fact);
          break;
        case "schedule": {
          const probability = resolved.probability;
          if (!getStream(world.rng, "events.outcomes").chance(probability)) break;
          const delay = resolved.delayRange ? resolveRange(resolved.delayRange, getStream(world.rng, "events.delay")) : resolved.delay;
          const bind: Record<string, EntityRef> = {};
          for (const [newRole, curRole] of Object.entries(resolved.bind)) {
            const ref = roles[curRole];
            if (ref) bind[newRole] = ref;
          }
          // Delay 0 is an immediate follow-up (interactive turn, 2026-09-25): the template spawns in this run,
          // bound from the parent's roles, and a player decision on it is offered in the same week's modal
          // ("E adesso"). A ScheduleAdd could never do that: facts apply after the scheduler, so an entry fires
          // at the next run at the earliest. Delay n >= 1 stays an entry dated turn + n.
          if (delay <= 0) {
            const target = templatesById.get(resolved.templateId);
            if (target) {
              const remaining = omitKeys(target.roles, Object.keys(bind));
              const bound: Bindings | null =
                Object.keys(remaining).length === 0 ? bind : bindRoles(world, remaining, bind, getStream(world.rng, "events.roles"), candidateIndex);
              if (bound && evaluateAll(world, bound, target.preconditions)) trySpawnTemplate(target, bound, { parentId: inst.id, causeChainId: inst.causeChainId, reaction: true });
              else lastCancellations.push(`immediate-follow-up-skipped:${target.id}`);
            }
            break;
          }
          const schedId = mintId<string>(world.meta.ids, "sched");
          facts.push({
            kind: "ScheduleAdd",
            entry: {
              id: schedId,
              fireTurn: turn + delay,
              templateId: resolved.templateId,
              bind,
              parentId: inst.id,
              causeChainId: inst.causeChainId,
              priority: resolved.priority,
              createdTurn: turn,
            },
            cause,
          });
          break;
        }
        case "cancel": {
          const cands = world.processes.order
            .map((id) => world.processes.byId[id]!)
            .filter((i) => i.templateId === resolved.templateId && !handledIds.has(i.id));
          for (const cand of cands) {
            if (resolved.boundTo) {
              const ref = roles[resolved.boundTo];
              const candRef = cand.roles[resolved.boundTo];
              if (!ref || !candRef || candRef.kind !== ref.kind || candRef.id !== ref.id) continue;
            }
            facts.push({ kind: "ProcessCancel", instanceId: cand.id, reason: resolved.reason, cause });
            handledIds.add(cand.id);
          }
          break;
        }
        case "crisis":
          // Crisis flags contract the PLAYER's turn (design 03 §6); a war between two other families is news, not a crisis
          // for the player. Gate on player involvement (2026-09-23, found in the first browser playtest).
          if (isPlayerFacing(template, roles)) {
            facts.push({ kind: "CrisisFlagSet", flag: resolved.flag as CrisisFlagName, ttl: resolved.ttl, active: resolved.active, cause });
          }
          break;
        case "request":
          emitBudgetedRequest(resolved.text, inst.id, template.priority ?? 0, cause);
          break;
        case "each": {
          // Extension 4 (design 04 phase-4 migration): expand `effects` once per candidate related to `from`
          // by `relation`, bound under `as`, in the relation's deterministic (table) order. Recurses through
          // this same function, so a nested `each` (not currently used by any template) would also work.
          const cands = eachCandidates(world, roles, { role: resolved.from, relation: resolved.relation }, candidateIndex);
          for (const cand of cands) {
            const nextRoles: Bindings = { ...roles, [resolved.as]: cand };
            if (resolved.where.length > 0 && !evaluateAll(world, nextRoles, resolved.where)) continue;
            applyEffects(resolved.effects, inst, nextRoles, template, cause);
          }
          break;
        }
      }
    }
  }

  function maybeScheduleFollowUp(fu: FollowUp, inst: ProcessInstance, roles: Bindings, cause: Cause): void {
    // `when` (and, at fire time, `entry.when`) is evaluated in the new template's own role namespace,
    // i.e. against the bindings produced by `bind`, not the resolving instance's roles.
    const bind: Record<string, EntityRef> = {};
    for (const [newRole, curRole] of Object.entries(fu.bind ?? {})) {
      const ref = roles[curRole];
      if (ref) bind[newRole] = ref;
    }
    if (fu.when && !evaluateAll(world, bind, fu.when)) return;
    const probability = fu.probability ?? 10_000;
    if (!getStream(world.rng, "events.outcomes").chance(probability)) return;
    const delay = resolveRange(fu.delay, getStream(world.rng, "events.delay"));
    const schedId = mintId<string>(world.meta.ids, "sched");
    facts.push({
      kind: "ScheduleAdd",
      entry: {
        id: schedId,
        fireTurn: turn + delay,
        templateId: fu.templateId,
        bind,
        ...(fu.when ? { when: fu.when } : {}),
        parentId: inst.id,
        causeChainId: inst.causeChainId,
        priority: fu.priority ?? 0,
        createdTurn: turn,
      },
      cause,
    });
  }

  function resolveInstanceNow(inst: ProcessInstance, template: ProcessTemplate, decidedOptionId?: string, emitDecideFact = false): void {
    const roles = inst.roles;
    // The instance leaves the table when its ProcessResolve applies, so it must stop counting toward
    // maxActivePerScope in this run's spawn pass; otherwise a weekly template re-spawns only every other turn.
    if (template.spawn && world.processes.byId[inst.id]) {
      const roleName = scopeRoleName(template);
      const ref = roles[roleName];
      if (ref) {
        const key = `${template.id}|${roleName}|${lockKeyOf(ref)}`;
        activeCountByScopeKey.set(key, Math.max(0, (activeCountByScopeKey.get(key) ?? 0) - 1));
      }
    }
    const cause: Cause = { templateId: template.id, instanceId: inst.id, rule: `engine.resolve:${template.id}` };
    if (emitDecideFact && decidedOptionId) {
      facts.push({ kind: "ProcessDecide", instanceId: inst.id, optionId: decidedOptionId, cause });
    }
    if (decidedOptionId) {
      const option: DecisionOption | undefined = template.decision?.options.find((o) => o.id === decidedOptionId);
      if (option) applyEffects(option.effects, inst, roles, template, cause);
    }
    // `decided` (engine/predicates.ts EvalContext, disputes wave): lets an outcome's `when` see which decision
    // option was chosen, e.g. dispute.claim's heldWon/heldLost only apply after "hold".
    const evalCtx = decidedOptionId !== undefined ? { decidedOptionId } : undefined;
    const matching = template.resolve.filter((o) => evaluateAll(world, roles, o.when ?? [], evalCtx));
    const pool: readonly Outcome[] = matching.length > 0 ? matching : template.resolve;
    const chosen = pickWeighted(pool, getStream(world.rng, "events.outcomes"));
    if (chosen) {
      applyEffects(chosen.effects, inst, roles, template, cause);
      // The report names the choice and its consequence (design 09 §8): "Lean on him: he paid." Only for the
      // player's own instances; other men's outcomes stay news or nothing.
      const outcomeText = chosen.report?.sponsor ?? chosen.report?.sign ?? chosen.report?.lawyer ?? chosen.report?.newspaper;
      const withNames = (t: string): string =>
        t.replace(/\{(\w+)\.name\}/g, (_m, role: string) => {
          const ref = roles[role];
          return ref?.kind === "character" ? (world.characters.byId[ref.id]?.name ?? role) : role;
        });
      if (outcomeText && chosen.report?.visibility !== "none" && isPlayerFacing(template, roles)) {
        const option = decidedOptionId ? template.decision?.options.find((o) => o.id === decidedOptionId) : undefined;
        const text = option && template.decision!.options.length > 1 ? `${option.label}: ${withNames(outcomeText)}` : withNames(outcomeText);
        const channel = chosen.report?.sponsor ? "sponsor" : chosen.report?.sign ? "sign" : chosen.report?.lawyer ? "lawyer" : "newspaper";
        facts.push({ kind: "ReportNote", text, channel, cause });
        // The newspaper (design 07 §5) prints its own column when the outcome has one and it is not the line above.
        if (chosen.report?.newspaper && channel !== "newspaper") facts.push({ kind: "ReportNote", text: withNames(chosen.report.newspaper), channel: "newspaper", cause });
      }
      for (const fu of template.followUps ?? []) maybeScheduleFollowUp(fu, inst, roles, cause);
      facts.push({ kind: "ProcessResolve", instanceId: inst.id, outcomeId: chosen.id, cause });
    } else {
      facts.push({ kind: "ProcessResolve", instanceId: inst.id, outcomeId: "none", cause });
    }
    if (template.crisis) {
      if (isPlayerFacing(template, inst.roles)) facts.push({ kind: "CrisisFlagSet", flag: template.crisis.flag, ttl: 0, active: false, cause });
    }
    handledIds.add(inst.id);
  }

  function trySpawnTemplate(template: ProcessTemplate, roles: Bindings, opts: { parentId?: string; causeChainId?: string; reaction?: boolean }): ProcessInstance | undefined {
    if (exclusiveTagBlocked(template, roles)) return undefined;

    const lockRefs: EntityRef[] = [];
    for (const roleName of template.locks ?? []) {
      const ref = roles[roleName];
      if (ref) lockRefs.push(ref);
    }
    for (const ref of lockRefs) {
      if (isLocked(ref)) {
        lastCancellations.push(`locked:${template.id}:${lockKeyOf(ref)}`);
        return undefined;
      }
    }

    const instanceId = mintId<"ProcessInstanceId">(world.meta.ids, "proc");
    const spawnCause: Cause = { templateId: template.id, instanceId, rule: "engine.spawn" };

    if (isPlayerFacing(template, roles)) {
      // A request is a sentence, never a template id: fall back through the report channels.
      const text = template.report?.sign ?? template.report?.sponsor ?? template.report?.lawyer ?? template.report?.newspaper ?? template.decision?.prompt ?? template.id;
      // The budget (design 04 §4) is a cap on the player's own decisions per turn, not on news. Since 2026-09-25
      // district cards and war weeks spawn on the player's town every turn; counting them starved the weekly
      // cards (story 1 fell to 7 weeks in 30 with two decisions). News is pushed outside the budget.
      const deciderRole = template.decision ? resolveDeciderRoleName(world, template.decision.role, roles) : null;
      const deciderRef = deciderRole ? roles[deciderRole] : undefined;
      const playerDecides = deciderRef?.kind === "character" && !!world.characters.byId[deciderRef.id]?.playerControlled;
      if (template.spawn?.spawnFrom || opts.reaction || !playerDecides) {
        // A reaction to a concrete recent event (the player's own ask, a missed collection, an arrest below the
        // player), an immediate follow-up of the player's own choice, or news: never deferred, never counted.
        facts.push({ kind: "RequestPush", request: { id: mintId<string>(world.meta.ids, "req"), turn, text, instanceId, priority: template.priority ?? 0 }, cause: spawnCause });
      } else {
        const ok = emitBudgetedRequest(text, instanceId, template.priority ?? 0, spawnCause);
        if (!ok) return undefined; // over budget: deferred, do not spawn
      }
    }

    const causeChainId = opts.causeChainId ?? `chain-${instanceId}`;
    const resolveTurn = turn + resolveRange(template.duration, getStream(world.rng, "events.delay"));
    const instance: ProcessInstance = {
      id: instanceId,
      templateId: template.id as TemplateId,
      templateVersion: template.version,
      kind: template.kind,
      lane: template.lane,
      state: "active",
      roles,
      startedTurn: turn,
      resolveTurn,
      progress: 0,
      locks: lockRefs,
      causeChainId,
      priority: template.priority ?? 0,
      ...(opts.parentId ? { parentId: opts.parentId as ProcessInstanceId } : {}),
      ...(template.exclusiveTag ? { exclusiveTag: template.exclusiveTag } : {}),
    };
    facts.push({ kind: "ProcessSpawn", instance, cause: spawnCause });
    for (const ref of lockRefs) lockedThisTurn.add(lockKeyOf(ref));
    if (template.exclusiveTag) {
      const scopeRef = scopeRefForTemplate(template, roles);
      spawnedTagsThisCall.add(`${template.exclusiveTag}|${scopeRef ? lockKeyOf(scopeRef) : "global"}`);
    }
    if (template.crisis) {
      if (isPlayerFacing(template, roles)) facts.push({ kind: "CrisisFlagSet", flag: template.crisis.flag, ttl: template.crisis.ttl, active: true, cause: spawnCause });
    }
    if (resolveTurn <= turn) {
      // A duration-0 decision for the player is offered in the same run it spawns (design 09 §4: the associate's
      // situations are weekly, so spawn, offer and decide must fit in two consecutive turns, not three).
      const deciderRoleName = template.decision ? resolveDeciderRoleName(world, template.decision.role, roles) : undefined;
      const deciderRef = deciderRoleName ? roles[deciderRoleName] : undefined;
      const decider = deciderRef?.kind === "character" ? world.characters.byId[deciderRef.id] : undefined;
      const validOptions = template.decision && decider?.playerControlled ? template.decision.options.filter((o) => evaluateAll(world, roles, o.when ?? [])) : [];
      if (validOptions.length > 0) {
        facts.push({
          kind: "ProcessAwaitDecision",
          instanceId: instance.id,
          options: validOptions.map((o) => o.id),
          cause: { templateId: template.id, instanceId: instance.id, rule: "engine.awaitDecision" },
        });
        handledIds.add(instance.id);
      } else {
        // An AI-held decision resolves by its default, as the due-firings pass does (found by the soldier task).
        resolveInstanceNow(instance, template, template.decision ? template.decision.aiDefault : undefined, false);
      }
    }
    return instance;
  }

  /** `spawn.cooldownTurns`: the template spawned on this scope entity within the window (ProcessSpawn in the recent facts). */
  function onCooldown(template: ProcessTemplate, ref: EntityRef): boolean {
    const cd = template.spawn?.cooldownTurns;
    if (!cd) return false;
    const threshold = turn - cd;
    for (const rf of world.history.recentFacts) {
      if (rf.kind !== "ProcessSpawn" || rf.turn < threshold || rf.fields?.["templateId"] !== template.id) continue;
      if (rf.subjects.includes(ref.id)) return true;
    }
    return false;
  }

  function countActiveForScope(template: ProcessTemplate, roleName: string, ref: EntityRef): number {
    const key = `${template.id}|${roleName}|${lockKeyOf(ref)}`;
    return (activeCountByScopeKey.get(key) ?? 0) + (spawnedScopeCounts.get(key) ?? 0);
  }

  for (const lane of LANE_ORDER) {
    // (a) decisions.
    for (const id of world.processes.order) {
      if (handledIds.has(id)) continue;
      const inst = world.processes.byId[id]!;
      if (inst.lane !== lane || inst.state !== "awaitingDecision" || !inst.decision) continue;
      const template = templatesById.get(inst.templateId);
      if (!template?.decision) continue;
      const match = decisions.find((d) => d.instanceId === id && inst.decision!.options.includes(d.optionId));
      if (match) {
        resolveInstanceNow(inst, template, match.optionId, true);
      } else if (turn - inst.decision.pendingSince >= template.decision.timeoutTurns) {
        resolveInstanceNow(inst, template, template.decision.timeoutOption, true);
      }
    }

    // (b) due firings: priority desc, startedTurn asc, id asc.
    const dueList = world.processes.order
      .filter((id) => !handledIds.has(id))
      .map((id) => world.processes.byId[id]!)
      .filter((inst) => inst.lane === lane && inst.state === "active")
      .sort((a, b) => b.priority - a.priority || a.startedTurn - b.startedTurn || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const inst of dueList) {
      if (handledIds.has(inst.id)) continue; // may have been cancelled by an earlier instance's effect this pass
      const template = templatesById.get(inst.templateId);
      if (!template) continue;
      const due = turn >= inst.resolveTurn || inst.progress >= 1000;
      if (due) {
        if (template.decision && !inst.decision) {
          const deciderRoleName = resolveDeciderRoleName(world, template.decision.role, inst.roles);
          const deciderRef = inst.roles[deciderRoleName];
          const deciderChar = deciderRef && deciderRef.kind === "character" ? world.characters.byId[deciderRef.id] : undefined;
          if (deciderChar?.playerControlled) {
            const validOptions = template.decision.options.filter((o) => evaluateAll(world, inst.roles, o.when ?? []));
            if (validOptions.length === 0) {
              // Nothing to offer: fall back to the AI default rather than deadlock the instance.
              resolveInstanceNow(inst, template, template.decision.aiDefault, false);
            } else {
              facts.push({
                kind: "ProcessAwaitDecision",
                instanceId: inst.id,
                options: validOptions.map((o) => o.id),
                cause: { templateId: template.id, instanceId: inst.id, rule: "engine.awaitDecision" },
              });
              handledIds.add(inst.id);
            }
          } else {
            resolveInstanceNow(inst, template, template.decision.aiDefault, false);
          }
        } else {
          resolveInstanceNow(inst, template, inst.decision?.options[0], false);
        }
      } else if (template.progressPerTurn) {
        const newProgress = Math.min(1000, inst.progress + template.progressPerTurn);
        facts.push({
          kind: "ProcessProgress",
          instanceId: inst.id,
          progress: newProgress,
          cause: { templateId: template.id, instanceId: inst.id, rule: "engine.progress" },
        });
      }
    }

    // (c) scheduled entries, in schedule order (already sorted by the processes reducer on insert).
    for (const entry of world.schedule) {
      if (entry.fireTurn > turn) continue;
      const template = templatesById.get(entry.templateId);
      if (!template) {
        // Content without the target template (a test slice, or a removed template after a content upgrade):
        // drop the entry once, in the first lane, instead of leaving it stale for engine.scheduleValid.
        if (lane === LANE_ORDER[0]) facts.push({ kind: "ScheduleRemove", entryId: entry.id, reason: "unknown-template", cause: { templateId: entry.templateId, rule: "engine.schedule.drop" } });
        continue;
      }
      if (template.lane !== lane) continue;
      facts.push({ kind: "ScheduleRemove", entryId: entry.id, reason: "fired", cause: { templateId: entry.templateId, rule: "engine.schedule.fire" } });
      const prebound: Bindings = { ...entry.bind };
      const remaining = omitKeys(template.roles, Object.keys(prebound));
      const roles: Bindings | null =
        Object.keys(remaining).length === 0 ? prebound : bindRoles(world, remaining, prebound, getStream(world.rng, "events.roles"), candidateIndex);
      if (!roles) {
        lastCancellations.push(`role-bind-failed:${template.id}`);
        continue;
      }
      const ok = evaluateAll(world, roles, entry.when ?? []) && evaluateAll(world, roles, template.preconditions);
      if (!ok) {
        lastCancellations.push(`precondition-failed:${template.id}`);
        continue;
      }
      trySpawnTemplate(template, roles, { ...(entry.parentId ? { parentId: entry.parentId } : {}), causeChainId: entry.causeChainId });
    }

    // (d) spawn pass.
    for (const template of content.templates) {
      if (template.lane !== lane || !template.spawn) continue;
      const spawnRule = template.spawn;
      const roleName = scopeRoleName(template);

      // Design 09 §7 item 4: bind from recent facts instead of iterating every entity of `spawn.per`. One
      // candidate spawn per matching fact within `withinTurns` (default 1, i.e. the previous turn -- the fact
      // is recorded into `world.history.recentFacts` at the end of the turn it happened, design 01 §3 step 7,
      // so it is never visible to this same turn's spawn pass). `role` (and `role2`, if given) are prebound
      // straight from the fact's `fields` map (engine/types.ts RecentFact, step.ts recordRecentFacts) using the
      // entity kind the template itself declares for that role -- the same contract `spawn.per` gives the
      // ordinary per-entity path below. maxActivePerScope and the weight draw apply exactly as that path does,
      // from the same "events.spawn" stream, so a template using `spawnFrom` still costs one draw per candidate.
      if (spawnRule.spawnFrom) {
        const sf = spawnRule.spawnFrom;
        const withinTurns = sf.withinTurns ?? 1;
        const threshold = turn - withinTurns;
        const entity1 = template.roles[sf.role]?.entity;
        const entity2 = sf.role2 ? template.roles[sf.role2]?.entity : undefined;
        for (const rf of world.history.recentFacts) {
          if (rf.kind !== sf.factKind || rf.turn < threshold) continue;
          if (sf.match && Object.entries(sf.match).some(([k, v]) => rf.fields?.[k] !== v)) continue; // e.g. PermissionAsked.what
          const id1 = rf.fields?.[sf.field];
          if (!id1 || !entity1) continue;
          const prebound: Bindings = { [sf.role]: { kind: entity1, id: id1 } };
          if (sf.role2) {
            if (!sf.field2 || !entity2) continue;
            const id2 = rf.fields?.[sf.field2];
            if (!id2) continue;
            prebound[sf.role2] = { kind: entity2, id: id2 };
          }
          const scopeRef = prebound[roleName];
          if (!scopeRef) continue;
          if (countActiveForScope(template, roleName, scopeRef) >= (spawnRule.maxActivePerScope ?? 1)) continue;
        if (onCooldown(template, scopeRef)) continue;
          if (!getStream(world.rng, "events.spawn").chance(spawnRule.weight)) continue;
          const remaining = omitKeys(template.roles, Object.keys(prebound));
          const roles: Bindings | null =
            Object.keys(remaining).length === 0 ? prebound : bindRoles(world, remaining, prebound, getStream(world.rng, "events.roles"), candidateIndex);
          if (!roles) continue;
          if (!evaluateAll(world, roles, template.preconditions)) continue;
          const spawned = trySpawnTemplate(template, roles, {});
          if (spawned) {
            const key = `${template.id}|${roleName}|${lockKeyOf(scopeRef)}`;
            spawnedScopeCounts.set(key, (spawnedScopeCounts.get(key) ?? 0) + 1);
          }
        }
        continue;
      }

      // Approach 2 (docs/NOW.md next tasks item 3): computed once per template, not per candidate -- see the
      // block comment above templateSafeForPrefilter for why this is safe. When the template isn't statically
      // safe, `prefilterPreds` stays empty and every candidate goes through the exact old path unchanged.
      const prefilterPreds = templateSafeForPrefilter(template, roleName) ? scopeOnlyPreconditions(template.preconditions, roleName) : [];
      // A player card (a top-level `playerControlled` precondition on the scope role, design 09 §4) has exactly one
      // candidate: the player. Fifty such templates scanning every character of a province cost 150 ms a turn
      // (2026-09-25); this keeps the draw sequence identical because the other candidates never passed anyway.
      const playerOnly = spawnRule.per === "character" && template.preconditions.some((p) => "playerControlled" in p && p.playerControlled.role === roleName && p.playerControlled.is === true);
      const candidates: readonly EntityRef[] = playerOnly ? [{ kind: "character", id: player.id }] : candidateIndex.byKind[spawnRule.per];
      for (const scopeRef of candidates) {
        if (countActiveForScope(template, roleName, scopeRef) >= (spawnRule.maxActivePerScope ?? 1)) continue;
        if (onCooldown(template, scopeRef)) continue;
        if (prefilterPreds.length > 0 && !evaluateAll(world, { [roleName]: scopeRef }, prefilterPreds)) continue;
        // The spawn draw comes BEFORE role binding (2026-09-23, phase 5 perf): binding a poacher across every
        // character for every business every turn cost 45 ms per turn on a generated province. Preconditions are
        // deterministic in the world state, so P(spawn) is unchanged; only the stream sequence differs (golden re-frozen).
        if (!getStream(world.rng, "events.spawn").chance(spawnRule.weight)) continue;
        const prebound: Bindings = { [roleName]: scopeRef };
        const remaining = omitKeys(template.roles, [roleName]);
        const roles: Bindings | null =
          Object.keys(remaining).length === 0 ? prebound : bindRoles(world, remaining, prebound, getStream(world.rng, "events.roles"), candidateIndex);
        if (!roles) continue;
        if (!evaluateAll(world, roles, template.preconditions)) continue;
        const spawned = trySpawnTemplate(template, roles, {});
        if (spawned) {
          const key = `${template.id}|${roleName}|${lockKeyOf(scopeRef)}`;
          spawnedScopeCounts.set(key, (spawnedScopeCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  return facts;
}
