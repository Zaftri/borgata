// The event engine's contracts (design 04). One engine runs events, schemes, operations, chains, disputes,
// careers and regional processes from data templates. Types here are binding for content (design 06) and for
// the scheduler; the evaluator (predicates.ts, roles.ts, effects.ts) and the scheduler (scheduler.ts) implement them.

import type { ProcessInstanceId, TemplateId } from "@borgata/shared";
import type { FactKind } from "../facts.js";
import type { CharStatus, CrisisFlagName, Rank } from "../world.js";

export type Lane = "state" | "commission" | "families" | "civil" | "world" | "people";
/** Fixed lane order (design 04 §4). */
export const LANE_ORDER: readonly Lane[] = ["state", "commission", "families", "civil", "world", "people"];

export type ProcessKind = "event" | "scheme" | "operation" | "chain" | "dispute" | "career" | "regional";
export type Scope = "town" | "family" | "district" | "province" | "island";
export type ProcessVisibility = "none" | "sign" | "known";

export type EntityKind = "character" | "family" | "crew" | "town" | "block" | "business";
export type EntityRef = { kind: EntityKind; id: string };

// ---------------------------------------------------------------------------------------------------------------
// Predicates: a small JSON expression language evaluated against the world and the bound roles (design 04 §1).
// `role` names a bound role; `path` is a dotted path on the bound entity (e.g. "loyalty", "attention").
// ---------------------------------------------------------------------------------------------------------------
export type CmpOp = "lt" | "lte" | "gt" | "gte" | "eq" | "ne";
export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate }
  | { cmp: { role: string; path: string; op: CmpOp; value: number } }
  | { band: { role: string; gte?: number; lte?: number } }            // role is a family (or a character's family)
  | { heat: { role: string; gte?: number; lte?: number } }            // role is a town (or an entity in a town)
  | { has: { role: string; trait?: string; tool?: string; memoryTag?: string } }
  | { status: { role: string; is: CharStatus | CharStatus[] } }
  | { rank: { role: string; in: Rank[] } }
  | { alive: { role: string } }
  | { playerControlled: { role: string; is: boolean } }
  | { recent: { factKind: FactKind; role?: string; withinTurns: number } } // a fact of this kind involving the role happened recently (from history.recentFacts)
  | { flag: { name: CrisisFlagName; active: boolean } }
  | { activeTemplate: { templateId: string; role?: string; exists: boolean } } // an active instance of this template (optionally bound to the role) exists
  | { sameEntity: { a: string; b: string; is: boolean } } // two bound roles refer to the same entity (kind and id); false if either is unbound (design 04 phase 4 migration, extension 1)
  | { bound: { role: string; is: boolean } } // whether an (optional) role got bound at all (extension 6)
  | { cmpRoles: { a: string; pathA: string; b: string; pathB: string; op: CmpOp } } // compare two bound entities' numeric paths (disputes wave)
  | { sameFamily: { a: string; b: string; is: boolean } } // two bound roles resolve to the same family, directly or via character/crew/town (disputes wave)
  | { decided: { optionId: string } } // the option chosen for the resolving instance's decision, if any (disputes wave; see engine/scheduler.ts resolveInstanceNow and engine/predicates.ts's EvalContext)
  | { fn: { name: string; args?: Record<string, number | string | boolean> } }; // registered in code (engine/predicates.ts registry)

// ---------------------------------------------------------------------------------------------------------------
// Role selectors: how the engine binds entities to role names (design 04 §1).
// ---------------------------------------------------------------------------------------------------------------
export type PickRule = "first" | "random" | `highest:${string}` | `lowest:${string}`;
/** Relations a role (or the `each` effect, engine/effects.ts) may use to restrict candidates to those related
 * to an already-bound role. `blockOf`, `chiefOf` and `membersOf` (and `crewOf` accepting a business anchor)
 * are the phase-4 migration's extensions (docs/NOW.md next tasks item 1). */
