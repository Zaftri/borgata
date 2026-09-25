// Zod schemas mirroring the event engine's binding TypeScript shapes (packages/sim/src/engine/types.ts,
// design 04 §1) plus the referential-integrity checks a schema alone cannot express (design 06 §5).
// Content is data; nothing here changes engine behaviour.

import { z } from "zod";
import type { Effect, NamePools, Predicate, ProcessTemplate, ReportSpec, RefValue, RoleSelector, TownArchetype } from "@borgata/sim";

// ---------------------------------------------------------------------------------------------------------------
// Enums (design 04 §1 literal unions).
// ---------------------------------------------------------------------------------------------------------------

const CmpOpSchema = z.enum(["lt", "lte", "gt", "gte", "eq", "ne"]);
const CharStatusSchema = z.enum(["free", "arrested", "jailed", "hiding", "shelved", "exiled", "dead"]);
const RankSchema = z.enum(["civilian", "associate", "soldier", "chief", "underboss", "counselor", "head"]);
const CrisisFlagNameSchema = z.enum([
  "war",
  "campaign",
  "trial",
  "succession",
  "magistrateArrival",
  "operationPending",
  "negotiation",
]);
const EntityKindSchema = z.enum(["character", "family", "crew", "town", "block", "business"]);
const ProcessKindSchema = z.enum(["event", "scheme", "operation", "chain", "dispute", "career", "regional"]);
const ScopeSchema = z.enum(["town", "family", "district", "province", "island"]);
const LaneSchema = z.enum(["state", "commission", "families", "civil", "world", "people"]);
const ProcessVisibilitySchema = z.enum(["none", "sign", "known"]);
const FromRelationSchema = z.enum([
  "inTown",
  "inCrew",
  "inFamily",
  "superiorOf",
  "subordinatesOf",
  "businessesOf",
  "townOf",
  "familyOf",
  "crewOf",
  "blockOf",
  "chiefOf",
  "membersOf",
  "claimHolderOf",
  "ownerOf",
  "warWithOf",
  "districtHeadOf",
  "headOf",
]);

/** `PickRule` includes template-literal variants ("highest:${string}"/"lowest:${string}"); validated by refine
 * and cast, since zod cannot narrow a regex-checked string to a template literal type at the type level. */
const PickRuleSchema = z
  .string()
  .refine(
    (v) => v === "first" || v === "random" || /^(highest|lowest):[a-zA-Z][a-zA-Z0-9_.]*$/.test(v),
    { message: 'pick must be "first", "random", "highest:<path>" or "lowest:<path>"' },
  ) as unknown as z.ZodType<RoleSelector["pick"]>;

/** `number | { min; max }`, used for durations and delays (design 04 §1). `min <= max` always, per the harness rule. */
const RangeSchema = z
  .object({ min: z.number().int(), max: z.number().int() })
  .strict()
  .refine((r) => r.min <= r.max, { message: "range min must be <= max" });
const NumberOrRangeSchema = z.union([z.number().int(), RangeSchema]);
/** Per10k probability (design 03 §1: probabilities are per 10,000). */
const Per10kSchema = z.number().int().min(0).max(10_000);

// ---------------------------------------------------------------------------------------------------------------
// RefValue (recursive): a role reference, a literal, or a scaling `$expr` (design 04 §1).
// ---------------------------------------------------------------------------------------------------------------

// Cast on assignment, not just annotated: with `exactOptionalPropertyTypes` (tsconfig), zod's own inferred
// output type for every `.optional()` field is `T | undefined` rather than the TS-exact `T | (absent)`, so no
// zod object schema with optional fields is nominally assignable to `z.ZodType<X>` for an `X` with `field?: T`.
// The runtime shape is still exactly right; only the static match against the hand-written binding type needs
// the escape hatch. Applies to every `z.ZodType<...>` cast in this file.
export const RefValueSchema: z.ZodType<RefValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(), // e.g. SuperiorSet.superiorId null (design 09 §4, the dropped scene)
    z
      .object({
        $expr: z
          .object({
            role: z.string(),
            path: z.string(),
            mul: z.number().optional(),
            add: z.number().optional(),
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .strict(),
      })
      .strict(),
    // Extension 3 (phase-4 migration): `ctx.turn + n`.
    z.object({ $turnPlus: z.number().int() }).strict(),
    z.array(RefValueSchema),
    z.record(z.string(), RefValueSchema),
  ]),
) as unknown as z.ZodType<RefValue>;

