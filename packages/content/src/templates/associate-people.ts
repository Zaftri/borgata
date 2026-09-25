// The associate's week, part 2 (design 09 §4 rows 7-13): the rival, the shopkeeper's problem, the patrol
// stop, the sponsor's short week and the feast, the warning, being dropped (and its two follow-ups), and
// la proposta (the ceremony). All spawn in lane `families` except `state.patrol.stop` (lane `state`, design 09
// §4's own exception), scope `town`, bound to the player via role `me` (`playerControlled` precondition),
// `spawn: { per: "character" }` with `maxActivePerScope: 1`, `duration: 1` (so the due-firings pass offers the
// decision instead of resolving in the same call it spawns -- the same reasoning civil.ts's file header gives
// for `family.intimidation.choose`), decision role `me`, `timeoutTurns: 1` with the table's stated default.
// Every option carries a `hint` (design 09 §7 item 2). RecordDelta fields `weeksPaid`/`weeksMissed`/`streakPaid`/
// `arrests` are owned by `systems/record.ts`'s automatic weekly sweep (design 09 §2); these templates only ever
// emit `jobsDone`/`jobsRefused`/`jobsBotched`, matching "favors accepted and completed" (design 09 §2).
//
// Six gaps found while authoring this file, each resolved with the nearest expressible behaviour and reported
// in full to the task owner (associate-people.test.ts exercises the templates around them):
//
// 1. No predicate reads a boolean `Family.policy` flag (`intakeOpen`, `bonesRequired`) or the favor ledger
//    (`world.favors`, keyed by pair -- no role selector ever binds it as a field). Both are the DSL's documented
//    escape hatch (design 04 §1): `family.policyFlag` and `relationships.favor`/`relationships.memoryWithin`
//    below, registered from this file exactly the way `systems/progression.ts` registers `progression.proposta`
//    (this file only *uses* `registerPredicateFn`, exported from `@borgata/sim`'s engine barrel; it adds no new
//    engine surface).
// 2. No predicate reads `world.meta.calendar.week`, so "on the feast week of the year" (design 09 §4's
//    `assoc.feast.chipIn` row) is also a `fn`: `assoc.feastWeek`, duplicating `FEAST_WEEKS` from
//    `systems/chains.ts` (that constant is not exported, and this file may not import a non-exported binding).
// 3. `SpawnRule.weight` is a single static per-10,000 number (engine/types.ts); it cannot scale with a bound
//    role's field (design 09 §4's `state.patrol.stop` row: "weight 400 + 20 per town heat/10"). Implemented as
//    a flat weight approximating a mid-heat town; noted here rather than adding `$expr` support to `SpawnRule`.
// 4. `$mint:<prefix>` is documented (engine/effects.ts) to memoize per effect *list*, so a `CharacterCreate`
//    and a following `MemoryAdd` on the same freshly-minted id would agree. Verified empirically (a throwaway
//    scheduler run, not kept) that this is not what the code does: `engine/scheduler.ts`'s `applyEffects`
//    builds a brand-new `EffectContext` object literal on every loop iteration, so `$mint:chr` mints a
//    *different* id for the `CharacterCreate` and for a same-array `MemoryAdd` that references it -- the
//    `MemoryAdd` is silently rejected ("unknown character"). This is exactly the pattern design 09 §4 asks
//    for in `assoc.civil.help` ("a named shopkeeper is created lazily via CharacterCreate if none") and in
//    `state.patrol.stop` ("a state actor generated lazily"); the task brief itself sanctions a fallback for
//    the first case ("if that is impossible to express with the predicate DSL, use FavorDelta toward the
//    sponsor instead"), which is applied here, and the identical reasoning is applied to the second: rather
//    than mint one disposable "officer" character per patrol stop forever (the only way to use CharacterCreate
//    here at all, since there is also no role selector that means "reuse the business's existing owner, or
//    this trait-holder, if one exists, else leave unbound so an effect can create one" -- no relation exposes
//    a business's `ownerId`, and a `where`-filtered selector cannot fall back to "create" on zero matches),
//    `state.patrol.stop`'s outcomes record memory tags on the player himself (`knownToPolice`,
//    `talkedToPolice`, `paidOfficer`) instead of on a synthetic officer entity.
//    Update, docs/event-storming-2026-09-25.md §3 hotspot 1 (2026-09-25): the `assoc.civil.help` half of this
//    gap is closed, not by `CharacterCreate` at all, but by a relation that did not exist before -- `ownerOf`
//    (business -> its civilian owner) plus a generated owner for every shop on the sponsor's crew's blocks
//    (design 09 §5). `civilHelp` below binds that owner as `keeper` and pays the favor to him directly when
//    bound, falling back to the sponsor (as before) only for the shops this generator addition does not reach.
//    `state.patrol.stop`'s synthetic-officer half of this gap is unaffected -- an officer is not a business's
//    owner, so `ownerOf` gives it nothing, and it is out of this task's scope regardless.
// 5. `RefValueSchema` (packages/content/src/schema.ts) has no `null` variant, yet `SuperiorSet.superiorId:
//    CharacterId | null` (facts.ts) legitimately needs `null` to drop a superior (`assoc.sponsor.dropped`).
//    There is no way to author this from content today (confirmed: `pnpm test` fails schema validation on a
//    literal `null` effect field even behind a TypeScript-only cast, since the zod schema is a separate,
//    runtime check `effects.ts`'s own null-tolerant `resolveValue` never reaches). See `droppedBaseEffects`
//    below for the fallback (`ClaimRelease` alone, which already clears `onRecordWith` as a reducer side
//    effect, not a Fact field) and what it costs.
// 6. `schema.ts`'s referential-integrity walker (`BUILTIN_REF_TOKENS`) was never extended for `$mint:<prefix>`
//    (design 09 §7 item 1): it treats "$mint:clm" as a reference to an undeclared role literally named
//    "mint:clm" and fails content validation. `assoc.sponsor.takenOn`'s `ClaimSet` uses `$instance` instead
//    (already whitelisted, and unique enough for the purpose -- see that template's own comment).
//
// A seventh, unrelated finding, not a gap in this file's own templates but load-bearing for `assoc.proposal`:
// `systems/progression.ts`'s pre-existing `checkPlayerPromotion` (phase 4) still promotes the player from
// associate to soldier the moment Weight crosses `RANK_THRESHOLDS.soldier` (100), independent of la proposta,
// `bonesRequired` or `intakeOpen`, and it runs every turn regardless of content. Since an associate's Weight
// now includes the same record fields la proposta reads (design 09 §3's `recordBonus`), Weight can (and in
// this file's ceremony test, does) cross 100 well before proposta reaches 750, so `checkPlayerPromotion` often
// promotes the player before `assoc.proposal` ever gets to run its scene -- and once promoted, `assoc.proposal`
// can no longer even spawn (`progression.proposta` returns null for a non-associate). `assoc.proposal` is
// implemented here faithfully to design 09 §4 regardless, since fixing the overlap means editing
// `systems/progression.ts`, which this task does not own; see this file's report for the full explanation.

