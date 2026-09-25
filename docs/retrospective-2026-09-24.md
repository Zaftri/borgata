# Retrospective, 2026-09-24: why the soldier earned nothing, and what catches it next time

Status: brainstorm output from the owner's question after the first soldier session. Requirements for the process and the harness; design and implementation follow in phase 6b's tuning pass and in design 08.

## What slipped through

| Defect | Where it was born | What would have shown it |
|---|---|---|
| A made man held no claim, so nothing was collected for him | Generation gave every shop to the soldiers of turn 0; the ceremony added a soldier and nothing else | A metric: the player's weekly income by rank, over a career that continues past the ceremony |
| Crews of nine soldiers on one block of four shops | Archetypes shipped 4 to 9 businesses per block against design 05's 8 to 18, and no crew cap against "2 to 6 soldiers" | A conformance test between the design table and the content package |
| The chief's answer to "open the book" was deferred and lost | The request budget treated a reaction to the player's own ask like any other spawn | A scenario on a generated world: ask, then assert an answer within two turns |
| Card outcomes never reached the report | The report projection was a whitelist of fact kinds written before templates had outcome text | Requirement story 2 ("the next report contains a line tied to the chosen option") turned into a test per decision template |
| Points, shares and claims unexplained | Interface built to the view contract, not to a first-time player | A playtest of the first ten minutes at each rank before the gate, not after |

## Why the process did not catch them

1. **The harness measured the world, not the player.** Money minted, arrests per hundred turns, band occupancy: all aggregates. Nothing asked "what did the player earn this week and from whom". The careers command stopped at the ceremony; the soldier opening was never played by an AI.
2. **Acceptance criteria stayed prose.** The first-ranks requirements listed seven stories with "accepts when" clauses; two became metrics, the rest were read once and trusted. Story 2 had a test nowhere.
3. **Design numbers had no owner.** The design table said one thing, the content another, and no test compared them. Agents copied the fixture's numbers, not the design's.
4. **Scenario tests ran on the hand-built starter world.** It had enough shops for everyone, so the claims-versus-crew imbalance of generated worlds never appeared in a test.
5. **Probes were disposable.** Four times today the owner rebuilt a week-by-week trace of the player's report lines as a scratch script and deleted it. That trace is the single most useful debugging tool this project has, and it did not exist as a command.
6. **Agents reported gaps honestly, and the integration did not turn gaps into checks.** Each report listed what the DSL could not express; none of those became a follow-up test or a metric.

## Requirements for prevention

1. **Player ledger metric.** `harness careers` reports the player's median weekly income by rank and by source (collections, shares from men, game, loans), with bands: an associate earns every week he is free; a soldier receives a share from a man within ten weeks of the ceremony; income never falls at a promotion.
2. **Careers play the soldier opening.** The AI presets ask for the book and an associate in their first soldier weeks and lend when the form appears; careers run 100 weeks per preset and report weeks to book, to first man, to first loan.
3. **Every story is a test or a metric before it is marked done.** A traceability table in design 08 maps each user story to the test file or harness metric that proves it; a story without one blocks the wave's gate, not the next phase's.
4. **Design numbers live in one place.** Content is the source of truth for tunable numbers and the design table is generated from it, or a content test asserts the archetypes within the design table's ranges. Either way a mismatch fails `pnpm check`.
5. **Economy invariants.** Shops per soldier per crew at least 1.5 at generation; every living, free soldier holds at least one claim after ten turns; every crew has a block; the family treasury can fund one book opening after twenty turns.
6. **Scenario tests on a generated world too.** A fixed generated seed joins the starter as a fixture; every decision template's scenario runs on both.
7. **The trace is a command.** `harness trace --seed S --turns N [--rank soldier] [--preset yesMan]` prints, per week, the player's decisions offered, the choice, the report lines, income by source and balance. The gate report pastes ten weeks of it.
8. **A scripted playthrough in the gate.** Sixty weeks of scripted actions from associate through the soldier opening, asserting at each step a visible report line and a balance change. Fails on silence.
9. **Every fact kind declares its report treatment.** Line, news, or silent, checked at load; "silent" is a deliberate choice recorded in the fact catalogue.
10. **The agent brief names the proof.** Each brief lists the story it implements and the test or metric that will prove it, and requires ten weeks of trace output on a generated world in the report.
11. **Ten minutes at each rank before the gate.** The owner or the integrating agent plays the first ten minutes of the rank in the browser and writes down every question a new player would ask, before `pnpm check` decides anything.

## Open questions for the owner

1. Which of 1, 4, 5 and 8 join `pnpm check`? Each adds seconds to the gate; the trace and careers can stay on demand.
2. Source of truth for numbers: content generating the design table, or a test against the table? The first keeps one place; the second keeps the design readable.
3. Should each wave end with the ten-minute playtest by the owner, or by the integrating agent with a screenshot and a written question list?
