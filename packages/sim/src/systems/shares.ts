// Shares system (design 03 §4, §5): applies each superior's share rule to this turn's income and
// returns the Facts. Runs after chain and other income is applied, reading `world.ledger.turnIncome`
// and current balances; never mutates World.

import { applyPermille } from "@borgata/shared";
import type { Fact } from "../facts.js";
import type { World } from "../world.js";

/** Share rules at or above this percent (permille) are heavy: the subordinate resents it (design 03 §5). */
const HEAVY_SHARE_PERCENT = 500;
/** Share rules at or below this percent (permille) are fair: the subordinate appreciates it. */
const FAIR_SHARE_PERCENT = 300;
const HEAVY_SHARE_LOYALTY_DELTA = -4;
const FAIR_SHARE_LOYALTY_DELTA = 2;

/** Depth of a character in the superior chain (0 = no superior). Cycles are cut at 64. */
function chainDepth(world: World, id: string): number {
  let depth = 0;
  let cur = world.characters.byId[id];
  while (cur?.superiorId && depth < 64) {
    depth++;
    cur = world.characters.byId[cur.superiorId];
  }
  return depth;
}

export function applyShares(world: World): Fact[] {
  const facts: Fact[] = [];
  // Shares cascade upward (design 03 §4): a soldier's share is the crew chief's income, the chief's share is the
  // head's. Process the deepest characters first and count shares received in this pass as income, so a chief pays
  // the head out of what his men paid him this turn. Facts are applied in emission order by the ledger.
  const received: Record<string, number> = {};
  const paid: Record<string, number> = {};
  const order = [...world.characters.order].sort((a, b) => chainDepth(world, b) - chainDepth(world, a) || world.characters.order.indexOf(a) - world.characters.order.indexOf(b));

  for (const id of order) {
    const c = world.characters.byId[id]!;
    if (!c.alive) continue;
    if (!c.superiorId) continue;
    const superior = world.characters.byId[c.superiorId];
    if (!superior || !superior.alive) continue;
    const rule = superior.shareRules[c.id];
    if (!rule) continue;

    const acct = c.accounts.personal;
    const income = (world.ledger.turnIncome[acct] ?? 0) + (received[acct] ?? 0);
    const balance = (world.ledger.accounts.byId[acct]?.dirty ?? 0) + (received[acct] ?? 0) - (paid[acct] ?? 0);
    const share = Math.min(rule.fixedPerTurn + applyPermille(income, rule.percent), balance);
    if (share <= 0) continue;
    paid[acct] = (paid[acct] ?? 0) + share;
    received[superior.accounts.personal] = (received[superior.accounts.personal] ?? 0) + share;

    // The share move precedes the treasury cut move: the cut is taken from what the superior just
    // received, so the ledger must apply the share first (facts for the ledger owner keep emission order).
    facts.push({
      kind: "MoneyMove",
      from: c.accounts.personal,
      to: superior.accounts.personal,
      amount: share,
      money: "dirty",
      cause: { rule: "share", actorId: c.id },
    });

    if (c.familyId) {
      const family = world.families.byId[c.familyId];
      if (family) {
        const cut = applyPermille(share, family.policy.treasuryCut);
        if (cut > 0) {
          paid[superior.accounts.personal] = (paid[superior.accounts.personal] ?? 0) + cut;
          facts.push({
            kind: "MoneyMove",
            from: superior.accounts.personal,
            to: family.treasury,
            amount: cut,
            money: "dirty",
            cause: { rule: "share.treasuryCut", actorId: superior.id },
          });
        }
      }
    }

    if (rule.percent >= HEAVY_SHARE_PERCENT) {
      facts.push({ kind: "LoyaltyDelta", characterId: c.id, delta: HEAVY_SHARE_LOYALTY_DELTA, cause: { rule: "share.heavy" } });
    } else if (rule.percent <= FAIR_SHARE_PERCENT) {
      facts.push({ kind: "LoyaltyDelta", characterId: c.id, delta: FAIR_SHARE_LOYALTY_DELTA, cause: { rule: "share.fair" } });
    }
  }

  return facts;
}
