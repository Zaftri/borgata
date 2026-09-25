// The Turno (turn) tab (design 07 §2.2, design 11-pixel-slice wave A3): hosts A1's animated `TurnView`,
// which plays the chosen place's `TurnLog` entries in tick order. This wrapper owns none of that logic — it
// only lazy-loads the component (so the two waves can land independently) and shows a loading/fallback panel
// when it is not there yet.
//
// `TurnView.tsx` is loaded through `import.meta.glob`, a build-time file scan (Vite), rather than a plain
// `import("../pixel/TurnView.js")`: a literal dynamic import is resolved by Rollup at build time and fails
// the whole build if the target file does not exist yet. A glob that matches zero files is not an error, so
// `pnpm build` passes whether or not A1 has landed; once `packages/ui/src/pixel/TurnView.tsx` exists, the
// glob picks it up automatically and Vite code-splits it normally.
/// <reference types="vite/client" />

import { useEffect, useState } from "preact/hooks";
import type { ComponentType } from "preact";
import type { World } from "@borgata/sim";

// A1's landed `TurnView` (packages/ui/src/pixel/TurnView.tsx) takes no props: it reads `world`/`lastLog`/
// `content`/`view` from the store itself (the same `useGameStore()` every other screen uses), rather than
// receiving them from its parent. This wrapper follows that shape rather than the props sketch this wave
// started from, since the landed component is the real contract.
type TurnViewComponentType = ComponentType<Record<string, never>>;

const turnViewModules = import.meta.glob<{ TurnView: TurnViewComponentType }>("../pixel/TurnView.tsx");

/** Resolves to A1's `TurnView` component, or `null` when the module has not landed in this checkout. Cached
 *  at module scope so switching tabs back and forth does not re-trigger the (glob-matched) dynamic import. */
let cachedTurnView: TurnViewComponentType | null = null;
let triedLoad = false;

function loadTurnView(): Promise<TurnViewComponentType | null> {
  const [key] = Object.keys(turnViewModules);
  if (!key) return Promise.resolve(null);
  return turnViewModules[key]!().then((mod) => mod.TurnView);
}

/** `world` is only used for the "no world yet" fallback below; `TurnView` reads the rest of the projection
 *  from the store on its own once it has landed. */
export function Turn({ world }: { world: World | null }) {
  // The lazy-initializer form (`() => cachedTurnView`) matters here: `cachedTurnView` is itself a function (a
  // component), and `useState` calls any function passed as its plain argument to compute the initial state
  // rather than storing it — `useState(cachedTurnView)` would invoke `TurnView()` directly, outside of a
  // render pass (corrupting its hooks), and store the vnode it returns as state instead of the component.
  const [TurnViewComponent, setTurnViewComponent] = useState<TurnViewComponentType | null>(() => cachedTurnView);
  const [failed, setFailed] = useState(triedLoad && !cachedTurnView);

  useEffect(() => {
    if (TurnViewComponent) return;
    let cancelled = false;
    loadTurnView()
      .then((component) => {
        triedLoad = true;
        if (cancelled) return;
        if (component) {
          cachedTurnView = component;
          setTurnViewComponent(() => component);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        triedLoad = true;
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [TurnViewComponent]);

  if (!world) {
    return (
      <section className="panel">
        <p className="empty">No world yet — start or load a game first.</p>
      </section>
    );
  }

  if (TurnViewComponent) {
    return <TurnViewComponent />;
  }

  return (
    <section className="panel turn-loading" aria-live="polite">
      <h2>Turno (turn)</h2>
      <p className="empty">
        {failed
          ? "The animated map is not available in this build yet. Watch the Report tab for what happened."
          : "Loading the map…"}
      </p>
    </section>
  );
}
