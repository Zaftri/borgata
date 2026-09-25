// The soldier opening (design 09 §6): the loan book, making an associate, standing behind a man who gets
// arrested, and the chief's two demands. Reuses the associate-week.ts/associate-people.ts conventions (lane
// `families`, scope `town`, `spawn: { per: "character" }`, `maxActivePerScope: 1`, `duration: 0` -- the task
// brief's own correction of those two files' stale header comments: "a player decision is offered in the same
// run it spawns" is what every template body in both files actually does) but does not import either file
// (per the task brief); where this file needs a `fn` predicate one of them already registers as a side effect
// of `templates/index.ts` importing every domain file, it references that `fn` by its registry name only
// (`family.policyFlag`, `relationships.favor`, `relationships.memoryWithin`) -- a soft coupling through the
// shared registry (design 04 §1), never a JS import across template files.
//
// Seven deviations from a literal reading of the design doc and the task brief, each forced by engine surface
// this task does not own (packages/sim/src/engine/*.ts, packages/sim/src/reducers/*.ts) or discovered while
// tracing that engine surface:
//
// 1. "Decision by the chief" cannot literally be `decision.role: "chief"` for a `duration: 0` template.
//    engine/scheduler.ts's `trySpawnTemplate` resolves a `duration: 0` instance immediately in the same call it
//    spawns; when the decision role's bound character is NOT `playerControlled`, that immediate path calls
//    `resolveInstanceNow(instance, template)` with `decidedOptionId` left `undefined` -- unlike the *due-firings*
//    path (for `duration > 0` templates), which explicitly falls back to `template.decision.aiDefault` for a
//    non-player decider, the `duration: 0` path has no such fallback at all. With `decidedOptionId` undefined,
//    every `resolve[].when` that gates on `{ decided: { optionId: ... } }` evaluates false (`evaluate`,
//    engine/predicates.ts: `ctx?.decidedOptionId === p.decided.optionId`, and `ctx` is undefined here), so
//    `matching` is always empty and `resolveInstanceNow`'s own fallback (`pool = matching.length > 0 ? matching
//    : template.resolve`) draws from the FULL, ungated outcome list -- silently wrong, not merely un-authored.
//    `soldier.openBook` and `soldier.askAssociate` instead use `decision.role: "me"` (the soldier who asked,
//    always `playerControlled`) with one non-branching option, exactly `assoc.proposal`'s and `assoc.sponsor.
//    warning`'s own established pattern for "an NPC's judgment presented as a scene the player watches unfold":
//    the real favor/`intakeOpen` branching lives in `resolve[].when` via `fn` predicates, still gated by
//    `{ decided: { optionId: "ask" } }` since the sole option is always available.
// 2. `$mint:chr` and a same-turn `ClaimSet` on it cannot both work: `OWNER_ORDER` (facts.ts) applies `"claims"`
//    strictly before `"characters"`, and facts for one turn are grouped by owner and applied in one end-of-turn
//    pass (design 01 §3), not in the emission order of one effect list -- so a `ClaimSet` referencing a
//    same-turn `$mint:chr` id always rejects ("unknown associate ... is not rank associate") no matter which
//    lane or effect-list position emits it. `soldier.askAssociate`'s "granted" outcome therefore emits
//    `CharacterCreate` with `onRecordWith: null` (setting it to `$me` immediately would itself violate
//    `invariants/claims.ts`'s `associateOnRecordConsistent`, which requires a non-null `onRecordWith` to have
//    exactly one matching associate-claim the very same turn) plus a `MemoryAdd` tagging the fresh associate
//    (owner "relationships", which DOES apply after "characters" within the same turn, so the freshly-minted id
//    already exists by then), and schedules a one-turn-later follow-up, `soldier.askAssociate.claim`, that
//    re-finds the associate by that tag (`subordinatesOf` + `has memoryTag`, at fire time, once the character
//    genuinely exists in `world.characters`) and only then applies `ClaimSet`/`ShareRuleSet`.
// 3. Design 09 §6's "the chief moves 400 kL to the player" reads as a `MoneyMove` fact alongside `LoanOpen`, but
//    reducers/ledger.ts's own `LoanOpen` case already debits the lender's account and credits the borrower's by
//    `loan.principal` as part of applying that one fact -- a separate `MoneyMove` for the same amount would
//    move the capital twice. `soldier.openBook`'s granted outcomes emit only `LoanOpen`.
// 4. No predicate reads an account balance: `cmp` only reads a plain numeric path on a bound entity's own
//    object (predicates.ts `pathValue`/`numericPath`), and a character's `accounts.personal` is an account id
//    (a string), not the balance. `ledger.accountAtLeast` is a new `fn`, registered here the way associate-
//    people.ts registers `family.policyFlag` (design 04 §1's escape hatch), so `soldier.openBook` can fall back
//    to a smaller loan when the chief cannot fund the full 400, per the task brief's own fallback instruction.
// 5. No relation reads "associates on record with me" directly -- roles.ts has no reverse `onRecordWith`
//    lookup, only `claimHolderOf` (subject -> holder, the wrong direction for "which associates are mine").
//    `chief.demand.man`'s `man` role and `soldier.detained.support`'s `me`-from-`man` binding both use
//    `subordinatesOf`/`superiorOf` instead (a soldier's `superiorId` and an associate's `onRecordWith` are kept
//    in lockstep by this file's own `CharacterCreate` and by `assoc.proposal`'s `SuperiorSet`), per the task
//    brief's own suggested fallback.
// 6. A name pool gap, closed 2026-09-25 (event-storming §4, the last row of the storming table: "when a made
//    man asks for an associate, the kid he kept becomes his first man by name"): `soldier.askAssociate`'s
//    "granted, no kid" branch used to give the new associate the one literal name "Turi Lo Verde" every time
//    (design 09 §5's name generator lives in the world generator, not reachable from a template's effects, and
//    there is still no `fn` that lets an effect draw a name from a list). `NEW_ASSOCIATE_NAMES` below is a
//    ten-name pool local to this file (not `packages/content/src/names`, which this task does not own); the
//    DSL's own weighted-`resolve` mechanism (every other probabilistic branch in this codebase already uses it,
//    e.g. `assoc.favor.drive`'s pickup/killing/stopped/witnessed split) stands in for "pick one of ten
//    uniformly": ten outcomes share the exact same `when`, each minting the new character under a different
//    name, left at the default weight (1) so `resolveInstanceNow`'s weighted draw picks among them evenly.
// 7. The kid's claim already exists: this file's header, deviation 2, explains why a same-turn `CharacterCreate`
//    + `ClaimSet` cannot land together (`OWNER_ORDER` applies "claims" before "characters"). The kid is not a
//    same-turn `CharacterCreate`, though -- `generation/player.ts` gives him a claim (`subject: { kind:
//    "associate", id: kid.id }`, `holderId: player.id`) and `onRecordWith: player.id` at world generation, the
//    same convention it uses for the player's and the rival's own claims (a generation-time direct write, not a
//    fact, per this repo's "generation, not a system" exception). `reducers/claims.ts`'s `ClaimSet` case rejects
//    a fact whose subject already has a claim (`claimOnSubject(world, subject)` truthy) regardless of turn or
//    rank ordering, and `ClaimTransfer` equally rejects a transfer to the holder who already holds it
//    (`claim.holderId === fact.toHolderId`) -- so both are always a no-op-that-fails for the kid, whose claim
//    already names `me` as holder. `grantedKid`'s effects below therefore emit no claim fact at all: only
//    `RankChange` (civilian -> associate; `invariants/claims.ts`'s `associateOnRecordConsistent` never checked
//    the subject's rank, only that `onRecordWith` matches exactly one associate-claim's holder, which the kid's
//    generation-time claim already satisfies before and after this template runs) and `SuperiorSet` (a no-op:
//    `generation/player.ts` already set `superiorId: player.id`, included anyway so the effect list reads the
//    same as design 09 §6's "RankChange, SuperiorSet, ClaimSet, ShareRuleSet" -- minus the claim, per this note).
//    Once `RankChange` lands, `ai/family-ai.ts`'s `ensureChain` (already running every turn, no template wiring
//    needed) sweeps him into the sponsor's crew's protection-tax chain the same turn it next runs, exactly the
//    way `generation/player.ts`'s own comment already documents for the rival: "every associate whose
//    `onRecordWith` names a crew member" now matches the kid too, since `RankChange` is the only field that was
//    ever missing.