// ---------------------------------------------------------------------------------------------------------------
// Predicate (recursive): the small JSON expression language (design 04 §1), all variants of the binding union.
// ---------------------------------------------------------------------------------------------------------------

export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(PredicateSchema) }).strict(),
    z.object({ any: z.array(PredicateSchema) }).strict(),
    z.object({ not: PredicateSchema }).strict(),
    z
      .object({
        cmp: z.object({ role: z.string(), path: z.string(), op: CmpOpSchema, value: z.number().int() }).strict(),
      })
      .strict(),
    z
      .object({
        band: z.object({ role: z.string(), gte: z.number().int().optional(), lte: z.number().int().optional() }).strict(),
      })
      .strict(),
    z
      .object({
        heat: z.object({ role: z.string(), gte: z.number().int().optional(), lte: z.number().int().optional() }).strict(),
      })
      .strict(),
    z
      .object({
        has: z
          .object({
            role: z.string(),
            trait: z.string().optional(),
            tool: z.string().optional(),
            memoryTag: z.string().optional(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        status: z.object({ role: z.string(), is: z.union([CharStatusSchema, z.array(CharStatusSchema)]) }).strict(),
      })
      .strict(),
    z.object({ rank: z.object({ role: z.string(), in: z.array(RankSchema) }).strict() }).strict(),
    z.object({ alive: z.object({ role: z.string() }).strict() }).strict(),
    z.object({ playerControlled: z.object({ role: z.string(), is: z.boolean() }).strict() }).strict(),
    z
      .object({
        recent: z
          .object({ factKind: z.string(), role: z.string().optional(), withinTurns: z.number().int().positive() })
          .strict(),
      })
      .strict(),
    z.object({ flag: z.object({ name: CrisisFlagNameSchema, active: z.boolean() }).strict() }).strict(),
    z
      .object({
        activeTemplate: z.object({ templateId: z.string(), role: z.string().optional(), exists: z.boolean() }).strict(),
      })
      .strict(),
    // Extension 1 (phase-4 migration): two bound roles refer to the same entity.
    z.object({ sameEntity: z.object({ a: z.string(), b: z.string(), is: z.boolean() }).strict() }).strict(),
    // Extension 6 (phase-4 migration): whether an (optional) role got bound at all.
    z.object({ bound: z.object({ role: z.string(), is: z.boolean() }).strict() }).strict(),
    // Disputes wave: compare two bound entities' numeric paths.
    z
      .object({
        cmpRoles: z
          .object({ a: z.string(), pathA: z.string(), b: z.string(), pathB: z.string(), op: CmpOpSchema })
          .strict(),
      })
      .strict(),
    // Disputes wave: two bound roles resolve to the same family.
    z.object({ sameFamily: z.object({ a: z.string(), b: z.string(), is: z.boolean() }).strict() }).strict(),
    // Disputes wave: the option chosen for the resolving instance's decision, if any.
    z.object({ decided: z.object({ optionId: z.string() }).strict() }).strict(),
    z
      .object({
        fn: z
          .object({ name: z.string(), args: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional() })
          .strict(),
      })
      .strict(),
  ]),
) as unknown as z.ZodType<Predicate>;

// ---------------------------------------------------------------------------------------------------------------
// RoleSelector (design 04 §1): how the engine binds entities to role names.
// ---------------------------------------------------------------------------------------------------------------