import { favorKey, registerPredicateFn } from "@borgata/sim";
import type { CharacterId } from "@borgata/shared";
import type { DecisionOption, Effect, ProcessTemplate } from "@borgata/sim";

// ---------------------------------------------------------------------------------------------------------------
// `fn` predicates (design 04 §1's escape hatch), registered here the way `systems/progression.ts` registers
// `progression.proposta`: a side effect of importing this module, which `templates/index.ts` always does.
// ---------------------------------------------------------------------------------------------------------------

/** `{ fn: { name: "family.policyFlag", args: { role: "me", flag: "intakeOpen" } } }`: a boolean on the role's
 * family (the role may itself be a family, or a character read through `familyId`). No predicate in
 * engine/types.ts reads a `Family.policy` field (gap 1 above). */
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

/** `{ fn: { name: "relationships.favor", args: { from: "sponsor", to: "me", op: "lte" | "gte", value: N } } }`:
 * the signed favor ledger has no role-bound field a `cmp` could read (gap 1 above); narrow to the two
 * comparisons this file needs. */
registerPredicateFn("relationships.favor", (world, roles, args) => {
  const fromRef = roles[String(args["from"] ?? "sponsor")];
  const toRef = roles[String(args["to"] ?? "me")];
  if (!fromRef || !toRef || fromRef.kind !== "character" || toRef.kind !== "character") return false;
  const value = world.favors[favorKey(fromRef.id as CharacterId, toRef.id as CharacterId)] ?? 0;
  const threshold = Number(args["value"] ?? 0);
  return args["op"] === "gte" ? value >= threshold : value <= threshold;
});

/** `{ fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "warned", within: 8 } } }`: has the
 * role gained a memory of this tag within the last `within` turns. Used for "not within 8 turns of the last
 * warning" (design 09 §4's `assoc.sponsor.warning` row); `recent` (engine/types.ts) only matches a *fact kind*,
 * not a memory tag, so it cannot distinguish a warning from any other `MemoryAdd`. */
registerPredicateFn("relationships.memoryWithin", (world, roles, args) => {
  const ref = roles[String(args["role"] ?? "me")];
  if (!ref || ref.kind !== "character") return false;
  const c = world.characters.byId[ref.id];
  if (!c) return false;
  const tag = String(args["tag"] ?? "");
  const within = Number(args["within"] ?? 8);
  return c.memory.some((m) => m.tag === tag && m.turn >= world.meta.turn - within);
});

/** The three feast weeks (Easter, mid-August, Christmas), duplicating the non-exported `FEAST_WEEKS` in
 * `systems/chains.ts` (design 03 §4) -- gap 2 above: nothing exposes the calendar week to the predicate DSL. */
const FEAST_WEEKS: readonly number[] = [15, 33, 52];
registerPredicateFn("assoc.feastWeek", (world) => FEAST_WEEKS.includes(world.meta.calendar.week));

// ---------------------------------------------------------------------------------------------------------------
// Shared role fragments.
// ---------------------------------------------------------------------------------------------------------------

/** The scope role every template in this file starts with; must be declared first so `scheduler.ts`'s
 * `scopeRoleName` (the first role whose `entity` matches `spawn.per`) finds it and not a later character role. */
const ME_ROLE = { entity: "character" as const, pick: "first" as const };

/** The associate's current claim holder (design 02 §9): exactly the sponsor he is on record with
 * (`Character.onRecordWith`, owned by claims and kept in sync with the claim). */
const SPONSOR_ROLE = { entity: "character" as const, from: { role: "me", relation: "claimHolderOf" as const }, pick: "first" as const };

const PLAYER_FREE: ProcessTemplate["preconditions"][number] = { playerControlled: { role: "me", is: true } };

// Schema rule 2c (2026-09-25): every decision option needs an outcome that answers it (a `decided` gate plus
// a report line the player reads), because the option's own effects (on the `DecisionOption` above) never carry
// a report of their own -- only an outcome's `report` field does (engine/scheduler.ts `resolveInstanceNow`).
// The trivial single always-matching outcome this file used to share across `civilHelp`/`sponsorShort`/
// `feastChipIn` (civil.ts's `family.intimidation.choose` pattern, now retired there too) can no longer be used
// once each option gets its own answering outcome: an unconditional `when`-less outcome would still match
// alongside the new option-gated ones (`resolveInstanceNow`'s `matching` filter has no notion of "at most one"),
// competing for the weighted draw and sometimes silently winning over the report the player is meant to see.
// Each of the three templates below gets its own small `resolve` array instead, one outcome per option.

// =================================================================================================================
// 1. `assoc.rival.poach` (design 09 §4 row: "weight 500 when a rival associate (same sponsor) exists").
// The generator guarantees the rival (design 09 §5); here he is found the same way an associate's sponsor
// doubles as his crew (docs/NOW.md phase 6: "associates ... collect with their sponsor's crew"): another
// associate whose `superiorId` is the sponsor (`subordinatesOf`), carrying the generator's `ambitious` trait.
// =================================================================================================================

