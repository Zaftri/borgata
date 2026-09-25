# Build Plan: How to Build a Heavily Correlated Simulation Without Drowning in Bugs

Status: process and engineering-approach plan, 2026-09-21. Inputs: `docs/brainstorm-requirements.md`, `docs/spec-review.md`. Assumptions confirmed by the owner: one person directing, AI agents writing most code, professional TypeScript-level experience, a few hours a week. This plan describes how the work is organized and what must be true of the code; it does not pick libraries or draw architecture, which is `/sc:design`.

---

## 1. Where the bugs will come from

The brief has twenty-two requirement groups and five shared meters (Weight, Attention with local heat, Exposure, Sentiment, loyalty). Almost every system reads two or three of them and writes one. Bugs in this kind of game are rarely inside a system. They live between systems: a share change that should move loyalty and does not, an arrest that adds evidence to the wrong dossier, a follow-up event that fires after its cause was cancelled, a renderer that shows a killing the simulation decided against. Add procedural generation and a forty-year career, and any bug is also hard to reproduce.

Three facts shape the answer.

- The person reviewing has a few hours a week. Review must be done by machines where possible and by playing where not; reading agent-written code line by line will not scale.
- Agents are good at implementing a clear contract and bad at holding twenty-two systems in their head. The plan must make every task small and every contract explicit.
- The game is deterministic by requirement (NF-4). Determinism is the single biggest gift to debugging a simulation: any bug becomes a seed and an action log.

So the plan has three legs: structure that puts the correlations in one place, automation that checks them every commit, and a build order that never has more than one unproven system in flight.

---

## 2. Structural rules (what must be true of the code)

These are requirements on the implementation. Design decides how; this says what.

**S1. The simulation is a headless library.** No rendering, no DOM, no timers, no platform random. It exposes one operation: given a world state, the player's actions for the turn and a seed, produce the next state and a turn log. It runs in a terminal, in tests and in the browser unchanged. Pixel art comes later and consumes the log.

**S2. One state tree, one owner per value.** Every value in the world has exactly one system allowed to write it. Weight is written by the progression system, Attention by the state system, Exposure by evidence events, Sentiment by the town system, loyalty by the relationship system, money by the ledger. Every other system asks for changes by emitting facts, never by writing. This is the rule that turns "a lot of correlations" into "a lot of readers of a few writers," which is tractable.

**S3. One event engine.** As the review recommended, events, schemes, operations, chains and dispute outcomes are all templates run by the same engine: roles, preconditions, per-turn progress, effects, follow-ups, and a scheduler with written ordering rules. New content is a template and a test, not a new engine. Cross-system correlation then has one home, and one place to log it.

**S4. Determinism is enforced, not hoped for.** A seeded random generator threaded through every call; integer or fixed-point arithmetic in the core; deterministic iteration order for every collection; no dates, no wall clock. A lint rule forbids the platform's random and floating-point accumulation in the core. A replay test reruns saved action logs and compares state hashes on every commit.

**S5. Every change carries its cause.** Each write to the state tree records which template, which actor and which rule produced it. This is the same data the brief needs for "every failure has a readable cause" (I2) and for the newspaper, so it is not overhead. For debugging it means the answer to "why did loyalty drop" is a query, not an investigation.

**S6. Invariants are executable.** Properties that must hold after every turn are written as assertions and run in debug builds every turn and in CI over thousands of seeds. First set: money is conserved (every unit moves from one account to another, never appears or vanishes); every business is on record with exactly one man; no character is the subject of two operations in one turn; no scheduled follow-up fires with a false precondition; Exposure never decreases except by a listed cause; a dissolved family owns no territory; the player's rank is consistent with the unlocked interface layers.

**S7. Content is data with a schema.** Event templates, rackets, traits, archetypes, name pools and scene templates are data files validated against a schema at build time. Agents add content by adding data and a test; the engine does not change. Saves carry a content version and a schema version; loading an older save migrates or refuses clearly.

**S8. The renderer is a replay.** The pixel-art turn animates the turn log. It never computes an outcome. If the animation and the report disagree, the animation is wrong by definition, which removes an entire class of bugs.

