// "La proposta" (being made) panel (design 09 §3, §8; first-ranks-requirements §3, §6). Shared by Planning and
// Report. Pure view of `view.proposta`: a four-step band indicator (0..3), its label, and its sign sentences.
// Renders nothing once the player has been made (`proposta` is null).

import { Info } from "./Help.js";
import type { PlayerView } from "@borgata/sim";

const STEPS = [0, 1, 2, 3] as const;

export function PropostaPanel({ view }: { view: PlayerView }) {
  const proposta = view.proposta;
  if (!proposta) return null;

  return (
    <section className="panel proposta-panel" aria-labelledby="proposta-heading">
      <h3 id="proposta-heading">La proposta (being made) <Info topic="proposta" /></h3>
      <div className="proposta-band" role="img" aria-label={`Band ${proposta.band + 1} of 4: ${proposta.label}`}>
        {STEPS.map((i) => (
          <span key={i} className={i <= proposta.band ? "proposta-step filled" : "proposta-step"} />
        ))}
        <span className="proposta-label">{proposta.label}</span>
      </div>
      {proposta.signs.length > 0 && (
        <ul className="plain proposta-signs">
          {proposta.signs.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