const rivalPoach: ProcessTemplate = {
  id: "assoc.rival.poach",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 1200, per: "character", maxActivePerScope: 1, cooldownTurns: 4 }, // tuned from 500 (probe 2026-09-24); cooldown: design 10
  roles: {
    me: ME_ROLE,
    sponsor: SPONSOR_ROLE,
    // Required (not `optional`): if no rival can be bound, `bindRoles` drops the spawn entirely (design 04 §3
    // step 2), which is exactly "weight 500 when a rival associate exists" -- no separate precondition needed.
    rival: {
      entity: "character",
      from: { role: "sponsor", relation: "subordinatesOf" },
      where: [
        { rank: { role: "$candidate", in: ["associate"] } },
        { has: { role: "$candidate", trait: "ambitious" } },
        { sameEntity: { a: "$candidate", b: "me", is: false } },
      ],
      pick: "random",
    },
    // For "settle"'s HeatDelta; optional since a fresh sponsor's crew might (rarely) hold no blocks yet.
    town: { entity: "town", from: { role: "sponsor", relation: "townOf" }, pick: "first", optional: true },
  },
  preconditions: [PLAYER_FREE],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "The other associate on your sponsor's book is working your corners.",
    options: [
      {
        id: "outwork",
        label: "Work harder than him",
        hint: "A job on your record, at the cost of about 20 kL of the week's take: the rounds you buy and the men who cover your stall. He keeps working your corners.",
        effects: [
          { fact: "RecordDelta", characterId: "$me", field: "jobsDone", delta: 1, cause: { rule: "assoc.rival.poach.outwork" } },
          // The cost the owner asked for (2026-09-24): no option is free. Longer hours are paid in rounds and cover.
          { fact: "MoneyDestroy", from: "$me.account", amount: 20, money: "dirty", sink: "outwork", cause: { rule: "assoc.rival.poach.outwork" } },
          // Stand-in for design 09 §4's "next favor auto-accepted" flag (no engine field tracks a one-shot
          // modifier on a future spawn); a memory tag is the nearest expressible signal.
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "eager", weight: 10 }, cause: { rule: "assoc.rival.poach.outwork" } },
        ],
      },
      {
        id: "cutIn",
        label: "Cut him in on the game",
        hint: "A slice of the game buys peace: he thinks well of you, and for eight weeks the table pays you about a third less.",
        effects: [
          { fact: "FavorDelta", from: "$rival", to: "$me", delta: 40, cause: { rule: "assoc.rival.poach.cutIn" } },
          // Stand-in for "game income -30 percent for 8 turns" (owned by `assoc.game.stake`, another file).
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "cutInDeal", weight: 20 }, cause: { rule: "assoc.rival.poach.cutIn" } },
        ],
      },
      {
        id: "rat",
        label: "Tell your sponsor what he's really like",
        hint: "Your sponsor hears it from you: favor now. He remembers, and the crew learns you talk.",
        effects: [
          { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 20, cause: { rule: "assoc.rival.poach.rat" } },
          { fact: "MemoryAdd", characterId: "$rival", memory: { tag: "ratted", aboutId: "$me", weight: 60 }, cause: { rule: "assoc.rival.poach.rat" } },
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "talker", weight: 40 }, cause: { rule: "assoc.rival.poach.rat" } },
        ],
      },
      {
        id: "settle",
        label: "Settle it in the street",
        hint: "A beating settles it: heat on the town, a line in your dossier, a grudge that outlives the rank, one time in ten a night in a cell.",
        effects: [], // branches by chance below, in `resolve` (design pattern: dispute.claim's weighted outcomes).
      },
    ],
    aiDefault: "outwork",
    timeoutTurns: 1,
    timeoutOption: "outwork",
  },
  resolve: [
    {
      id: "settleClean",
      weight: 9000,
      when: [{ decided: { optionId: "settle" } }],
      effects: [
        { fact: "HeatDelta", townId: "$town", delta: 15, cause: { rule: "assoc.rival.poach.settle" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 15, source: "participation" }, cause: { rule: "assoc.rival.poach.settle" } },
        { fact: "MemoryAdd", characterId: "$rival", memory: { tag: "beaten", aboutId: "$me", weight: 200 }, cause: { rule: "assoc.rival.poach.settle" } },
      ],
      report: { sign: "You settled it with him in the street.", visibility: "sign" },
    },
    {
      id: "settleArrested",
      weight: 1000,
      when: [{ decided: { optionId: "settle" } }],
      effects: [
        { fact: "HeatDelta", townId: "$town", delta: 15, cause: { rule: "assoc.rival.poach.settle" } },
        { fact: "EvidenceAdd", characterId: "$me", item: { crimeRef: "$instance", weight: 15, source: "participation" }, cause: { rule: "assoc.rival.poach.settle" } },
        { fact: "MemoryAdd", characterId: "$rival", memory: { tag: "beaten", aboutId: "$me", weight: 200 }, cause: { rule: "assoc.rival.poach.settle" } },
        { fact: "StatusChange", characterId: "$me", status: "arrested", untilTurn: { $turnPlus: 4 }, cause: { rule: "assoc.rival.poach.settle.arrested" } },
      ],
      report: { newspaper: "Two young men fought in the street; police arrested one of them.", sign: "You settled it with him in the street, and the police picked you up for it.", visibility: "sign" },
    },
    // Every other option already applied its effects directly (see the options above); without this, an
    // "outwork"/"cutIn"/"rat" decision would leave `matching` empty and `resolveInstanceNow`'s fallback would
    // treat the FULL `resolve` array as eligible, wrongly drawing one of the "settle" outcomes (engine/
    // scheduler.ts: `pool = matching.length > 0 ? matching : template.resolve`). Same defensive shape as
    // `dispute.claim`'s "settled" catch-all (packages/content/src/templates/disputes.ts).
    // One outcome per choice so the report names what the choice came to (rule 2b, 2026-09-25).
    { id: "outworked", when: [{ decided: { optionId: "outwork" } }], effects: [], report: { sign: "You worked the longer hours and paid for the rounds; he is still on your corners.", visibility: "sign" } },
    { id: "cutIn", when: [{ decided: { optionId: "cutIn" } }], effects: [], report: { sign: "A slice of the game bought peace; the table pays you a little less for a while.", visibility: "sign" } },
    { id: "ratted", when: [{ decided: { optionId: "rat" } }], effects: [], report: { sign: "Your sponsor heard it from you. He will remember who told him.", visibility: "sign" } },
  ],
  followUps: [],
  report: { sponsor: "The other associate on your sponsor's book is crowding you.", visibility: "known" },
  tags: ["associate", "rival", "decision"],
};