// Not annotated `z.ZodType<RoleSelector>`: `exactOptionalPropertyTypes` friction (see note above RefValueSchema).
export const RoleSelectorSchema = z
  .object({
    entity: EntityKindSchema,
    where: z.array(PredicateSchema).optional(),
    from: z.object({ role: z.string(), relation: FromRelationSchema }).strict().optional(),
    pick: PickRuleSchema,
    optional: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------------------------
// Effect: Fact constructors with role references, plus schedule/cancel/crisis/request (design 04 §1).
// The `fact` field is a plain string (not the FactKind literal union): membership in the real fact catalogue is
// a referential-integrity check (validateTemplates), not a static schema constraint, per design 06 §5 item 2.
// ---------------------------------------------------------------------------------------------------------------

const FactEffectSchema = z.object({ fact: z.string() }).catchall(RefValueSchema);

const ScheduleEffectSchema = z
  .object({
    schedule: z
      .object({
        templateId: z.string(),
        delay: NumberOrRangeSchema,
        probability: Per10kSchema.optional(),
        bind: z.record(z.string(), z.string()).optional(),
        priority: z.number().int().optional(),
      })
      .strict(),
  })
  .strict();

const CancelEffectSchema = z
  .object({
    cancel: z.object({ templateId: z.string(), boundTo: z.string().optional(), reason: z.string() }).strict(),
  })
  .strict();

const CrisisEffectSchema = z
  .object({
    crisis: z.object({ flag: CrisisFlagNameSchema, ttl: z.number().int(), active: z.boolean() }).strict(),
  })
  .strict();

const RequestEffectSchema = z.object({ request: z.object({ text: z.string() }).strict() }).strict();

/** Not annotated `z.ZodType<Effect>`: the fact effect's `fact` field is intentionally looser (`string`, see
 * above) than the binding `FactKind` union, so the two are not mutually assignable at the type level.
 * `z.lazy` because `each.effects` is itself an array of `EffectSchema` (extension 4, phase-4 migration): the
 * schema became self-recursive the moment `each` was added, same pattern as `RefValueSchema`/`PredicateSchema`. */
export const EffectSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    FactEffectSchema,
    ScheduleEffectSchema,
    CancelEffectSchema,
    CrisisEffectSchema,
    RequestEffectSchema,
    z
      .object({
        each: z
          .object({
            from: z.string(),
            relation: FromRelationSchema,
            as: z.string(),
            where: z.array(PredicateSchema).optional(),
            effects: z.array(EffectSchema),
          })
          .strict(),
      })
      .strict(),
  ]),
);

// ---------------------------------------------------------------------------------------------------------------
// Report, outcomes, decisions, spawn, follow-ups (design 04 §1, §6).
// ---------------------------------------------------------------------------------------------------------------

// Not annotated `z.ZodType<ReportSpec>`: `exactOptionalPropertyTypes` friction (see note above RefValueSchema).
export const ReportSpecSchema = z
  .object({
    newspaper: z.string().optional(),
    lawyer: z.string().optional(),
    sponsor: z.string().optional(),
    sign: z.string().optional(),
    visibility: ProcessVisibilitySchema,
  })
  .strict();

// Not `z.ZodType<Outcome>`: `effects` carries the looser `EffectSchema` (see above).
export const OutcomeSchema = z
  .object({
    id: z.string(),
    weight: z.number().int().positive().optional(),
    when: z.array(PredicateSchema).optional(),
    effects: z.array(EffectSchema),
    report: ReportSpecSchema.optional(),
  })
  .strict();

// Not `z.ZodType<DecisionOption>`: same reason as OutcomeSchema.
export const DecisionOptionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    hint: z.string().optional(),
    when: z.array(PredicateSchema).optional(),
    effects: z.array(EffectSchema),
  })
  .strict();

// Not `z.ZodType<DecisionSpec>`: embeds DecisionOptionSchema.
export const DecisionSpecSchema = z
  .object({
    // A priority list (design 04 hotspot 5, 2026-09-25): resolved at decision time to the first role bound to a
    // player-controlled character, else the last role in the list (engine/scheduler.ts's resolveDeciderRoleName).
    role: z.union([z.string(), z.array(z.string()).min(1)]),
    prompt: z.string(),
    options: z.array(DecisionOptionSchema),
    aiDefault: z.string(),
    timeoutTurns: z.number().int(),
    timeoutOption: z.string(),
  })
  .strict();

