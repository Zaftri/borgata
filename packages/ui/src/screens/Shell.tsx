// The persistent frame (design 07 §2.1): header with calendar/turn length/rank/weight/balance/loyalty/layers,
// the four tabs, and the footer (Save, Export, New game). Reads only `view` (a PlayerView) and `state.save`;
// never `world`.

import { useState } from "preact/hooks";
import type { PlayerAction, PlayerView } from "@borgata/sim";
import { gameStore, useGameStore } from "../store.js";
import { Planning } from "./Planning.js";
import { ReportLines, ReportScreen } from "./Report.js";
import { Book } from "./Book.js";
import { SituationCard } from "./Planning.js";
import { Info } from "./Help.js";
import { People } from "./People.js";
import { Territory } from "./Territory.js";
import { Turn } from "./Turn.js";
import { familyStateLabel, formatTreasury, LIFESTYLE_WORDS } from "../format.js";

type Tab = "planning" | "turn" | "report" | "book" | "people" | "territory";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "planning", label: "Planning" },
  { id: "turn", label: "Turno (turn)" },
  { id: "report", label: "Report" },
  { id: "book", label: "Il libro (the book)" },
  { id: "people", label: "People" },
  { id: "territory", label: "Territory" },
];

export function Shell() {
  const state = useGameStore();
  const [tab, setTab] = useState<Tab>("planning");
  const view = state.view;

  // Ironman locks a fresh start once the game is underway. `World` has no "game over" state yet (phase 6 note),
  // so this is a conservative approximation: ironman always blocks "New game" while a save exists.
  const newGameLocked = !!state.save?.setup.ironman;

  // Design 09 §3's two run-ending exits: death, or the sponsor dropping the player with nobody taking them on
  // (`view.you.alive` / `view.you.dropped`, view.ts).
  const runEnded = !!view && (!view.you.alive || view.you.dropped);

  return (
    <div className="shell">
      <header className="shell-header">
        {view ? (
          <>
            <div className="stat">
              <span className="mute">Anno {view.calendar.year}, settimana {view.calendar.week}</span>
              <strong>
                Turno: {view.turnLength} settiman{view.turnLength === 1 ? "a" : "e"}
                {view.crises.length > 0 && (
                  <span className="pill">
                    {view.crises.join(", ")}
                    {view.crises.includes("war") && <Info topic="war" />}
                  </span>
                )}
              </strong>
            </div>
            <div className="stat">
              <span className="mute">Rank <Info topic="rank" /></span>
              <strong>
                {view.you.rank} (weight {view.you.weight})
              </strong>
            </div>
            <div className="stat">
              <span className="mute">Balance <Info topic="balance" /></span>
              <strong>
                dirty {view.you.dirty} kL / clean {view.you.clean} kL
              </strong>
            </div>
            <div className="stat">
              <span className="mute">Loyalty{view.you.sponsorName ? ` toward ${view.you.sponsorName}` : ""} <Info topic="loyalty" /></span>
              <strong>{view.you.loyalty}</strong>
            </div>
            {view.family && (
              <div className="stat">
                <span className="mute">La famiglia (family)</span>
                <strong>
                  {view.family.name} —{" "}
                  <span className={view.family.state === "weakened" ? "accent-text" : undefined}>
                    {familyStateLabel(view.family.state)}
                  </span>
                  , {formatTreasury(view.family.treasury)}
                </strong>
              </div>
            )}
            <div className="stat">
              <span className="mute">Tenore di vita (lifestyle) <Info topic="lifestyle" /></span>
              <strong>{LIFESTYLE_WORDS[view.you.lifestyle]}</strong>
            </div>
            {view.sponsorMood !== null && (
              <div className="stat">
                <span className="mute">Il padrino (sponsor) <Info topic="sponsor" /></span>
                <strong>{view.sponsorMood}</strong>
              </div>
            )}
            {view.attentionBandName && (
              <div className="stat">
                <span className="mute">Attention <Info topic="attention" /></span>
                <strong>{view.attentionBandName}</strong>
              </div>
            )}
          </>
        ) : (
          <div className="stat mute">Waiting for the world view…</div>
        )}
      </header>

      {/* Design 13 §1's war state ("Guerra (war)" in the header, the turn contracts to a week, collections
          halved): the banner itself is text, in the accent colour as a second, color-only cue on top of it
          (design 07 §6) -- `view.crises.length > 0` already shows the flag name as a pill above, in the header. */}
      {view && view.crises.includes("war") && (
        <div className="banner war accent-text" role="alert">
          Guerra (war): collections at half, men sleeping away from home
        </div>
      )}

      {state.error && <div className="banner error" role="alert">{state.error}</div>}

      {view && state.weekOpen && !runEnded && (
        <WeekModal view={view} pendingActions={state.pendingActions} onWatchWeek={() => setTab("turn")} />
      )}

      {view && runEnded ? (
        <EndOfRun view={view} />
      ) : (
        <>
          <nav className="tabs" role="tablist" aria-label="Screens">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>

          <main className="shell-main" role="tabpanel">
            {!view && <p className="empty">The player view is not available yet (projectView is landing separately). Saves and turns still work.</p>}
            {view && tab === "planning" && <Planning view={view} pendingActions={state.pendingActions} />}
            {view && tab === "turn" && <Turn world={state.world} />}
            {view && tab === "report" && <ReportScreen view={view} />}
            {view && tab === "book" && <Book view={view} />}
            {view && tab === "people" && <People view={view} />}
            {view && tab === "territory" && <Territory view={view} />}
          </main>
        </>
      )}

      <footer className="shell-footer">
        <button type="button" onClick={() => gameStore.saveToDb()}>
          Save
        </button>
        <button type="button" onClick={() => gameStore.exportSave()}>
          Export
        </button>
        <button
          type="button"
          disabled={newGameLocked && !runEnded}
          title={newGameLocked && !runEnded ? "Ironman: no restart while this game is in progress" : ""}
          onClick={() => gameStore.returnToSetup()}
        >
          New game
        </button>
      </footer>
    </div>
  );
}