// =================================================================================================================
// 2. `assoc.civil.help` (design 09 §4 row: "weight 600"). Gap 4 (see the file header) no longer applies here:
// docs/event-storming-2026-09-25.md §3 hotspot 1 added `Business.ownerId`, the `ownerOf` role relation and a
// generated civilian owner for every shop on the sponsor's crew's blocks, so `shop` (bound below the same way
// it always was, via `crew`'s `businessesOf`) usually HAS an owner to bind as `keeper`. The favor is banked with
// the shopkeeper himself when `keeper` is bound; the sponsor-favor fallback (the task's own sanctioned
// workaround, kept for the shops this generator addition does not reach -- other towns' blocks, "lazy, later"
// per design 09 §5) still applies when it is not.
// =================================================================================================================

const civilHelp: ProcessTemplate = {
  id: "assoc.civil.help",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 2500, per: "character", maxActivePerScope: 1, cooldownTurns: 4 }, // tuned from 600 (probe 2026-09-24); cooldown: design 10
  roles: {
    me: ME_ROLE,
    sponsor: SPONSOR_ROLE,
    crew: { entity: "crew", from: { role: "sponsor", relation: "crewOf" }, pick: "first", optional: true },
    // Required: with no business to help, the whole scene has no subject, so the spawn simply does not happen
    // (design 04 §3 step 2), same idiom as `family.poach.attempt`'s required `poacher`.
    shop: { entity: "business", from: { role: "crew", relation: "businessesOf" }, pick: "random" },
    town: { entity: "town", from: { role: "shop", relation: "townOf" }, pick: "first" },
    // The shop's owner (hotspot 1): optional, since a shop off the sponsor's crew's blocks has none.
    keeper: { entity: "character", from: { role: "shop", relation: "ownerOf" }, pick: "first", optional: true },
  },
  preconditions: [PLAYER_FREE],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "A shopkeeper on the block has a problem only a friend can fix.",
    options: [
      {
        id: "helpFree",
        label: "Help him for nothing",
        hint: "Your time, for nothing: the town thinks better of the family, and the block remembers you kindly.",
        // The favor itself (keeper if bound, else the sponsor fallback) is decided in `resolve` below, since an
        // option's own effects cannot branch on a role's binding -- only an outcome's `when` can.
        effects: [{ fact: "SentimentDelta", townId: "$town", delta: 25, cause: { rule: "assoc.civil.help.helpFree" } }],
      },
      {
        id: "helpFee",
        label: "Help him, but he pays",
        hint: "A few lire for the trouble: 15 kL now, and a little less goodwill.",
        effects: [
          { fact: "MoneyMint", to: "$me.account", amount: 15, money: "dirty", source: "helpFee", cause: { rule: "assoc.civil.help.helpFee" } },
          { fact: "SentimentDelta", townId: "$town", delta: 5, cause: { rule: "assoc.civil.help.helpFee" } },
        ],
      },
      {
        id: "ignore",
        label: "It's not your business",
        hint: "Nothing spent, nothing gained. The block learns the family only takes.",
        effects: [{ fact: "SentimentDelta", townId: "$town", delta: -10, cause: { rule: "assoc.civil.help.ignore" } }],
      },
    ],
    aiDefault: "ignore",
    timeoutTurns: 1,
    timeoutOption: "ignore",
  },
  resolve: [
    {
      id: "helpedFreeKeeper",
      when: [{ decided: { optionId: "helpFree" } }, { bound: { role: "keeper", is: true } }],
      effects: [
        { fact: "FavorDelta", from: "$keeper", to: "$me", delta: 30, cause: { rule: "assoc.civil.help.helpFree" } },
        { fact: "MemoryAdd", characterId: "$keeper", memory: { tag: "helped", aboutId: "$me", weight: 20 }, cause: { rule: "assoc.civil.help.helpFree" } },
      ],
      report: { sign: "You helped him for nothing; he will remember it kindly.", visibility: "sign" },
    },
    {
      id: "helpedFreeNoKeeper",
      when: [{ decided: { optionId: "helpFree" } }, { bound: { role: "keeper", is: false } }],
      // Gap 4's original fallback: the shopkeeper's gratitude is banked with the sponsor instead, for the shops
      // this generator addition does not reach (no owner character exists to hang it on there).
      effects: [{ fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 30, cause: { rule: "assoc.civil.help.helpFree" } }],
      report: { sign: "You helped him for nothing; the block will remember it kindly.", visibility: "sign" },
    },
    {
      id: "helpedFeeKeeper",
      when: [{ decided: { optionId: "helpFee" } }, { bound: { role: "keeper", is: true } }],
      effects: [
        { fact: "FavorDelta", from: "$keeper", to: "$me", delta: 10, cause: { rule: "assoc.civil.help.helpFee" } },
        { fact: "MemoryAdd", characterId: "$keeper", memory: { tag: "helped", aboutId: "$me", weight: 10 }, cause: { rule: "assoc.civil.help.helpFee" } },
      ],
      report: { sign: "You helped him, but made him pay for it.", visibility: "sign" },
    },
    {
      id: "helpedFeeNoKeeper",
      when: [{ decided: { optionId: "helpFee" } }, { bound: { role: "keeper", is: false } }],
      effects: [{ fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 10, cause: { rule: "assoc.civil.help.helpFee" } }],
      report: { sign: "You helped him, but made him pay for it.", visibility: "sign" },
    },
    { id: "ignored", when: [{ decided: { optionId: "ignore" } }], effects: [], report: { sign: "You decided it wasn't your business.", visibility: "sign" } },
  ],
  followUps: [],
  report: { sign: "A shopkeeper on the block could use a friend.", visibility: "sign" },
  tags: ["associate", "civil", "decision"],
};