// Not annotated `z.ZodType<SpawnRule>`: `exactOptionalPropertyTypes` friction (see note above RefValueSchema).
export const SpawnRuleSchema = z
  .object({
    // `weight` is read straight into `stream.chance(...)` (scheduler.ts), i.e. it is a per-10,000 probability
    // despite the field's name in the comment on SpawnRule; bounded accordingly.
    weight: Per10kSchema.min(1),
    per: EntityKindSchema,
    maxActivePerScope: z.number().int().positive().optional(),
    cooldownTurns: z.number().int().positive().optional(),
    // design 09 §7: bind the scope entity from a recent fact instead of iterating every entity of the kind.
    spawnFrom: z
      .object({
        factKind: z.string(),
        role: z.string(),
        field: z.string(),
        role2: z.string().optional(),
        field2: z.string().optional(),
        withinTurns: z.number().int().positive().optional(),
        match: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// Not annotated `z.ZodType<FollowUp>`: `exactOptionalPropertyTypes` friction (see note above RefValueSchema).
export const FollowUpSchema = z
  .object({
    templateId: z.string(),
    delay: NumberOrRangeSchema,
    probability: Per10kSchema.optional(),
    bind: z.record(z.string(), z.string()).optional(),
    when: z.array(PredicateSchema).optional(),
    priority: z.number().int().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------------------------
// ProcessTemplate (design 04 §1, design 06 §2.2 naming convention "lane.domain.action").
// Not `z.ZodType<ProcessTemplate>`: transitively embeds EffectSchema (see above); cast on parse instead.
// ---------------------------------------------------------------------------------------------------------------

export const ProcessTemplateSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z]+(\.[a-zA-Z0-9]+)+$/, 'id must match "lane.domain.action" naming (e.g. "state.raid.den")'),
    version: z.number().int().positive(),
    kind: ProcessKindSchema,
    scope: ScopeSchema,
    lane: LaneSchema,
    roles: z.record(z.string(), RoleSelectorSchema),
    spawn: SpawnRuleSchema.optional(),
    preconditions: z.array(PredicateSchema),
    duration: NumberOrRangeSchema,
    progressPerTurn: z.number().int().min(1).max(1000).optional(),
    decision: DecisionSpecSchema.optional(),
    resolve: z.array(OutcomeSchema),
    followUps: z.array(FollowUpSchema),
    crisis: z.object({ flag: CrisisFlagNameSchema, ttl: z.number().int() }).strict().optional(),
    exclusiveTag: z.string().optional(),
    priority: z.number().int().optional(),
    locks: z.array(z.string()).optional(),
    report: ReportSpecSchema.optional(),
    tags: z.array(z.string()).min(1),
    codexId: z.string().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------------------------
// Referential integrity (design 06 §5): checks a schema alone cannot express, run once every template has parsed.
// ---------------------------------------------------------------------------------------------------------------

const BUILTIN_REF_TOKENS = new Set(["$turn", "$instance", "$template", "$chainRef"]);

/** True if `report` carries at least one non-empty channel text (build-plan §5b item 8(b): "no silent
 * consequences" needs a line the player, or the relevant record, actually reads -- an empty string is the same
 * as no text at all). */
function hasChannelText(report: ReportSpec | undefined): boolean {
  if (!report) return false;
  return [report.sponsor, report.sign, report.newspaper, report.lawyer].some(
    (s) => typeof s === "string" && s.trim().length > 0,
  );
}

/** True if this effect (or, recursively, one of an `each`'s nested effects) writes state a player could notice:
 * a `fact` or a `schedule`. `cancel`, `crisis` and `request` are not state changes an outcome "does" on its own
 * (crisis/request effects always ride alongside a fact in practice, and a bare `cancel` undoes something else's
 * effect rather than creating a new one) -- build-plan §5b item 8(b)'s rule 2. */
function effectChangesState(e: Effect): boolean {
  if ("fact" in e) return true;
  if ("schedule" in e) return true;
  if ("each" in e) return e.each.effects.some((ee) => effectChangesState(ee as Effect));
  return false;
}

/** Every role reference site outside of `$`-prefixed effect tokens uses the bare role name directly as a
 * `Bindings` key (predicates.ts, roles.ts, effects.ts, scheduler.ts all do `roles[name]`, no "$" stripping). */
function referentialErrorsForTemplate(
  t: ProcessTemplate,
  templateIds: ReadonlySet<string>,
  factKinds: ReadonlySet<string>,
  fnNames: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const roleNames = new Set(Object.keys(t.roles));
  // "$candidate" (roles.ts binds it during `where` evaluation) and "scope" (scheduler.ts's default scope role
  // name when no declared role matches `spawn.per`) are always allowed, per the task's referential-integrity list.
  const exemptDirect = new Set<string>([...roleNames, "$candidate", "scope"]);
  const exemptPlain = new Set<string>([...roleNames, "candidate", "scope"]);

  function checkDirectRole(role: string, where: string): void {
    if (!exemptDirect.has(role)) errors.push(`${t.id}: undeclared role "${role}" referenced in ${where}`);
  }

  function checkDollarToken(token: string, where: string): void {
    if (BUILTIN_REF_TOKENS.has(token)) return;
    if (token.startsWith("$mint:")) return; // a freshly minted id (design 09 §7 item 1)
    const body = token.slice(1);
    const dot = body.indexOf(".");
    const role = dot < 0 ? body : body.slice(0, dot);
    if (!exemptPlain.has(role)) {
      errors.push(`${t.id}: undeclared role "${role}" referenced in ${where} ("${token}")`);
    }
  }

  function walkRefValue(v: RefValue, where: string): void {
    if (typeof v === "string") {
      if (v.startsWith("$")) checkDollarToken(v, where);
      return;
    }
    if (typeof v === "number" || typeof v === "boolean") return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => walkRefValue(item, `${where}[${i}]`));
      return;
    }
    if (v && typeof v === "object") {
      if ("$expr" in v) {
        const expr = (v as { $expr: { role: string } }).$expr;
        checkDirectRole(expr.role, `${where}.$expr.role`);
        return;
      }
      for (const [k, vv] of Object.entries(v as Record<string, RefValue>)) walkRefValue(vv, `${where}.${k}`);
    }
  }

  function walkPredicate(p: Predicate, where: string): void {
    if ("all" in p) { p.all.forEach((x, i) => walkPredicate(x, `${where}.all[${i}]`)); return; }
    if ("any" in p) { p.any.forEach((x, i) => walkPredicate(x, `${where}.any[${i}]`)); return; }
    if ("not" in p) { walkPredicate(p.not, `${where}.not`); return; }
    if ("cmp" in p) { checkDirectRole(p.cmp.role, where); return; }
    if ("band" in p) { checkDirectRole(p.band.role, where); return; }
    if ("heat" in p) { checkDirectRole(p.heat.role, where); return; }
    if ("has" in p) { checkDirectRole(p.has.role, where); return; }
    if ("status" in p) { checkDirectRole(p.status.role, where); return; }
    if ("rank" in p) { checkDirectRole(p.rank.role, where); return; }
    if ("alive" in p) { checkDirectRole(p.alive.role, where); return; }
    if ("playerControlled" in p) { checkDirectRole(p.playerControlled.role, where); return; }
    if ("recent" in p) { if (p.recent.role) checkDirectRole(p.recent.role, where); return; }
    if ("flag" in p) return;
    if ("activeTemplate" in p) { if (p.activeTemplate.role) checkDirectRole(p.activeTemplate.role, where); return; }
    if ("sameEntity" in p) { checkDirectRole(p.sameEntity.a, `${where}.a`); checkDirectRole(p.sameEntity.b, `${where}.b`); return; }
    if ("bound" in p) { checkDirectRole(p.bound.role, where); return; }
    if ("cmpRoles" in p) { checkDirectRole(p.cmpRoles.a, `${where}.a`); checkDirectRole(p.cmpRoles.b, `${where}.b`); return; }
    if ("sameFamily" in p) { checkDirectRole(p.sameFamily.a, `${where}.a`); checkDirectRole(p.sameFamily.b, `${where}.b`); return; }
    if ("decided" in p) return;
    if ("fn" in p) {
      if (!fnNames.has(p.fn.name)) errors.push(`${t.id}: unknown predicate fn "${p.fn.name}" in ${where}`);
      return;
    }
  }

  function walkEffect(e: Effect, where: string): void {
    if ("fact" in e) {
      if (!factKinds.has(e.fact)) errors.push(`${t.id}: unknown fact kind "${e.fact}" in ${where}`);
      for (const [k, v] of Object.entries(e)) {
        if (k === "fact" || k === "cause") continue;
        walkRefValue(v as RefValue, `${where}.${k}`);
      }
      return;
    }
    if ("schedule" in e) {
      const s = e.schedule;
      if (!templateIds.has(s.templateId)) {
        errors.push(`${t.id}: schedule refers to unknown template "${s.templateId}" in ${where}`);
      }
      if (s.bind) {
        for (const [newRole, curRole] of Object.entries(s.bind)) checkDirectRole(curRole, `${where}.bind.${newRole}`);
      }
      return;
    }
    if ("cancel" in e) {
      const c = e.cancel;
      if (!templateIds.has(c.templateId)) {
        errors.push(`${t.id}: cancel refers to unknown template "${c.templateId}" in ${where}`);
      }
      if (c.boundTo) checkDirectRole(c.boundTo, `${where}.boundTo`);
      return;
    }
    if ("each" in e) {
      // Extension 4 (phase-4 migration): `each.as` is a role name valid only inside `where`/`effects` here, so
      // it is added to the exempt sets for the walk and removed again afterward (one template at a time; these
      // sets are per-call closures, never shared across templates).
      const each = e.each;
      checkDirectRole(each.from, `${where}.from`);
      exemptDirect.add(each.as);
      exemptPlain.add(each.as);
      each.where?.forEach((p, i) => walkPredicate(p, `${where}.where[${i}]`));
      each.effects.forEach((ee, i) => walkEffect(ee as Effect, `${where}.effects[${i}]`));
      exemptDirect.delete(each.as);
      exemptPlain.delete(each.as);
      return;
    }
    // crisis, request: no role or template references to check.
  }

  t.preconditions.forEach((p, i) => walkPredicate(p, `preconditions[${i}]`));

  for (const [roleName, sel] of Object.entries(t.roles)) {
    if (sel.from) checkDirectRole(sel.from.role, `roles.${roleName}.from.role`);
    sel.where?.forEach((p, i) => walkPredicate(p, `roles.${roleName}.where[${i}]`));
  }

  if (t.spawn) {
    const matches = Object.values(t.roles).some((sel) => sel.entity === t.spawn!.per);
    if (!matches) errors.push(`${t.id}: spawn.per "${t.spawn.per}" does not match any declared role's entity kind`);
  }

  // build-plan §5b item 8(b) rule 2: a hidden mechanism (the template's own report visibility is "none", or the
  // template is tagged "internal": an AI-only dispute branch, a state squad's internal step) may resolve silently.
  const isHiddenTemplate = t.report?.visibility === "none" || t.tags.includes("internal");

  const outcomeIds = new Set<string>();
  t.resolve.forEach((outcome, i) => {
    if (outcomeIds.has(outcome.id)) errors.push(`${t.id}: duplicate outcome id "${outcome.id}"`);
    outcomeIds.add(outcome.id);
    outcome.when?.forEach((p, j) => walkPredicate(p, `resolve[${i}].when[${j}]`));
    outcome.effects.forEach((e, j) => walkEffect(e as Effect, `resolve[${i}].effects[${j}]`));

    // Rule 2: an outcome that changes state (a fact or a schedule effect, including inside `each`) needs a
    // report line with a channel text and a visibility the player (or record) can see, unless this is a hidden
    // template. An outcome with no such effect (only, say, `cancel`/`crisis`/`request`, or nothing at all) may
    // stay silent.
    // Rule 2b (2026-09-25, found by beat coverage): an outcome gated on a player decision (`decided` in its
    // `when`) needs a report line even with no effects of its own, because the option's effects may live on the
    // option and the player must still see what their choice came to (first-ranks §8 story 2).
    const gatedOnDecision = JSON.stringify(outcome.when ?? []).includes('"decided"');
    if (!isHiddenTemplate && (gatedOnDecision || outcome.effects.some((e) => effectChangesState(e as Effect)))) {
      const reportOk = outcome.report !== undefined && outcome.report.visibility !== "none" && hasChannelText(outcome.report);
      if (!reportOk) errors.push(`${t.id}: outcome ${outcome.id} ${gatedOnDecision ? "follows a player choice" : "changes state"} without a report line`);
    }
  });

  // Rule 2c (2026-09-25, the feast card had options and no outcomes at all, so a choice showed nothing): every
  // option needs an outcome that answers it: one gated on `decided: { optionId }`, or a general outcome with a
  // report line and no `decided` guard that therefore answers every option.
  if (t.decision && !isHiddenTemplate) {
    const general = t.resolve.some((o) => !JSON.stringify(o.when ?? []).includes('"decided"') && o.report !== undefined && hasChannelText(o.report));
    for (const option of t.decision.options) {
      const answered = t.resolve.some((o) => JSON.stringify(o.when ?? []).includes(`"optionId":"${option.id}"`));
      if (!answered && !general) errors.push(`${t.id}: option ${option.id} has no outcome that answers it`);
    }
  }

  if (t.decision) {
    // A priority list (design 04 hotspot 5): every role in it must itself be a declared role.
    if (Array.isArray(t.decision.role)) {
      t.decision.role.forEach((r, i) => checkDirectRole(r, `decision.role[${i}]`));
    } else {
      checkDirectRole(t.decision.role, "decision.role");
    }
    const optionIds = new Set(t.decision.options.map((o) => o.id));
    if (!optionIds.has(t.decision.aiDefault)) {
      errors.push(`${t.id}: decision.aiDefault "${t.decision.aiDefault}" is not one of the decision's option ids`);
    }
    if (!optionIds.has(t.decision.timeoutOption)) {
      errors.push(`${t.id}: decision.timeoutOption "${t.decision.timeoutOption}" is not one of the decision's option ids`);
    }
    t.decision.options.forEach((opt, i) => {
      opt.when?.forEach((p, j) => walkPredicate(p, `decision.options[${i}].when[${j}]`));
      opt.effects.forEach((e, j) => walkEffect(e as Effect, `decision.options[${i}].effects[${j}]`));
      // Rule 1: every option's hint is the cost in words (types.ts's own doc comment on `DecisionOption.hint`);
      // an empty or missing hint is a silent consequence the player picks blind.
      if (!opt.hint || opt.hint.trim().length === 0) {
        errors.push(`${t.id}: option ${opt.id} has no hint`);
      }
    });
    // Rule 3: the request queue reads the template's own top-level report as the card's sentence (design 07);
    // a decision template with no report text there has no card to show at all.
    if (!hasChannelText(t.report)) {
      errors.push(`${t.id}: decision template has no report text`);
    }
  }

  t.followUps.forEach((fu, i) => {
    if (!templateIds.has(fu.templateId)) {
      errors.push(`${t.id}: followUps[${i}] refers to unknown template "${fu.templateId}"`);
    }
    fu.when?.forEach((p, j) => walkPredicate(p, `followUps[${i}].when[${j}]`));
    if (fu.bind) {
      for (const [newRole, curRole] of Object.entries(fu.bind)) checkDirectRole(curRole, `followUps[${i}].bind.${newRole}`);
    }
  });

  if (t.locks) t.locks.forEach((r) => checkDirectRole(r, "locks"));

  return errors;
}

/** Parse and validate raw template data (design 06 §5): schema shape, then referential integrity across the
 * whole set. `factKinds` is `Object.keys(OWNER_OF_FACT)` and `fnNames` is `predicateFnNames()` (both @borgata/sim). */
export function validateTemplates(
  templates: unknown[],
  opts: { factKinds: readonly string[]; fnNames: readonly string[] },
): { ok: true; templates: ProcessTemplate[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const parsed: ProcessTemplate[] = [];

  templates.forEach((raw, idx) => {
    const rawId =
      raw && typeof raw === "object" && "id" in raw && typeof (raw as { id: unknown }).id === "string"
        ? (raw as { id: string }).id
        : `template[${idx}]`;
    const result = ProcessTemplateSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        errors.push(`${rawId}: ${path ? `${path}: ` : ""}${issue.message}`);
      }
      return;
    }
    parsed.push(result.data as ProcessTemplate);
  });

  if (errors.length > 0) return { ok: false, errors };

  const idCounts = new Map<string, number>();
  for (const t of parsed) idCounts.set(t.id, (idCounts.get(t.id) ?? 0) + 1);
  for (const [id, count] of idCounts) {
    if (count > 1) errors.push(`${id}: duplicate template id (${count} templates share this id)`);
  }

  const templateIds = new Set(idCounts.keys());
  const factKindSet = new Set(opts.factKinds);
  const fnNameSet = new Set(opts.fnNames);

  for (const t of parsed) {
    errors.push(...referentialErrorsForTemplate(t, templateIds, factKindSet, fnNameSet));
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, templates: parsed };
}

// ---------------------------------------------------------------------------------------------------------------
// TownArchetype and NamePools (design 06 §2.4, §2.5; binding shapes packages/sim/src/content-types.ts). Phase 5
// content task: town archetypes and name pools get their own schemas and a `validateContentData` entry point,
// mirroring the `validateTemplates` pattern above (parse each item with a readable per-item error, then check
// cross-item invariants such as uniqueness).
// ---------------------------------------------------------------------------------------------------------------

/** A plain non-negative integer range with `min <= max` (population, blocks, businesses per block: not meters,
 * so no 0..1000 ceiling, per CLAUDE.md rule 4's "meters are 0..1000" applying only to compliance/fear/etc). */
const IntRangeSchema = z
  .object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
  .strict()
  .refine((r) => r.min <= r.max, { message: "range min must be <= max" });

/** A meter range (compliance, fear): bounded 0..1000 per CLAUDE.md rule 4. */
const MeterRangeSchema = z
  .object({ min: z.number().int().min(0).max(1000), max: z.number().int().min(0).max(1000) })
  .strict()
  .refine((r) => r.min <= r.max, { message: "range min must be <= max" });

/** Mirrors `BusinessType` (packages/sim/src/world.ts): the seven business types the engine knows. */
const ArchetypeBusinessTypeSchema = z.enum(["stall", "shop", "bar", "workshop", "restaurant", "site", "supermarket"]);
/** Mirrors `BusinessSize` (packages/sim/src/world.ts): 1..5. */
const ArchetypeBusinessSizeSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

const BusinessMixEntrySchema = z
  .object({
    type: ArchetypeBusinessTypeSchema,
    weight: z.number().int().positive(),
    sizes: z.array(ArchetypeBusinessSizeSchema).min(1),
  })
  .strict();

/** Not annotated `z.ZodType<TownArchetype>`: `exactOptionalPropertyTypes` friction with zod's inferred output
 * for objects containing nested `.strict()` schemas (same reason documented above `RefValueSchema`); the
 * runtime shape matches the binding type exactly and callers cast on parse, as `validateTemplates` does. */
export const TownArchetypeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    isNeighborhood: z.boolean(),
    population: IntRangeSchema,
    blocks: IntRangeSchema,
    businessesPerBlock: IntRangeSchema,
    businessMix: z.array(BusinessMixEntrySchema).min(2),
    compliance: MeterRangeSchema,
    fear: MeterRangeSchema,
    institutions: z.array(z.string().min(1)).min(1),
    nameStyle: z.enum(["town", "neighborhood", "island"]),
    playerStart: z.boolean(),
  })
  .strict();

