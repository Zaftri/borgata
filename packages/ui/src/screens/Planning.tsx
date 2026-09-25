// The Planning screen (design 07 §2.1, design 09 §8): situation cards for the week's decisions, then the
// rank-gated action forms ("Ordini"), then the news the player only hears about, then the pending-actions
// list and End turn. The "Being made" panel (design 09 §3) sits above all of it while `view.proposta` is set.

import { Info } from "./Help.js";
import { useState } from "preact/hooks";
import type { ActionSpec, DecisionView, PlayerAction, PlayerView, World } from "@borgata/sim";
import { gameStore, useGameStore } from "../store.js";
import { describeAction, LIFESTYLE_WORDS } from "../format.js";
import { PropostaPanel } from "./Proposta.js";
import { Portrait } from "../pixel/PortraitView.js";
import { characterPortraitParts } from "../pixel/portrait.js";

export function Planning({ view, pendingActions }: { view: PlayerView; pendingActions: PlayerAction[] }) {
  return (
    <div>
      <PropostaPanel view={view} />
      <ThisWeek view={view} pendingActions={pendingActions} />
      <Orders view={view} />
      <HeardOnTheBlock view={view} />
      <div className="panel-grid">
        <div>
          <PendingActions actions={pendingActions} />
        </div>
        <div>
          <div className="panel">
            <button type="button" className="primary" onClick={() => gameStore.endTurn()}>
              Fine turno (end turn)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Questa settimana" (design 09 §8, first-ranks-requirements §6): one situation card per `view.decisions`,
 *  prompt then options as buttons with the option label and its cost hint underneath. The queued option (if
 *  any) is shown selected; clicking another option re-queues the decide for the same instance (store.ts's
 *  `queueAction` replaces rather than appends a second `decide` for one instance). */
function ThisWeek({ view, pendingActions }: { view: PlayerView; pendingActions: PlayerAction[] }) {
  return (
    <section className="panel" aria-labelledby="week-heading">
      <h3 id="week-heading">Questa settimana (this week) <Info topic="cards" /></h3>
      {view.decisions.length === 0 && <p className="empty">Nothing asks for a decision this week.</p>}
      {view.decisions.map((d) => (
        <SituationCard key={d.instanceId} decision={d} pendingActions={pendingActions} />
      ))}
    </section>
  );
}

/** The card's counterpart, for a 32px portrait next to the prompt (design 11 wave A2): the sponsor or crew
 *  chief — the player's superior — for `assoc.favor*`, `assoc.sponsor*` and `chief.demand*` templates; the kid
 *  (the civilian with trait "kid" on record with the player) for `assoc.kid*`. Null for every other template,
 *  or while the world hasn't loaded. */
function counterpartId(world: World | null, templateId: string): string | null {
  if (!world) return null;
  const me = world.characters.byId[world.player.characterId];
  if (!me) return null;
  if (templateId.startsWith("assoc.kid")) {
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      if (c.alive && c.traits.includes("kid") && c.onRecordWith === me.id) return c.id;
    }
    return null;
  }
  if (templateId.startsWith("assoc.favor") || templateId.startsWith("assoc.sponsor") || templateId.startsWith("chief.demand")) {
    return me.superiorId;
  }
  return null;
}

/** One situation card: the prompt, the options with their hints, the queued option pressed. Shared with the week
 *  modal (Shell.tsx), which shows the cards that follow from this turn's choices under "E adesso (and now)". */
export function SituationCard({ decision: d, pendingActions }: { decision: DecisionView; pendingActions: PlayerAction[] }) {
  const { world } = useGameStore();
  const queued = pendingActions.find(
    (a): a is Extract<PlayerAction, { kind: "decide" }> => a.kind === "decide" && a.instanceId === d.instanceId,
  );
  const counterpart = counterpartId(world, d.templateId);
  const counterpartCharacter = counterpart ? world?.characters.byId[counterpart] : undefined;
  const counterpartParts = counterpartCharacter ? characterPortraitParts(world, counterpartCharacter.id) : null;
  return (
    <div className="decision-card situation-card">
      {d.followUp && (
        <p className="mute situation-because">
          Perché hai scelto «{d.followUp.optionLabel}» (because you chose it):
        </p>
      )}
      <div className="situation-heading">
        {counterpartParts && counterpartCharacter && (
          <Portrait parts={counterpartParts} size={32} alt={`Portrait of ${counterpartCharacter.name}`} />
        )}
        <p className="situation-prompt">{d.prompt}</p>
      </div>
      <div className="options">
        {d.options.map((o) => {
          const selected = queued?.optionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              className={selected ? "option-button option-selected" : "option-button"}
              aria-pressed={selected}
              onClick={() => gameStore.queueAction({ kind: "decide", instanceId: d.instanceId, optionId: o.id })}
            >
              <span className="option-label">{o.label}</span>
              {o.hint && <span className="option-hint">{o.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Sentito sul quartiere" (design 09 §4/§8): news requests only — another man's business the player merely
 *  hears about. Requests with `kind === "decision"` are not repeated here; their card is in "Questa settimana". */
function HeardOnTheBlock({ view }: { view: PlayerView }) {
  const news = view.requests.filter((r) => r.kind === "news");
  return (
    <section className="panel" aria-labelledby="news-heading">
      <h3 id="news-heading">Sentito sul quartiere (heard on the block) <Info topic="news" /></h3>
      {news.length === 0 && <p className="empty">Nothing heard this week.</p>}
      {news.length > 0 && (
        <ul className="plain">
          {news.map((r) => (
            <li key={r.id}>{r.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Orders({ view }: { view: PlayerView }) {
  // The two permission actions are hidden until soldier rank (design 09 §8, first-ranks-requirements §6);
  // `askPermission` is the only ActionSpec associate rank ever receives from buildActions (view.ts), so it is
  // the only one filtered here.
  const visible = view.actions.filter((spec) => spec.kind !== "askPermission" || view.you.rank !== "associate");
  // Design 12 §1: "Ordini" lists tenore di vita (lifestyle) last, after whatever else the rank offers this
  // turn — a display-order choice only; `view.actions` itself carries no ordering guarantee to rely on.
  const actions = [...visible.filter((spec) => spec.kind !== "setLifestyle"), ...visible.filter((spec) => spec.kind === "setLifestyle")];

  if (actions.length === 0) {
    return (
      <section className="panel" aria-labelledby="orders-heading">
        <h3 id="orders-heading">Ordini (orders)</h3>
        <p className="empty">No actions available at your rank yet.</p>
      </section>
    );
  }
  return (
    <section className="panel" aria-labelledby="orders-heading">
      <h3 id="orders-heading">Ordini (orders)</h3>
      {actions.map((spec, i) => (
        <ActionForm key={i} spec={spec} />
      ))}
    </section>
  );
}

function ActionForm({ spec }: { spec: ActionSpec }) {
  switch (spec.kind) {
    case "setShare":
      return <SetShareForm spec={spec} />;
    case "claimBusiness":
      return <ClaimBusinessForm spec={spec} />;
    case "releaseClaim":
      return <ReleaseClaimForm spec={spec} />;
    case "askPermission":
      return <AskPermissionForm spec={spec} />;
    case "lend":
      return <LendForm spec={spec} />;
    case "setLifestyle":
      return <LifestyleForm spec={spec} />;
  }
}

function SetShareForm({ spec }: { spec: Extract<ActionSpec, { kind: "setShare" }> }) {
  const [values, setValues] = useState<Record<string, { fixed: string; percent: string }>>({});

  if (spec.subordinates.length === 0) return null;

  return (
    <div>
      <h3>La quota (set share) <Info topic="setShare" /></h3>
      {spec.subordinates.map((s) => {
        const v = values[s.id] ?? {
          fixed: String(s.current?.fixedPerTurn ?? 0),
          percent: String((s.current?.percent ?? 0) / 10),
        };
        return (
          <div className="action-form" key={s.id}>
            <span>{s.name}</span>
            <label>
              fixed (kL)
              <input
                type="number"
                value={v.fixed}
                onInput={(e) => setValues({ ...values, [s.id]: { ...v, fixed: (e.target as HTMLInputElement).value } })}
                style={{ width: "5em", marginLeft: "0.3em" }}
              />
            </label>
            <label>
              percent
              <input
                type="number"
                value={v.percent}
                onInput={(e) => setValues({ ...values, [s.id]: { ...v, percent: (e.target as HTMLInputElement).value } })}
                style={{ width: "4em", marginLeft: "0.3em" }}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                gameStore.queueAction({
                  kind: "setShare",
                  subordinateId: s.id,
                  rule: { fixedPerTurn: Math.round(Number(v.fixed) || 0), percent: Math.round((Number(v.percent) || 0) * 10) },
                })
              }
            >
              Set
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ClaimBusinessForm({ spec }: { spec: Extract<ActionSpec, { kind: "claimBusiness" }> }) {
  if (spec.businesses.length === 0) return null;
  return (
    <div>
      <h3>La pretesa (claim a business) <Info topic="claimBusiness" /></h3>
      {spec.businesses.map((b) => (
        <div className="action-form" key={b.id}>
          <span>{b.label}</span>
          <button type="button" onClick={() => gameStore.queueAction({ kind: "claimBusiness", businessId: b.id })}>
            Claim
          </button>
        </div>
      ))}
    </div>
  );
}

function ReleaseClaimForm({ spec }: { spec: Extract<ActionSpec, { kind: "releaseClaim" }> }) {
  if (spec.claims.length === 0) return null;
  return (
    <div>
      <h3>Lasciare la pretesa (release a claim) <Info topic="releaseClaim" /></h3>
      {spec.claims.map((c) => (
        <div className="action-form" key={c.claimId}>
          <span>{c.label}</span>
          <button type="button" onClick={() => gameStore.queueAction({ kind: "releaseClaim", claimId: c.claimId })}>
            Release
          </button>
        </div>
      ))}
    </div>
  );
}

// Rendered only at soldier rank and above (Orders filters `askPermission` out at associate rank), so the two
// buttons always carry the soldier-rank labels from design 09 §8 / first-ranks-requirements §6.
const ASK_LABELS: Record<"makeAssociate" | "openBook", string> = {
  openBook: "Aprire il libro (open the book)",
  makeAssociate: "Chiedere di fare un associato (ask to make an associate)",
};

function AskPermissionForm({ spec }: { spec: Extract<ActionSpec, { kind: "askPermission" }> }) {
  if (spec.options.length === 0) return null;
  return (
    <div>
      <h3>Chiedere al capodecina (ask the chief) <Info topic="askPermission" /></h3>
      <div className="action-form">
        {spec.options.map((opt) => (
          <button key={opt} type="button" onClick={() => gameStore.queueAction({ kind: "askPermission", what: opt })}>
            {ASK_LABELS[opt]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Prestito" (design 09 §6, first-ranks-requirements §5): the loan book form, shown once the chief's book is
 *  open (soldier rank and above; `view.actions` carries a `lend` spec only then, per view.ts's `buildActions`).
 *  Business select, principal bounded to `10..spec.maxPrincipal`, points bounded to `1..10`. */
function LendForm({ spec }: { spec: Extract<ActionSpec, { kind: "lend" }> }) {
  const [businessId, setBusinessId] = useState(spec.businesses[0]?.id ?? "");
  const [principal, setPrincipal] = useState(String(Math.min(10, spec.maxPrincipal)));
  const [points, setPoints] = useState("3");

  if (spec.businesses.length === 0) return null;

  const canLend = spec.maxPrincipal >= 10;

  return (
    <div>
      <h3>Prestito (lend) <Info topic="lend" /></h3>
      {!canLend && <p className="empty">Not enough cash on hand to open a loan (minimum 10 kL).</p>}
      {canLend && (
        <div className="action-form">
          <label>
            business
            <select
              value={businessId}
              onInput={(e) => setBusinessId((e.target as HTMLSelectElement).value)}
              style={{ marginLeft: "0.3em" }}
            >
              {spec.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            capitale (principal, kL)
            <input
              type="number"
              min={10}
              max={spec.maxPrincipal}
              value={principal}
              onInput={(e) => setPrincipal((e.target as HTMLInputElement).value)}
              style={{ width: "6em", marginLeft: "0.3em" }}
            />
          </label>
          <label>
            punti (points: percent of the principal he pays you every week)
            <input
              type="number"
              min={1}
              max={10}
              value={points}
              onInput={(e) => setPoints((e.target as HTMLInputElement).value)}
              style={{ width: "4em", marginLeft: "0.3em" }}
            />
          </label>
          <span className="mute">
            {(() => {
              const pr = Math.round(Number(principal) || 0);
              const pt = Math.round(Number(points) || 0);
              const weekly = Math.round((pr * pt) / 100);
              return pr > 0 && pt > 0 ? `He pays you about ${weekly} kL a week while he can; four missed weeks in a row and the loan defaults.` : "";
            })()}
          </span>
          <button
            type="button"
            onClick={() => {
              const clampedPrincipal = Math.min(spec.maxPrincipal, Math.max(10, Math.round(Number(principal) || 0)));
              const clampedPoints = Math.min(10, Math.max(1, Math.round(Number(points) || 0)));
              gameStore.queueAction({ kind: "lend", businessId, principal: clampedPrincipal, points: clampedPoints });
            }}
          >
            Lend
          </button>
        </div>
      )}
    </div>
  );
}

function PendingActions({ actions }: { actions: PlayerAction[] }) {
  return (
    <section className="panel" aria-labelledby="pending-heading">
      <h3 id="pending-heading">Queued this turn</h3>
      {actions.length === 0 && <p className="empty">Nothing queued yet.</p>}
      {actions.length > 0 && (
        <ul className="plain">
          {actions.map((a, i) => (
            <li key={i}>
              {describeAction(a)}{" "}
              <button type="button" onClick={() => gameStore.removeAction(i)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tenore di vita (lifestyle), design 12: a weekly cost, respect with the men, and the state's eye. Each
 *  option states its own cost from `spec.costs` (never a number the player could not know), and the current
 *  choice shows pressed and disabled, same convention as `SituationCard`'s queued option. */
function LifestyleForm({ spec }: { spec: Extract<ActionSpec, { kind: "setLifestyle" }> }) {
  const labels: Record<"modest" | "ordinary" | "lavish", string> = {
    modest: `${LIFESTYLE_WORDS.modest}: ${spec.costs.modest} kL a week, nothing noticed, less respect`,
    ordinary: `${LIFESTYLE_WORDS.ordinary}: ${spec.costs.ordinary} kL a week, respect as a man of the family`,
    lavish: `${LIFESTYLE_WORDS.lavish}: ${spec.costs.lavish} kL a week, respect and the state's eye`,
  };
  return (
    <div>
      <h3>Tenore di vita (lifestyle) <Info topic="lifestyle" /></h3>
      <div className="options">
        {(["modest", "ordinary", "lavish"] as const).map((l) => (
          <button
            key={l}
            type="button"
            className={spec.current === l ? "option-button option-selected" : "option-button"}
            aria-pressed={spec.current === l}
            disabled={spec.current === l}
            onClick={() => gameStore.queueAction({ kind: "setLifestyle", lifestyle: l })}
          >
            <span className="option-label">{labels[l]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

