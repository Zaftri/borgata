// The Report screen (design 07 §2.3): last turn's lines grouped, "what the state may know" from signs only,
// and the Attention band name when the territory layer is unlocked.

import type { PlayerView } from "@borgata/sim";
import { groupReportLines, type ReportGroup } from "../format.js";
import { PropostaPanel } from "./Proposta.js";
import { Newspaper } from "./Newspaper.js";

const GROUP_TITLES: Record<ReportGroup, string> = {
  money: "Buste (envelopes)",
  people: "Famiglia (family)",
  state: "Lo stato (the state)",
  notes: "Giornale (notes)",
};

const GROUP_ORDER: ReportGroup[] = ["money", "people", "state", "notes"];

/** The grouped lines of the last turn, shared by the Report tab and the week modal (Shell.tsx). */
export function ReportLines({ view }: { view: PlayerView }) {
  const groups = groupReportLines(view.report.lines);
  const hasAnyLines = view.report.lines.length > 0;
  return (
    <>
      {!hasAnyLines && <p className="empty">Nothing to report from last turn.</p>}
      {GROUP_ORDER.map(
        (g) =>
          groups[g].length > 0 && (
            <div className="report-group" key={g}>
              <h3>{GROUP_TITLES[g]}</h3>
              <ul className="plain">
                {groups[g].map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ),
      )}
    </>
  );
}

export function ReportScreen({ view }: { view: PlayerView }) {
  return (
    <div>
      <PropostaPanel view={view} />
      <section className="panel">
        <h2>
          Rapporto (report) — Anno {view.report.calendar.year}, settimana {view.report.calendar.week}
        </h2>
        <ReportLines view={view} />
      </section>

      <Newspaper view={view} />

      <section className="panel" aria-labelledby="state-heading">
        <h3 id="state-heading">What the state may know</h3>
        {view.attentionBandName && (
          <p>
            Band: <strong>{view.attentionBandName}</strong>
          </p>
        )}
        {view.stateSigns.length === 0 && <p className="empty">No signs this turn.</p>}
        {view.stateSigns.length > 0 && (
          <ul className="plain">
            {view.stateSigns.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
