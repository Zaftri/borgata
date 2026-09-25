# The First Ranks: Requirements for a Fun Associate and Soldier

Status: brainstorm output, 2026-09-24, after the phase 6 playtest verdict ("all you do is click one button"). Scope: the associate rank and the first weeks of the soldier rank. This document adds to `docs/brainstorm-requirements.md`; where they differ, this one is newer. Requirements only; design and implementation follow as phase 6b.

Decisions taken with the owner (2026-09-24):
1. Pace: two or three real decisions every week. Weeks never pass empty.
2. Stakes: real. An associate can be arrested, dropped by his sponsor, or killed. Runs can end here.
3. Goal: being made, with visible progress toward it. The ceremony is the rank's finale.
4. Length: about 30 to 45 minutes of real time, roughly 30 weekly turns.

---

## 1. What went wrong and what "fun" means here

The playtest found the systems working and the player idle: the associate collects one stall, pays half up, and presses end turn. Weight never moves, the two permission buttons do nothing, and the requests on screen are another man's decisions.

What makes an early loop fun in the games this project learns from is not complexity but a choice each turn whose cost you can read and whose result you see next turn. Five rules follow, and every requirement below serves one of them.

1. **Every week asks something of you**, and each option costs something different: money, favor, exposure, or the town's goodwill.
2. **You see what your choice did** on the next report, in plain words, tied to the choice.
3. **You can read the risk before you choose.** Not the number, but the signs: this shopkeeper has reported men before, this sponsor has a temper, the block has been quiet.
4. **There is a bar you are trying to move**: how close you are to being proposed. Every choice is weighed against it.
5. **The consequences are people.** Your sponsor has a mood, a rival associate wants your stall, the shopkeeper has a name and a memory.

---

## 2. The associate's week: the decision catalogue

Each situation below is a player-facing decision with a trigger, options, an immediate effect, a delayed risk, and a real reason to decline. Two or three of these surface per week from a weighted pool; the late payer and the card game recur, the rest are rarer.

### 2.1 The late payer (recurring)
Trigger: a business the player collects from fails to pay this week.
- **Let it slide.** No money this week. Next week the neighbors have heard; compliance on the block drifts down.
- **Lean on him yourself.** He probably pays and his fear rises, and so does his neighbors'. A window costs nothing, but the town notices, a small item lands in your dossier, and a shopkeeper with the "reports" trait produces a witness and, sometimes, a patrol arrest with your name on it, not your sponsor's.
- **Tell your sponsor.** It is handled properly and you spend favor. Do it too often and he concludes you cannot hold a stall and gives it to another associate.
- **Send the kid.** You have one errand boy. He can lean on a stall for you: less exposure for you, a weaker effect, and a small chance he botches it and the shopkeeper laughs at both of you.

### 2.2 The card game (recurring)
Trigger: every week, the game needs a banker and a place.
- **Bank it yourself.** Your cash is the bank. A good week doubles what you put in; a bad week takes it. Variance is the point.
- **Borrow the stake from your sponsor.** He fronts the bank, takes a cut of every win, and you owe him the losses. Your envelope is safer; your favor ledger grows a debt.
- **Skip the game this week.** Nothing risked, nothing earned, and the regulars drift to another game.
- **Move the game.** Heat on the venue rises each week it stays. Moving costs a week's take and resets heat. A raid takes the bank and arrests whoever is holding it, which is you.

### 2.3 The sponsor's favors (occasional, escalating)
Trigger: your sponsor asks for something with no money in it. You do not know exactly what until after. You can read signs: which man is involved, whether a dispute is open, whether the crew has been quiet.
- **Drive a man.** Usually a pickup or a meeting: favor gained, a small dossier line. Sometimes a killing: you have made your bones, you are proposable ahead of every other associate, and you carry a murder memory that adds to the pressure at every future arrest and makes you a liability if the family ever fears you will talk. A patrol can stop the car; a witness can see your face.
- **Carry a note.** Low risk unless the recipient is watched, in which case the note is document evidence and you are now a known courier.
- **Watch a door.** Favor and, if something happened inside, a memory you did not want. A civilian who saw you is a witness; if the police arrive you are the one arrested, knowing just enough to be worth pressuring.
- **Decline any of these.** You stay clean. Favor falls, your sponsor marks you as a man who says no, and after two refusals he moves you off his block. A man who says yes to everything is made in a year and is the state's best witness in three; a man who always says no stays an associate forever.

