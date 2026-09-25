// Record system (design 09 §2, §3): the weekly counters behind la proposta and associate Weight. Read-only
// over the world (CLAUDE.md rule 1); emits `RecordDelta` for the progression owner to apply.
//
// Envelopes: every living associate who received income this turn (a collection landed in his personal
// account, per `world.ledger.turnIncome`, the same field `systems/shares.ts` reads) is paid up; otherwise he
// missed the week and his streak resets. No stream is needed: this system observes this turn's already-decided
// income, it does not roll anything of its own.
//
// Arrests: design 09 §2 also wants `record.arrests` bumped the turn a character's status *becomes* arrested.
// This system's signature is fixed to `(world, content)` with no log, and it runs after `applyShares` but
// before `recordRecentFacts` (step.ts) folds this turn's applied facts into `world.history.recentFacts` --
// so this turn's own StatusChange facts are not yet visible through that history, only through the mutated
// `world.characters` table itself, which does not say *when* a status changed. The only turn-stamped source
// available here is last turn's entry in `world.history.recentFacts` (written at the end of the previous
// `step()` call). We therefore detect an arrest one turn late: a character is credited with an arrest when
// (a) a `StatusChange` fact named him on exactly last turn, and (b) his status right now is still `arrested`
// -- condition (b) is what tells an arrest apart from a release or any other status change recorded that same
// turn, since `world.history.recentFacts` keeps the fact kind and subjects but not the fact's fields.
import type { Content } from "../content-types.js";
import type { Cause, Fact } from "../facts.js";
import type { World } from "../world.js";

export function recordStep(world: World, _content: Content): Fact[] {
  const facts: Fact[] = [];
  const lastTurn = world.meta.turn - 1;

  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.alive) continue;

    if (c.rank === "associate") {
      const income = world.ledger.turnIncome[c.accounts.personal] ?? 0;
      const cause: Cause = { rule: "record.weekly", actorId: c.id };
      if (income > 0) {
        facts.push({ kind: "RecordDelta", characterId: c.id, field: "weeksPaid", delta: 1, cause });
        facts.push({ kind: "RecordDelta", characterId: c.id, field: "streakPaid", delta: 1, cause });
      } else {
        facts.push({ kind: "RecordDelta", characterId: c.id, field: "weeksMissed", delta: 1, cause });
        facts.push({ kind: "RecordDelta", characterId: c.id, field: "streakPaid", delta: 0, set: true, cause });
      }
    }

    if (c.status === "arrested") {
      const arrestedLastTurn = world.history.recentFacts.some(
        (rf) => rf.turn === lastTurn && rf.kind === "StatusChange" && rf.subjects.includes(c.id),
      );
      if (arrestedLastTurn) {
        facts.push({ kind: "RecordDelta", characterId: c.id, field: "arrests", delta: 1, cause: { rule: "record.arrest", actorId: c.id } });
      }
    }
  }

  return facts;
}