// =================================================================================================================
// 3. `state.patrol.stop` (design 09 §4 row: "lane state, weight 400 + 20 per town heat/10"; gap 3: a flat
// weight approximates the dynamic formula). See the file header, gap 4, for why there is no lazily-created
// "officer" character: outcomes record the encounter on the player himself.
// =================================================================================================================

const patrolStop: ProcessTemplate = {
  id: "state.patrol.stop",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "state",
  spawn: { weight: 1500, per: "character", maxActivePerScope: 1, cooldownTurns: 3 }, // patrol stop, tuned from 800 (probe 2026-09-24); cooldown: design 10
  roles: {
    me: ME_ROLE,
    // "talk"'s bad outcome puts evidence on the sponsor (design 09 §4); optional so a dropped associate
    // with no sponsor can still be stopped on the street.
    sponsor: { entity: "character", from: { role: "me", relation: "claimHolderOf" }, pick: "first", optional: true },
  },
  preconditions: [PLAYER_FREE],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "A patrolman stops you on the corner.",
    options: [
      {
        id: "silent",
        label: "Say nothing",
        hint: "The correct answer. Nothing happens; the officer remembers your face.",
        effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: "knownToPolice", weight: 20 }, cause: { rule: "state.patrol.stop.silent" } }],
      },
      {
        id: "talk",
        label: "Make conversation",
        hint: "One time in seven you say a word too many: a document on your sponsor's dossier, and a memory a rival can use.",
        effects: [], // 15 percent bad, in `resolve` below.
      },
      {
        id: "bribe",
        label: "Slip him something",
        hint: "10 kL from your pocket. Cheaper than an arrest, and now he knows you pay.",
        effects: [
          { fact: "MoneyDestroy", from: "$me.account", amount: 10, money: "dirty", sink: "bribe", cause: { rule: "state.patrol.stop.bribe" } },
          { fact: "MemoryAdd", characterId: "$me", memory: { tag: "paidOfficer", weight: 15 }, cause: { rule: "state.patrol.stop.bribe" } },
        ],
      },
    ],
    aiDefault: "silent",
    timeoutTurns: 1,
    timeoutOption: "silent",
  },
  resolve: [
    {
      id: "talkBad",
      weight: 1500,
      when: [{ decided: { optionId: "talk" } }],
      effects: [
        { fact: "EvidenceAdd", characterId: "$sponsor", item: { crimeRef: "$instance", weight: 20, source: "document" }, cause: { rule: "state.patrol.stop.talk.bad" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "talkedToPolice", weight: 80 }, cause: { rule: "state.patrol.stop.talk.bad" } },
      ],
      report: { sign: "You said too much; it lands on your sponsor's dossier.", visibility: "sign" },
    },
    { id: "talkOk", weight: 8500, when: [{ decided: { optionId: "talk" } }], effects: [], report: { sign: "A word or two and he waved you on.", visibility: "sign" } },
    // See `assoc.rival.poach`'s identical comment: without this, "silent"/"bribe" would fall back to the
    // full `resolve` pool and could wrongly draw "talkBad".
    { id: "silent", when: [{ decided: { optionId: "silent" } }], effects: [], report: { sign: "You said nothing. The patrolman took a long look at your face and let you go.", visibility: "sign" } },
    { id: "bribed", when: [{ decided: { optionId: "bribe" } }], effects: [], report: { sign: "Ten lire changed hands on the corner. He knows you pay now.", visibility: "sign" } },
  ],
  followUps: [],
  report: { sign: "A patrolman is looking your way.", visibility: "sign" },
  tags: ["state", "patrol", "decision"],
};

// =================================================================================================================
// 4. `assoc.sponsor.short` (design 09 §4 row: "weight 300 (gambler 900)"; the trait-scaled weight is the same
// static-`SpawnRule.weight` gap as `state.patrol.stop` -- a single flat weight is used). Follow-up 5,
// `assoc.sponsor.repay`, is schedule-only (no `spawn`), reached by "lend"'s own probabilistic `schedule` effect.
// =================================================================================================================

const REPAY_BIND = { me: "me", sponsor: "sponsor" };

const sponsorShort: ProcessTemplate = {
  id: "assoc.sponsor.short",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 1000, per: "character", maxActivePerScope: 1, cooldownTurns: 6 }, // tuned from 300 (probe 2026-09-24); cooldown: design 10
  roles: { me: ME_ROLE, sponsor: SPONSOR_ROLE },
  preconditions: [PLAYER_FREE],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Your sponsor is short this week and asks you for help.",
    options: [
      {
        id: "lend",
        label: "Lend him the money",
        hint: "40 kL out of your pocket, favor up. He repays in a few weeks, more often than not.",
        effects: [
          { fact: "MoneyMove", from: "$me.account", to: "$sponsor.account", amount: 40, money: "dirty", cause: { rule: "assoc.sponsor.short.lend" } },
          { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 30, cause: { rule: "assoc.sponsor.short.lend" } },
          { schedule: { templateId: "assoc.sponsor.repay", delay: 6, probability: 6000, bind: REPAY_BIND } },
        ],
      },
      {
        id: "give",
        label: "Give it to him outright",
        hint: "30 kL, gone for good, and a bigger step up in favor.",
        effects: [
          { fact: "MoneyMove", from: "$me.account", to: "$sponsor.account", amount: 30, money: "dirty", cause: { rule: "assoc.sponsor.short.give" } },
          { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 60, cause: { rule: "assoc.sponsor.short.give" } },
        ],
      },
      {
        id: "refuse",
        label: "Tell him you have nothing",
        hint: "Costs nothing today. Favor down, and he wonders what you are saving for.",
        effects: [{ fact: "FavorDelta", from: "$sponsor", to: "$me", delta: -30, cause: { rule: "assoc.sponsor.short.refuse" } }],
      },
    ],
    aiDefault: "lend",
    timeoutTurns: 1,
    timeoutOption: "lend",
  },
  resolve: [
    { id: "lent", when: [{ decided: { optionId: "lend" } }], effects: [], report: { sign: "You lent your sponsor the money.", visibility: "sign" } },
    { id: "gave", when: [{ decided: { optionId: "give" } }], effects: [], report: { sign: "You gave your sponsor the money outright.", visibility: "sign" } },
    { id: "refused", when: [{ decided: { optionId: "refuse" } }], effects: [], report: { sign: "You told your sponsor you had nothing to give.", visibility: "sign" } },
  ],
  followUps: [],
  report: { sponsor: "Your sponsor is short this week.", visibility: "known" },
  tags: ["associate", "sponsor", "decision"],
};