import { favorKey, registerPredicateFn } from "@borgata/sim";
import type { CharacterId } from "@borgata/shared";
import type { DecisionOption, Effect, Outcome, ProcessTemplate, RoleSelector } from "@borgata/sim";

// ---------------------------------------------------------------------------------------------------------------
// `fn` predicates this file adds to the registry (design 04 §1's escape hatch). `family.policyFlag`,
// `relationships.favor` and `relationships.memoryWithin` are exact copies of associate-people.ts's own
// registrations (the task brief: "helpers may be copied but do not import across template files" -- a JS
// import of that file is what this file's header rules out, not reuse of the *name* through the shared
// registry). Copied rather than relied-on-by-name because this file must not assume some *other* content file
// happens to have been imported first for its `registerPredicateFn` side effect to have run yet -- true in
// production (`templates/index.ts` imports every domain file unconditionally) but not in an isolated test or
// harness scenario that loads only `SOLDIER_TEMPLATES`, exactly as `soldier.test.ts` does. Re-registering the
// same name twice (once from each file, when both happen to load) is harmless: `registerPredicateFn` just
// overwrites the registry entry with an identical implementation.
// ---------------------------------------------------------------------------------------------------------------

/** `{ fn: { name: "ledger.accountAtLeast", args: { role: "chief", min: 400 } } }`: see this file's header,
 * deviation 4. */
