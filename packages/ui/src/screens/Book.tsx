// Il libro (the book): who is under you, what each pays, your stalls, your loans and your debts, with last
// turn's figures. Reads `view.book` only; every number is the core's (design 07 §5: exact for what you own).
import type { PlayerView } from "@borgata/sim";
import { Info } from "./Help.js";
import { useGameStore } from "../store.js";
import { Portrait } from "../pixel/PortraitView.js";
import { characterPortraitParts } from "../pixel/portrait.js";
import { dutyDueLabel, dutyKindLabel } from "../format.js";

function lastTurnLabel(v: "paid" | "missed" | "quiet"): string {
  return v === "paid" ? "pagato (paid)" : v === "missed" ? "mancato (missed)" : "niente (nothing due)";
}

export function Book({ view }: { view: PlayerView }) {
  const { world } = useGameStore();
  const b = view.book;
  return (
    <div>
      <section className="panel">
        <h2>
          I miei uomini (my men) <Info topic="book" />
        </h2>
        {b.men.length === 0 && <p className="empty">Nobody is on your book yet. As a soldier, ask the chief to make an associate.</p>}
        {b.men.length > 0 && (
          <table className="table-fold">
            <thead>
              <tr>
                <th aria-label="Portrait" />
                <th>Name</th>
                <th>Rank</th>
                <th>Status</th>
                <th>La quota (share)</th>
                <th>Paid you last turn</th>
                <th>Loyalty</th>
              </tr>
            </thead>
            <tbody>
              {b.men.map((m) => (
                <tr key={m.id}>
                  <td className="portrait-cell" data-label="">
                    {(() => {
                      const parts = characterPortraitParts(world, m.id);
                      return parts && <Portrait parts={parts} size={32} alt={`Portrait of ${m.name}`} />;
                    })()}
                  </td>
                  <td data-label="Name">{m.name}</td>
                  <td data-label="Rank">{m.rank}</td>
                  <td data-label="Status">{m.status}</td>
                  <td data-label="La quota (share)">{m.share ? `${m.share.fixedPerTurn} kL + ${m.share.percent / 10}%` : <span className="mute">none set</span>}</td>
                  <td data-label="Paid you last turn">{m.paidLastTurn} kL</td>
                  <td data-label="Loyalty">{m.loyalty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>
          Le mie pretese (my stalls) <Info topic="claimBusiness" />
        </h2>
        {b.stalls.length === 0 && (
          <p className="empty">
            {view.you.rank === "associate" ? "An associate works his sponsor's stalls; his own come with being made." : "You hold no stall. Claim one under Ordini, or wait for the chief to hand you one."}
          </p>
        )}
        {b.stalls.length > 0 && (
          <table className="table-fold">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Owner</th>
                <th>Collected by</th>
                <th>Last turn</th>
                <th>Compliance</th>
              </tr>
            </thead>
            <tbody>
              {b.stalls.map((s) => (
                <tr key={s.businessId}>
                  <td data-label="Shop">{s.label}</td>
                  <td data-label="Owner">{s.ownerName ?? <span className="mute">unknown</span>}</td>
                  <td data-label="Collected by">{s.collectorName}</td>
                  <td data-label="Last turn">
                    {lastTurnLabel(s.lastTurn)}
                    {s.amount > 0 && ` · ${s.amount} kL`}
                  </td>
                  <td data-label="Compliance">
                    {s.compliance}
                    {s.refusalStage > 0 && <span className="pill">refusing</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>
          Il libro dei prestiti (my loans) <Info topic="lend" />
        </h2>
        {b.loans.length === 0 && <p className="empty">No loans out.</p>}
        {b.loans.length > 0 && (
          <table className="table-fold">
            <thead>
              <tr>
                <th>Borrower</th>
                <th>Principal</th>
                <th>Points</th>
                <th>Weekly interest</th>
                <th>Last turn</th>
                <th>Late</th>
              </tr>
            </thead>
            <tbody>
              {b.loans.map((l) => (
                <tr key={l.id}>
                  <td data-label="Borrower">{l.borrowerLabel}</td>
                  <td data-label="Principal">{l.principal} kL</td>
                  <td data-label="Points">{l.points}</td>
                  <td data-label="Weekly interest">{l.weeklyInterest} kL</td>
                  <td data-label="Last turn">{lastTurnLabel(l.lastTurn)}</td>
                  <td data-label="Late">
                    {l.weeksLate === 0 ? <span className="mute">on time</span> : `${l.weeksLate} week${l.weeksLate === 1 ? "" : "s"}, ${l.weeksToDefault} to default`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>I miei debiti (what I owe)</h2>
        {b.debts.length === 0 && <p className="empty">You owe nobody.</p>}
        {b.debts.length > 0 && (
          <table className="table-fold">
            <thead>
              <tr>
                <th>Lender</th>
                <th>Principal left</th>
                <th>Points</th>
                <th>Paid last turn</th>
              </tr>
            </thead>
            <tbody>
              {b.debts.map((d, i) => (
                <tr key={i}>
                  <td data-label="Lender">{d.lenderName}</td>
                  <td data-label="Principal left">{d.principal} kL</td>
                  <td data-label="Points">{d.points}</td>
                  <td data-label="Paid last turn">{d.paidLastTurn} kL</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>
          I miei doveri (my duties) <Info topic="duties" />
        </h2>
        {b.duties.length === 0 && <p className="empty">No duties. A man with no duties has no men.</p>}
        {b.duties.length > 0 && (
          <table className="table-fold">
            <thead>
              <tr>
                <th>What</th>
                <th>To whom</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Recurring</th>
                <th>Met</th>
                <th>Missed</th>
                <th>Last result</th>
              </tr>
            </thead>
            <tbody>
              {b.duties.map((d) => (
                <tr key={d.id}>
                  <td data-label="What">{dutyKindLabel(d.kind, d.beneficiaryName)}</td>
                  <td data-label="To whom">{d.beneficiaryName}</td>
                  <td data-label="Amount">{d.amount} kL</td>
                  <td data-label="Due">{dutyDueLabel(d.dueIn)}</td>
                  <td data-label="Recurring">{d.recurring ? "recurring" : "once"}</td>
                  <td data-label="Met">{d.met}</td>
                  <td data-label="Missed">{d.missed}</td>
                  <td data-label="Last result">{lastResultLabel(d.lastResult)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function lastResultLabel(v: "met" | "missed" | null): string {
  return v === "met" ? "rispettato (met)" : v === "missed" ? "mancato (missed)" : "ancora nessuno (none yet)";
}
