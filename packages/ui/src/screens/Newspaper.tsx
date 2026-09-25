// Il giornale (design 07 §5, design 07 §2.3 "Newspaper" page, design 11-pixel-slice wave A3): a styled DOM
// panel for the town's public news. It renders `view.newspaper` (view.ts) verbatim — the renderer never
// composes sentences (design 07 §4) — as short newspaper columns, with an invented masthead (the game world's
// papers are fictional; "La Voce della Provincia" is not a real paper) and a photo slot for the place's tile
// snapshot. Pure view of `PlayerView`; no game logic, no `world` access (design 01 §8 rule 1 does not apply to
// the UI, but the same "read only the projection" discipline does, per design 07 §4).

import { useEffect, useRef } from "preact/hooks";
import type { PlayerView } from "@borgata/sim";

const MASTHEAD = "La Voce della Provincia";

/** Splits newspaper lines into up to `columnCount` newspaper-style columns: the first column reads top to
 *  bottom before the next one starts, as in print, rather than round-robin. Pure and exported for its own
 *  test (packages/ui/src/screens/newspaper.test.ts) since this environment has no `preact-render-to-string`. */
export function splitIntoColumns(lines: readonly string[], columnCount: number): string[][] {
  if (lines.length === 0) return [];
  if (columnCount <= 1) return [[...lines]];
  const perColumn = Math.ceil(lines.length / columnCount);
  const columns: string[][] = [];
  for (let i = 0; i < columnCount; i++) {
    const chunk = lines.slice(i * perColumn, (i + 1) * perColumn);
    if (chunk.length > 0) columns.push(chunk);
  }
  return columns;
}

/** A duck-typed check for a canvas element: avoids referencing the `HTMLCanvasElement` global at runtime so
 *  this module still loads under vitest's default (non-DOM) environment. */
function isCanvas(v: unknown): v is HTMLCanvasElement {
  return typeof v === "object" && v !== null && typeof (v as { getContext?: unknown }).getContext === "function";
}

/** The photo slot (design 07 §5): a 96x96 crop of the Turn view's canvas when the caller has one, a plain
 *  image when given a URL/data-URI, or a placeholder tile pattern (drawn in CSS, style.css `.newspaper-photo`)
 *  when no photo is available yet — A1's TurnView does not expose a snapshot in this wave. */
function NewspaperPhoto({ photo }: { photo: HTMLCanvasElement | string | undefined }) {
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !isCanvas(photo)) return;
    slot.replaceChildren(photo);
    return () => {
      slot.replaceChildren();
    };
  }, [photo]);

  if (photo === undefined) {
    return (
      <div
        className="newspaper-photo newspaper-photo-placeholder"
        role="img"
        aria-label="No photograph filed this week"
      />
    );
  }
  if (typeof photo === "string") {
    return (
      <div className="newspaper-photo">
        <img src={photo} width={96} height={96} alt="This week, in the district" />
      </div>
    );
  }
  return <div className="newspaper-photo" ref={slotRef} />;
}

export function Newspaper({ view, photo }: { view: PlayerView; photo?: HTMLCanvasElement | string }) {
  const lines = view.newspaper;
  const columns = splitIntoColumns(lines, 2);

  return (
    <section className="panel newspaper" aria-labelledby="newspaper-heading">
      <div className="newspaper-head">
        <div className="newspaper-masthead">
          <h2 id="newspaper-heading" className="newspaper-title">
            {MASTHEAD}
          </h2>
          <p className="newspaper-dateline">
            Anno {view.calendar.year}, settimana {view.calendar.week}
          </p>
        </div>
        <NewspaperPhoto photo={photo} />
      </div>
      {lines.length === 0 ? (
        <p className="empty newspaper-filler">Niente di nuovo (nothing new) this week.</p>
      ) : (
        <div className="newspaper-columns">
          {columns.map((column, i) => (
            <div className="newspaper-column" key={i}>
              {column.map((line, j) => (
                <p className="newspaper-line" key={j}>
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
