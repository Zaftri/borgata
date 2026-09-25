# Specification Review: Cosa Nostra Strategy Game Requirements Brief

Reviewed: `docs/brainstorm-requirements.md` (revision of 2026-09-21, 19 decisions, 22 requirement groups, 19 user stories).
Mode: critique, single iteration. Panel: Wiegers (lead, requirements), Adzic (examples), Cockburn (actors and goals), Fowler (domain boundaries), Hohpe (event semantics), Nygard (failure modes), Newman (evolution), Crispin and Gregory (testing and quality), Hightower (deployment).

## Quality assessment

| Dimension | Score | Note |
|---|---|---|
| Completeness | 8.5 / 10 | Unusually complete for a brainstorm output; the research is visible in every group |
| Clarity | 7 / 10 | Strong prose, but the rename to English left artifacts, and two abstractions overlap |
| Consistency | 5 / 10 | Decisions contradict each other, priority words contradict the tier table, weekly language survives adaptive turns |
| Testability | 5.5 / 10 | Nineteen stories have acceptance criteria; most requirements do not, and there is no test strategy for a procedural simulation |
| Overall | 6.5 / 10 | Ready for design after one consistency pass; not yet a stable baseline |

## Critical issues (fix before design)

**W-1. The priority vocabulary contradicts the scope tiers.** (Wiegers)
Section 3 defines must as "required for the first playable version." Section 9c then puts groups full of must items in the Release tier: M1, M2 and M7 (ownership) are must but FR-M is Release; D6 (association case at the top band) is must while core is "state to one band"; B12 (must) describes nine chains at release; N-1 and N-2 (player character) are must while N is listed as core but its N-3 heir is expansion. A reader cannot tell what the first playable contains.
Recommendation: redefine the words. Must = required for the game to be the game described (release). Should = release quality. Could = expansion. Then let section 9 (vertical slice) and the Core tier be the only statements of what the first playable contains, and make the slice a strict subset of Core. Today the slice omits N, O, P, U, V and C12 while Core includes them.

**W-2. Decision 5 contradicts decision 13.** (Wiegers)
Decision 5: "turn-based weeks; the world moves only when the player ends the week." Decision 13: adaptive turn length. Section 1 still says "one turn is one week." The core loop is still named Planning, Working Week, Sunday; H2 says "weekly newspaper"; H3 "Sunday reports"; B10 and B13 "each week" and "reports on Sunday"; user stories 1, 3, 4, 8 and 13 say "Sunday report," "next-week," "within the week," "the following week."
Recommendation: rewrite decision 5 as "turn-based; the world moves only when the player ends the turn; turn length per decision 13." Rename the loop to Planning, the Turn, the Report, and replace every weekly phrase with "turn" or "report." Keep "Sunday" only as flavor at weekly ranks.

**W-3. Rename artifacts damage credibility.** (Wiegers, Gregory)
Decision 3: "head of the family (head of family)." Fantasy: "associate (associate)." Mechanic 2 and B6b: "squared (squaring)." V-5: "shelve (shelved)." D4b: "hiding a body (making a body disappear)." A4: "Capocrews." Rank table: "retiring clean" contradicts G6a. Section 10 has an orphaned sentence ("All three were closed"). N12 cites "open question 2 in section 10," which no longer exists. Section 14 says the Sicily report is "in progress" and "when it lands"; it has landed.
Recommendation: one editorial pass; these are twenty minutes of fixes but every one is a place a reader stops trusting the document.

**F-1. Two identifier schemes collide.** (Fowler)
FR-N uses N-1 to N-5 (player character). The non-functional requirements use N1 to N13. "N3" and "N-3" are different requirements one hyphen apart, one a session-fit rule and the other the heir mechanic.
Recommendation: rename the player-character group to FR-PC (PC-1 to PC-5) or renumber NFRs as NF-1 to NF-13. Also renumber within groups: A8 before A7, B9 with no B8 nearby, C12 to C16 before C9, D10 before D8, E4a before E4, R-6 and R-3a before R-5, N10 last. Order communicates priority to a reader whether intended or not.

**F-2. Four process abstractions do the same job.** (Fowler, Hohpe)
Events (FR-L: preconditions, effects, follow-ups), schemes (FR-V: schemer, motive, duration, discovery), operations (FR-O: crew, method, odds, outcomes) and chains (B13: slot boards that run each turn) are all "a process with actors, preconditions, per-turn progress and consequences." Disputes (E1) are a fifth if treated as scenes with branching outcomes. Designing them as separate engines is the largest avoidable cost in the brief.
Recommendation: state a single requirement that schemes, operations and chains are event templates with roles, and that the event scheduler is the one engine. Design then models a scheme as a long-running event with a discovery follow-up and an operation as a short event with a resolution roll. This also answers the open question of how many decisions a turn surfaces, because there is one queue to cap.

