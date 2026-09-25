# Design 10: More situations, with follow-ups (phase 6c)

Status: design, 2026-09-25, from the owner's request after the phase 6b sessions ("more situations; some with follow-up decisions"). Everything runs on the existing engine and the phase 6b conventions (design 09 §4, §12): lane `families` unless noted, `per: "character"` bound to the player, `duration: 0`, decision role `me`, hints and report lines on every option and outcome (content validation enforces both), `spawn.cooldownTurns` so the same rare card never returns within four weeks. Follow-ups are `schedule` effects that bind the people of the first card into the second, so the second card knows who it is about.

Written in the catalogue format (build plan §5b item 8): trigger, options with cost, outcomes with odds. Numbers are starting values; the harness metrics in design 09 §10 own the bands.

## Decisions taken with the four open items of 2026-09-24

1. Card density: a weekly card for the kid (§1) and five rarer chains raise the share of weeks with two or more cards; measured after landing, target 90 percent (first-ranks §8 story 1).
2. Repeats: `spawn.cooldownTurns: 4` on every rare card; the weekly cards (game, kid) are meant to repeat.
3. Bad favors: witness odds lowered (drive 5 percent, door 4 percent); the band stays 5 to 15 and counts arrests, witnesses, murders and deaths.
4. The careful man: favor now fades toward zero with a half-life of a year, so old refusals stop counting; the drop rule (five in a row) stands as story 5 asks.

## 1. The kid's errand (`assoc.kid.errand`, weekly, weight 6000, needs the `kid` on record with me)

Trigger: most weeks the kid needs telling what to do. Cooldown 1.

| Option | Cost in words | Outcomes |
|---|---|---|
| `collect` Send him for the small debts | He brings 8 to 12 kL. One time in eight a patrol picks him up, and that is a card next week. | `brought` 87%: MoneyMint me +10, kid loyalty +5. `caught` 13%: StatusChange kid arrested 2 turns, RecordDelta? no; schedule `assoc.kid.caught` next turn bound kid. |
| `messages` Keep him running messages | Nothing today; your sponsor notices a boy who is useful (favor +5 one week in three). | `useful` 33%: FavorDelta sponsor→me +5. `quiet` 67%: nothing, report "The kid ran his messages." |
| `nightOff` Give him the night off | He remembers it. Nothing earned. | `rested` 100%: LoyaltyDelta kid +15. |

### Follow-up `assoc.kid.caught` (scheduled, decision by me, bound `kid`)

"The patrol has the kid at the station. He has not said a word yet."

| Option | Cost | Outcomes |
|---|---|---|
| `fine` Pay the fine | 15 kL, he is out tonight and loyal. | `out`: MoneyDestroy 15 sink "fine", StatusChange kid free, LoyaltyDelta kid +30. |
| `lawyer` Ask your sponsor's lawyer | Costs favor (−10); the sponsor learns the kid was collecting for you. | `out`: FavorDelta −10, StatusChange kid free, MemoryAdd sponsor "kidCollects" about me. |
| `sit` Let him sit | Free. Two nights in the cell: loyalty −40, and one time in five he names you (EvidenceAdd me 20 testimony). | `sat` 80%: LoyaltyDelta kid −40. `named` 20%: LoyaltyDelta −40, EvidenceAdd me 20 source testimony. |

## 2. The new owner (`assoc.shop.newOwner`, weight 900, cooldown 8, per business on my round: bind `shop` from a business on the sponsor's crew blocks)

"The bar on the corner changed hands. The new man does not know the arrangement."

| Option | Cost | Outcomes |
|---|---|---|
| `explain` Explain it yourself, gently | Usually he understands (compliance +80). One time in four he takes it to the police: a card next week. | `understood` 75%: ComplianceDelta shop +80, report. `reported` 25%: EvidenceAdd me 15 witness, schedule `assoc.shop.reported` next turn bound shop. |
| `sponsor` Let your sponsor introduce himself | Done properly, no risk to you; favor −10 (you could not handle it). | `introduced`: ComplianceDelta shop +120, FavorDelta −10. |
| `wait` Wait and see | Nothing now. Half the time he refuses when the collector comes (refusal stage 1, compliance −60). | `paid` 50%: nothing. `refused` 50%: RefusalStage shop 1 (if the fact exists; else ComplianceDelta −100), report. |

