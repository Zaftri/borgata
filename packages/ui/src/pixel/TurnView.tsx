// The animated Turn view (design 07 §2.2, design 11 wave A1): one chosen place, drawn from `projectScene` and
// played as `SceneClip` beats. Not wired into the shell yet (design 11 A3 does that: `import { TurnView } from
// "./pixel/TurnView.js"` on the Turn tab). This component computes nothing the sim didn't already decide — it
// reads `world`/`lastLog`/`content` from the store, calls `projectScene`, and draws exactly what comes back.
//
// PixiJS 8 pitfalls hit while writing this (see the report to the caller for the full list): `Application` is
// constructed then `await`-initialized separately (`new Application(); await app.init(...)`); only `Container`
// instances may have children in v8 (a bare `Sprite.addChild` throws); the canvas element is `app.canvas`, not
// `app.view`; and a pixel-art texture needs its scale mode set to `"nearest"` (a string in v8, not the old
// `SCALE_MODES.NEAREST` enum) or upscaling blurs it.

import "./turn.css";
import { Application, Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { ActorRole, PlaceOption, SceneActor, SceneBuilding, SceneClip, SceneView } from "@borgata/sim";
import { projectScene } from "@borgata/sim";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useGameStore } from "../store.js";
import { atlas } from "./atlas.js";
import {
  advanceQueue,
  isQueueEmpty,
  skipQueue,
  startQueue,
  type PlaybackQueue,
  type PlaybackSpeed,
  type ScheduledBeat,
} from "./playback.js";

const NARROW_BREAKPOINT_PX = 700;
const WIDE_SCALE = 3;
const NARROW_SCALE = 2;
const TILE_PX = 16;

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState<boolean>(() => (typeof window === "undefined" ? false : window.innerWidth < NARROW_BREAKPOINT_PX));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setNarrow(window.innerWidth < NARROW_BREAKPOINT_PX);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return narrow;
}

function clipLabel(kind: SceneClip["kind"]): string {
  return kind;
}

// ---------------------------------------------------------------------------------------------------------------
// The Pixi layer: mounts an Application once, redraws the scene's tiles/buildings/actors whenever the scene or
// the scale changes, and plays one transient visual per beat. Kept as a single component-scoped hook (rather
// than split further) because every piece of it shares the same Pixi object refs.
// ---------------------------------------------------------------------------------------------------------------

type Layers = { tiles: Container; buildings: Container; actors: Container; effects: Container };

type ActiveEffect = { update(elapsedMs: number): void; cleanup(): void };