/** "La fine" (the end): design 09 §3's two finales. Shown in place of the tabs and working area once
 *  `view.you.alive` is false or `view.you.dropped` is true. Names which ending it was, shows the last report
 *  (which itself carries the proposta panel via `ReportScreen`), and a button back to Setup, never gated by
 *  ironman: the run is over on its own terms, not by the player choosing to restart early. */
function EndOfRun({ view }: { view: PlayerView }) {
  const ending = !view.you.alive
    ? `${view.you.name} is dead. The run ends here.`
    : "You drifted away from the life.";

  return (
    <main className="shell-main" role="tabpanel">
      <div className="banner legacy" role="alert">
        <h2>La fine (the end)</h2>
        <p>{ending}</p>
      </div>
      <ReportScreen view={view} />
      <div className="panel">
        <button type="button" className="primary" onClick={() => gameStore.returnToSetup()}>
          Torna alla configurazione (back to setup)
        </button>
      </div>
    </main>
  );
}

/** The week's summary after Fine turno (design 07 §3 as text): the same lines as the Report tab, in a modal the
 *  player dismisses; nothing here is computed, it is `view.report` and `view.proposta` again. */
function WeekModal({
  view,
  pendingActions,
  onWatchWeek,
}: {
  view: PlayerView;
  pendingActions: PlayerAction[];
  /** Design 11-pixel-slice wave A3: "Guarda la settimana" closes the modal and switches the shell to the
   *  Turno tab, where the animated view plays this same week for the chosen place. */
  onWatchWeek: () => void;
}) {
  // Cards that follow directly from this turn's choices (view.ts `followUp`): the interactive part of the turn.
  const andNow = view.decisions.filter((d) => d.followUp);
  const undecided = andNow.filter((d) => !pendingActions.some((a) => a.kind === "decide" && a.instanceId === d.instanceId));
  return (
    <div className="modal-backdrop" role="presentation" onClick={() => undecided.length === 0 && gameStore.dismissWeek()}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-labelledby="week-heading" onClick={(e) => e.stopPropagation()}>
        <h2 id="week-heading">
          La settimana (the week) — Anno {view.report.calendar.year}, settimana {view.report.calendar.week}
        </h2>
        <ReportLines view={view} />
        {view.proposta && (
          <p className="mute">
            La proposta: {view.proposta.label}
          </p>
        )}
        {andNow.length > 0 && (
          <section aria-labelledby="andnow-heading">
            <h3 id="andnow-heading">E adesso (and now)</h3>
            {andNow.map((d) => (
              <SituationCard key={d.instanceId} decision={d} pendingActions={pendingActions} />
            ))}
          </section>
        )}
        <div className="options">
          <button
            type="button"
            disabled={undecided.length > 0}
            onClick={() => {
              gameStore.dismissWeek();
              onWatchWeek();
            }}
          >
            Guarda la settimana (watch the week)
          </button>
          <button type="button" autoFocus disabled={undecided.length > 0} onClick={() => gameStore.dismissWeek()}>
            {undecided.length > 0 ? "Scegli prima (choose first)" : "Continua (continue)"}
          </button>
        </div>
      </div>
    </div>
  );
}

