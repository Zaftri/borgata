// Economy invariants (build-plan §5b item 5; docs/retrospective-2026-09-24.md "requirements for prevention" 5):
// the arrows generation draws (claims, crews, blocks) that the chain and promotion systems read many turns
// later had no check of their own until now. Registered by importing this module from ./all.ts, the same
// convention every other invariant module in this directory uses.

import { claimsHeldBy } from "../reducers/claims.js";
import { registerHealthCheck, type Violation } from "../invariants.js";

/** "Every crew with living members has at least one block": a crew whose chief or soldiers are still alive but
 * that holds no block runs an empty protection-tax chain and its men collect nothing (2026-09-24 phase 6b
 * probe, docs/NOW.md). Structural, so (like invariants/generation.ts) it runs every turn, not only at
 * generation: a war or a succession that strips every block from a crew without disbanding it would be exactly
 * as bad turn 40 as turn 0. */
registerHealthCheck({
  name: "economy.crewHasBlock",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.crews.order) {
      const crew = world.crews.byId[id]!;
      const chief = world.characters.byId[crew.chiefId];
      const hasLivingMember = (chief?.alive ?? false) || crew.memberIds.some((mid) => world.characters.byId[mid]?.alive ?? false);
      if (!hasLivingMember) continue;
      if (crew.blockIds.length === 0) {
        out.push({ name: "economy.crewHasBlock", message: `crew ${id} has a living chief or soldier but holds no block` });
      }
    }
    return out;
  },
});

/** "Per crew, businesses on its blocks divided by its soldiers is at least 1.5": generation's own guarantee
 * (packages/sim/src/generation/families.ts caps soldiers at 6 per crew and never assigns more crews than
 * blocks) that a made man has enough shops to go around. This is a GENERATION-TIME check only, not a standing
 * one: play itself is free to move the ratio below 1.5 later (a business can be lost to a rival, a soldier can
 * be recruited without a matching business windfall), and policing that drift is `economy.madeManHasStall`'s
 * job below, not this one's. Registered as an ordinary invariant (world.meta.turn is readable from any
 * invariant, per invariants.ts's own `calendar.weekInRange`) rather than a bespoke non-invariant generation
 * check, guarded to a no-op past turn 0 -- the same shape generation.test.ts's own "over 200 seeds" sweep
 * already calls `runInvariants` with right after `generateWorld`, before any `step()`. A crew with zero
 * soldiers is skipped (the ratio is undefined, not violated): nothing to serve, nothing to divide by. */
registerHealthCheck({
  name: "economy.shopsPerSoldier",
  check(world): Violation[] {
    if (world.meta.turn !== 0) return [];
    const out: Violation[] = [];
    for (const id of world.crews.order) {
      const crew = world.crews.byId[id]!;
      const soldierCount = crew.memberIds.length;
      if (soldierCount === 0) continue;
      let businesses = 0;
      for (const blockId of crew.blockIds) businesses += world.geo.blocks.byId[blockId]?.businessIds.length ?? 0;
      // "at least 1.5" as integer math (CLAUDE.md rule 4: no floating-point literals in sim), since
      // businesses/soldierCount >= 1.5 iff businesses*2 >= soldierCount*3 for a positive soldierCount.
      if (businesses * 2 < soldierCount * 3) {
        const ratioTimes100 = Math.trunc((businesses * 100) / soldierCount);
        out.push({
          name: "economy.shopsPerSoldier",
          message: `crew ${id}: ${businesses} businesses / ${soldierCount} soldiers = ${Math.trunc(ratioTimes100 / 100)}.${String(ratioTimes100 % 100).padStart(2, "0")}, below 1.5`,
        });
      }
    }
    return out;
  },
});

/**
 * "Every living, free soldier who has been a soldier for ten or more turns holds at least one business claim":
 * the design's own fix for "a made man held no claim, so nothing was collected for him" (retrospective table,
 * row 1). Documented limit (the task brief's own instruction): no field on `Character` records the turn rank
 * changed to soldier. The only evidence of it at all is the `MemoryAdd` tag "made" that `assoc.proposal`'s own
 * ceremony outcome stamps on the PLAYER alone (packages/content/src/templates/associate-people.ts); every other
 * soldier -- everyone generation places directly in the rank at turn 0, and anyone a future AI promotion path
 * might create without an equivalent tag -- is assumed made at turn 0. This cannot distinguish "generated at
 * turn 0" from "silently promoted at turn 400 with no record of it": the invariant would wrongly demand a claim
 * ten turns after generation for the former (correct) and ten turns after an untagged promotion for the latter
 * (also correct, coincidentally, only because turn 0 is always at least 10 turns in the past once this ever
 * runs) -- it is the best available signal, not a precise one, until a `becameSoldierTurn` field exists.
 */
registerHealthCheck({
  name: "economy.madeManHasStall",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      if (!c.alive || c.status !== "free" || c.rank !== "soldier") continue;
      const madeMemory = c.memory.find((m) => m.tag === "made");
      const becameSoldierTurn = madeMemory ? madeMemory.turn : 0;
      if (world.meta.turn - becameSoldierTurn < 10) continue;
      const holdsBusiness = claimsHeldBy(world, c.id).some((claim) => claim.subject.kind === "business");
      if (!holdsBusiness) {
        out.push({
          name: "economy.madeManHasStall",
          message: `soldier ${id} has held no business claim for >=10 turns since becoming a soldier (assumed turn ${becameSoldierTurn})`,
        });
      }
    }
    return out;
  },
});

/** "After turn 20, every family treasury holds at least 150 kL dirty": the loan book's own capital floor
 * (design 09 §6: "Open the book" moves 400, or falls back to 150, from the CHIEF's personal purse, not the
 * family treasury directly -- but a family whose treasury itself cannot cover even the smaller amount is a
 * family that cannot keep its soldiers' books funded once their own purses run dry, design 09 §6's "a made
 * man's loan draws on the family treasury when his own purse is short", docs/NOW.md 2026-09-24). */
registerHealthCheck({
  name: "economy.treasuryCanFundBook",
  check(world): Violation[] {
    if (world.meta.turn <= 20) return [];
    const out: Violation[] = [];
    // The player's family only: a small island family with 140 kL is a small economy, not a defect; the check
    // exists so the player's own book can be funded (2026-09-24, sweep showed 5 of 40 families at 145 kL).
    const playerFamilyId = world.characters.byId[world.player.characterId]?.familyId;
    for (const id of world.families.order) {
      if (playerFamilyId && id !== playerFamilyId) continue;
      const family = world.families.byId[id]!;
      const account = world.ledger.accounts.byId[family.treasury];
      const dirty = account?.dirty ?? 0;
      if (dirty < 150) {
        out.push({ name: "economy.treasuryCanFundBook", message: `family ${id} treasury holds ${dirty} kL dirty at turn ${world.meta.turn}, below 150` });
      }
    }
    return out;
  },
});