/** A pool with a minimum count and no duplicate entries (design 05 stage 12's uniqueness rule, generalized to
 * every pool per the phase 5 task's "no duplicates" requirement). */
function namePoolField(min: number, label: string) {
  return z
    .array(z.string().min(1))
    .min(min)
    .refine((arr) => new Set(arr).size === arr.length, { message: `${label}: duplicate entries` });
}

/** Not annotated `z.ZodType<NamePools>`: same `exactOptionalPropertyTypes` friction noted above. Minimum
 * counts are the phase 5 task's requirement: 60 male given names, 40 female, 120 surnames, 40 nicknames,
 * 40 town names, 30 neighborhood names, 12 island names. */
export const NamePoolsSchema = z
  .object({
    givenMale: namePoolField(60, "givenMale"),
    givenFemale: namePoolField(40, "givenFemale"),
    surnames: namePoolField(120, "surnames"),
    nicknames: namePoolField(40, "nicknames"),
    townNames: namePoolField(40, "townNames"),
    neighborhoodNames: namePoolField(30, "neighborhoodNames"),
    islandNames: namePoolField(12, "islandNames"),
    familyNameSuffixes: namePoolField(1, "familyNameSuffixes"),
    provinceName: z.string().min(1),
    capitalName: z.string().min(1),
  })
  .strict();