/** `assoc.sponsor.repay`: schedule-only follow-up of `assoc.sponsor.short`'s "lend" (no `spawn`; reached only
 * via the `schedule` effect above, same pattern as `operation.arson`/`operation.bomb` in civil.ts). No decision:
 * this is the sponsor making good, not a choice of the player's. */
const sponsorRepay: ProcessTemplate = {
  id: "assoc.sponsor.repay",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: { me: ME_ROLE, sponsor: { entity: "character", pick: "first" } },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "repaid",
      effects: [
        { fact: "MoneyMove", from: "$sponsor.account", to: "$me.account", amount: 40, money: "dirty", cause: { rule: "assoc.sponsor.repay" } },
        { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 10, cause: { rule: "assoc.sponsor.repay" } },
      ],
      report: { sign: "Your sponsor pays back what he owed you.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { sign: "Your sponsor pays back what he owed you.", visibility: "sign" },
  tags: ["associate", "sponsor", "followup"],
};

// =================================================================================================================
// 5. `assoc.feast.chipIn` (design 09 §4 row: "weight 10000 on the feast week of the year"). Gate via the
// `assoc.feastWeek` fn (gap 2 above).
// =================================================================================================================

const feastChipIn: ProcessTemplate = {
  id: "assoc.feast.chipIn",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 10_000, per: "character", maxActivePerScope: 1 },
  roles: {
    me: ME_ROLE,
    sponsor: SPONSOR_ROLE,
    town: { entity: "town", from: { role: "sponsor", relation: "townOf" }, pick: "first", optional: true },
  },
  preconditions: [PLAYER_FREE, { fn: { name: "assoc.feastWeek" } }],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  // Lowest priority in this file: design 09 §4's "the late payer and the game outrank the feast" (those
  // templates belong to `associate-week.ts`, a parallel file; a negative priority here is this file's half
  // of that ordering).
  priority: -1,
  decision: {
    role: "me",
    prompt: "The feast is coming, and the collection box is going around.",
    options: [
      {
        id: "chipIn",
        label: "Chip in for the feast",
        hint: "10 kL to the committee: the town warms to the family, and your name is in your sponsor's ear.",
        effects: [
          { fact: "MoneyDestroy", from: "$me.account", amount: 10, money: "dirty", sink: "feast", cause: { rule: "assoc.feast.chipIn.chipIn" } },
          { fact: "SentimentDelta", townId: "$town", delta: 15, cause: { rule: "assoc.feast.chipIn.chipIn" } },
          { fact: "FavorDelta", from: "$sponsor", to: "$me", delta: 10, cause: { rule: "assoc.feast.chipIn.chipIn" } },
        ],
      },
      { id: "keep", label: "Keep your money", hint: "Keep the 10 kL. The neighbors notice who did not give.", effects: [] },
    ],
    aiDefault: "keep",
    timeoutTurns: 1,
    timeoutOption: "keep",
  },
  resolve: [
    { id: "chippedIn", when: [{ decided: { optionId: "chipIn" } }], effects: [], report: { sign: "You chipped in for the feast; the committee will remember it.", visibility: "sign" } },
    { id: "kept", when: [{ decided: { optionId: "keep" } }], effects: [], report: { sign: "You kept your money; the neighbors noticed who didn't give.", visibility: "sign" } },
  ],
  followUps: [],
  report: { sign: "The feast is coming, and the collection box is going around.", visibility: "sign" },
  tags: ["associate", "feast", "decision"],
};

// =================================================================================================================
// 6. `assoc.sponsor.warning` (design 09 §4 row: "weight 10000 when favor(sponsor->me) <= -100 and not within
// 8 turns of the last warning"). A single-option "decision" per this file's header note: the player has
// nothing to choose, only to acknowledge, same as `assoc.sponsor.dropped` and `assoc.proposal` below.
// =================================================================================================================

const sponsorWarning: ProcessTemplate = {
  id: "assoc.sponsor.warning",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 10_000, per: "character", maxActivePerScope: 1 },
  roles: { me: ME_ROLE, sponsor: SPONSOR_ROLE },
  preconditions: [
    PLAYER_FREE,
    {
      any: [
        { fn: { name: "relationships.favor", args: { from: "sponsor", to: "me", op: "lte", value: -100 } } },
        { cmp: { role: "me", path: "record.streakRefused", op: "gte", value: 3 } }, // three refusals in a row (first-ranks §8 story 5)
      ],
    },
    { not: { fn: { name: "relationships.memoryWithin", args: { role: "me", tag: "warned", within: 8 } } } },
  ],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Your sponsor has had enough. He wants you to hear it from him.",
    options: [
      { id: "none", label: "Hear him out", hint: "niente da dare, solo da ascoltare (nothing to give, only to listen)", effects: [] },
    ],
    aiDefault: "none",
    timeoutTurns: 1,
    timeoutOption: "none",
  },
  resolve: [
    {
      id: "warned",
      effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: "warned", weight: 60 }, cause: { rule: "assoc.sponsor.warning" } }],
      report: { sign: "You heard your sponsor out; the warning stands against you now.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { sponsor: "Your sponsor has had enough. Straighten up.", visibility: "known" },
  tags: ["associate", "sponsor", "decision"],
};