**H-1. The event system has no scheduling semantics.** (Hohpe)
L1 to L4 say events have preconditions and follow-ups and are drawn from weighted pools. Nothing says what happens when two chains want the same character in the same turn, when a scheduled follow-up's precondition is no longer true, when two families' events contradict, or how many events may fire per turn. In a deterministic simulation (N4), ordering is part of the contract.
Recommendation: add L8: the scheduler has a defined order (state responses first, then family actions, then civil events, or whatever design chooses), follow-ups are re-validated at fire time and cancelled with a reported reason, a character can be the subject of at most one operation per turn, and the per-turn event budget is a tunable. Determinism requires this to be written down.

**C-1. Requirements are stated as behaviours without measures.** (Wiegers, Crispin)
Examples: "loyalty drifts with success" (T-5), "reputation collapses" (B6b), "refusal spreads when refusers are seen to survive" (B6), "Attention decays slowly" (D5), "hold the territory for a sustained period" (G6), "reaching crew chief in two to three hours" (I1, the one measured target, and it is a design outcome rather than a requirement). The brief does not need tuned numbers, but it needs the shape of the measure: what is observed, in what unit, over what period.
Recommendation: for each must requirement add a one-line "measured by" clause (for example, D5: "Attention is a value in five bands; each band has an entry threshold and a half-life in turns; design sets values"). Without it, design cannot know when it has met the requirement.

## Major issues (fix in the same pass or early in design)

**A-1. Attention bands are never counted.** (Adzic, Wiegers)
D7 lists eight state tools that unlock "by band." D1 lists three layers. The walkthrough names four bands (quiet, noticed, watched, targeted). Weight thresholds per rank are also undefined, which is acceptable for design, but the number of bands is a requirement because every other system references them.
Recommendation: fix the band count (five is the natural fit for eight tools across three layers) and give each band a name and the tools it unlocks. Give Weight the same treatment: one threshold per rank, plus the district-head threshold.

**A-2. No worked example ties the economy together.** (Adzic)
The research has real figures (protection tax tariffs by business type, loan points, the 3-2-2-1 public works split, family sizes, one in twenty collaborators). The brief cites them in isolation. There is no single scenario showing a crew of six men, their businesses, their shares, the treasury cut, the lawyer's fee and the resulting envelope for one turn.
Recommendation: add a "reference turn" appendix with illustrative numbers, marked as illustrative. It is the fastest way for design to discover whether the share economy is interesting week to week, which section 9 names as the first hypothesis.

**K-1. User stories cover five ranks unevenly.** (Cockburn)
Nineteen stories: nine are "as a player," seven are head of family or crew chief, one is underboss, one is man of honor, none is associate. There is no story for the loan book, war, going into hiding, the negotiation, heir continuity, the harbor, the pre-history archive, the household, or the codex. Section 2 says the ladder is the tutorial; the stories should trace it.
Recommendation: one story per rank per core system at minimum, each with the actor's rank and goal named. Convert "as a player" stories to a specific rank.

**E-1. Who approves killing an associate is unstated.** (Cockburn, on accuracy)
E2 gates violence for men of honor, heads and the state. Associates are "disciplined by the sponsor." Killing an associate on the family's territory historically required the head's approval, and the walkthrough assumes this ("killing anyone needs the head"). The brief does not say it.
Recommendation: add to E2: "killing anyone on the territory, including associates and civilians, requires the head of family's approval."

**N-1. Determinism is required but not specified.** (Nygard)
N4 requires reproducibility from seed and action log. In a JavaScript browser game that means a seeded pseudo-random generator, no use of the platform's random, no floating-point accumulation that differs across engines, and a stable iteration order for every collection. None of this is stated, and it is the kind of requirement that is cheap to meet at the start and impossible to retrofit.
Recommendation: add N4a: seeded PRNG everywhere; integer or fixed-point arithmetic in the simulation core; deterministic ordering of all iterations; a replay test in CI that reruns saved action logs and compares state hashes.