registerPredicateFn("ledger.accountAtLeast", (world, roles, args) => {
  const ref = roles[String(args["role"] ?? "chief")];
  if (!ref || ref.kind !== "character") return false;
  const c = world.characters.byId[ref.id];
  if (!c) return false;
  const acct = world.ledger.accounts.byId[c.accounts.personal];
  if (!acct) return false;
  // A made man's purse plus his family's treasury: the ledger funds a loan from the treasury when the purse is
  // short (reducers/ledger.ts LoanOpen, 2026-09-24), so the grant must be judged on the same money or the card
  // says "he opens the book" while the ledger rejects the loan.
  const family = c.familyId && c.rank !== "associate" && c.rank !== "civilian" ? world.families.byId[c.familyId] : undefined;
  const treasury = family ? (world.ledger.accounts.byId[family.treasury]?.dirty ?? 0) : 0;
  return acct.dirty + treasury >= Number(args["min"] ?? 0);
});

/** Copy of associate-people.ts's `family.policyFlag`. */
registerPredicateFn("family.policyFlag", (world, roles, args) => {
  const ref = roles[String(args["role"] ?? "family")];
  if (!ref) return false;
  const family =
    ref.kind === "family"
      ? world.families.byId[ref.id]
      : ref.kind === "character"
        ? (() => {
            const c = world.characters.byId[ref.id];
            return c?.familyId ? world.families.byId[c.familyId] : undefined;
          })()
        : undefined;
  if (!family) return false;
  const flag = String(args["flag"] ?? "");
  return (family.policy as unknown as Record<string, boolean>)[flag] === true;
});

/** Copy of associate-people.ts's `relationships.favor`. */
registerPredicateFn("relationships.favor", (world, roles, args) => {
  const fromRef = roles[String(args["from"] ?? "sponsor")];
  const toRef = roles[String(args["to"] ?? "me")];
  if (!fromRef || !toRef || fromRef.kind !== "character" || toRef.kind !== "character") return false;
  const value = world.favors[favorKey(fromRef.id as CharacterId, toRef.id as CharacterId)] ?? 0;
  const threshold = Number(args["value"] ?? 0);
  return args["op"] === "gte" ? value >= threshold : value <= threshold;
});

/** Copy of associate-people.ts's `relationships.memoryWithin`. */
registerPredicateFn("relationships.memoryWithin", (world, roles, args) => {
  const ref = roles[String(args["role"] ?? "me")];
  if (!ref || ref.kind !== "character") return false;
  const c = world.characters.byId[ref.id];
  if (!c) return false;
  const tag = String(args["tag"] ?? "");
  const within = Number(args["within"] ?? 8);
  return c.memory.some((m) => m.tag === tag && m.turn >= world.meta.turn - within);
});

// ---------------------------------------------------------------------------------------------------------------
// Shared role fragments.
// ---------------------------------------------------------------------------------------------------------------

/** The soldier himself; declared first in every template's `roles` so `scheduler.ts`'s `scopeRoleName` (the
 * first role whose `entity` matches `spawn.per`) finds it, and so `spawnFrom`'s own scope-role lookup (which
 * reads the role straight out of its `prebound` map) finds a role that really is prebound from the fact. */
const ME_ROLE = { entity: "character" as const, pick: "first" as const };

/** The crew chief: after the ceremony (`assoc.proposal`'s "made" outcome, associate-people.ts) `me.superiorId`
 * is set directly to the chief, so `superiorOf` reaches him in one hop -- the task brief's own suggested
 * relation, simpler than chaining `crewOf` -> `chiefOf`. */
const CHIEF_ROLE = { entity: "character" as const, from: { role: "me", relation: "superiorOf" as const }, pick: "first" as const };

const PLAYER_FREE: ProcessTemplate["preconditions"][number] = { playerControlled: { role: "me", is: true } };
const ME_IS_SOLDIER: ProcessTemplate["preconditions"][number] = { rank: { role: "me", in: ["soldier"] } };

