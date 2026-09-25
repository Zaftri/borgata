// Obligations, lifestyle and the family's health (design 12 §2). Runs after loans, before decays.
//  - Due obligations: the player's raise `ObligationDue` (a card decides); an AI debtor pays from his purse, else
//    from his family's treasury when he is a made man, else misses.
//  - Recurring obligations close when their condition ends (a prisoner released) or `untilTurn` passes.
//  - Lifestyle: its weekly cost leaves the purse as a sink; when the purse cannot pay, the man falls to modest.
//  - Family state: `weakened` after four turns with income below obligations plus lifestyle, `healthy` after four above.
import type { CharacterId } from "@borgata/shared";
import type { Content } from "../content-types.js";
import type { Cause, Fact } from "../facts.js";
import { LIFESTYLE_COST, type Character, type Obligation, type World } from "../world.js";

export const WEAKENED_AFTER_TURNS = 4;

// Design 12 §3 (content task): the player's due card cannot construct `ObligationMet`/`ObligationMissed`
// itself. `Bindings` (engine/roles.ts, engine/predicates.ts, engine/effects.ts) only ever holds `EntityRef`s
// (kind + id) bound from `spawnFrom`'s `field`; there is no path for a raw scalar fact field (`obligationId`)
// to reach an effect's `Fact` value the way `$role`/`$role.account` reach a bound entity (`resolveRoleRef`,
// engine/effects.ts, has no case that returns an arbitrary field off the originating fact). Widening that
// (a non-entity value slot in `Bindings`, or string interpolation in `resolveValue` so a tag could read
// "paid:$obligationId") would touch engine/effects.ts, engine/roles.ts and engine/predicates.ts, files this
// task does not own and which parallel content tasks are editing against the same engine surface. So
// `oblig.due.card`'s "pay"/"skip" options (packages/content/src/templates/obligations.ts) each leave a
// same-turn `MemoryAdd` marker instead, exactly the fallback the task brief names; this system reads it here
// and does the actual payment/miss itself, the same way it already does for an AI debtor below.
// Gap (reported, not fixed): the marker is generic, not tied to one obligation id, because content cannot
// name the id. When a debtor has more than one obligation due the very same turn (e.g. the "both" outcome of
// `oblig.prisoner.open` opening prisonerSupport and lawyer together, both due `$turn`), a single "pay" or
// "skip" answered for whichever due card actually spawned (`oblig.due.card`'s `maxActivePerScope: 1` admits
// only one card at a time per debtor, so this is rarer in play than it sounds) is applied to every one of that
// debtor's obligations that are due this same turn, not only the one the card was showing. Acceptable for now:
// every story this task's brief lists exercises exactly one due obligation at a time.
const PLAYER_OBLIGATION_PAY_TAG = "obligationPay";
const PLAYER_OBLIGATION_SKIP_TAG = "obligationSkip";

function accountDirty(world: World, accountId: string): number {
  return world.ledger.accounts.byId[accountId]?.dirty ?? 0;
}

/** The obligation's beneficiary character id, when it has one (design 12 §3: `ObligationMissed.beneficiaryId`). */
function beneficiaryCharacterId(o: Obligation): CharacterId | undefined {
  return o.beneficiary.kind === "character" ? o.beneficiary.id : undefined;
}

function missedFact(o: Obligation, cause: Cause): Fact {
  const beneficiaryId = beneficiaryCharacterId(o);
  return { kind: "ObligationMissed", obligationId: o.id, debtorId: o.debtorId, obligationKind: o.kind, ...(beneficiaryId ? { beneficiaryId } : {}), cause };
}

function beneficiaryAccount(world: World, o: Obligation): { to: string; external: boolean } | null {
  if (o.beneficiary.kind === "character") {
    const c = world.characters.byId[o.beneficiary.id];
    return c ? { to: c.accounts.personal, external: false } : null;
  }
  if (o.beneficiary.kind === "family") {
    const f = world.families.byId[o.beneficiary.id];
    return f ? { to: f.treasury, external: false } : null;
  }
  return { to: o.beneficiary.id, external: true };
}

