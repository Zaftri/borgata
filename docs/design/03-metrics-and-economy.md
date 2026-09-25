# Design 03: Metrics and Economy

Status: design, 2026-09-21. Defines the five meters (Weight, Attention with local heat, Exposure, Sentiment, loyalty), reputation facets, the money model, the chain (slot board) model, rank thresholds, turn length rules, and a reference turn with illustrative numbers. All numbers here are starting values for tuning, marked so. The harness (design 08) owns the bands they must stay within.

Units: meters are integers 0 to 1000 (Sentiment -1000 to 1000). Money is integer thousands of lire, written "kL". Probabilities are integers per 10,000.

---

## 1. Weight (power) — owner: progression

The answer to "how strong am I." Computed, never stored as truth.

```
Weight = clamp(0..1000,
    120 * ln(1 + menOnRecord)            // soldiers and associates whose claim chain ends at this character
  +  0.5 * territoryValue                // sum of business sizes on blocks under the character's crews, scaled
  +  80 * institutionsControlled
  +  tributePerTurn / 10                 // kL per turn flowing up to this character
  +  ownedAssetValue / 50                // clean-book value of family-owned businesses under the character
  +  votesDeliverable / 20
  +  standingBonus                        // average standing with district families, scaled to 0..100
)
```

Illustrative; design tuning replaces coefficients. Rank is not an input (review F-1). Weight is computed per character (for promotion) and per family (sum over the head's chain, for regency bids and the district).

Rank eligibility thresholds (illustrative): soldier 100, crew chief 250, administration 450, head 600 (plus vacancy and election), district head 750 (plus election by the district's heads). Promotion also needs favor (superior's loyalty toward the player above 600) and a vacancy or open intake (G3).

---

## 2. Attention (pressure) — owner: pressure

The answer to "how hard is the state looking." One metric with two time scales (D3).

**Local heat** per town, 0 to 1000. Rises with visible acts on that town; decays with a half-life of 4 weeks toward 0. Triggers raids and street arrests when above 300 and 600.

**Family Attention** 0 to 1000. Each turn: `attention += sum(heatInflow from towns the family holds) / 8 + directAdds - decay`, where decay moves it toward a floor with a half-life of 104 weeks. The floor is `20 * ln(familySize)`: a big family is never quiet.

**Provincial shared Attention** is the maximum family Attention in the province, scaled by 0.4, and is added to every family's effective Attention when tools are chosen: a loud neighbor brings the state to your door.

**Bands** (five, named for the interface):

| Band | Range | Name shown | Tools unlocked against the family |
|---|---|---|---|
| 0 | 0 to 199 | Quiet | Patrols, occasional raids on visible heat |
| 1 | 200 to 399 | Noticed | Informant network, a dedicated squad in the town |
| 2 | 400 to 599 | Watched | An investigating magistrate assigned, bugs and wiretaps |
| 3 | 600 to 799 | Targeted | Asset seizures, collaborator program at full strength, association case opens |
| 4 | 800 to 1000 | Besieged | Army in the streets, hard prison regime for jailed bosses, mass trial possible, the negotiation chain may fire |

Bands have hysteresis: a band is entered at its lower bound and left 50 below it, so a family does not flicker. Band changes are Facts (`ToolUnlock`) and are announced diegetically (G4).

**Direct adds** (illustrative): intimidation with damage +10 heat; a beating +25 heat; a killing with witnesses +120 heat and +40 Attention; a disappearance +40 heat and +15 Attention; a bomb +250 heat and +120 Attention; a killed politician +300 Attention; a killed magistrate or journalist +500 Attention and provincial +300; an arrest of a family member +10 Attention; lavish lifestyle +2 per turn per lavish character; a headline about the family +5 to +30 by prominence. Politicians and lawyers can buy down Attention by at most 40 per intervention with a cooldown, never below the floor.

---

## 3. Exposure — owner: evidence

The answer to "what would the state find." Per character. `exposure = min(1000, sum(item.weight))` over the dossier. Items never decay. They are removed only when their source dies or retracts (witness), or when a conviction consumes them (`CaseReset` moves items into the case record).

Item weights (illustrative): witnessed by a civilian 30; ordered through one buffer 20, through two 8; caught on a wire 60; named by a collaborator 90; found in seized documents 50; participated in a killing 120; owned the asset seized 40. Buffers discount the orderer's item by the number of intermediaries (D2).

Flip roll at arrest (D4): `pressure = sentenceExposure(exposure, chargeTier) + 300*ifMurderKnowledge + 200*ifOnTape + 400*ifFamilyThreatenedOrKilled + programTerms(band)`; `resistance = loyalty + 200*ifFamilySupported(P-1) + legitimacyBonus(D4a) - 300*ifOwnSideFearsHim`. Outcome by comparing pressure and resistance with a draw from the `flip` stream: silence, plea without cooperation, cooperation. Base rate is tuned so that across AI careers about one member in twenty cooperates (D6).

Addendum (2026-09-25, design 12 §1/§2): the roll itself no longer happens at the moment of arrest. It moves to an interrogation during detention (`state.detained.interrogation`, resolving in the second week held), so that a jailed man's supported family (`ifFamilySupported`) has had a turn to matter first; the formula above is unchanged.

---

## 4. Money and chains — owner: ledger and processes

**Accounts.** Every character, family (treasury), family-owned business and each external source has an account with `dirty` and `clean`. Only listed sources mint: civilian payments (protection tax, loan interest, gambling losses, contract percentages, smuggling sales, clean business revenue). Only listed sinks destroy: bribes to non-entities, lifestyle consumption, state seizures, lawyer fees to non-character lawyers. Everything else is a move.

**Shares.** Each superior sets, per subordinate, a share rule `{ fixedPerTurn: kL, percent: permille }`. The ledger applies shares at the end of income: subordinate account to superior account. The treasury cut (family policy, default 100 permille) moves from each share to the treasury. Skimming is a scheme (design 04) that reduces the declared income before shares.

**Laundering.** Each family-owned business has `launderCapacityPerTurn`. `Launder{account, amount}` converts dirty to clean up to capacity, minus a fee (default 200 permille). Dirty spend on visible things (lifestyle, asset purchase without nominee) adds `EvidenceAdd` and `AttentionDelta`.

**Chains as slot boards.** A chain instance is `{ templateId, familyId, slots: Record<slotName, filler | null>, throughput: number, lastRun }`. A slot filler is a character, a business, an institution slot, a route node or an off-map partner. A chain runs each turn when all required slots are filled: it mints or moves money by its template, adds evidence to each slot's character (each slot is an exposure point, B13), and may spawn events (a seizure, a partner arrested). Player and AI interact with chains only by filling and vacating slots; no per-turn routing.

Core chains and their slots (design 06 has the schemas):

| Chain | Slots | Runs |
|---|---|---|
| Protection tax | collectors (1..n characters), blocks | Weekly for size 1 to 2 businesses; at the three feasts for size 3 to 5 |
| Loans | lender (character), capital (account), borrowers (generated lazily) | Interest weekly at 3 to 5 percent; default converts collateral into a `BusinessOwnershipSet` |
| Gambling | venue (business with den function), banker, runners (1..3) | Weekly; income scales with town population and Sentiment |
| Laundering | fronts (family-owned businesses), accountant (optional, raises capacity 30 percent) | Each turn |
| Votes (light in core) | town blocks, feast committee, jobs provided | At elections; produces `VoteBlockSet` |
| Cigarettes (release) | supplier (off-map partner), mother ship (route leg), landing (route node), boats (business fishing), harbor warehouse (institution slot), distribution (crew) | Each turn; interdiction roll per leg |
| Heroin (release) | morphine supplier, import leg, refinery site (business with cover), chemist (character with skill), export buyer (off-map) | Each turn; enormous income; evidence on every slot; Commission ban check |
| Public works (release) | contract table seat, front firm (owned construction business), engineer (career), subcontract suppliers (owned businesses), politician | On each awarded contract; 3-2-2-1 split (B7) |
| Construction (release) | land (block), rezoning (politician favor), construction firm, materials (concrete plant), sales channel (nominee) | Multi-turn project; creates blocks (U-8) |

---

## 5. Sentiment, compliance, loyalty, favors, reputation

**Sentiment** per town, -1000 to 1000, owner towns. Moves toward 0 with a half-life of 52 weeks. Negative is against the family. Inputs (illustrative): a murdered merchant -150; a burned shop -40; a killed priest or journalist -400; feast sponsored +30 per year; petty crime kept low +2 per turn; a confiscated asset turned social -60; jobs provided +1 per ten jobs per turn; a refusing merchant who survives a year -80 and spawns an antagonist; a state squad arriving -20 (fear of the family drops) and reporting rates rise.

**Compliance** per business, derived probability of paying at a collection: `base(type) + fear*0.4 - sentimentAgainst*0.3 - stateCredibility*0.2 + protectionBenefit*0.1`, clamped. Refusal moves `refusalStage` up the ladder only when the player chooses (B6a).

**Loyalty** per character toward direct superior, owner relationships. Inputs: share kept relative to peers, protection delivered (arrests defended, family supported), promotions, insults, memory of dead kin, the superior's reputation facets, internal legitimacy of the family (D4a). Decays toward 500 with a half-life of 104 weeks.

**Favors** are a signed ledger between characters and between families, owner relationships: `favor(a,b)` in -1000 to 1000. Disputes read it; cooperation actions write it.

**Reputation facets** per character: feared, fair, greedy, weak, wordKept, talker; each 0 to 1000 with slow decay; written by rules in templates (`ReputationDelta`). Disputes, recruitment and AI decisions read them.

---

## 6. Turn length and crises

`turnLength` in weeks: associate and soldier 1; chief 2; administration and head 4. If any `CrisisFlag` is active, turnLength is 1. Crisis flags are set and cleared by templates: `war`, `campaign`, `trial` (player or key man on trial), `succession`, `magistrateArrival`, `operationPending` (optional, tuning decides), `negotiation`. Flags carry an expiry; the calendar reducer clears expired flags. A turn-length change emits `TurnLengthSet` with a cause the report renders in character (G1a).

Quiet turns: if the player's request queue is empty and no process needs a player decision, the interface offers "let the month pass" which submits an empty action set; the report still renders.

---

## 7. Reference turn (illustrative, for tuning and for the text slice)

A crew chief in a Palermo market-quarter neighborhood, one fortnight turn.

| Item | Amount (kL) |
|---|---|
| Protection tax from 38 stalls and small shops (size 1 to 2), 90 percent compliance, 30 kL per month each, two weeks | 513 |
| Feast collection due this turn from 6 size-3 shops at 400 kL each (Easter) | 2,400 |
| Loan book: 12,000 kL out at 4 percent per week, two weeks, 85 percent paying | 816 |
| Two gambling dens, town population 9,000, neutral Sentiment | 700 |
| Crew income before shares | 4,429 |
| Men keep (six soldiers, share rule 40 percent of their own take) | -1,300 |
| Treasury cut (100 permille of what moves up) | -313 |
| Envelope to the family expected this turn | -1,800 |
| Lawyer retainer, one associate in custody | -150 |
| Support to a jailed man's household | -120 |
| Crew chief's own take this turn | 746 |

The point of the table is the tension it shows: the envelope is the largest line; the feast collection is what makes the turn possible; a failed feast collection or a raid on a den turns the turn negative, and the crew chief chooses between his men's shares, the jailed man's family, and the envelope.

---

## 8. Difficulty presets

Presets scale: Attention floor and decay half-life, tool thresholds (shift bands by ±50), flip base rate (±30 percent), compliance base (±10 percent), AI aggression, and heat per act. Ironman is orthogonal.