/** The single, always-available option every AI-judged scene in this file offers its `me` decider (this file's
 * header, deviation 1): there is nothing to choose, only to hear the answer, exactly `assoc.proposal`'s "none"/
 * `assoc.sponsor.warning`'s "none" pattern (associate-people.ts). */
function waitOption(hint: string): DecisionOption {
  return { id: "ask", label: "Aspettare la risposta (wait for the answer)", hint, effects: [] };
}

/** The kid the player kept (design 09 §5, event-storming §4's last row): a civilian `subordinatesOf` `me`
 * carrying trait `kid`, reached exactly the way `situations-a.ts`'s `assoc.kid.errand` already reaches him (that
 * file's own header, deviation 3, since there is no direct "on record with me" relation, only `subordinatesOf`,
 * because `generation/player.ts` keeps the kid's `superiorId` and `onRecordWith` in lockstep, both `player.id`).
 * Optional and further filtered `alive`/`status: "free"` (this file's task brief): a dead, detained, or already
 * -made kid should fall through to `grantedNew` exactly as if there were no kid at all, not silently deny the
 * whole request. */
const KID_ROLE: RoleSelector = {
  entity: "character",
  from: { role: "me", relation: "subordinatesOf" },
  where: [
    { has: { role: "$candidate", trait: "kid" } },
    { alive: { role: "$candidate" } },
    { status: { role: "$candidate", is: "free" } },
  ],
  pick: "first",
  optional: true,
};

/** Shared gates for `soldier.askAssociate`'s "granted" branches (both `grantedKid` and every `grantedNew*`):
 * the chief does not hold a grudge, and the family's books are open. */
const CHIEF_FAVOR_OK: ProcessTemplate["preconditions"][number] = {
  fn: { name: "relationships.favor", args: { from: "chief", to: "me", op: "gte", value: 0 } },
};
const INTAKE_OPEN: ProcessTemplate["preconditions"][number] = {
  fn: { name: "family.policyFlag", args: { role: "me", flag: "intakeOpen" } },
};

/** The kid is ready to be made (task brief): bound, 16 or older, loyalty 500 or more. `bound` first (extension 6,
 * engine/predicates.ts): `cmp` on an unbound role's path reads `pathValue(world, undefined, ...)`, which returns
 * `undefined` and so evaluates false on its own -- but a short-circuiting `all` still needs the explicit `bound`
 * check so `grantedNew*`'s `{ not: KID_READY }` reads as "no kid, or too young, or not loyal enough", not just
 * "not (age >= 16 and loyalty >= 500)" against a kid who was never bound. */
const KID_READY: ProcessTemplate["preconditions"][number] = {
  all: [
    { bound: { role: "kid", is: true } },
    { cmp: { role: "kid", path: "age", op: "gte", value: 16 } },
    { cmp: { role: "kid", path: "loyalty", op: "gte", value: 500 } },
  ],
};

// =================================================================================================================
// 1. `soldier.openBook` (design 09 §6): capital to lend, from the chief, at a point a week.
// =================================================================================================================

const OPEN_BOOK_FULL = 400;
const OPEN_BOOK_SHORT = 150;

function openBookLoanEffects(principal: number, rule: string): Effect[] {
  return [
    {
      fact: "LoanOpen",
      loan: { id: "$mint:loan", lenderId: "$chief", borrower: { kind: "character", id: "$me" }, principal, points: 1, openedTurn: "$turn", weeksLate: 0 },
      cause: { rule },
    },
    { fact: "MemoryAdd", characterId: "$me", memory: { tag: "bookOpen", weight: 100 }, cause: { rule } },
  ];
}

