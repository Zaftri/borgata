# Design Documents

Produced 2026-09-21 from the requirements brief, the panel review and the build plan. Read in order; 01 to 04 are the foundation that build-plan phases 0 to 3 depend on.

| # | Document | What it decides |
|---|---|---|
| 01 | `01-architecture.md` | Technology (TypeScript, headless `sim`, PixiJS + Preact, zod content, IndexedDB saves), packages and dependency direction, the turn pipeline, Facts, determinism, saves and versions, fog of war as projection, compact provinces, repository rules |
| 02 | `02-state-model.md` | The world state tree, entities, the ownership table (which reducer writes what), the Fact catalogue, derived values, size expectations, model invariants |
| 03 | `03-metrics-and-economy.md` | Weight, Attention with local heat and five bands, Exposure and the flip roll, money and chains as slot boards, Sentiment, compliance, loyalty, favors, reputation, turn length and crisis flags, a reference turn, difficulty presets |
| 04 | `04-event-engine.md` | The one engine: template format, predicate DSL, instances, lifecycle, six scheduler lanes with ordering, re-validation, locks and budgets, mapping of every requirement group onto templates, visibility, authoring rules, a worked chain |
| 05 | `05-world-generation.md` | Generation pipeline by stage, archetypes and economies, families and cast, pre-history, guaranteed tutorial beats with re-roll and relaxation, determinism and lazy expansion, naming, performance, generator invariants |
| 06 | `06-content-schemas.md` | Content package layout, zod schemas per content type, text templating and bilingual labels, versioning and migrations, build-time validation, content volume targets, authoring guidance |
| 07 | `07-interface-and-rendering.md` | Screens per rank and UI layer unlocks, Planning, animated Turn and Report, fog-of-war rules, renderer as replay, pixel-art pipeline, accessibility, mobile web, the text slice, performance budgets |
| 08 | `08-harness-and-testing.md` | Harness commands, the AI player, outcome distributions with target bands, the invariant list, scenario test format and user-story mapping, golden seeds, replay and hashes, generator property tests, failure-mode tests, CI stages, the reviewer summary |
| 09 | `09-first-ranks.md` | Phase 6b: the associate's week and the soldier opening as decision templates on the existing engine; la proposta as a derived bar; sponsor personalities, the rival and the kid; the loan book; six new fact kinds and two small engine extensions; harness presets and bands |
| 10 | `10-situations.md` | Phase 6c: nine more situations with follow-up decisions (the kid, the new owner, the debtor, the witness, the sponsor arrested, the block feud, the short associate, the bad loan), the four tuning decisions of 2026-09-25, `spawn.cooldownTurns` |
| 11 | `11-pixel-slice.md` | Phase 7: the story of one week seen, the scene projection contract (tiles, buildings, actors, clips), portrait parts, the newspaper channel, waves A1 to A3 and the gate |
| — | `dependency-table.md` | Living table of what each system reads, owns and emits; the arrows that carry correlation risk |

Related: `../brainstorm-requirements.md` (what), `../spec-review.md` (what was wrong and what design must settle), `../build-plan.md` (how the work is organized), `../gameplay-walkthrough.md` (how it plays).

## Review items from `spec-review.md` and where design settles them

| Item | Settled in |
|---|---|
| F-2, H-1 one engine with scheduling semantics | 04 §1 to §4 |
| C-1 measured requirements | 03 (every meter has unit, range, half-life, inputs) and 08 (metrics with bands) |
| A-1 band count | 03 §2: five bands with names and tools |
| N-1 determinism rules | 01 §5 |
| N-2 failure modes | 01 §6 saves; 05 constraint relaxation; 08 failure-mode tests |
| S-1 versioned saves and content | 01 §6, 06 versioning |
| T-1 test harness | 08 |
| A-2 reference turn | 03 §7 |
| K-1 stories per rank | 07 screens per rank; 08 scenario mapping |
| Open: decisions per turn cap | 04 §4 budget by rank |
| Open: animated turn at island scale | 07 (one chosen place, the rest in the report) |

## Next step

`/sc:implement` phase 0 of the build plan: repository skeleton, `shared` types, seeded streams, the empty `World`, the Fact reducers' scaffolding, the harness skeleton with replay check and invariant framework, and the repository `CLAUDE.md` from design 01 §10.