/** The facts that pay an obligation from `fromAccount`: a move to a character or family, a sink to an external. */
export function paymentFacts(world: World, o: Obligation, fromAccount: string, cause: Cause): Fact[] | null {
  const target = beneficiaryAccount(world, o);
  if (!target) return null;
  if (target.external) return [{ kind: "MoneyDestroy", from: fromAccount as never, amount: o.amount, money: "dirty", sink: `obligation.${o.kind}`, cause }];
  return [{ kind: "MoneyMove", from: fromAccount as never, to: target.to as never, amount: o.amount, money: "dirty", cause }];
}

function conditionEnded(world: World, o: Obligation): boolean {
  if (o.untilTurn !== null && world.meta.turn > o.untilTurn) return true;
  if (o.kind === "prisonerSupport" && o.beneficiary.kind === "character") {
    const prisoner = world.characters.byId[o.beneficiary.id];
    return !prisoner || !prisoner.alive || prisoner.status !== "arrested";
  }
  const debtor = world.characters.byId[o.debtorId];
  return !debtor || !debtor.alive;
}

export function obligationsStep(world: World, _content: Content): Fact[] {
  const facts: Fact[] = [];
  const turn = world.meta.turn;

  for (const id of world.obligations.order) {
    const o = world.obligations.byId[id]!;
    if (o.status !== "open") continue;
    if (conditionEnded(world, o)) {
      facts.push({ kind: "ObligationClose", obligationId: o.id, reason: "condition ended", cause: { rule: "obligations.close" } });
      continue;
    }
    if (o.nextDueTurn > turn) continue;
    const debtor = world.characters.byId[o.debtorId];
    if (!debtor) continue;
    const cause: Cause = { rule: `obligation.${o.kind}`, actorId: debtor.id };
    const purse = debtor.accounts.personal;
    if (debtor.playerControlled) {
      // `oblig.due.card` (content) offers pay/skip and, unable to name this obligation's id itself (see this
      // file's header), leaves a same-turn `MemoryAdd` marker instead of an effect this system can trust
      // blindly; this reads it back rather than always re-raising `ObligationDue`.
      const answeredThisTurn = debtor.memory.filter((m) => m.turn === turn);
      const paid = answeredThisTurn.some((m) => m.tag === PLAYER_OBLIGATION_PAY_TAG);
      const skipped = !paid && answeredThisTurn.some((m) => m.tag === PLAYER_OBLIGATION_SKIP_TAG);
      if (paid) {
        // The player pays personally, from his own purse only: unlike an AI made man, the family treasury is
        // not his to draw on yet (design 12 §1: the treasury panel is head-rank, out of scope here).
        if (accountDirty(world, purse) >= o.amount) {
          const pay = paymentFacts(world, o, purse, cause);
          if (pay) {
            facts.push(...pay, { kind: "ObligationMet", obligationId: o.id, paidBy: "debtor", cause });
            continue;
          }
        }
        facts.push(missedFact(o, cause));
        continue;
      }
      if (skipped) {
        facts.push(missedFact(o, cause));
        continue;
      }
      facts.push({ kind: "ObligationDue", obligationId: o.id, debtorId: debtor.id, amount: o.amount, obligationKind: o.kind, cause });
      continue;
    }
    // An AI debtor: his purse, else the treasury for a made man, else he misses.
    const family = debtor.familyId ? world.families.byId[debtor.familyId] : undefined;
    const madeMan = debtor.rank !== "associate" && debtor.rank !== "civilian";
    let from: string | null = null;
    let paidBy: "debtor" | "treasury" = "debtor";
    if (accountDirty(world, purse) >= o.amount) from = purse;
    else if (madeMan && family && accountDirty(world, family.treasury) >= o.amount) { from = family.treasury; paidBy = "treasury"; }
    if (from) {
      const pay = paymentFacts(world, o, from, cause);
      if (pay) {
        facts.push(...pay, { kind: "ObligationMet", obligationId: o.id, paidBy, cause });
        continue;
      }
    }
    facts.push(missedFact(o, cause));
  }

  // Lifestyle: the weekly cost, or the fall to modest.
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.alive || c.lifestyle === "modest") continue;
    const cost = LIFESTYLE_COST[c.lifestyle] * world.meta.turnLength;
    const cause: Cause = { rule: "lifestyle.cost", actorId: c.id };
    if (accountDirty(world, c.accounts.personal) >= cost) {
      facts.push({ kind: "MoneyDestroy", from: c.accounts.personal, amount: cost, money: "dirty", sink: "lifestyle", cause });
    } else {
      facts.push({ kind: "LifestyleSet", characterId: c.id, lifestyle: "modest", cause: { rule: "lifestyle.unaffordable", actorId: c.id } });
    }
  }

  // Family health: income against duties, four turns each way; the streak is family state (owner territory).
  for (const fid of world.families.order) {
    const family = world.families.byId[fid]!;
    if (family.state !== "healthy" && family.state !== "weakened") continue;
    const members = familyMembers(world, family.id);
    const income = members.reduce((n, c) => n + (world.ledger.turnIncome[c.accounts.personal] ?? 0), 0);
    const duties = world.obligations.order
      .map((oid) => world.obligations.byId[oid]!)
      .filter((o) => o.status === "open" && members.some((c) => c.id === o.debtorId))
      .reduce((n, o) => n + (o.everyTurns ? o.amount : 0), 0)
      + members.reduce((n, c) => n + LIFESTYLE_COST[c.lifestyle], 0);
    const short = income < duties;
    const prev = family.shortfallStreak;
    const next = short ? Math.max(1, prev + 1) : Math.min(-1, prev - 1);
    if (next !== prev) facts.push({ kind: "FamilyShortfallSet", familyId: family.id, streak: next, cause: { rule: short ? "family.shortfall" : "family.surplus" } });
    if (family.state === "healthy" && next >= WEAKENED_AFTER_TURNS) facts.push({ kind: "FamilyStateSet", familyId: family.id, state: "weakened", cause: { rule: "family.incomeBelowDuties" } });
    if (family.state === "weakened" && next <= -WEAKENED_AFTER_TURNS) facts.push({ kind: "FamilyStateSet", familyId: family.id, state: "healthy", cause: { rule: "family.recovered" } });
  }
  return facts;
}