// =================================================================================================================
// 7. `assoc.sponsor.dropped` (design 09 §4 row: "weight 10000 when favor <= -220 or jobsRefused >= 5") with
// its two follow-ups, `assoc.sponsor.takenOn` and `assoc.run.ends` (design 09 §4's "either/or"). Modelled as
// two mutually-exclusive weighted `resolve` outcomes rather than two independent `followUps` entries: the
// `FollowUp` type's `probability` fields are each drawn separately (engine/scheduler.ts `maybeScheduleFollowUp`),
// so two independent 50 percent draws could fire both or neither; a weighted `resolve` (dispute.claim's own
// pattern) guarantees exactly one path is scheduled.
// =================================================================================================================

// Gap 5 (see the file header): `SuperiorSet.superiorId: CharacterId | null` (facts.ts) legitimately needs
// `null` to clear a superior, but the content schema's `RefValueSchema` (packages/content/src/schema.ts) has
// no `null` variant at all -- `FactEffectSchema`'s `.catchall(RefValueSchema)` rejects a literal `null` field
// on ANY effect, so there is no way to author this from content (confirmed: `pnpm test` fails schema
// validation on a `null` field even behind a TypeScript cast, since the zod schema is a separate, runtime
// check). The nearest expressible behaviour: `ClaimRelease` alone already clears `Character.onRecordWith` as
// a side effect the claims reducer performs directly, not through a Fact field (reducers/claims.ts
// `ClaimRelease`), and `onRecordWith` (via `claimHolderOf`) is what this file's own `SPONSOR_ROLE` reads, so
// this file's own templates see "no sponsor" correctly from the turn a player is dropped. `Character.superiorId`
// itself is left stale (still the old sponsor) until either `assoc.sponsor.takenOn` sets a fresh one (a
// non-null value, which authors fine) or the run ends; this does affect one thing outside this file's reach:
// `associate-week.ts`'s sibling templates resolve their own "sponsor" role via `superiorOf` (`Character.
// superiorId`), so they would keep offering scenes against the old sponsor for a dropped, not-yet-taken-on
// player. Reported in full rather than silently accepted.
const droppedBaseEffects: Effect[] = [{ fact: "ClaimRelease", claimId: "$me.claim", cause: { rule: "assoc.sponsor.dropped" } }];

const sponsorDropped: ProcessTemplate = {
  id: "assoc.sponsor.dropped",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 10_000, per: "character", maxActivePerScope: 1 },
  roles: { me: ME_ROLE, sponsor: SPONSOR_ROLE },
  preconditions: [
    PLAYER_FREE,
    {
      any: [
        { fn: { name: "relationships.favor", args: { from: "sponsor", to: "me", op: "lte", value: -220 } } },
        { cmp: { role: "me", path: "record.streakRefused", op: "gte", value: 5 } }, // five in a row, not five ever (first-ranks §8 story 5)
      ],
    },
  ],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Your sponsor tells you he is done carrying you.",
    options: [{ id: "none", label: "Take it", hint: "il tuo posto (your place) — gone", effects: [] }],
    aiDefault: "none",
    timeoutTurns: 1,
    timeoutOption: "none",
  },
  resolve: [
    {
      id: "takenOn",
      weight: 5000,
      when: [{ decided: { optionId: "none" } }],
      effects: [...droppedBaseEffects, { schedule: { templateId: "assoc.sponsor.takenOn", delay: 1, bind: REPAY_BIND } }],
      report: { sign: "Your sponsor cuts you loose; someone else in the crew will vouch for you.", visibility: "sign" },
    },
    {
      id: "runEnds",
      weight: 5000,
      when: [{ decided: { optionId: "none" } }],
      effects: [...droppedBaseEffects, { schedule: { templateId: "assoc.run.ends", delay: 1, bind: { me: "me" } } }],
      report: { newspaper: "A young man of the quarter has fallen silent; nobody is backing him now.", sign: "Your sponsor cuts you loose, and this time nobody steps in.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { sponsor: "Your sponsor is done carrying you.", visibility: "known" },
  tags: ["associate", "sponsor", "decision"],
};

/** `assoc.sponsor.takenOn` (schedule-only): another soldier of the same crew takes the player on. No decision;
 * the taking is the crew's, not the player's. Required roles mean an old sponsor whose crew has no other
 * soldier simply never produces a taking-on (the schedule entry's role binding fails and is dropped, logged --
 * design 04 §3 step 2), which is the nearest expressible behaviour for an edge case design 09 §4 does not cover. */
const sponsorTakenOn: ProcessTemplate = {
  id: "assoc.sponsor.takenOn",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: {
    me: ME_ROLE,
    sponsor: { entity: "character", pick: "first" },
    crew: { entity: "crew", from: { role: "sponsor", relation: "crewOf" }, pick: "first" },
    newSponsor: {
      entity: "character",
      from: { role: "crew", relation: "membersOf" },
      where: [{ rank: { role: "$candidate", in: ["soldier"] } }, { sameEntity: { a: "$candidate", b: "sponsor", is: false } }],
      pick: "random",
    },
  },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "takenOn",
      effects: [
        // `$mint:clm` (design 09 §7 item 1) is what the task brief points to for a fresh claim id, but
        // `schema.ts`'s referential-integrity walker (`BUILTIN_REF_TOKENS`/`checkDollarToken`) was never
        // extended to recognize the `$mint:<prefix>` family of tokens -- it treats "$mint:clm" as a reference
        // to an undeclared role named "mint:clm" and `pnpm test` confirms this fails schema validation.
        // `$instance` (already whitelisted, engine/effects.ts) is the nearest expressible substitute: it
        // resolves to the currently-resolving process instance's own id, which is unique across the whole
        // world (ids are minted from one shared, ever-increasing counter regardless of prefix, so a "proc-N"
        // string can never collide with a "clm-N" one) and this outcome resolves at most once, so reusing it
        // as the claim's id is safe and passes validation without a schema change.
        { fact: "ClaimSet", claimId: "$instance", subject: { kind: "associate", id: "$me" }, holderId: "$newSponsor", cause: { rule: "assoc.sponsor.takenOn" } },
        { fact: "SuperiorSet", characterId: "$me", superiorId: "$newSponsor", cause: { rule: "assoc.sponsor.takenOn" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "takenOn", weight: 30 }, cause: { rule: "assoc.sponsor.takenOn" } },
      ],
      report: { sign: "Another man vouches for you now.", visibility: "sign" },
    },
  ],
  followUps: [],
  report: { sign: "Another man vouches for you now.", visibility: "sign" },
  tags: ["associate", "sponsor", "followup"],
};

