// The AI player stands in for the human in harness runs (design 08 §2). It drives the same PlayerAction API.
// Phase 6b (design 09 §10): presets differ in how they answer decision cards. Since 2026-09-25 every preset also
// plays the soldier opening (retrospective item 2: "careers play the soldier opening"): once made, it asks the
// chief for the book and for a man, and lends when the book is open, so careers and coverage reach the soldier
// cards instead of stopping at the ceremony.

import type { PlayerAction, World } from "@borgata/sim";

/** Legacy names kept for golden seeds; the phase 6b presets are yesMan, careful and mixed. */
export type Strategy = "quiet" | "loud" | "mixed" | "yesMan" | "careful";

export type AiPlayer = { strategy: Strategy; act(world: World, turn: number): PlayerAction[] };

/**
 * Option preference by preset (design 09 §10). An option matches a preference when its id starts with the given
 * prefix; the first match wins, and a preset with no match leaves the decision to the template's aiDefault.
 * The soldier cards: `ask` (the two permission scenes), `lawyer`/`mother`/`nothing` (a detained associate,
 * `soldier.detained.support` -- unregistered legacy, design 12 §3's own header; kept here only where harmless),
 * `accept`/`argue` (the chief's envelope), `lend`/`refuse` (the chief wants a man); the patrol stop: `silent`,
 * `talk`, `bribe`.
 *
 * Design 12 §3/§4 (obligations and the treasury): `oblig.prisoner.open` (support/lawyer/both/nothing),
 * `oblig.due.card` (pay/skip, any obligation kind) and `oblig.funeral` (attend/stayAway). Options are matched
 * in the *card's own* declared order (see `act()` below), not preference order, so a token only "wins" a card
 * when no earlier-declared option of that same card already matches -- this is why `both` (yesMan) needed
 * `lawyer` removed from its list first: `oblig.prisoner.open` declares `support`, `lawyer`, `both`, `nothing`
 * in that order, and yesMan's pre-existing `lawyer` (aimed at the now-unregistered legacy card above) would
 * otherwise win the new card before `both` is ever reached. That pre-existing `lawyer` token was harmless
 * everywhere else (`assoc.kid.caught`'s own `fine`, declared first, already wins that card for yesMan), so
 * dropping it here costs yesMan nothing else.
 */
