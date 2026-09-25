# Design 12: Obligations, the treasury and lifestyle (build plan phase 8, group 1)

Status: design, 2026-09-25, on the owner's "next phase" with new engine allowed. Requirements: FR-P (P-1 to P-5), PC-4, the U-1 "income below obligations" trigger of FR-U. Stories first (build plan §5b): §1; contracts §2; content §3; waves §4.

## 1. Stories

| Week | The player does | The player sees |
|---|---|---|
| Soldier, week n | The report says an associate of yours was arrested | A card: "Turi's mother has nothing coming in while he is inside." Options: support her (15 kL a week while he is held), pay a lawyer (30 kL once, he is out a week sooner), both, nothing. The Book gains a section "I miei doveri (my duties)": each open obligation, what it costs, when it is due, met or missed so far. |
| The weeks after | Pays or skips | Paid: a report line "You paid Turi's mother 15 kL" and the same in the modal; his loyalty holds and the flip roll reads the support. Skipped: "Turi's mother went without this week"; his loyalty drops and the next patrol that holds him rolls the flip against a man whose family was left alone. |
| Any rank | A crewmate dies (rare) | A card: the funeral; attend and pay a share (30 kL) or stay away. Staying away is an insult the crew remembers (loyalty toward the player's line, favor with the chief). |
| Any rank | Opens Ordini | "Tenore di vita (lifestyle)": modest, ordinary, lavish. The hint states the weekly cost, the respect (Weight) and the attention it draws. The header shows it. |
| Soldier and above | Watches the family | The Book shows the treasury as a band (rumor precision below head), and the report says when the treasury paid for a man of the family ("The family paid for Nino's lawyer"). When the family's income falls below its obligations for four weeks the newspaper and the report call the family weakened; loyalty across the family drifts down while it lasts. |
| Head (later) | Controls the treasury | Out of scope here: the panel to set the cut and approve payments arrives with the head rank. |

Acceptance: the flip rate for detained associates whose family was supported is at most half the rate for unsupported ones over 200 careers; every obligation due produces either a card or an automatic payment with a report line; treasury payments appear in the report; a weakened family is announced within a turn of the condition; lifestyle changes Weight and heat within a turn.

## 2. Contracts (owner)

State, owner `obligations` (a new reducer, inserted in `OWNER_ORDER` after `ledger`):

```ts
type ObligationKind = "prisonerSupport" | "lawyer" | "funeral" | "feast" | "fugitiveUpkeep" | "gift" | "charity";
type Obligation = {
  id: ObligationId; kind: ObligationKind;
  debtorId: CharacterId;                       // who owes it
  beneficiary: { kind: "character"; id } | { kind: "family"; id } | { kind: "external"; id: string };
  amount: KiloLire;                            // per due date
  everyTurns: number | null;                   // null: once
  nextDueTurn: number; untilTurn: number | null; // recurring ones end (release, a funeral has no until)
  met: number; missed: number; lastResult: "met" | "missed" | null;
  status: "open" | "closed";
};
// world.obligations: Table<Obligation>
// Character.lifestyle: "modest" | "ordinary" | "lavish" (owner characters; default ordinary)
// Family.state: "healthy" | "weakened" (owner families/territory as today; regency and dormant later)
```

Facts: `ObligationOpen { obligation }`, `ObligationDue { obligationId, debtorId, amount }` (logged, no state: templates spawn from it), `ObligationMet { obligationId, paidBy: "debtor" | "treasury" }` (state: met +1, next due), `ObligationMissed { obligationId }` (missed +1, next due), `ObligationClose { obligationId, reason }`, `LifestyleSet { characterId, lifestyle }` (owner characters), `FamilyStateSet { familyId, state }` (owner territory's family fields, as `policy` is).

System `obligationsStep` (after loans, before decays): for every open obligation due this turn: if the debtor is player-controlled, emit `ObligationDue` only (the card decides; a card that times out skips, which emits `ObligationMissed` through its outcome); if AI: pay from the debtor's purse, else from the family treasury when the debtor is a made man (`MoneyMove` or `MoneyDestroy` by beneficiary kind, then `ObligationMet` with `paidBy`), else `ObligationMissed`. Recurring obligations close when `untilTurn` passes or the condition ends (a prisoner released: the system closes prisonerSupport when the prisoner is free). Lifestyle: each turn `MoneyDestroy` 0, 5 or 40 kL (ordinary tuned from 10 at integration: an associate earns about 25 a week) (sink "lifestyle") from the character's purse when affordable; when not, the lifestyle falls to modest with a report line. Weight: `+0 / +10 / +30` term in `computeWeight` for every rank. Heat: `+0 / +1 / +3` per turn on the character's town from `exposureFromActivity` (visible wealth, design 03 §4). Family state: `weakened` when for four consecutive turns the family's income (all members' turnIncome plus treasury inflow) is below its open obligations' weekly total plus lifestyle costs; back to `healthy` after four turns above. While weakened, loyalty of members decays 2 points a week faster (design 03 §5's "its health is loyalty").

Flip roll: `state.flipRoll` already has a `familySupported` term; it reads the debtor's open prisonerSupport obligation with `lastResult === "met"` for the arrested character as beneficiary.

View: `PlayerView.book.duties: Array<{ id, kind, beneficiaryName, amount, dueIn, met, missed, status }>`; `PlayerView.you.lifestyle`; `PlayerView.family: { name, state, treasury: { precision, band | value } }`; report lines for `ObligationMet` (own and treasury-paid for a family man), `ObligationMissed`, `LifestyleSet`, `FamilyStateSet`. Action `setLifestyle { lifestyle }`, spec at every rank.

## 3. Content (templates)

- `oblig.prisoner.open`: spawnFrom `StatusChange` arrested where the man's superior or claim holder is the player: replaces `soldier.detained.support`'s one-off with a card that opens obligations: support (ObligationOpen prisonerSupport 15 every turn until release), lawyer (ObligationOpen lawyer 30 once; the release comes a turn sooner: `StatusChange` untilTurn shortened is a fact the reducer can accept as `DetentionShorten`, owner characters, or simpler: LoyaltyDelta +20 and a `MemoryAdd` the flip roll reads), both, nothing.
- `oblig.due.card`: spawnFrom `ObligationDue` for the player: pay (the move or destroy by beneficiary kind, then ObligationMet) or skip (ObligationMissed); immediate (duration 0), the amount and beneficiary in the prompt via role names; hint states the consequence by kind.
- `oblig.missed.prisoner`: spawnFrom `ObligationMissed` of kind prisonerSupport: LoyaltyDelta beneficiary −40, MemoryAdd "familyLeftAlone", report; the flip roll term reads the last result.
- `oblig.funeral`: spawnFrom `StatusChange` dead of a member of the player's crew or family: card attend and pay (ObligationOpen funeral 30 once, then met next turn by the due card) or stay away (favor chief −20, LoyaltyDelta of the dead man's subordinates toward the player's line, report).
- `oblig.feast` folds the existing feast card: chipping in opens and meets a feast obligation (the record of who gave is what the committee remembers).
- `family.weakened.news` and `family.recovered.news`: spawnFrom `FamilyStateSet`, newspaper lines.
- Lifestyle has no card: the order sets it; `lifestyle.fallen` spawnFrom `LifestyleSet` to modest with cause "unaffordable": a report line.

## 4. Waves

- Owner: contracts above (state, facts, reducer, system, view, action, weight and heat terms, family state), tests for the reducer and the system, the dependency table.
- Wave A (parallel): (a) content templates of §3 with scenario tests and the story `obligations.story.test.ts`; (b) interface: the duties section in the Book, the lifestyle order with its hint, the family line in the header, the treasury band; (c) harness: `careers` metrics for obligations met and missed, flip rate supported versus unsupported, weakened-family share; presets pay when they can (yesMan always, careful lawyer only, mixed support only).
- Gate: story passes on the starter and three seeds, careers bands, coverage of the new cards, catalogue regenerated, ten minutes of play with the question list.
