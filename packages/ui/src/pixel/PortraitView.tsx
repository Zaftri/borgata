// A character's face, composed by `portrait.ts` (design 07 §5, design 11 wave A2). Renders the cached canvas
// as an `<img>` (a data URL) rather than a mounted canvas, so it behaves like any other image for layout, alt
// text and screen readers, and so a table of two hundred rows never holds two hundred live canvas elements.
//
// Named `PortraitView.tsx`, not `Portrait.tsx`: this directory already holds `portrait.ts` (the drawing
// module), and on this repo's case-insensitive filesystem `import "./Portrait.js"` resolves ambiguously —
// TypeScript's `moduleResolution: "bundler"` probes the `.ts` extension before `.tsx` and matches `portrait.ts`
// first (TS1149), so the two names can't safely coexist as `Portrait.tsx`/`portrait.ts` here. The exported
// component is still `Portrait`, used as `<Portrait parts size alt />`, per design 11 wave A2.
import "./portrait.css";
import type { PortraitParts } from "@borgata/sim";
import { getPortraitDataUrl } from "./portrait.js";

export function Portrait({ parts, size, alt }: { parts: PortraitParts; size: 32 | 64; alt: string }) {
  // packages/ui only ever renders in a browser (design 01 §6), but keep this component side-effect-free to
  // import: no canvas is touched until render, and render itself no-ops without `document` (e.g. a future SSR
  // pass) rather than throwing.
  if (typeof document === "undefined") return null;
  const src = getPortraitDataUrl(parts, size);
  return <img className="portrait" src={src} width={size} height={size} alt={alt} />;
}