const openBook: ProcessTemplate = {
  id: "soldier.openBook",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "PermissionAsked", role: "me", field: "characterId", match: { what: "openBook" } },
  },
  roles: { me: ME_ROLE, chief: CHIEF_ROLE },
  preconditions: [PLAYER_FREE, ME_IS_SOLDIER, { not: { has: { role: "me", memoryTag: "bookOpen" } } }],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "You asked your chief to open the book to you.",
    options: [waitOption("Nothing to do now but wait for his word.")],
    aiDefault: "ask",
    timeoutTurns: 1,
    timeoutOption: "ask",
  },
  resolve: [
    {
      id: "grantedFull",
      when: [
        { decided: { optionId: "ask" } },
        { fn: { name: "relationships.favor", args: { from: "chief", to: "me", op: "gte", value: 0 } } },
        { fn: { name: "ledger.accountAtLeast", args: { role: "chief", min: OPEN_BOOK_FULL } } },
      ],
      effects: openBookLoanEffects(OPEN_BOOK_FULL, "soldier.openBook.grantedFull"),
      report: { sponsor: "Your chief opens the book to you: 400 lire, at a point a week.", visibility: "known" },
    },
    {
      id: "grantedShort",
      when: [
        { decided: { optionId: "ask" } },
        { fn: { name: "relationships.favor", args: { from: "chief", to: "me", op: "gte", value: 0 } } },
        { not: { fn: { name: "ledger.accountAtLeast", args: { role: "chief", min: OPEN_BOOK_FULL } } } },
        { fn: { name: "ledger.accountAtLeast", args: { role: "chief", min: OPEN_BOOK_SHORT } } },
      ],
      effects: openBookLoanEffects(OPEN_BOOK_SHORT, "soldier.openBook.grantedShort"),
      report: { sponsor: "Your chief opens the book to you, though he's shorter than he'd like: 150 lire, at a point a week.", visibility: "known" },
    },
    {
      id: "noCapital",
      when: [
        { decided: { optionId: "ask" } },
        { fn: { name: "relationships.favor", args: { from: "chief", to: "me", op: "gte", value: 0 } } },
        { not: { fn: { name: "ledger.accountAtLeast", args: { role: "chief", min: OPEN_BOOK_SHORT } } } },
      ],
      effects: [],
      report: { sponsor: "Your chief would open the book to you, but the family has no capital to spare this month. Ask again when the treasury has filled.", visibility: "known" },
    },
    {
      id: "denied",
      when: [{ decided: { optionId: "ask" } }, { not: { fn: { name: "relationships.favor", args: { from: "chief", to: "me", op: "gte", value: 0 } } } }],
      effects: [{ fact: "FavorDelta", from: "$chief", to: "$me", delta: -10, cause: { rule: "soldier.openBook.denied" } }],
      report: { sponsor: "Your chief tells you no book, not while he's still owed.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "A soldier at your table wants to open a book." },
  tags: ["soldier", "loanBook", "decision"],
  codexId: "soldier-opening",
};

// =================================================================================================================
// 2. `soldier.askAssociate` (design 09 §6) and its schedule-only follow-up `soldier.askAssociate.claim` (this
// file's header, deviation 2): the claim and share rule land one turn after the character does.
// =================================================================================================================

/** Ten period Sicilian names (this file's header, deviation 6): the `grantedNew*` pool, local to this file, not
 * `packages/content/src/names` (this task's brief: files this task owns only). */
const NEW_ASSOCIATE_NAMES: readonly string[] = [
  "Ninu Randazzo",
  "Pippo Cannizzaro",
  "Saro Bonfiglio",
  "Cola Sciacca",
  "Peppe Farruggia",
  "Vanni Fera",
  "Rocco Sfameni",
  "Michele Trapani",
  "Nunzio Cusumano",
  "Gaspare Vitale",
];

/** One `grantedNew*` outcome, minting a fresh associate under `name` (this file's header, deviation 6). Identical
 * `when`/effects shape across the whole pool except the name, so a uniform default weight (1 apiece, left unset)
 * gives an even draw among the ten. */
function grantedNewOutcome(name: string, index: number): Outcome {
  const rule = "soldier.askAssociate.grantedNew";
  return {
    id: `grantedNew${index + 1}`,
    when: [{ decided: { optionId: "ask" } }, CHIEF_FAVOR_OK, INTAKE_OPEN, { not: KID_READY }],
    effects: [
      {
        fact: "CharacterCreate",
        id: "$mint:chr",
        name,
        rank: "associate",
        age: 19,
        familyId: "$me.family",
        superiorId: "$me",
        crewId: null,
        // Not "$me": `invariants/claims.ts`'s `associateOnRecordConsistent` requires a character with a
        // non-null `onRecordWith` to have exactly one matching associate-claim naming that holder, and this
        // file's header (deviation 2) already explains why the claim cannot land until a turn later than the
        // character does. Leaving `onRecordWith` null until `soldier.askAssociate.claim`'s `ClaimSet` sets it
        // (a side effect reducers/claims.ts's own `ClaimSet` case performs) keeps every turn's world state
        // valid in between, at the cost of the new man reading as "not yet on record" for that one turn.
        onRecordWith: null,
        traits: [],
        cause: { rule },
      },
      { fact: "MemoryAdd", characterId: "$mint:chr", memory: { tag: "freshAssociate", weight: 1 }, cause: { rule } },
      { schedule: { templateId: "soldier.askAssociate.claim", delay: 1, bind: { me: "me" } } },
    ],
    report: { sponsor: "Your chief lets you bring a man onto your own book.", visibility: "known" },
  };
}

const askAssociate: ProcessTemplate = {
  id: "soldier.askAssociate",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "PermissionAsked", role: "me", field: "characterId", match: { what: "makeAssociate" } },
  },
  roles: { me: ME_ROLE, chief: CHIEF_ROLE, kid: KID_ROLE },
  preconditions: [PLAYER_FREE, ME_IS_SOLDIER],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "You asked your chief to let you bring a man onto your own book.",
    options: [waitOption("Nothing to do now but wait for his word.")],
    aiDefault: "ask",
    timeoutTurns: 1,
    timeoutOption: "ask",
  },
  resolve: [
    {
      id: "grantedKid",
      when: [{ decided: { optionId: "ask" } }, CHIEF_FAVOR_OK, INTAKE_OPEN, KID_READY],
      effects: [
        { fact: "RankChange", characterId: "$kid", rank: "associate", cause: { rule: "soldier.askAssociate.grantedKid" } },
        // A no-op (this file's header, deviation 7): generation already set his superiorId to the player.
        // Kept anyway so the effect list reads like design 09 §6's "RankChange, SuperiorSet, ..., ShareRuleSet".
        { fact: "SuperiorSet", characterId: "$kid", superiorId: "$me", cause: { rule: "soldier.askAssociate.grantedKid" } },
        // No ClaimSet/ClaimTransfer here -- see this file's header, deviation 7: the kid's claim (from
        // generation) already names `me` as holder, and both facts reject a no-op onto an already-held claim.
        { fact: "ShareRuleSet", superiorId: "$me", subordinateId: "$kid", rule: { fixedPerTurn: 0, percent: 500 }, cause: { rule: "soldier.askAssociate.grantedKid" } },
        { fact: "MemoryAdd", characterId: "$kid", memory: { tag: "made", weight: 100 }, cause: { rule: "soldier.askAssociate.grantedKid" } },
      ],
      report: {
        sponsor: "Your chief lets you bring {kid.name} onto your own book; the boy you kept is your first man.",
        visibility: "known",
      },
    },
    ...NEW_ASSOCIATE_NAMES.map((name, i) => grantedNewOutcome(name, i)),
    {
      id: "denied",
      when: [{ decided: { optionId: "ask" } }, { not: { all: [CHIEF_FAVOR_OK, INTAKE_OPEN] } }],
      effects: [{ fact: "FavorDelta", from: "$chief", to: "$me", delta: -10, cause: { rule: "soldier.askAssociate.denied" } }],
      report: { sponsor: "Your chief tells you the books are closed to you for now.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "A soldier at your table wants to bring a man up." },
  tags: ["soldier", "associate", "decision"],
  codexId: "soldier-opening",
};

/** Schedule-only (no `spawn`): re-binds the fresh associate by the `freshAssociate` tag `granted` above left on
 * him (not yet also tagged `onBook`, so a second `askAssociate` some turns later does not re-match the same
 * man), then applies `ClaimSet`/`ShareRuleSet` now that `CharacterCreate` has genuinely landed (this file's
 * header, deviation 2). */
const askAssociateClaim: ProcessTemplate = {
  id: "soldier.askAssociate.claim",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: {
    me: { entity: "character", pick: "first" },
    associate: {
      entity: "character",
      from: { role: "me", relation: "subordinatesOf" },
      where: [{ has: { role: "$candidate", memoryTag: "freshAssociate" } }, { not: { has: { role: "$candidate", memoryTag: "onBook" } } }],
      pick: "first",
    },
  },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "claimed",
      effects: [
        { fact: "ClaimSet", claimId: "$mint:clm", subject: { kind: "associate", id: "$associate" }, holderId: "$me", cause: { rule: "soldier.askAssociate.claim" } },
        { fact: "ShareRuleSet", superiorId: "$me", subordinateId: "$associate", rule: { fixedPerTurn: 0, percent: 500 }, cause: { rule: "soldier.askAssociate.claim" } },
        { fact: "MemoryAdd", characterId: "$associate", memory: { tag: "onBook", weight: 1 }, cause: { rule: "soldier.askAssociate.claim" } },
      ],
      report: { sign: "Your new man is on the book now.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { sign: "Your new man is on the book now.", visibility: "sign" },
  tags: ["soldier", "associate", "followup"],
};

// =================================================================================================================
// 3. `soldier.detained.support` (design 09 §6): the first arrest below the player.
// =================================================================================================================

const detainedSupport: ProcessTemplate = {
  id: "soldier.detained.support",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: {
    weight: 10_000,
    per: "character",
    maxActivePerScope: 1,
    spawnFrom: { factKind: "StatusChange", role: "man", field: "characterId", match: { status: "arrested" } },
  },
  roles: {
    // `man` first (this file's header note on `ME_ROLE`): `spawnFrom` prebinds `man`, not `me`, so `man` must
    // be the role `scopeRoleName` finds for `maxActivePerScope` to see it as prebound.
    man: { entity: "character", pick: "first" },
    me: { entity: "character", from: { role: "man", relation: "superiorOf" }, pick: "first" },
  },
  preconditions: [{ playerControlled: { role: "me", is: true } }, { rank: { role: "man", in: ["associate"] } }],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "One of your men has been picked up. What do you do for him?",
    options: [
      { id: "lawyer", label: "Pagare l'avvocato (pay the lawyer)", hint: "30 lire, out of your own pocket, but he'll know you stood by him.", effects: [] },
      { id: "mother", label: "Aiutare la madre (help his mother)", hint: "15 lire while he's inside; costs less, means less.", effects: [] },
      { id: "nothing", label: "Niente (nothing)", hint: "Costs you nothing, and he'll remember that too.", effects: [] },
    ],
    aiDefault: "nothing",
    timeoutTurns: 1,
    timeoutOption: "nothing",
  },
  resolve: [
    {
      id: "lawyer",
      when: [{ decided: { optionId: "lawyer" } }],
      effects: [
        { fact: "MoneyDestroy", from: "$me.account", amount: 30, money: "dirty", sink: "lawyer", cause: { rule: "soldier.detained.support.lawyer" } },
        { fact: "LoyaltyDelta", characterId: "$man", delta: 40, cause: { rule: "soldier.detained.support.lawyer" } },
      ],
      report: { sign: "You paid for a lawyer for your man.", visibility: "sign" },
    },
    {
      id: "mother",
      when: [{ decided: { optionId: "mother" } }],
      effects: [
        { fact: "MoneyDestroy", from: "$me.account", amount: 15, money: "dirty", sink: "family", cause: { rule: "soldier.detained.support.mother" } },
        { fact: "LoyaltyDelta", characterId: "$man", delta: 20, cause: { rule: "soldier.detained.support.mother" } },
        { fact: "FavorDelta", from: "$man", to: "$me", delta: 20, cause: { rule: "soldier.detained.support.mother" } },
      ],
      report: { sign: "You saw that his mother wanted for nothing.", visibility: "sign" },
    },
    {
      id: "nothing",
      when: [{ decided: { optionId: "nothing" } }],
      effects: [{ fact: "LoyaltyDelta", characterId: "$man", delta: -30, cause: { rule: "soldier.detained.support.nothing" } }],
      report: { sign: "You did nothing for him.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "One of your men has been picked up." },
  tags: ["soldier", "detained", "decision"],
  codexId: "soldier-opening",
};

// =================================================================================================================
// 4. `chief.demand.envelope` (design 09 §6).
// =================================================================================================================

const ENVELOPE_AMOUNT = 60;

const chiefDemandEnvelope: ProcessTemplate = {
  id: "chief.demand.envelope",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 800, per: "character", maxActivePerScope: 1 },
  roles: { me: ME_ROLE, chief: CHIEF_ROLE },
  preconditions: [
    PLAYER_FREE,
    ME_IS_SOLDIER,
    { not: { fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "envelopeDemand", within: 8 } } } },
  ],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Your chief wants a fatter envelope this quarter.",
    options: [
      {
        id: "accept",
        label: "Pagare (pay it)",
        hint: "60 lire this week; he remembers you as a man who pays.",
        effects: [
          { fact: "MoneyMove", from: "$me.account", to: "$chief.account", amount: ENVELOPE_AMOUNT, money: "dirty", cause: { rule: "chief.demand.envelope.accept" } },
          { fact: "FavorDelta", from: "$chief", to: "$me", delta: 20, cause: { rule: "chief.demand.envelope.accept" } },
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "envelopeDemand", weight: 1 }, cause: { rule: "chief.demand.envelope.accept" } },
        ],
      },
      {
        id: "argue",
        label: "Discutere (argue the point)",
        hint: "Might cost you nothing, might cost you the same 60 lire and his patience besides.",
        effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: "envelopeDemand", weight: 1 }, cause: { rule: "chief.demand.envelope.argue" } }],
      },
    ],
    aiDefault: "accept",
    timeoutTurns: 1,
    timeoutOption: "accept",
  },
  resolve: [
    { id: "accepted", when: [{ decided: { optionId: "accept" } }], effects: [], report: { sign: "You paid your chief his extra envelope.", visibility: "sign" } },
    {
      id: "argueRelents",
      when: [{ decided: { optionId: "argue" } }],
      weight: 5000,
      effects: [{ fact: "FavorDelta", from: "$chief", to: "$me", delta: -10, cause: { rule: "chief.demand.envelope.argue.relents" } }],
      report: { sign: "Your chief let it go, but he didn't like it.", visibility: "sign" },
    },
    {
      id: "argueInsists",
      when: [{ decided: { optionId: "argue" } }],
      weight: 5000,
      effects: [
        { fact: "MoneyMove", from: "$me.account", to: "$chief.account", amount: ENVELOPE_AMOUNT, money: "dirty", cause: { rule: "chief.demand.envelope.argue.insists" } },
        { fact: "FavorDelta", from: "$chief", to: "$me", delta: -30, cause: { rule: "chief.demand.envelope.argue.insists" } },
      ],
      report: { sign: "Your chief insisted, and you paid anyway.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Your chief wants a fatter envelope this quarter." },
  tags: ["soldier", "chief", "decision"],
  codexId: "soldier-opening",
};

// =================================================================================================================
// 5. `chief.demand.man` (design 09 §6): this file's header, deviation 5, for the `man` role.
// =================================================================================================================

const chiefDemandMan: ProcessTemplate = {
  id: "chief.demand.man",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 600, per: "character", maxActivePerScope: 1 },
  roles: {
    me: ME_ROLE,
    chief: CHIEF_ROLE,
    // Required, not optional: with no associate of mine to lend, the whole scene has no subject, so the spawn
    // simply does not happen (design 04 §3 step 2) -- exactly "weight 600 when me has at least one associate
    // on record" without a separate precondition, matching associate-people.ts's `rivalPoach`'s own `rival` role.
    man: {
      entity: "character",
      from: { role: "me", relation: "subordinatesOf" },
      where: [{ rank: { role: "$candidate", in: ["associate"] } }],
      pick: "random",
    },
  },
  preconditions: [
    PLAYER_FREE,
    ME_IS_SOLDIER,
    { not: { fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "manDemand", within: 6 } } } },
  ],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Your chief wants to borrow one of your men for a job.",
    options: [
      {
        id: "lend",
        label: "Prestarlo (lend him)",
        hint: "Good for your standing with the chief; the job carries its own risk for your man.",
        effects: [
          { fact: "RecordDelta", characterId: "$man", field: "jobsDone", delta: 1, cause: { rule: "chief.demand.man.lend" } },
          { fact: "FavorDelta", from: "$chief", to: "$me", delta: 30, cause: { rule: "chief.demand.man.lend" } },
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "manDemand", weight: 1 }, cause: { rule: "chief.demand.man.lend" } },
        ],
      },
      {
        id: "refuse",
        label: "Rifiutare (refuse)",
        hint: "He won't ask nicely next time.",
        effects: [
          { fact: "FavorDelta", from: "$chief", to: "$me", delta: -25, cause: { rule: "chief.demand.man.refuse" } },
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "manDemand", weight: 1 }, cause: { rule: "chief.demand.man.refuse" } },
        ],
      },
    ],
    aiDefault: "lend",
    timeoutTurns: 1,
    timeoutOption: "lend",
  },
  resolve: [
    { id: "lentClean", when: [{ decided: { optionId: "lend" } }], weight: 8500, effects: [], report: { sign: "Your man did the job and came back clean.", visibility: "sign" } },
    {
      id: "lentArrested",
      when: [{ decided: { optionId: "lend" } }],
      weight: 1500,
      effects: [{ fact: "StatusChange", characterId: "$man", status: "arrested", untilTurn: { $turnPlus: 3 }, cause: { rule: "chief.demand.man.arrested" } }],
      report: { newspaper: "A young man was taken in after a job for the family.", visibility: "known" },
    },
    { id: "refused", when: [{ decided: { optionId: "refuse" } }], effects: [], report: { sign: "You told your chief no.", visibility: "sign" } },
  ],
  followUps: [],
  report: { visibility: "known", sponsor: "Your chief wants to borrow one of your men for a job." },
  tags: ["soldier", "chief", "decision"],
  codexId: "soldier-opening",
};

// `soldier.detained.support` (design 09 §6) is superseded by `oblig.prisoner.open` (design 12 §3), which opens
// real obligations on the same trigger; it stays here unregistered as the record of the first version.
export const DETAINED_SUPPORT_LEGACY: ProcessTemplate = detainedSupport;
export const SOLDIER_TEMPLATES: ProcessTemplate[] = [openBook, askAssociate, askAssociateClaim, chiefDemandEnvelope, chiefDemandMan];

// Re-exported only so the file typechecks even if a narrow future test helper reads an option's `hint`/`effects`
// or an outcome's shape directly; not otherwise used here (associate-people.ts's own file-final comment).
export type { DecisionOption, Outcome };
