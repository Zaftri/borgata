// Chains system (design 03 §4, B13): runs every chain instance for the turn and returns the Facts it
// produces. Chains never mutate World; the step applies the returned Facts through the owner reducers.

import { claimOnSubject } from "../reducers/claims.js";
import type { Content } from "../content-types.js";
import type { Cause, Fact } from "../facts.js";
import { getStream } from "../rng.js";
import { complianceChance } from "../reducers/towns.js";
import type { CharacterId } from "@borgata/shared";
import type { Character, World } from "../world.js";

/** Weekly tariff (kL) for size 1-2 businesses, scaled by `world.meta.turnLength` weeks (design 03 §4). */
export const WEEKLY_TARIFF: Readonly<Record<1 | 2, number>> = { 1: 8, 2: 20 };

/** Tariff (kL) due once for size 3-5 businesses at each feast the turn's week window covers (design 03 §4). */
export const FEAST_TARIFF: Readonly<Record<3 | 4 | 5, number>> = { 3: 400, 4: 1500, 5: 5000 };

/** The three feast weeks: Easter (15), mid-August (33), Christmas (52) (design 03 §4). */
const FEAST_WEEKS: readonly number[] = [15, 33, 52];

/**
 * The feast weeks (a subset of [15, 33, 52]) covered by the turn's week window
 * `[week, week + turnLength - 1]`, wrapping past week 52 back to week 1 of the next year.
 */
export function feastsInWindow(week: number, turnLength: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < turnLength; i++) {
    const w = ((week - 1 + i) % 52) + 1;
    if (FEAST_WEEKS.includes(w) && !out.includes(w)) out.push(w);
  }
  return out;
}

export function runChains(world: World, _content: Content): Fact[] {
  const facts: Fact[] = [];
  const feastDue = feastsInWindow(world.meta.calendar.week, world.meta.turnLength).length > 0;
  const stream = getStream(world.rng, "chains.protectionTax");

  for (const chainId of world.chains.order) {
    const chain = world.chains.byId[chainId]!;
    if (chain.templateId !== "chain.protectionTax") continue;

    const collectorFillers = chain.slots["collectors"];
    const blockFillers = chain.slots["blocks"];
    if (!collectorFillers || collectorFillers.length === 0) continue;
    if (!blockFillers || blockFillers.length === 0) continue;

    // Living, free collectors, in slot order (dead or unavailable men do not collect this turn).
    const collectors: Character[] = [];
    for (const filler of collectorFillers) {
      if (filler.kind !== "character") continue;
      const c = world.characters.byId[filler.id];
      if (c && c.alive && c.status === "free") collectors.push(c);
    }
    if (collectors.length === 0) continue;
    // Who collects which shop (design 03 §4, design 09 §1). A claimed shop belongs to its holder's round: one of
    // the associates on record with him collects it (round-robin among them), or he does himself when he has
    // none. Unclaimed shops go round-robin over the remaining collectors, associates before men of honor and the
    // player first among associates (his weekly round is the game's first loop). Before 2026-09-24 every shop
    // went round-robin over all collectors regardless of claims, so a soldier with claims and an associate
    // often collected nothing: the crew had more men than shops.
    const key = (c: Character): number => (c.rank === "associate" ? 0 : 2) + (c.playerControlled ? 0 : 1);
    collectors.sort((a, b) => key(a) - key(b));
    const atWar = world.families.byId[chain.familyId]?.warWith !== null && world.families.byId[chain.familyId]?.warWith !== undefined;
    const collectorById = new Map(collectors.map((c) => [c.id, c]));
    const associatesOf = new Map<CharacterId, Character[]>();
    for (const c of collectors) {
      if (c.rank !== "associate" || !c.onRecordWith) continue;
      const list = associatesOf.get(c.onRecordWith) ?? [];
      list.push(c);
      associatesOf.set(c.onRecordWith, list);
    }
    const roundOf = new Map<CharacterId, number>();

    let businessIndex = 0;
    for (const blockFiller of blockFillers) {
      if (blockFiller.kind !== "block") continue;
      const block = world.geo.blocks.byId[blockFiller.id];
      if (!block) continue;

      for (const businessId of block.businessIds) {
        const business = world.geo.businesses.byId[businessId];
        if (!business) continue;
        const holderId = claimOnSubject(world, { kind: "business", id: business.id })?.holderId;
        const holder = holderId ? collectorById.get(holderId) : undefined;
        let collector: Character;
        if (holder) {
          const men = associatesOf.get(holder.id);
          if (men && men.length > 0) {
            const n = roundOf.get(holder.id) ?? 0;
            collector = men[n % men.length]!;
            roundOf.set(holder.id, n + 1);
          } else {
            collector = holder;
          }
        } else {
          collector = collectors[businessIndex % collectors.length]!;
          businessIndex++;
        }

        if (business.refusalStage >= 1) continue; // squared refusers pay nothing

        const size = business.size;
        let amount: number | null = null;
        if (size === 1 || size === 2) {
          amount = WEEKLY_TARIFF[size] * world.meta.turnLength;
          if (atWar) amount = Math.max(1, Math.floor(amount / 2)); // design 13: a family at war collects half
        } else if (feastDue) {
          amount = FEAST_TARIFF[size];
        }
        if (amount === null) continue; // size 3-5, no feast due this turn

        const cause: Cause = { rule: "chain.protectionTax", instanceId: chain.id, actorId: collector.id, subjectId: business.id };
        if (stream.chance(complianceChance(world, business.id))) {
          facts.push({ kind: "MoneyMint", to: collector.accounts.personal, amount, money: "dirty", source: "protectionTax", cause });
        } else {
          // The shop learned refusal is survivable this time.
          facts.push({ kind: "ComplianceDelta", businessId: business.id, delta: -20, cause: { rule: "chain.protectionTax", instanceId: chain.id } });
          facts.push({ kind: "CollectionMissed", businessId: business.id, collectorId: collector.id, cause: { rule: "chain.protectionTax", instanceId: chain.id, actorId: collector.id } });
        }
      }
    }
  }

  return facts;
}