**S9. Systems are added by tests first.** No system enters the core without its contract (types), its invariants and its harness metric written before implementation. This is how a few hours of review a week buys confidence: the reviewer reads the contract and the metrics, not the implementation.

---

## 3. The harness (what checks the correlations)

The harness is a set of programs that run the headless simulation without a player. It is built in phase 0 and grows with every system. It is the reviewer's main instrument.

- **Seed sweep.** Generate N worlds (a thousand in CI, more overnight) and check generator constraints (K5, C13): tutorial beats present, archetype economy present, no impossible geography.
- **Replay check.** Rerun stored action logs from the golden-seed set and compare final state hashes. Any difference is a determinism bug, found the day it is introduced.
- **Invariant sweep.** Run AI-only games for a full career on many seeds with all invariants on. Any violation stops the run and prints the cause chain.
- **Outcome distributions.** Over the AI-only games, report the numbers the brief makes claims about: war frequency, share of families that collapse by each mode, average career length by strategy, collaborator rate (target near one in twenty), time to reach each rank, Attention band occupancy. Each has a target band. A system change that moves a distribution out of its band fails the gate, which catches "peace no longer has value" without a human playing fifty games.
- **Performance budget.** Turn time and generation time measured in the same runs (NF-12).
- **Scenario tests.** Hand-written situations expressed as state plus actions, with expected facts in the turn log. These are the user stories' acceptance criteria made executable, one per story.

---

## 4. Build order

Each phase ends in something that runs, is covered by the harness, and is playable or inspectable in text. Never more than one unproven system in flight. Phases are dependency-ordered; phase length is whatever a few hours a week allows.

| Phase | Builds | Proven by |
|---|---|---|
| 0. Foundations | State tree, seeded random, turn stepper, action log and replay, invariant framework, harness skeleton, text report printer, content schema loader | Replay check green on an empty world; invariant framework catches a deliberately planted violation |
| 1. People and money | Characters with traits and loyalty, claims, protection tax, shares, the ledger, a minimal treasury | Money conservation over a thousand turns; loyalty responds to shares in scenario tests |
| 2. The state, first band | Exposure, local heat into Attention band 1, arrests, the flip roll | Exposure only rises by listed causes; flip rate sits in its band across seeds |
| 3. The event engine | Templates, roles, preconditions, follow-ups, scheduler ordering, cancellation; migrate arrests and flips onto it; first chain (the refusing shopkeeper) | No follow-up fires on a false precondition; the chain's steps appear in the log in order |
| 4. Disputes and ranks | Claim collisions, dispute resolution, Weight, promotion associate to man of honor to crew chief, crew-chief autonomy | Scenario tests for stories 1, 2, 5; time-to-rank distribution in band |
| 4b. Command-line play | A terminal loop in the harness (`pnpm harness play --seed <s>`): prints the report each turn, lists the request queue and the actions available at the player's rank, reads a choice, calls `step`. No rendering, no DOM. Saves and loads through the same SaveFile as the game. | The owner plays ten turns as an associate and writes the first playtest note; every action reachable in the loop has a scenario test. Decision 2026-09-23: added so the share economy is felt two phases before the text interface. |
| 5. Generation, one archetype | One neighborhood archetype from a seed with constraints; the cast around the player | Seed sweep over a thousand seeds with tutorial beats present |
| 6. Text interface | A plain DOM planning screen and report over the headless core. No art. | The first human playtest of the vertical slice's three hypotheses: is the share economy interesting turn to turn, does the flip create fear, does the place feel like a place. This is the go or no-go gate for the whole project, and it happens before any pixel is drawn. |
| 7. Pixel presentation | Renderer as replay of the turn log; portraits from parts; the newspaper | Animation never contradicts the report (a test compares them); performance budget |
| 8 onward. Release systems | One group at a time in dependency order: obligations and treasury, disputes to the district, ownership, public works, the full state ladder, careers, rise and fall, treason, harbors and routes, kinship, the negotiation | Each arrives as templates plus contract plus invariants plus a harness metric; distributions stay in band |