export function familyMembers(world: World, familyId: string): Character[] {
  const out: Character[] = [];
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (c.alive && c.familyId === familyId && c.rank !== "civilian") out.push(c);
  }
  return out;
}

/** True when the arrested character's family has been supported at least once and has not since been left
 * without (design 12: the flip roll reads it). `met >= 1` rather than `lastResult === "met"` (2026-09-25, the
 * flip's own move to `state.detained.interrogation`, packages/content/src/templates/state.ts): the interrogation
 * resolves in the *second* week of detention, one or more turns after `oblig.prisoner.open`'s "support"/"both"
 * pays the first week immediately (obligations.ts's own comment on that), so by the time the flip is rolled the
 * obligation's `lastResult` may already have advanced past that first `ObligationMet` to a later turn's result --
 * `met >= 1` asks "was this family ever supported", not "was it supported on the most recent due date". A family
 * supported once and then abandoned is still excluded: `lastResult !== "missed"` requires the *last* due date to
 * not have been missed, so a support obligation that lapses (skipped, or the debtor runs dry) stops counting the
 * turn it lapses, exactly as design 12's "supported ... then abandoned is not supported" asks. */
export function prisonerSupported(world: World, prisonerId: CharacterId): boolean {
  return world.obligations.order.some((id) => {
    const o = world.obligations.byId[id]!;
    return (
      o.status === "open" &&
      o.kind === "prisonerSupport" &&
      o.beneficiary.kind === "character" &&
      o.beneficiary.id === prisonerId &&
      o.met >= 1 &&
      o.lastResult !== "missed"
    );
  });
}