/** `assoc.run.ends` (schedule-only): "the run-end screen itself is UI work in a later wave; the memory tag is
 * the signal" (design 09 §4). */
const runEnds: ProcessTemplate = {
  id: "assoc.run.ends",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  roles: { me: ME_ROLE },
  preconditions: [],
  duration: 0,
  resolve: [
    {
      id: "ended",
      effects: [{ fact: "MemoryAdd", characterId: "$me", memory: { tag: "dropped", weight: 1000 }, cause: { rule: "assoc.run.ends" } }],
      report: { sponsor: "You have drifted away from that life.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { sponsor: "You have drifted away from that life.", visibility: "known" },
  tags: ["associate", "runend", "followup"],
};

// =================================================================================================================
// 8. `assoc.proposal` (design 09 §4 row: "weight 10000 when proposta >= 750 and intakeOpen and me free").
// See the file header for the `checkPlayerPromotion` overlap this template inherits, not fixed here.
// =================================================================================================================

const BONES_GATE = [
  { fn: { name: "family.policyFlag", args: { role: "me", flag: "bonesRequired" } } },
  { not: { has: { role: "me", memoryTag: "murder" } } },
] as const;

const proposal: ProcessTemplate = {
  id: "assoc.proposal",
  version: 1,
  kind: "event",
  scope: "town",
  lane: "families",
  spawn: { weight: 10_000, per: "character", maxActivePerScope: 1, cooldownTurns: 8 }, // cooldown: with a bones rule the scene sent the player on the test and came back every week until it was done (story 1, 2026-09-25)
  roles: {
    me: ME_ROLE,
    sponsor: SPONSOR_ROLE,
    crew: { entity: "crew", from: { role: "sponsor", relation: "crewOf" }, pick: "first" },
    chief: { entity: "character", from: { role: "crew", relation: "chiefOf" }, pick: "first" },
  },
  preconditions: [
    PLAYER_FREE,
    { status: { role: "me", is: "free" } },
    { fn: { name: "progression.proposta", args: { role: "me", min: 750 } } },
    { fn: { name: "family.policyFlag", args: { role: "me", flag: "intakeOpen" } } },
  ],
  duration: 0, // a player decision is offered in the same run it spawns (scheduler, phase 6b)
  decision: {
    role: "me",
    prompt: "Word comes that the family wants to talk to you.",
    options: [{ id: "none", label: "Go to them", hint: "niente da portare, solo te stesso (nothing to bring, only yourself)", effects: [] }],
    aiDefault: "none",
    timeoutTurns: 1,
    timeoutOption: "none",
  },
  resolve: [
    {
      // "if the family has bonesRequired and me has no memory tag murder, the template instead schedules
      // assoc.favor.drive" (design 09 §4). `assoc.favor.drive` is owned by a parallel task's file
      // (associate-week.ts) and referenced here by id only, per the task brief; forcing that template's
      // "killing" outcome is that file's own concern, out of this file's reach.
      id: "bones",
      when: [{ decided: { optionId: "none" } }, ...BONES_GATE],
      effects: [{ schedule: { templateId: "assoc.favor.drive", delay: 1, bind: REPAY_BIND } }],
      report: { sponsor: "Before it is official, the family has one more thing to ask of you.", visibility: "known" },
    },
    {
      id: "made",
      when: [{ decided: { optionId: "none" } }, { not: { all: [...BONES_GATE] } }],
      effects: [
        { fact: "RankChange", characterId: "$me", rank: "soldier", cause: { rule: "assoc.proposal.made" } },
        { fact: "CrewMemberAdd", crewId: "$crew", characterId: "$me", cause: { rule: "assoc.proposal.made" } },
        { fact: "SuperiorSet", characterId: "$me", superiorId: "$chief", cause: { rule: "assoc.proposal.made" } },
        { fact: "UiLayerUnlock", layer: "loanBook", cause: { rule: "assoc.proposal.made" } },
        { fact: "MemoryAdd", characterId: "$me", memory: { tag: "made", weight: 200 }, cause: { rule: "assoc.proposal.made" } },
      ],
      report: { sponsor: "You are made; the family is yours now, and you answer to your new chief.", visibility: "known" },
    },
  ],
  followUps: [],
  report: { sponsor: "Word comes that the family wants to talk to you.", visibility: "known" },
  tags: ["associate", "proposal", "ceremony"],
};

export const ASSOCIATE_PEOPLE_TEMPLATES: ProcessTemplate[] = [
  rivalPoach,
  civilHelp,
  patrolStop,
  sponsorShort,
  sponsorRepay,
  feastChipIn,
  sponsorWarning,
  sponsorDropped,
  sponsorTakenOn,
  runEnds,
  proposal,
];

// Re-exported only so the file typechecks even if an option's `hint`/`effects` fields are read narrowly by a
// future test helper; not otherwise used here.
export type { DecisionOption };