### Follow-up `assoc.shop.reported` (bound shop, decision by me)

"The new owner went to the station. A patrolman asked about you by name."

| Option | Cost | Outcomes |
|---|---|---|
| `lieLow` Lie low a month | No collections from that shop for 4 turns (MemoryAdd me "lyingLow"; the late payer card does not fire for it); heat −10. | `quiet`: HeatDelta −10, MemoryAdd. |
| `lean` Lean on him | Fear +100; one time in three he is a witness (EvidenceAdd me 40 witness) and one in ten you are picked up. | `scared` 57%, `witness` 33%, `arrested` 10%. |
| `tell` Tell your sponsor | Favor −15; it is handled: compliance +150, and the sponsor carries the evidence (EvidenceAdd sponsor 10). | `handled`. |

## 3. The debtor (`assoc.debtor.plea`, weight 700, cooldown 6, needs `runsGame`)

"A regular at your table is into you for 40 kL and cannot pay."

| Option | Cost | Outcomes |
|---|---|---|
| `week` Give him a week | Nothing now. Next week: he pays (60%), or he has run (40%) and that is a card. | `wait`: schedule `assoc.debtor.week2` next turn bound `debtor` (a lazily named civilian is not needed: the card carries no character; bind nothing). |
| `watch` Take his watch | 25 kL now; the table hears you take watches (Sentiment −10). | `taken`: MoneyMint +25, SentimentDelta −10. |
| `forgive` Forgive it | Nothing now; the regulars like you (game good-week odds are the game card's business; here: SentimentDelta +10, FavorDelta sponsor +0). | `forgiven`: SentimentDelta +10, MemoryAdd me "generous". |

### Follow-up `assoc.debtor.week2`

"A week has passed."

Outcomes without a decision when he pays (`paid` 60%: MoneyMint +40); when he ran (`ran` 40%) a decision:

| Option | Cost | Outcomes |
|---|---|---|
| `chase` Chase him | Heat +10, evidence 10; you get 40 (70%) or a beating goes wrong and he is in hospital (30%: evidence 40, heat +30). | `caught` 70%, `hospital` 30%. |
| `writeOff` Write it off | Nothing; the table learns debts can be walked from (game bad-week odds are unchanged here; SentimentDelta 0; MemoryAdd me "soft"). | `written`. |
| `tellSponsor` Tell your sponsor | Favor −10; his men find him: you get 20, he gets 20. | `found`: MoneyMint +20, FavorDelta −10. |

## 4. The witness who wants to talk (`assoc.witness.approach`, lane state, weight 10000 when me has memory `sawSomething` or a witness item within 6 turns; cooldown 12)

"A man who was there that night wants a word. He says he has not decided what he saw."

| Option | Cost | Outcomes |
|---|---|---|
| `pay` Pay him | 30 kL; he forgets (EvidenceAdd? no: MemoryAdd me "paidWitness"; 20 percent he comes back in eight weeks: schedule self). | `forgot` 80%, `returns` 20%: schedule `assoc.witness.approach` +8. |
| `scare` Scare him | Fear on his block +60, evidence 15; one in five he goes straight to the station (EvidenceAdd me 40 testimony). | `scared` 80%, `station` 20%. |
| `ignore` Ignore him | Nothing now; one in four he testifies within a month (schedule `assoc.witness.talks` in 2 to 4 turns, probability 2500). | `waited`. |

### Follow-up `assoc.witness.talks` (no decision): EvidenceAdd me 40 testimony, HeatDelta +10, report "A statement with your name in it is on a desk at the station."

## 5. Your sponsor is picked up (`assoc.sponsor.arrested`, spawnFrom StatusChange arrested on my sponsor, match status arrested; decision by me)

"They took your sponsor last night. His stalls need collecting and his wife needs telling."

| Option | Cost | Outcomes |
|---|---|---|
| `collect` Keep collecting for him | You hold his envelopes for him: favor +30 when he is out (MemoryAdd me "heldTheLine"; the release card reads it). | `held`. |
| `skim` Keep the envelopes | +40 kL now; when he is out he finds out two times in five (MemoryAdd me "skimmed"). | `skimmed`: MoneyMint +40, MemoryAdd. |
| `wife` Bring word to his wife and money for the lawyer | 20 kL; favor +20 now, loyalty of the crew toward you (Sentiment +5). | `carried`: MoneyDestroy 20, FavorDelta +20. |

### Follow-up `assoc.sponsor.returns` (spawnFrom StatusChange free on my sponsor with cause detention.ended; match status free)

Outcomes by my memory: `grateful` when `heldTheLine` (FavorDelta +30, report), `caught` when `skimmed` and 40 percent (FavorDelta −60, RecordDelta streakRefused? no: MemoryAdd sponsor "skimmedMe" about me; the warning card reads favor), `unnoticed` otherwise.

## 6. The block feud (`assoc.feud.neighbor`, weight 500, cooldown 10)

"Two shopkeepers on your block are at each other's throats over a wall. Both want you to settle it."

| Option | Cost | Outcomes |
|---|---|---|
| `sideA` Side with the first | He pays early for a month (compliance +100 on shop A); the other sulks (compliance −60 on B, 30 percent refusal). | |
| `sideB` Side with the second | Mirror. | |
| `split` Make them split the cost | Both grumble, both pay (Sentiment +15, FavorDelta sponsor +10: the family as local government). | |
| `ignore` Not your problem | Nothing; the block learns the family only takes (Sentiment −10). | |

Two shops bound from the sponsor's crew blocks (`shopA`, `shopB`, sameEntity false).

## 7. Soldier: the associate who is short (`soldier.associate.short`, spawnFrom CollectionMissed where the collector is on record with me, cooldown 3)

"Your man came up short again this week."

| Option | Cost | Outcomes |
|---|---|---|
| `confront` Have a word | Loyalty −20, but he does not do it again for a while (MemoryAdd man "warnedByBoss"); 10 percent he asks to move to another soldier (schedule `soldier.associate.leaves` +2, probability 1000). | |
| `letGo` Let it go | Nothing; streak broken is his, not yours. | |
| `squeeze` Raise his share to 60 percent | ShareRuleSet me→man 600; loyalty −40; more money for you while he lasts. | |

### Follow-up `soldier.associate.leaves`: ClaimRelease of the man, SuperiorSet null; report "Your man asked the chief for another sponsor and got one."

## 8. Soldier: the loan that went bad (`soldier.loan.bad`, spawnFrom LoanDefault where the lender is me, bound the business from the loan; the loans system must emit the business id on the fact)

"The bakery cannot pay. Its owner is asking what you want."

| Option | Cost | Outcomes |
|---|---|---|
| `take` Take the shop | You hold the claim (ClaimSet if unclaimed, else nothing), Sentiment −20 on the town. | |
| `stock` Take his stock | +60 kL, fear +80, he limps on. | |
| `extend` Extend him a month | Nothing now; he pays it all back over four weeks (LoanOpen again at 2 points on the same principal? Simplest: MoneyMint +25 in four weeks via a scheduled no-decision follow-up, probability 7000). | |

## 9. Volume and order of work

Nine cards, seven follow-ups, about 60 outcomes and 70 text lines. Three agents in parallel: (a) §1, §3, §6; (b) §2, §4, §5; (c) §7, §8 plus the `subjectId` on LoanDefault and the release cause the sponsor card reads. Each brief: the catalogue rows above, a scenario test per card that drives the follow-up too, and ten weeks of `harness trace` in the report. Owner: integrate, regenerate the catalogue, run coverage and the stories, tune density to the 90 percent target.