export type FromRelation =
  | "inTown"
  | "inCrew"
  | "inFamily"
  | "superiorOf"
  | "subordinatesOf"
  | "businessesOf"
  | "townOf"
  | "familyOf"
  | "crewOf"
  | "blockOf" // business -> its block; character -> the first block of its crew
  | "chiefOf" // crew, block or business -> the chief character
  | "membersOf" // crew -> its members, excluding the chief
  | "claimHolderOf" // business or associate character -> the character holding the claim on it (disputes wave, via reducers/claims.ts claimOnSubject)
  | "ownerOf" // business -> its civilian owner character (Business.ownerId); unbound when null (docs/event-storming-2026-09-25.md §3 hotspot 1)
  | "warWithOf" // family -> the family it is currently at war with (Family.warWith), unbound when null (design 13 §3, war.ts)
  | "districtHeadOf" // family -> the district head family of its district (design 13 §3, disputes-to-the-district wave; District.districtHeadFamilyId via Family.districtId), unbound when the family has no district or the district has no head
  | "headOf"; // family -> its head character (design 13 §3; Family.headId), unbound when null
export type RoleSelector = {
  entity: EntityKind;
  /** Predicates evaluated with the candidate bound as role "$candidate" plus all roles bound so far. */
  where?: Predicate[];
  /** Restrict candidates to those related to an already-bound role: e.g. { role: "town", relation: "inTown" }. */
  from?: { role: string; relation: FromRelation };
  pick: PickRule;
  /** Required by default; an optional role may stay unbound and effects referring to it are skipped. */
  optional?: boolean;
};

// ---------------------------------------------------------------------------------------------------------------
// Effects: Fact constructors with role references (design 04 §1). A string value beginning with "$" is a reference
// resolved by effects.ts: "$role" -> entity id; "$role.account" -> personal or treasury account; "$role.family";
// "$role.town"; "$role.crew"; "$role.superior"; "$role.claim" -> the claim id on a business or associate role
// (disputes wave, via reducers/claims.ts claimOnSubject); "$turn"; "$instance"; "$template"; "$chainRef" (causeChainId).
// Numbers may be given as { "$expr": { "role": "target", "path": "exposure", "mul": 1, "add": 0 } } for simple scaling.
// ---------------------------------------------------------------------------------------------------------------
export type RefValue =
  | string
  | number
  | boolean
  | null
  | { $expr: { role: string; path: string; mul?: number; add?: number; min?: number; max?: number } }
  | { $turnPlus: number } // resolves to ctx.turn + n (integer); extension 3 of the phase-4 migration
  | RefValue[]
  | { [k: string]: RefValue };
export type Effect =
  | { fact: FactKind; [field: string]: RefValue }
  | { schedule: { templateId: string; delay: number | { min: number; max: number }; probability?: number; bind?: Record<string, string>; priority?: number } }
  | { cancel: { templateId: string; boundTo?: string; reason: string } }
  | { crisis: { flag: CrisisFlagName; ttl: number; active: boolean } }
  | { request: { text: string } } // push a player-facing note into the request queue (design 07); budgeted
  | {
      // Expands to `effects` once per candidate related to `from` by `relation`, bound under `as`, in the
      // relation's deterministic order (extension 4 of the phase-4 migration; see engine/roles.ts eachCandidates
      // and engine/scheduler.ts's recursive `applyEffects` "each" case).
      each: { from: string; relation: FromRelation; as: string; where?: Predicate[]; effects: Effect[] };
    };

export type ReportSpec = {
  /** Text templates with role placeholders `{role.name}`; per channel (design 04 §6, L5). */
  newspaper?: string;
  lawyer?: string;
  sponsor?: string;
  sign?: string;
  visibility: ProcessVisibility;
};

export type Outcome = {
  id: string;
  /** Weighted draw among outcomes whose `when` holds; default weight 1. */
  weight?: number;
  when?: Predicate[];
  effects: Effect[];
  report?: ReportSpec;
};