### 2.4 The rival associate (once or twice per rank)
Trigger: another associate on record with your sponsor wants what you have.
- He poaches a payment from your stall, or badmouths you to the sponsor, or offers to split a job.
- **Outwork him** (accept more jobs this month), **cut him in** (share the card game for a quieter life), **rat him out** to the sponsor (favor now, a reputation as a talker later), or **settle it yourself** (a beating: fear, heat, and a grudge that outlives the rank).

### 2.5 The shopkeeper's problem (occasional)
Trigger: a shopkeeper on your block asks for help: recover a stolen bicycle, settle a debt with a neighbor, keep a drunk away from his daughter. This is the family as local government.
- **Help him** for free (Sentiment and consent up, the town remembers you kindly), **help him for a fee** (money now, less goodwill), or **ignore him** (nothing, and the block learns the family only takes).

### 2.6 The patrol stop (occasional, more often when heat is up)
Trigger: a patrol stops you on your rounds.
- **Say nothing.** Correct, and the officer remembers your face.
- **Talk your way out.** A small chance of a slip that lands as a document item on your sponsor's dossier, and a memory tagged "talked to police" that a rival associate can use against you.
- **Offer something.** A bribe from your own pocket: cheaper than an arrest, and the officer now knows you pay.

### 2.7 The sponsor's short week (occasional)
Trigger: your sponsor's own envelope to the crew chief is short and he asks you for cash.
- **Lend it** (favor up, your balance down, repaid when he can, or not), **give it** (a bigger favor, gone for good), or **refuse** (favor down, and he wonders what you are saving for).

### 2.8 The feast (once a year)
Trigger: the saint's feast committee collects. **Chip in** (Sentiment, and your name in the sponsor's ear), or **keep your money**.

---

## 3. The bar: standing to be made

- **A visible measure** called *la proposta* (the proposal), shown as a band with signs, not a number: "your sponsor is pleased," "you are spoken of," "the books are closed this year." Inputs: envelopes paid on time (weeks in a row), jobs accepted and done, no arrests, sponsor favor, the family's intake policy, and a bones rule if the family has one.
- **Threshold and finale.** When the measure is high enough and the books are open, the sponsor proposes you; the ceremony scene states the rules; you are a soldier. Target: 25 to 35 weeks for a player who takes most jobs and pays on time.
- **The other exits.** Favor below a floor: your sponsor drops you, and another soldier may or may not take you on (a scene; if none does, the run ends as "you drifted away from the life"). Arrest with a flip: a run-ending disgrace. A job gone wrong: death is possible but rare (under one run in twenty for a player who takes every job).
- **Weight as an associate** is fed by the same inputs at a lower scale, so Weight and the proposal agree.

---

## 4. People with faces