/** Parse and validate the archetypes array and the name pools (design 06 §5, applied to the two content types
 * the phase 5 task adds schemas for). Mirrors `validateTemplates`: per-item schema errors first, named by id
 * (or index when the id itself is malformed), then cross-item invariants (unique archetype ids). */
export function validateContentData(
  archetypes: unknown[],
  names: unknown,
): { ok: true; archetypes: TownArchetype[]; names: NamePools } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const parsedArchetypes: TownArchetype[] = [];

  archetypes.forEach((raw, idx) => {
    const rawId =
      raw && typeof raw === "object" && "id" in raw && typeof (raw as { id: unknown }).id === "string"
        ? (raw as { id: string }).id
        : `archetype[${idx}]`;
    const result = TownArchetypeSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        errors.push(`${rawId}: ${path ? `${path}: ` : ""}${issue.message}`);
      }
      return;
    }
    parsedArchetypes.push(result.data as TownArchetype);
  });

  if (parsedArchetypes.length === archetypes.length) {
    const idCounts = new Map<string, number>();
    for (const a of parsedArchetypes) idCounts.set(a.id, (idCounts.get(a.id) ?? 0) + 1);
    for (const [id, count] of idCounts) {
      if (count > 1) errors.push(`${id}: duplicate archetype id (${count} archetypes share this id)`);
    }
  }

  const namesResult = NamePoolsSchema.safeParse(names);
  let parsedNames: NamePools | undefined;
  if (!namesResult.success) {
    for (const issue of namesResult.error.issues) {
      const path = issue.path.join(".");
      errors.push(`names: ${path ? `${path}: ` : ""}${issue.message}`);
    }
  } else {
    parsedNames = namesResult.data as NamePools;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, archetypes: parsedArchetypes, names: parsedNames! };
}