function usePixiStage(
  hostRef: { current: HTMLDivElement | null },
  scene: SceneView | null,
  scale: number,
  playback: PlaybackQueue,
  setPlayback: (fn: (q: PlaybackQueue) => PlaybackQueue) => void,
): void {
  const appRef = useRef<Application | null>(null);
  const layersRef = useRef<Layers | null>(null);
  const actorSpritesRef = useRef<Map<string, Sprite>>(new Map());
  const buildingSpritesRef = useRef<Map<string, Sprite[]>>(new Map());
  const buildingByIdRef = useRef<Map<string, SceneBuilding>>(new Map());
  const actorByIdRef = useRef<Map<string, SceneActor>>(new Map());
  const hiddenActorsRef = useRef<Set<string>>(new Set());
  const playbackRef = useRef<PlaybackQueue>(playback);
  const beatElapsedRef = useRef(0);
  const activeEffectRef = useRef<ActiveEffect | null>(null);
  const activeBeatRef = useRef<ScheduledBeat | null>(null);
  // Pixi's init is async: the first redraw would run before the Application exists and never run again for the
  // same scene (found in the owner's browser check, 2026-09-25: a 16-pixel strip). `ready` re-triggers it.
  const [ready, setReady] = useState(false);

  playbackRef.current = playback;

  // Mount once: create the Application and the four layer containers (tiles under buildings under actors
  // under transient effects), and drive both the auto-advance timer and the active beat's effect from one
  // ticker callback.
  useEffect(() => {
    let cancelled = false;
    const app = new Application();
    void (async () => {
      await app.init({ width: TILE_PX, height: TILE_PX, backgroundAlpha: 1, background: "#2a2015", antialias: false });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      const tiles = new Container();
      const buildings = new Container();
      const actors = new Container();
      const effects = new Container();
      app.stage.addChild(tiles, buildings, actors, effects);
      layersRef.current = { tiles, buildings, actors, effects };
      appRef.current = app;
      hostRef.current?.appendChild(app.canvas);
      setReady(true);

      app.ticker.add((ticker) => {
        const deltaMs = ticker.deltaMS;
        beatElapsedRef.current += deltaMs;
        activeEffectRef.current?.update(beatElapsedRef.current);
        const beat = activeBeatRef.current;
        if (beat && beatElapsedRef.current >= beat.durationMs && !isQueueEmpty(playbackRef.current)) {
          setPlayback((q) => advanceQueue(q));
        }
      });
    })();
    return () => {
      cancelled = true;
      activeEffectRef.current?.cleanup();
      activeEffectRef.current = null;
      const app = appRef.current;
      if (app) {
        app.destroy(true, { children: true });
        appRef.current = null;
        layersRef.current = null;
      }
    };
    // Mounts exactly once; `hostRef`/`setPlayback` are stable across the component's life.
  }, []);

  // Redraw the whole scene when the place/turn changes or the pixel scale changes.
  useEffect(() => {
    const app = appRef.current;
    const layers = layersRef.current;
    if (!app || !layers || !scene) return;

    for (const layer of [layers.tiles, layers.buildings, layers.actors, layers.effects]) {
      layer.removeChildren();
    }
    actorSpritesRef.current.clear();
    buildingSpritesRef.current.clear();
    hiddenActorsRef.current.clear();
    buildingByIdRef.current = new Map(scene.buildings.map((b) => [b.businessId, b]));
    actorByIdRef.current = new Map(scene.actors.map((a) => [a.id, a]));

    const pixelsWide = scene.width * TILE_PX * scale;
    const pixelsTall = scene.height * TILE_PX * scale;
    app.renderer.resize(pixelsWide, pixelsTall);
    app.canvas.style.width = `${pixelsWide}px`;
    app.canvas.style.height = `${pixelsTall}px`;

    const place = (sprite: Sprite, x: number, y: number) => {
      sprite.scale.set(scale);
      sprite.x = x * TILE_PX * scale;
      sprite.y = y * TILE_PX * scale;
    };

    for (let y = 0; y < scene.height; y++) {
      const row = scene.tiles[y];
      if (!row) continue;
      for (let x = 0; x < scene.width; x++) {
        const kind = row[x];
        if (!kind) continue;
        const sprite = new Sprite(atlas.tile(kind));
        place(sprite, x, y);
        layers.tiles.addChild(sprite);
      }
    }

    for (const building of scene.buildings) {
      const sprites: Sprite[] = [];
      for (let k = 0; k < building.width; k++) {
        const sprite = new Sprite(atlas.building(building.type, building.size, building.state));
        place(sprite, building.x + k, building.y);
        layers.buildings.addChild(sprite);
        sprites.push(sprite);
      }
      buildingSpritesRef.current.set(building.businessId, sprites);
    }

    for (const actor of scene.actors) {
      const sprite = new Sprite(atlas.figure(actor.role, actor.portrait));
      place(sprite, actor.x, actor.y);
      layers.actors.addChild(sprite);
      actorSpritesRef.current.set(actor.id, sprite);
    }
  }, [scene, scale, ready]);

  // One transient visual per beat (design 07 §2.2's "collectors walking to shops... a shutter being glued...").
  useEffect(() => {
    const layers = layersRef.current;
    activeEffectRef.current?.cleanup();
    activeEffectRef.current = null;
    activeBeatRef.current = playback.current;
    beatElapsedRef.current = 0;
    if (!layers || !scene || !playback.current) return;
    activeEffectRef.current = buildEffect(playback.current.clip, playback.current.durationMs, scale, {
      layers,
      actorSprites: actorSpritesRef.current,
      buildingSprites: buildingSpritesRef.current,
      buildingById: buildingByIdRef.current,
      actorById: actorByIdRef.current,
      hiddenActors: hiddenActorsRef.current,
      sceneWidthPx: scene.width * TILE_PX * scale,
      sceneHeightPx: scene.height * TILE_PX * scale,
    });
  }, [playback.current]);
}

