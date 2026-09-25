# Borgata: repository rules for agents

Read first: `docs/NOW.md` (current phase and task), then `docs/design/README.md`. The requirements are in `docs/brainstorm-requirements.md`; the process is in `docs/build-plan.md`. Do not re-derive decisions that are recorded there.

## Layout

- `packages/shared`: ids, integer math, hashing, canonical JSON, version constants. No dependencies.
- `packages/sim`: the headless simulation core. Imports only `@borgata/shared`. No DOM, no timers, no `Date`, no `Math.random`, no floating-point literals.
- `packages/content`: data files and zod schemas; exports a validated `Content` object and `CONTENT_VERSION`.
- `packages/harness`: CLI (`pnpm harness <command>`): `quick`, `sweep`, `replay`, `perf`, `golden`.
- `packages/ui`: (later) PixiJS turn view and Preact panels; consumes the turn log only.

Dependency direction is strict: ui and harness depend on sim, content, shared; content on shared; sim on shared only. ESLint enforces the sim rules.

## Rules (from design 01 §10)

1. Never mutate `World` from a system. Emit `Fact`s; only owner reducers write state, in the fixed owner order (`packages/sim/src/reducers/index.ts`).
2. Write only values your system owns. The ownership table is design 02 §6 and `docs/design/dependency-table.md`. Update the dependency table in the same change when you add a read or a write.
3. Randomness comes only from `streams.get(world, "<system.name>")`. Each system has its own named stream.
4. Integers only in `sim`. Money is thousands of lire. Meters are 0..1000. Probabilities are per 10,000.
5. Do not add a new process type. Add a template (design 04).
6. Do not add content without a schema entry and a scenario test.
7. Every reducer rejects invalid facts with a logged reason; it never throws on data.
8. Every state change must be reproducible: run `pnpm harness replay --golden` before reporting.

## Before you report

Run `pnpm check` (typecheck, lint, tests, `harness quick`) and paste the harness summary into your report. If a golden seed hash changed, explain why in the report; do not update golden hashes without saying so.

## Writing style for code

- TypeScript strict, ES modules, `import type` for types.
- Small pure functions; the world is a plain JSON-serializable object.
- Tests live beside the code as `*.test.ts` (vitest).
- Comments explain why, and cite the design section (for example `design 03 §2`).
