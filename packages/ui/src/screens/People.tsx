// The People screen (design 07 §2.1 layer `associates`/`family.chart` etc.): a table from `view.people` —
// relation, rank, status, loyalty (band or value with its precision marker), notes.

import type { PersonView, PlayerView } from "@borgata/sim";
import { formatMeter } from "../format.js";
import { useGameStore } from "../store.js";
import { Portrait } from "../pixel/PortraitView.js";
import { characterPortraitParts } from "../pixel/portrait.js";

const RELATION_LABEL: Record<PersonView["relation"], string> = {
  you: "you",
  sponsor: "sponsor",
  superior: "superior",
  subordinate: "subordinate",
  crewmate: "crewmate",
  family: "family",
  rival: "rival",
  civilian: "civilian",
};

export function People({ view }: { view: PlayerView }) {
  const { world } = useGameStore();
  return (
    <section className="panel">
      <h2>People</h2>
      {view.people.length === 0 && <p className="empty">No one on record yet.</p>}
      {view.people.length > 0 && (
        <table className="table-fold">
          <thead>
            <tr>
              <th aria-label="Portrait" />
              <th>Name</th>
              <th>Relation</th>
              <th>Rank</th>
              <th>Status</th>
              <th>Loyalty</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {view.people.map((p) => (
              <tr key={p.id}>
                <td className="portrait-cell" data-label="">
                  {(() => {
                    const parts = characterPortraitParts(world, p.id);
                    return parts && <Portrait parts={parts} size={32} alt={`Portrait of ${p.name}`} />;
                  })()}
                </td>
                <td data-label="Name">{p.name}</td>
                <td data-label="Relation">{RELATION_LABEL[p.relation]}</td>
                <td data-label="Rank">{p.rank}</td>
                <td data-label="Status">
                  {p.status}
                  {p.detainedUntilTurn !== null && <span className="pill">until turn {p.detainedUntilTurn}</span>}
                </td>
                <td data-label="Loyalty">
                  {formatMeter(p.loyalty)}
                  {p.loyalty.precision !== "exact" && <span className="pill">{p.loyalty.precision}</span>}
                </td>
                <td data-label="Notes">{p.notes.length > 0 ? p.notes.join("; ") : <span className="mute">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