const PREFERENCES: Record<Strategy, readonly string[]> = {
  quiet: [],
  loud: ["lean", "self", "bank", "ask", "lawyer", "accept", "lend", "bribe", "settle"],
  // Design 10 cards: the kid (collect/messages/nightOff, fine/lawyer/sit), the new owner (explain/sponsor/wait,
  // lieLow/lean/tell), the debtor (week/watch/forgive, chase/writeOff/tellSponsor), the witness (pay/scare/ignore),
  // the sponsor arrested (collect/skim/wife), the feud (sideA/sideB/split/ignore), the short man (confront/letGo/
  // squeeze), the bad loan (take/stock/extend).
  // Hotspot 5 (docs/event-storming-2026-09-25.md §3, 2026-09-25): `glue` (family.intimidation.choose, now
  // routed to the player himself when he is `holder` or `mine`) and `hold` (dispute.claim, routed to him as
  // `holder` or `poacher`) reach coverage for the new player-decided branches. `hold` is declared before `pay`
  // in disputes.ts's own options array precisely so this pre-existing `pay` entry (for situations-b.ts's own
  // card) cannot pre-empt it: `act()` below picks the first *offered* option, not the first preference.
  // Design 12: `both` (oblig.prisoner.open -- full protection, yesMan's usual maximalism) and `attend` (oblig.
  // funeral). `lawyer` dropped (see the header comment above this table) so `both` is reachable; `pay` was
  // already here (situations-b.ts's witness card) and doubles as `oblig.due.card`'s own "pay" for yesMan.
  // Design 13 (docs/design/13-disputes-to-the-district.md §4 wave c): `record` -- `dispute.district.sitdown`'s
  // "bring the claim record" approach, yesMan's usual deference to the paper trail (matches the existing `hold`
  // above at the family level). `accept` (war.meeting, peace) was already here from phase 6b and needs no
  // addition: it already wins that card since war.meeting's own options are declared `accept` before `refuse`
  // (task brief: "accept on favors... already match the preset's intent"). `hold` (family level, dispute.claim)
  // was already here too. No crew-level token is added for any preset (dispute.stall.crew's priorClaim/offer/
  // favor/stepBack): design 13 §4's own preset line names only the family, district and war levels, so a crew
  // quarrel falls to that template's own aiDefault for every preset, same as any other uncovered card.
  yesMan: ["accept", "lean", "bank", "help", "chip", "give", "ask", "lend", "silent", "outwork", "collect", "fine", "explain", "week", "chase", "pay", "split", "confront", "take", "glue", "hold", "both", "attend", "record"],
  // Hotspot 5: `none` (family.intimidation.choose -- let the shop be, careful's usual passivity) and `concede`
  // (dispute.claim -- give the shop up rather than fight).
  // Design 12: `lawyer` (oblig.prisoner.open -- careful pays for the lawyer, not the ongoing weekly support),
  // `pay` (oblig.due.card -- meets whatever obligation is due; also newly reaches `dispute.claim`'s own `pay`,
  // pre-empted there by careful's pre-existing `concede` declared first, and `assoc.witness.approach`'s `pay`,
  // not pre-empted: careful now pays the witness there instead of its previous `ignore`, a discovered side
  // effect of this addition, reported rather than silently avoided) and `attend` (oblig.funeral).
  // Design 13 §4 wave c: `gift` -- `dispute.district.sitdown`'s "a gift for the district head's family" approach,
  // careful's usual placating style (checked against `give`, the yesMan-only token for `assoc.sponsor.short`:
  // "gift" is not a prefix of "give" or vice versa, so no accidental match either way). `accept` (war.meeting,
  // peace) is deliberately *not* added here as a global token: `chief.demand.envelope` declares its own options
  // `accept` before `argue`, and careful already relies on its pre-existing `argue` token to win that card; a
  // global `accept` would out-rank it there (accept declared first) and silently flip careful from arguing the
  // envelope to paying it. `act()` below instead prepends `accept` to this preset's list only for the
  // `war.meeting` instance, the same scoped-override pattern already used for careful's `assoc.favor.note`.
  careful: ["decline", "tell", "borrow", "skip", "quiet", "refuse", "fee", "ask", "mother", "argue", "silent", "cutIn", "messages", "sponsor", "forgive", "writeOff", "ignore", "wife", "letGo", "extend", "lieLow", "none", "concede", "lawyer", "pay", "attend", "gift"],
  // Hotspot 5: `glue` (a middling, hands-on answer) and `pay` (already offered by situations-b.ts's own card;
  // dispute.claim's own `pay` reuses it, exactly as yesMan's pre-existing `pay` reuses it for its own card).
  // Design 12: `support` (oblig.prisoner.open -- the ongoing weekly obligation, not the lawyer) and `stayAway`
  // (oblig.funeral). `pay` was already here and doubles as `oblig.due.card`'s own "pay" for mixed.
  // Design 13 §4 wave c: `hold` (dispute.claim, family level -- mixed stands its ground like yesMan does) and
  // `witness` (dispute.district.sitdown -- brings evidence the other man came armed, mixed's harder edge; matches
  // its existing `rat`/`scare`). `refuse` (war.meeting) is *not* added as a global token: mixed's pre-existing
  // `accept` (index 0, kept from phase 6b for `chief.demand.envelope`) is declared before `refuse` in
  // war.meeting's own options too, so a global `refuse` would never be reached -- mixed would always accept.
  // Design 13 §1's story wants a war to actually happen for a turn before peace, so `act()` below refuses the
  // *first* war.meeting this preset ever sees (a scoped override, `accept` dropped from the candidate list only
  // for that one decision) and accepts every one after, via the ordinary `accept` token already in this list.
  mixed: ["accept", "tell", "borrow", "help", "chipIn", "ask", "lawyer", "lend", "silent", "rat", "collect", "fine", "explain", "watch", "scare", "skim", "sideA", "squeeze", "stock", "glue", "pay", "support", "stayAway", "hold", "witness"],
};

/** How often a preset repeats an ask the chief has not granted (turns). */
const ASK_EVERY = 8;

