# Borgata

A single-player, browser-based strategy game about rising through a Sicilian Cosa Nostra family in the 1970s and 1980s, on a procedurally generated Sicily. Fictional people; real rackets, rules and institutions. A hobby project, free, in development.

Play the current build: the GitHub Pages link on this repository (set up by `.github/workflows/pages.yml`). Nothing is saved anywhere but your own browser.

## What it is now

- An associate's weeks: cards with readable stakes, a card game, favors that can go wrong, a bar toward being made, and the ceremony.
- A soldier's opening: the loan book, your first man, your own stalls, duties toward a jailed man's family, a lifestyle.
- A town drawn in pixels that plays the week, faces composed from parts, and a provincial newspaper.
- A deterministic headless core (every game replays from its seed and action log), an event engine driven by data templates, and a harness that checks invariants, replays golden seeds and measures the game's outcome distributions.

## Run it

```
pnpm install
pnpm dev        # http://localhost:5173/
pnpm check      # typecheck, lint, tests, harness quick
pnpm harness trace --seed any --turns 12   # a week-by-week trace of a player's game
```

## Read it

- `docs/NOW.md`: the current phase, the latest numbers, what is next.
- `docs/brainstorm-requirements.md`: what the game is meant to be.
- `docs/design/`: the design documents, from architecture to the latest system group.
- `docs/catalogue.md`: every card, option, outcome and its odds, generated from the content.
- `docs/gameplay-walkthrough.md`: how a career is meant to play, rank by rank.

## How it is built

The owner writes the stories, the contracts and the tests; coding agents implement against them; a harness gates every change. The method is in `docs/build-plan.md` §5b and the retrospective that produced it in `docs/retrospective-2026-09-25.md`.