/** `hint` is the cost in words, written from what the player knows (first-ranks §6). */
export type DecisionOption = { id: string; label: string; hint?: string; when?: Predicate[]; effects: Effect[] };
export type DecisionSpec = {
  /** Who decides: the player when the deciding role is player-controlled, else the AI picks `aiDefault`. A
   * priority list (design 04 hotspot 5, 2026-09-25: "when the player is the party, the player decides") routes
   * the decision to the first role bound to a player-controlled character, else the last role in the list (the
   * NPC default) -- resolved by engine/scheduler.ts's `resolveDeciderRoleName`, mirrored by view.ts and the
   * harness. A single string is the original, single-decider form and is unaffected. */
  role: string | string[];
  prompt: string;
  options: DecisionOption[];
  aiDefault: string;
  /** Turns the instance waits for a player decision before `timeoutOption` is taken. */
  timeoutTurns: number;
  timeoutOption: string;
};

export type SpawnRule = {
  /** Relative weight in the lane's spawn pool. */
  weight: number;
  /** Which scope the spawn iterates: one candidate spawn per entity of this kind that satisfies the preconditions. */
  per: EntityKind;
  /** At most this many active instances per scope entity (default 1). */
  maxActivePerScope?: number;
  /** The template does not spawn again on the same scope entity within this many turns of its last spawn there (2026-09-25). */
  cooldownTurns?: number;
  /** Spawn on recent facts instead of entities (design 09 §7 item 4): one candidate per matching fact within
   *  `withinTurns` (default 1), binding `role` to the entity in `field` (and, if given, `role2` to `field2`). */
  spawnFrom?: { factKind: string; role: string; field: "businessId" | "characterId" | "townId" | "collectorId"; role2?: string; field2?: "businessId" | "characterId" | "townId" | "collectorId"; withinTurns?: number; match?: Record<string, string> };
};

export type FollowUp = { templateId: string; delay: number | { min: number; max: number }; probability?: number; bind?: Record<string, string>; when?: Predicate[]; priority?: number };

export type ProcessTemplate = {
  id: string;
  version: number;
  kind: ProcessKind;
  scope: Scope;
  lane: Lane;
  roles: Record<string, RoleSelector>;
  spawn?: SpawnRule;
  preconditions: Predicate[];
  /** 0 = instant. */
  duration: number | { min: number; max: number };
  /** Progress per turn in permille of completion; when it reaches 1000 the instance resolves early. */
  progressPerTurn?: number;
  decision?: DecisionSpec;
  resolve: Outcome[];
  followUps: FollowUp[];
  crisis?: { flag: CrisisFlagName; ttl: number };
  exclusiveTag?: string;
  priority?: number;
  /** Subject roles locked for the instance's life (one operation per subject per turn, design 04 §4). */
  locks?: string[];
  report?: ReportSpec;
  tags: string[];
  codexId?: string;
};

export type ProcessState = "active" | "awaitingDecision" | "resolved" | "cancelled";

export type ProcessInstance = {
  id: ProcessInstanceId;
  templateId: TemplateId;
  templateVersion: number;
  kind: ProcessKind;
  lane: Lane;
  state: ProcessState;
  roles: Record<string, EntityRef>;
  startedTurn: number;
  resolveTurn: number;              // the turn at which it resolves unless progress completes earlier
  progress: number;                 // permille
  locks: EntityRef[];
  causeChainId: string;
  parentId?: ProcessInstanceId;
  decision?: { pendingSince: number; options: string[] };
  priority: number;
  exclusiveTag?: string;
};

export type ScheduledEntry = {
  id: string;
  fireTurn: number;
  templateId: string;
  bind: Record<string, EntityRef>;
  when?: Predicate[];
  parentId?: ProcessInstanceId;
  causeChainId: string;
  priority: number;
  createdTurn: number;
};

/** Per-rank budget of new player-facing instances entering the request queue per turn (design 04 §4). */
export const REQUEST_BUDGET_BY_RANK: Record<Rank, number> = { civilian: 3, associate: 3, soldier: 3, chief: 5, underboss: 7, counselor: 7, head: 8 };

/** `fields` (design 09 §7 item 4): the fact's own id-valued fields keyed by their field name (businessId,
 *  collectorId, characterId, ...), so a `spawnFrom` rule can look one up by name instead of only knowing the
 *  flattened `subjects` list. Optional and left off entirely by any caller that only ever needs `subjects`
 *  (tests predating this addition construct a `RecentFact` without it), so it defaults to `{}` where read. */
export type RecentFact = { turn: number; kind: FactKind; subjects: string[]; fields?: Record<string, string> };