export function makeAiPlayer(strategy: Strategy): AiPlayer {
  const prefs = PREFERENCES[strategy];
  const lastAsked: Record<"openBook" | "makeAssociate", number> = { openBook: -ASK_EVERY, makeAssociate: -ASK_EVERY };
  // Design 13 §4 wave c: mixed refuses its first war.meeting, then accepts every one after (see the `mixed`
  // header comment above `PREFERENCES`). One flag per AiPlayer instance, i.e. per career, matching `lastAsked`.
  let mixedRefusedAWarMeeting = false;
  return {
    strategy,
    act(world: World, turn: number): PlayerAction[] {
      if (prefs.length === 0) return [];
      const actions: PlayerAction[] = [];
      for (const inst of Object.values(world.processes.byId)) {
        if (inst.state !== "awaitingDecision" || !inst.decision) continue;
        // The harness has no template here; a decision is the player's when the player holds a role in it
        // (design 09 templates bind the player as the deciding role, never as a bystander).
        const mine = Object.values(inst.roles).some((r) => r.kind === "character" && world.characters.byId[r.id]?.playerControlled);
        if (!mine) continue;
        // The careful man takes the quiet favor (a note) and declines the rest (design 09 §10).
        let localPrefs = strategy === "careful" && inst.templateId === "assoc.favor.note" ? ["accept", ...prefs] : prefs;
        // Design 13 §4 wave c, scoped overrides (see the `careful` and `mixed` header comments above
        // `PREFERENCES` for why these are not global tokens):
        if (strategy === "careful" && inst.templateId === "war.meeting") localPrefs = ["accept", ...prefs];
        if (strategy === "mixed" && inst.templateId === "war.meeting" && !mixedRefusedAWarMeeting) {
          localPrefs = ["refuse"]; // excludes this preset's own global `accept`, which would otherwise win first
          mixedRefusedAWarMeeting = true;
        }
        const option = inst.decision.options.find((o) => localPrefs.some((p) => o.startsWith(p)));
        if (option) actions.push({ kind: "decide", instanceId: inst.id, optionId: option });
      }

      // The soldier opening (design 09 §6).
      const me = world.characters.byId[world.player.characterId];
      if (me && me.alive && me.status === "free" && me.rank === "soldier") {
        const bookOpen = me.memory.some((m) => m.tag === "bookOpen");
        const hasMan = world.characters.order.some((id) => {
          const c = world.characters.byId[id]!;
          return c.alive && c.rank === "associate" && c.onRecordWith === me.id;
        });
        if (!bookOpen && turn - lastAsked.openBook >= ASK_EVERY) {
          actions.push({ kind: "askPermission", what: "openBook" });
          lastAsked.openBook = turn;
        }
        if (!hasMan && turn - lastAsked.makeAssociate >= ASK_EVERY) {
          actions.push({ kind: "askPermission", what: "makeAssociate" });
          lastAsked.makeAssociate = turn;
        }
        // Lend 100 at 4 points to a shop in the family's towns that has no loan from me yet, while cash allows
        // and at most three loans out (the careful man lends at 3 points, the loud one at 6).
        const cash = world.ledger.accounts.byId[me.accounts.personal]?.dirty ?? 0;
        if (bookOpen && me.loans.length < 3 && cash >= 160) {
          const family = me.familyId ? world.families.byId[me.familyId] : undefined;
          let target: string | undefined;
          for (const townId of family?.townIds ?? []) {
            for (const blockId of world.geo.towns.byId[townId]?.blockIds ?? []) {
              for (const businessId of world.geo.blocks.byId[blockId]?.businessIds ?? []) {
                if (!me.loans.some((l) => l.borrower.kind === "business" && l.borrower.id === businessId)) { target = businessId; break; }
              }
              if (target) break;
            }
            if (target) break;
          }
          if (target) actions.push({ kind: "lend", businessId: target, principal: 100, points: strategy === "careful" ? 3 : strategy === "loud" ? 6 : 4 });
        }

        // Lifestyle (design 12 §1, §2): a made man's default stays "modest" (`RankChange` does not touch it,
        // packages/sim/src/reducers/characters.ts), so the three presets diverge only by what they *ask* for
        // once made. yesMan reaches for lavish as soon as he can afford it; mixed settles for the ordinary,
        // unremarkable made-man's life; careful asks for nothing, so he simply stays at the "modest" he already
        // carries over from being an associate -- no action needed, and `setLifestyle` would reject a request
        // for the lifestyle he is already living (systems/player-actions.ts's own "already living that way").
        if (strategy === "yesMan" && me.lifestyle !== "lavish" && cash >= 200) {
          actions.push({ kind: "setLifestyle", lifestyle: "lavish" });
        } else if (strategy === "mixed" && me.lifestyle !== "ordinary") {
          actions.push({ kind: "setLifestyle", lifestyle: "ordinary" });
        }
      }
      return actions;
    },
  };
}