Phase 4b makes the game playable in the terminal as soon as player actions exist; phase 6 is the first interface a stranger could use. Gameplay is proven in text. If the share economy is dull in text, no amount of pixel art saves it, and the plan has spent nothing on art yet.

---

## 5. Working with agents

The owner's job is direction, contracts, review of metrics, and playtesting. The agents' job is everything else. Rules that make that work:

- **Contract before code.** Every task hands the agent the types it may touch, the invariants it must keep, the harness metric it must not move out of band, and the scenario test it must make pass. An agent that needs to change a contract stops and asks.
- **One task, one system, one change list.** Tasks are sized to a single sitting. A task touches one system's writer and any number of readers, never two writers.
- **The agent runs the harness before reporting.** Typecheck, unit tests, invariants over a hundred seeds, replay check. A report without harness output is not a report.
- **Review by metrics and play, not by reading.** The owner reads the contract diff and the harness numbers, then plays the scenario. Code is read only when a metric moved or an invariant fired.
- **Golden seeds.** A fixed set of seeds and action logs whose outcomes are stored. Every task reruns them. Any change in outcome must be explained in the task report and accepted by the owner.
- **A repository rulebook.** A `CLAUDE.md` in the repo stating the structural rules in section 2 as prohibitions the agent checks itself against: no platform random in the core, no logic in the renderer, no writes outside your system's owned values, no new engine when a template will do, no content without a schema entry and a test.
- **Decision records.** Each design decision gets a short dated note in the repo. Agents read them before touching the area. This is how twenty-two systems stay coherent across months of sessions with no shared memory.
- **Living dependency table.** One file lists, per system, which values it reads and which it writes. Agents update it in the same change. The owner reviews it for new arrows; a new arrow is a new correlation and gets a new invariant.

---

## 5b. Stories first (added 2026-09-24 after the phase 6b soldier session)

Section 1 predicted that bugs live between systems, and section 5 divided the work by system. Both held, and the second undid the first: every agent's system was correct alone, and the soldier's first week was nobody's. The engine was tested with invariants and hashes, which say the world is consistent, and never with the one question that matters, which is what the player saw and earned this week. The retrospective in `docs/retrospective-2026-09-24.md` lists the six ways that failed. This section changes how work starts, who owns it, and what "done" means.

**1. A story before a contract.** Every feature begins as a story: a plain-language table of weeks, the player's action each week, and the visible result the player must see (a report line, a card, a balance change, a panel). The owner writes or approves the table; the walkthrough document already has the voice. The story is the contract's first page. A contract without a story is not written.

**2. The story is executable before the code exists.** An agent turns the table into a test that runs the real pipeline on a fixed generated seed and on the starter world: set up, act, `step`, assert on `projectView`. It fails on the first day. The wave is done when it passes and the ten-week trace it prints reads like the table. Stories live in `packages/sim/src/stories/` and every later bug becomes an added assertion in a story, not a unit test on the fixture that let it pass.

**3. One owner per story, systems as helpers.** A story agent owns the story end to end across files, and asks system agents for the engine or reducer extensions it cannot express. The system agents own their files as today, but their brief names the story they serve and the story test they must not break. Nobody reports a system done while its story fails.

**4. Numbers are content, and content is checked against the design.** Tunable numbers (businesses per block, soldiers per crew, tariffs, weights) live only in `packages/content`. The design documents state relations and ranges and point at the content file; a content test asserts each range. A number in a design table that no test reads is a comment, and comments drift.

**5. Every arrow gets its check in the same change, including the arrows from generation.** Section 5's rule stands and now names generation explicitly: the generator writes claims, crews and blocks that the chain and the promotion read forty turns later. That arrow had no invariant. The economy invariants (shops per soldier, a claim for every made man, a block for every crew, a treasury that can fund a book) are the first of that class.

**6. The trace is a first-class tool.** `harness trace` prints, per week, what the player was offered, chose, saw and earned. Every task report pastes ten weeks of it. The owner reads the trace before the harness numbers; the numbers say nothing broke, the trace says whether it plays.