type EffectContext = {
  layers: Layers;
  actorSprites: Map<string, Sprite>;
  buildingSprites: Map<string, Sprite[]>;
  buildingById: Map<string, SceneBuilding>;
  actorById: Map<string, SceneActor>;
  hiddenActors: Set<string>;
  sceneWidthPx: number;
  sceneHeightPx: number;
};

function findActorByRole(ctx: EffectContext, role: ActorRole): SceneActor | null {
  for (const a of ctx.actorById.values()) if (a.role === role) return a;
  return null;
}

function spawn(ctx: EffectContext, texture: Texture, x: number, y: number, scale: number): Sprite {
  const sprite = new Sprite(texture);
  sprite.scale.set(scale);
  sprite.x = x;
  sprite.y = y;
  ctx.layers.effects.addChild(sprite);
  return sprite;
}

function noEffect(): ActiveEffect {
  return { update: () => {}, cleanup: () => {} };
}

/** Builds the one-shot visual for a beat. Sign-visibility clips (design 07 §2.2) never carry an `actorId`, so
 *  branches below that key off `clip.actorId` naturally draw the partial form (an unmarked car, nobody named)
 *  for them without a separate code path. */
function buildEffect(clip: SceneClip, durationMs: number, scale: number, ctx: EffectContext): ActiveEffect {
  const anchorForBusiness = (businessId: string | undefined): { x: number; y: number } | null => {
    if (!businessId) return null;
    const b = ctx.buildingById.get(businessId);
    return b ? { x: b.x * TILE_PX * scale, y: b.y * TILE_PX * scale } : null;
  };
  const anchorForActor = (actorId: string | undefined): { sprite: Sprite; x: number; y: number } | null => {
    if (!actorId) return null;
    const sprite = ctx.actorSprites.get(actorId);
    return sprite ? { sprite, x: sprite.x, y: sprite.y } : null;
  };

  switch (clip.kind) {
    case "collect":
    case "loan":
    case "claim":
    case "share": {
      const anchor = anchorForBusiness(clip.businessId) ?? anchorForActor(clip.actorId);
      if (!anchor) return noEffect();
      const coin = spawn(ctx, atlas.coin(), anchor.x, anchor.y - TILE_PX * scale * 0.3, scale);
      return {
        update: (elapsedMs) => {
          const t = Math.min(1, elapsedMs / durationMs);
          coin.y = anchor.y - TILE_PX * scale * (0.3 + t * 0.8);
          coin.alpha = 1 - t;
        },
        cleanup: () => {
          ctx.layers.effects.removeChild(coin);
          coin.destroy();
        },
      };
    }
    case "missed": {
      const sprites = clip.businessId ? ctx.buildingSprites.get(clip.businessId) : undefined;
      const building = clip.businessId ? ctx.buildingById.get(clip.businessId) : undefined;
      if (!sprites || !building) return noEffect();
      const openTexture = sprites[0]?.texture;
      const shutTexture = atlas.building(building.type, building.size, "refusing");
      let lastPhase = -1;
      return {
        update: (elapsedMs) => {
          const phase = Math.floor(elapsedMs / 150) % 2;
          if (phase === lastPhase) return;
          lastPhase = phase;
          for (const s of sprites) s.texture = phase === 0 ? shutTexture : (openTexture ?? shutTexture);
        },
        cleanup: () => {
          if (!openTexture) return;
          for (const s of sprites) s.texture = openTexture;
        },
      };
    }
    case "lean": {
      const target = anchorForActor(clip.actorId)?.sprite ?? ctx.buildingSprites.get(clip.businessId ?? "")?.[0];
      if (!target) return noEffect();
      const baseX = target.x;
      return {
        update: (elapsedMs) => {
          target.x = baseX + Math.sin(elapsedMs / 40) * 2 * scale;
        },
        cleanup: () => {
          target.x = baseX;
        },
      };
    }
    case "game": {
      const dim = new Graphics().rect(0, 0, ctx.sceneWidthPx, ctx.sceneHeightPx).fill({ color: "#000000", alpha: 0.35 });
      ctx.layers.effects.addChild(dim);
      const you = findActorByRole(ctx, "you");
      const glow = you ? spawn(ctx, atlas.coin(), you.x * TILE_PX * scale, you.y * TILE_PX * scale, scale * 1.5) : null;
      if (glow) glow.tint = "#e8d19a";
      return {
        update: (elapsedMs) => {
          if (glow) glow.alpha = 0.6 + Math.sin(elapsedMs / 120) * 0.4;
        },
        cleanup: () => {
          ctx.layers.effects.removeChild(dim);
          dim.destroy();
          if (glow) {
            ctx.layers.effects.removeChild(glow);
            glow.destroy();
          }
        },
      };
    }
    case "arrest":
    case "release": {
      const arriving = clip.kind === "arrest";
      const actor = clip.actorId ? ctx.actorById.get(clip.actorId) : undefined;
      const sprite = clip.actorId ? ctx.actorSprites.get(clip.actorId) : undefined;
      const destX = actor ? actor.x * TILE_PX * scale : 0;
      const y = actor ? actor.y * TILE_PX * scale : 0;
      const fromX = arriving ? -TILE_PX * scale * 2 : destX;
      const toX = arriving ? destX : -TILE_PX * scale * 2;
      const car = spawn(ctx, atlas.car(), fromX, y, scale);
      if (sprite && arriving) sprite.alpha = 1;
      return {
        update: (elapsedMs) => {
          const t = Math.min(1, elapsedMs / durationMs);
          car.x = fromX + (toX - fromX) * t;
          if (sprite && arriving) sprite.alpha = 1 - t * 0.7;
        },
        cleanup: () => {
          ctx.layers.effects.removeChild(car);
          car.destroy();
          if (sprite && clip.actorId) {
            if (arriving) {
              sprite.visible = false;
              ctx.hiddenActors.add(clip.actorId);
            } else {
              sprite.visible = true;
              sprite.alpha = 1;
              ctx.hiddenActors.delete(clip.actorId);
            }
          }
        },
      };
    }
    case "raid": {
      // Swept along the street row just below the piazza (scene.ts's `layoutTown`: rows 0-1 are the piazza).
      const y = TILE_PX * scale;
      const light = spawn(ctx, atlas.blueLight(), 0, y, scale * 1.5);
      return {
        update: (elapsedMs) => {
          const t = Math.min(1, elapsedMs / durationMs);
          light.x = t * ctx.sceneWidthPx;
          light.alpha = 0.5 + Math.sin(elapsedMs / 80) * 0.4;
        },
        cleanup: () => {
          ctx.layers.effects.removeChild(light);
          light.destroy();
        },
      };
    }
    case "patrol": {
      const car = spawn(ctx, atlas.car(), 0, TILE_PX * scale, scale);
      return {
        update: (elapsedMs) => {
          const t = Math.min(1, elapsedMs / durationMs);
          car.x = t * ctx.sceneWidthPx;
        },
        cleanup: () => {
          ctx.layers.effects.removeChild(car);
          car.destroy();
        },
      };
    }
    case "kid": {
      const kid = findActorByRole(ctx, "kid");
      const sprite = kid ? ctx.actorSprites.get(kid.id) : undefined;
      if (!sprite) return noEffect();
      const baseX = sprite.x;
      const baseY = sprite.y;
      return {
        update: (elapsedMs) => {
          const t = (elapsedMs / durationMs) * Math.PI * 2;
          sprite.x = baseX + Math.sin(t) * TILE_PX * scale * 0.6;
          sprite.y = baseY - Math.abs(Math.cos(t)) * TILE_PX * scale * 0.2;
        },
        cleanup: () => {
          sprite.x = baseX;
          sprite.y = baseY;
        },
      };
    }
    case "favor":
    case "note":
    case "news":
      // Caption-only beats (design 11 A1): nothing animates on the map.
      return noEffect();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The component.
// ---------------------------------------------------------------------------------------------------------------

export function TurnView() {
  const { world, lastLog: log, content, view } = useGameStore();
  const narrow = useIsNarrow();
  const scale = narrow ? NARROW_SCALE : WIDE_SCALE;

  const places: PlaceOption[] = view?.places ?? [];
  const [placeId, setPlaceId] = useState<string | null>(null);
  const effectivePlaceId = placeId && places.some((p) => p.id === placeId) ? placeId : (places[0]?.id ?? null);

  const scene = useMemo<SceneView | null>(() => {
    if (!world || !content || !effectivePlaceId) return null;
    return projectScene(world, log, content, effectivePlaceId);
  }, [world, log, content, effectivePlaceId]);

  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [playback, setPlayback] = useState<PlaybackQueue>({ queue: [], current: null });
  const [openClip, setOpenClip] = useState<SceneClip | null>(null);

  // Rebuild the playhead whenever the scene (a new place, or a new turn's log) or the speed changes.
  useEffect(() => {
    setPlayback(scene ? startQueue(scene.clips, speed) : { queue: [], current: null });
    setOpenClip(null);
  }, [scene, speed]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  usePixiStage(hostRef, scene, scale, playback, setPlayback);

  const caption = playback.current?.clip.text ?? (scene && scene.clips.length > 0 && isQueueEmpty(playback) ? "The week is over." : "Nothing to report here yet.");

  return (
    <div className="turn-view">
      <div className="turn-controls">
        <label className="turn-place-picker">
          Place
          <select
            value={effectivePlaceId ?? ""}
            onChange={(e) => setPlaceId((e.target as HTMLSelectElement).value)}
            disabled={places.length === 0}
          >
            {places.length === 0 && <option value="">No place yet</option>}
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="turn-speed-buttons" role="group" aria-label="Playback speed">
          <button type="button" aria-pressed={speed === 1} onClick={() => setSpeed(1)}>
            1x
          </button>
          <button type="button" aria-pressed={speed === 2} onClick={() => setSpeed(2)}>
            2x
          </button>
          <button type="button" onClick={() => setPlayback((q) => skipQueue(q))} disabled={isQueueEmpty(playback)}>
            Skip
          </button>
        </div>
      </div>

      <div className="turn-canvas-frame" ref={hostRef} />

      <button
        type="button"
        className="turn-caption"
        onClick={() => playback.current && setOpenClip(playback.current.clip)}
        disabled={!playback.current}
      >
        {caption}
      </button>

      {scene && scene.clips.length > 0 && (
        <div className="turn-beat-strip" role="list" aria-label="This turn's beats">
          {scene.clips.map((clip, i) => (
            <button
              key={`${clip.tick}-${clip.kind}-${i}`}
              type="button"
              role="listitem"
              className={`turn-beat-dot${playback.current?.clip === clip ? " turn-beat-current" : ""}`}
              title={clip.text}
              onClick={() => setOpenClip(clip)}
            >
              {clipLabel(clip.kind)}
            </button>
          ))}
        </div>
      )}

      {openClip && (
        <div className="turn-sentence-panel panel" role="dialog" aria-label="Beat detail">
          <p>{openClip.text}</p>
          <button type="button" onClick={() => setOpenClip(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
