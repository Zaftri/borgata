// The setup screen (design 07 §8, build plan phase 6 item 1): seed, archetype, background, difficulty,
// ironman, Start; Continue from an IndexedDB save; Import a file.

import { useEffect, useState } from "preact/hooks";
import type { GameSetup } from "@borgata/sim";
import { gameStore, useGameStore, type SaveSummary } from "../store.js";

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function Setup() {
  const state = useGameStore();
  const { content } = state;
  const starterArchetypes = content.archetypes.filter((a) => a.playerStart);

  const [seed, setSeed] = useState(randomSeed());
  const [archetype, setArchetype] = useState<string>(starterArchetypes[0]?.id ?? "");
  const [background, setBackground] = useState<GameSetup["background"]>("outsider");
  const [difficulty, setDifficulty] = useState<GameSetup["difficulty"]>("normal");
  const [ironman, setIronman] = useState(false);

  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    gameStore.listSaves().then((list) => {
      if (!cancelled) setSaves(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function start(): void {
    const setup: GameSetup = { archetype: archetype || null, background, difficulty, ironman };
    gameStore.newGame(setup, seed);
  }

  async function onImport(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setImportError(null);
    await gameStore.importSave(file);
    const after = gameStore.getState();
    if (after.error) setImportError(after.error);
    input.value = "";
  }

  return (
    <main className="setup-screen">
      <h1>Borgata</h1>

      <section className="setup-section" aria-labelledby="new-game-heading">
        <h2 id="new-game-heading">New game</h2>

        <div className="field-row">
          <div className="field">
            <label htmlFor="seed">Seed</label>
            <input id="seed" type="text" value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} />
          </div>
          <button type="button" onClick={() => setSeed(randomSeed())}>
            Random
          </button>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="archetype">Starting place</label>
            <select id="archetype" value={archetype} onChange={(e) => setArchetype((e.target as HTMLSelectElement).value)}>
              <option value="">(seed-chosen)</option>
              {starterArchetypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="background">Background</label>
            <select id="background" value={background} onChange={(e) => setBackground((e.target as HTMLSelectElement).value as GameSetup["background"])}>
              <option value="outsider">Outsider</option>
              <option value="family">Family</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="difficulty">Difficulty</label>
            <select id="difficulty" value={difficulty} onChange={(e) => setDifficulty((e.target as HTMLSelectElement).value as GameSetup["difficulty"])}>
              <option value="gentle">Gentle</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <label>
            <input type="checkbox" checked={ironman} onChange={(e) => setIronman((e.target as HTMLInputElement).checked)} /> Ironman (one save, no
            restarts)
          </label>
        </div>

        <button type="button" className="primary" onClick={start}>
          Start
        </button>
      </section>

      <section className="setup-section" aria-labelledby="continue-heading">
        <h2 id="continue-heading">Continue</h2>
        {saves === null && <p className="mute">Looking for saves...</p>}
        {saves !== null && saves.length === 0 && <p className="empty">No saved games yet.</p>}
        {saves !== null && saves.length > 0 && (
          <ul className="plain">
            {saves.map((s) => (
              <li key={s.id}>
                <strong>{s.seed}</strong> — turn {s.turn}, {s.setup.background}, {s.setup.difficulty}
                {s.setup.ironman ? ", ironman" : ""}{" "}
                <button type="button" onClick={() => gameStore.loadFromDb(s.id)}>
                  Continue
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="setup-section" aria-labelledby="import-heading">
        <h2 id="import-heading">Import a save</h2>
        <input type="file" accept="application/json" onChange={onImport} aria-label="Import save file" />
        {importError && <p className="banner error">{importError}</p>}
      </section>
    </main>
  );
}
