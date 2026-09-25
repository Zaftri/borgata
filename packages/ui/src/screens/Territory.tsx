// The Territory screen (design 07 §2.1, `territory` layer): the player's town as blocks and businesses with
// holder, compliance/fear and a refusal marker, a claim button when claimable; neighboring towns as rumor lines;
// design 13's district panel (families, the district head, standing, war) below the towns.

import type { Estimate, PlayerView, TownView } from "@borgata/sim";
import { gameStore } from "../store.js";
import { familyStateLabel, formatMeter, formatStanding, refusalMark } from "../format.js";
import { Info } from "./Help.js";

export function Territory({ view }: { view: PlayerView }) {
  const mine = view.towns.filter((t) => t.yours);
  const neighbors = view.towns.filter((t) => !t.yours);

  return (
    <div>
      {mine.length === 0 && (
        <section className="panel">
          <p className="empty">No town of your own yet.</p>
        </section>
      )}
      {mine.map((t) => (
        <OwnTown key={t.id} town={t} />
      ))}

      <District district={view.district} />

      {neighbors.length > 0 && (
        <section className="panel" aria-labelledby="neighbors-heading">
          <h3 id="neighbors-heading">Neighboring towns</h3>
          {neighbors.map((t) => (
            <div key={t.id} style={{ marginBottom: "0.75rem" }}>
              <strong>{t.name}</strong> <span className="mute">({t.archetype}{t.familyName ? `, ${t.familyName}` : ""})</span>
              <ul className="plain">
                {t.sentimentSign && <li>{t.sentimentSign}</li>}
                {t.heatSign && <li>{t.heatSign}</li>}
                {!t.sentimentSign && !t.heatSign && <li className="mute">Nothing is said of it.</li>}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function OwnTown({ town }: { town: TownView }) {
  return (
    <section className="panel" aria-labelledby={`town-${town.id}`}>
      <h2 id={`town-${town.id}`}>
        {town.name} <span className="mute">({town.archetype})</span>
      </h2>
      {town.sentimentSign && <p className="mute">{town.sentimentSign}</p>}
      {town.heatSign && <p className="mute">{town.heatSign}</p>}

      {town.blocks.map((block) => (
        <div key={block.id} style={{ marginBottom: "1rem" }}>
          <h3>
            Block {block.id} {block.crewChiefName && <span className="mute">— crew of {block.crewChiefName}</span>}
          </h3>
          <table className="table-fold">
            <thead>
              <tr>
                <th>Mark</th>
                <th>Business</th>
                <th>Owner</th>
                <th>Holder</th>
                <th>Compliance</th>
                <th>Fear</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {block.businesses.map((b) => (
                <tr key={b.id}>
                  <td data-label="Mark">
                    <span className="mark">{refusalMark(b.refusalStage)}</span>
                  </td>
                  <td data-label="Business">
                    {b.type} (size {b.size})
                  </td>
                  <td data-label="Owner">
                    {b.ownerName ?? <span className="mute">unknown</span>}
                    {b.ownerTrait && <span className="pill">{b.ownerTrait}</span>}
                  </td>
                  <td data-label="Holder">{b.holderName ?? <span className="mute">unclaimed</span>}</td>
                  <td data-label="Compliance">{formatMeter(b.compliance)}</td>
                  <td data-label="Fear">{formatMeter(b.fear)}</td>
                  <td data-label="">
                    {b.claimable && (
                      <button type="button" onClick={() => gameStore.queueAction({ kind: "claimBusiness", businessId: b.id })}>
                        Claim
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="mute">Marks: $ paying, x1-x4 refusing (stage).</p>
    </section>
  );
}

/** Il mandamento (the district), design 13 §2's `PlayerView.district`: its name, its head family, and a table
 *  of every family that shares it (name, yours, state in words, standing as a band, at-war marks). Null until
 *  the player's own family sits in a district (world generation, design 13's owner contracts). */
function District({ district }: { district: PlayerView["district"] }) {
  if (!district) return null;
  return (
    <section className="panel" aria-labelledby="district-heading">
      <h2 id="district-heading">
        Il mandamento (the district) <Info topic="district" />
      </h2>
      <p>
        {district.name} — headed by{" "}
        <strong>{district.headFamilyName ?? <span className="mute">no head yet</span>}</strong>
      </p>
      <table className="table-fold">
        <thead>
          <tr>
            <th>Family</th>
            <th>Yours</th>
            <th>State</th>
            <th>Standing</th>
            <th>At war</th>
          </tr>
        </thead>
        <tbody>
          {district.families.map((f) => (
            <tr key={f.id}>
              <td data-label="Family">{f.name}</td>
              <td data-label="Yours">{f.yours ? "yours" : <span className="mute">—</span>}</td>
              <td data-label="State">{familyStateLabel(f.state)}</td>
              <td data-label="Standing">{f.standing ? <StandingCell standing={f.standing} /> : <span className="mute">—</span>}</td>
              <td data-label="At war">
                {f.atWar ? (
                  <span className="pill accent-text">in guerra (at war)</span>
                ) : (
                  <span className="mute">no</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** A family's standing as a band word (design 13, task brief), the raw band shown on hover via `title`
 *  (design 07 §6: the word always carries the meaning; the number on hover is extra, not required to read it). */
function StandingCell({ standing }: { standing: Estimate }) {
  const { word, raw } = formatStanding(standing);
  return <span title={raw}>{word}</span>;
}