- **The sponsor has a personality** drawn from four types that change the frequency and tone of his asks and how he reacts to refusals: the patient earner (few favors, slow to anger), the hothead (more jobs, harsher on refusals, more heat around him), the schemer (notes and doors, not driving; values silence), the gambler (short weeks, wants your card game's stake). His mood toward you is shown as a sentence each week.
- **The rival associate** has a name, a stall, and a memory of what you did to him.
- **Shopkeepers who refuse or report** acquire names and traits when they matter (the reporter, the proud one, the one who pays late but always pays).
- **News is labeled as news.** Decisions that belong to the crew chief appear under "Heard on the block", never in the player's decision list.

---

## 5. Into the soldier rank: the first weeks must open up, not stall

The first ten weeks as a soldier must add, in this order, so the new rank feels like a promotion rather than a bigger idle screen:
1. **The loan book.** The crew chief lends capital at one point a week; the player sets loans to shopkeepers at three to five points; defaults are paid in assets. "Open the book" is the action that starts it.
2. **Your own associate.** "Make an associate" asks the chief; a yes gives you a man who collects and runs your errands, with his own late payers and favors now flowing to you.
3. **Claims and shares.** Already built; surfaced with a scene the first time a claim collides.
4. **Your first arrest below you.** Your associate is picked up; you decide whether to pay his lawyer and support his mother, and you see the flip risk as a band.
5. **The chief's demands.** The favors now come from above with money in them: a bigger envelope this quarter, a man for a job.

---

## 6. Presentation requirements (text interface)

- Situations appear as cards on the Planning screen: a short text, the signs you can read, three or four options each with a one-line "what it costs" hint written from what the player knows, never from hidden numbers.
- The Report ties each consequence to the choice that caused it: "You leaned on Turi's stall: he paid, and the baker next door paid early."
- A "Being made" panel shows the proposal band and the signs behind it.
- The sponsor's mood line sits in the header next to loyalty.
- The two permission actions are hidden until soldier rank and then do the things described in section 5.

---

## 7. Content volume

For the associate rank: about 12 decision templates, 4 sponsor personalities as trait sets, roughly 40 outcome texts, 6 shopkeeper traits, 1 ceremony scene with a bones variant, 1 dropped scene. For the soldier opening: the loan chain, the make-an-associate flow, 4 more decision templates, about 15 outcome texts. All as data templates on the existing engine; no new engine features expected beyond a "situation card" report channel.

---

## 8. User stories and acceptance criteria

1. **The busy week.** As an associate, I want two or three situations every week so that ending the turn is never my only move.
   Accepts when: across 30 turns of a scripted run, at least 90 percent of turns present two or more player decisions, and no two consecutive turns present the identical set.
2. **The readable cost.** As a player, I want each option to say what it costs in words I can act on.
   Accepts when: every option has a cost hint, and the next report contains a line tied to the chosen option by cause.
3. **The job that goes wrong.** As a player, I want a favor to carry real risk so that saying yes is a decision.
   Accepts when: over 200 AI-played associate careers, between 5 and 15 percent of accepted favors produce an arrest, a witness, or a murder memory, and at least one run in fifty ends in the associate rank.
4. **The bar.** As an associate, I want to see how close I am to being made and why.
   Accepts when: the proposal band and its signs appear from turn 1, move within a turn of a relevant choice, and a player who takes most jobs and pays on time is made in 25 to 35 turns on the default difficulty.
5. **Dropped.** As a player who refuses everything, I want the family to stop wanting me rather than the game stalling.
   Accepts when: three refusals in a row trigger the sponsor's warning, five trigger the dropped scene, and the run either continues under a new sponsor or ends with a legacy screen.
6. **The card game's swing.** As an associate, I want the game to be a real gamble.
   Accepts when: banking it yourself over 20 weeks produces at least one week that loses more than a normal week's collections, and borrowing the stake never does but leaves a favor debt.
7. **Made, and busy.** As a new soldier, I want the loan book and my own associate within ten weeks so that promotion opens the game.
   Accepts when: "Open the book" produces capital and a loan action, "Make an associate" produces a man on record with me after the chief's answer, and both are available within ten turns of the ceremony on the default difficulty.

---

## 9. Non-goals

- No scripted campaign: situations are drawn from a weighted pool conditioned on the world, and the same seed replays identically.
- No new engine type: situations are decision templates; the card game is a chain; the proposal band is a derived value.
- No art. This is text interface work; pixel presentation stays phase 7.

---

## 10. Open questions

1. **Permadeath scope.** Death at associate rank always, or only in ironman? Recommended: always possible, rare, and always preceded by a readable sign.
2. **The kid.** A named character generated at start, or an abstract action? Recommended: a named character, so he can be arrested, flip, or one day be your first associate.
3. **Difficulty presets** and the associate: does "gentle" remove death, or only lengthen the bar? Recommended: gentle halves the chance of jobs going wrong and never removes consequences.
4. **The bones rule.** Show the family's rule from day one, or let the player discover it when the proposal comes? Recommended: the sponsor tells you in week one, in character, so the driving job carries its full weight.