**N-2. Failure modes are missing.** (Nygard)
What happens when the generator cannot satisfy the tutorial constraints (K5) for a seed? When a save is corrupt or from an older version? When browser storage is full or cleared? When generation exceeds the 15-second budget on a slow device? The brief has a performance budget and no degradation policy.
Recommendation: K5a: constraint failure re-rolls the local neighborhood up to N times and then relaxes named constraints in a defined order. J1a: save schema is versioned; loading an older save either migrates or refuses with a clear message; export is always offered before a refused load. N12a: generation shows progress and can fall back to a smaller pre-history.

**S-1. Save and data evolution are unaddressed.** (Newman)
Event templates, name pools and archetypes are described as authored (K6) and data files are "could" (N10, L6). Saves persist for a forty-year career of several hundred turns; the game will be updated many times during one player's run. Without versioned schemas for both saves and content, every content update risks every save.
Recommendation: promote L6 and N10 to should for event templates and name pools, since event templates are "the largest content cost" (N13) and will change most; require a save-schema version and a content-version stamp in every save.

**T-1. There is no test strategy for a procedural simulation.** (Crispin)
The acceptance criteria describe what a player sees. Nothing describes how the team verifies the systemic claims: that peace has value (E3, E5), that quiet and loud strategies are both viable (user story 6), that tutorial beats appear for every seed (K5, C13), that turns resolve under two seconds (N12), that the base collaborator rate is near one in twenty (D6).
Recommendation: add NF-Test: the simulation runs headless without a renderer; a harness runs AI-only games across many seeds and reports outcome distributions (war frequency, collapse modes, average career length, collaborator rate); generator constraints are checked over at least a thousand seeds in CI; performance budgets are measured in the same harness.

**G-1. Content boundaries need one more sentence.** (Gregory)
N7 forbids graphic imagery and real persons. D4a names killing women or children as rule violations; N-2a makes women actors; the trait list includes "womanizer." The subject is recent and the audience includes people from the places depicted.
Recommendation: N7a: children are never targets or depicted victims in operations; violence against women exists only as a rule violation with consequences, never as a player-selectable operation; the codex names real victims respectfully and the game never fictionalizes a real death.

## Minor issues

- Section 9 says "52 weeks" but the slice reaches crew chief, where turns are fortnights. Say "one in-game year."
- Header says "revised after all nine open questions"; there are nineteen decisions. Update the status line.
- J1 "optionally on a light backend" leaves the first release's hosting undecided. Decision 9 implies none. State it: first release is a static site with browser saves and export; a backend is expansion. (Hightower)
- B1 counts eight rackets; B12 counts nine chains with laundering added and votes "light." Say explicitly that a racket is a source of money and a chain is how a racket runs, and that laundering is a chain but not a racket.
- G6 "sustained period" and D6 "top band" should reference the band count once it exists (A-1).
- The glossary lists "41-bis" and "416-bis" as interface labels; both are Italian statute numbers that mean nothing untranslated. Give them English-first labels ("hard prison regime (41-bis)").
- Working title "Borgata" is fine, but decision 17's bilingual rule would render the neighborhood label as "borgata (neighborhood)" everywhere, so the title collides with an interface term. Note it.

## Expert consensus

1. The brief is complete enough to design from and too inconsistent to design against. One consistency pass (W-1 to W-3, F-1) turns it into a baseline.
2. Unify the process abstractions (F-2, H-1). One event engine with roles is the single most valuable simplification available and it also answers the open decisions-per-turn question.
3. Write the measures, not the numbers (C-1, A-1). Design needs to know what is counted; it does not need the values yet.
4. A procedural, deterministic simulation needs a test harness as a requirement, not an afterthought (N-1, T-1).

## Disagreements recorded

- Wiegers would reduce the must set to the vertical slice; Cockburn argues must should describe the whole game and the slice should be a separate plan. The recommendation in W-1 follows Cockburn, because the slice already exists as section 9.
- Adzic wants illustrative numbers in the brief; Fowler warns they will be read as decisions. The recommendation is an appendix explicitly marked illustrative.
- Newman would make data-driven content a must; Hightower notes that for a hobby project the cost of schema discipline is real. The recommendation is should, for event templates and name pools only.

## Improvement roadmap

Immediate (before `/sc:design`): W-1, W-2, W-3, F-1, E-1, the minor editorial items.
Early in design: F-2 and H-1 (one engine), C-1 and A-1 (measures and bands), N-1 (determinism rules), A-2 (reference turn).
Before the first playable: N-2 (failure modes), S-1 (versioned saves and content), T-1 (harness), K-1 (stories per rank), G-1 (content boundary).