**7. Ten minutes of play per rank before the gate.** After each wave the integrating agent plays the first ten minutes of the affected rank in the browser and writes down every question a first-time player would ask, with a screenshot. Questions are filed as interface work before the owner plays. The owner's playtest then asks the design question, not the "what is this field" question.

**8. The outcome catalogue (owner's addition, 2026-09-24: "predict all actions with all outcomes").** The engine is already event-based: every player action is a template option, every consequence an outcome with effects and a report text. What is missing is that enumeration as the specification and as a coverage check. Three parts. (a) `harness catalogue` generates `docs/catalogue.md` from the content: per card, the trigger, each option with its hint, each outcome with its odds, its effects in words and its report line. The owner reviews the catalogue, not the code; a card whose outcome table reads wrong is wrong. (b) Content validation rejects a player-facing outcome that changes state without a report line, an outcome that follows a player choice without a report line (2026-09-25: "say nothing" at a patrol stop showed nothing), and an option without a hint: no silent consequences. (d) `harness coverage` also lists the animated beat kinds never seen on the player's place. (c) `harness coverage` records which option and outcome ids fired across the story corpus and the careers, and lists the ones never reached; each is either given a story or removed as dead content. First-order outcomes are enumerated exhaustively per action this way; second-order chains (an arrest that becomes a flip that becomes testimony) are covered by stories, because their product is not enumerable.

**10. Definition of done for a story.** The story test passes on the starter and on three generated seeds; the trace is pasted; the ten-minute question list is empty or filed; the design's numbers referenced by the story have a content test; the dependency table names every new arrow with its invariant or metric.

---

## 6. Working a few hours a week

- Every session ends green. Nothing is left half-migrated on the main line; unfinished work lives on a branch with a note.
- A single `NOW.md` holds the current phase, the current task, the last harness numbers and the next three tasks. It is the first thing read each session and the last thing written.
- Never two systems in flight. A system in flight for six calendar weeks is still one system.
- Harness runs overnight, unattended, on the widest seed set, and posts a summary. The owner starts each session by reading it.
- Playtests are scheduled, short and written down: one scenario, one question, one paragraph of notes. Playtest notes feed design changes, which feed contracts, which feed agent tasks.

---

## 7. Quality gates

| When | Gate |
|---|---|
| Every commit | Typecheck; unit tests; invariants over 100 seeds; replay check on golden seeds; schema validation of all content |
| Every task report | Harness output attached; ten weeks of `harness trace` attached; dependency table updated; golden-seed differences explained |
| Every wave | The wave's story tests pass on the starter and three generated seeds; `harness coverage` lists no unreached outcome without a story or a removal note; the catalogue is regenerated and reviewed; ten-minute play of the affected rank with a question list |
| Every phase | Outcome distributions in band across 1,000 seeds; performance budget met; one written playtest |
| Before the text slice (phase 6) | Every must requirement in the vertical slice has a scenario test |
| Before the first public build | Save migration tested from every earlier schema version; a fresh device runs a full career at the performance budget |

---

## 8. What this plan does not solve

- **Balance.** The harness detects when balance moves; it does not tell you what is fun. Only playtesting does, and the plan buys time for it by automating everything else.
- **Content volume.** Event templates are the largest content cost (NF-13). The structure makes them cheap to add and test, but someone still has to write hundreds of them. Agents can draft them from the research reports; the owner still curates tone.
- **Design ambiguity.** The review's design-level items (band counts, measured requirements, scheduler semantics) must be settled in `/sc:design` before phase 3. Phase 0 to 2 can start before that; phase 3 cannot.
- **Motivation over years.** A few hours a week for a game this size is a multi-year project. The build order is arranged so that something playable exists after phase 6 and every later phase adds a finished system to a working game, not a piece to a pile.

---

## 9. Next step

`/sc:design` with three inputs: the brief, the review, and this plan. Design should produce the state tree, the event engine's template format and scheduler rules, the metric definitions with bands, the content schemas, and the harness's metric list, in that order, because phases 0 to 3 depend on them.
