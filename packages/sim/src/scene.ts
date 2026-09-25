// The animated turn's data (design 07 §2.2, §4): one chosen place, laid out as a tile grid, and the turn log's
// entries for that place as an ordered list of clips. Pure projection: the renderer (packages/ui, PixiJS) draws
// this and never computes an outcome. The equivalence rule (design 07 §4): the clip list for a place equals the
// player-visible log entries about that place, in tick order; a test in scene.test.ts holds it.
//
// Layout is derived, never stored (design 01 §5: the world is the truth, everything drawn is a projection of it):
// the same town id always lays out the same way, so a replay draws the same picture.

import { hash64 } from "@borgata/shared";
import type { Content } from "./content-types.js";
import type { Fact } from "./facts.js";
import type { LogEntry, TurnLog } from "./log.js";
import type { Business, BusinessType, Character, Town, World } from "./world.js";

export type TileKind = "street" | "piazza" | "wall" | "water" | "quay" | "field" | "church" | "police" | "harbor";

export type BuildingState = "open" | "refusing" | "yours" | "sponsor" | "closed";

export type SceneBuilding = {
  businessId: string;
  blockId: string;
  x: number; // tiles
  y: number;
  width: number; // 1..3 tiles by size
  type: BusinessType;
  size: number;
  state: BuildingState;
  label: string; // "bar 2 on blk-3"
};

export type ActorRole = "you" | "kid" | "associate" | "soldier" | "chief" | "civilian";

export type SceneActor = { id: string; name: string; role: ActorRole; x: number; y: number; portrait: PortraitParts };

export type ClipKind =
  | "collect" | "missed" | "lean" | "game" | "arrest" | "release" | "raid" | "patrol" | "favor" | "kid" | "loan" | "claim" | "share" | "note" | "news";

/** One animated beat. `text` is the report sentence the beat stands for; the renderer never composes text. */
export type SceneClip = {
  tick: number;
  kind: ClipKind;
  text: string;
  actorId?: string;
  businessId?: string;
  /** "sign" clips are drawn in their partial form (an unknown car, not a labelled van), design 07 §2.2. */
  visibility: "known" | "sign";
  cause: { rule: string; templateId?: string; instanceId?: string };
};

export type SceneView = {
  placeId: string;
  placeName: string;
  archetype: string;
  width: number;
  height: number;
  /** Row-major, height rows of width tiles. Buildings are drawn over "wall" tiles. */
  tiles: TileKind[][];
  buildings: SceneBuilding[];
  actors: SceneActor[];
  clips: SceneClip[];
};

export type PlaceOption = { id: string; name: string; yours: boolean };

// ---------------------------------------------------------------------------------------------------------------
// Portraits (design 07 §5): part ids derived from the character, deterministic, cached by the renderer.
// ---------------------------------------------------------------------------------------------------------------

export type PortraitParts = {
  skin: number; // 0..5
  head: number; // 0..5
  hair: number; // 0..13
  hairAge: 0 | 1 | 2; // full, thinning, grey
  brows: number; // 0..4
  eyes: number; // 0..7
  nose: number; // 0..5
  mouth: number; // 0..6
  facialHair: number; // 0..8, 0 = none
  ageMarks: 0 | 1 | 2 | 3; // none, lines, heavy lines, gaunt
  clothing: number; // 0..11 by role and lifestyle
  accessory: number; // 0..7, 0 = none
};

const CLOTHING_BY_RANK: Record<string, number> = { civilian: 0, associate: 1, soldier: 2, chief: 3, underboss: 4, counselor: 5, head: 6 };

/** Deterministic parts from the character id (a 64-bit hash sliced into fields), the age band and the rank. */
export function portraitParts(c: Character): PortraitParts {
  const h = hash64(`portrait:${c.id}`);
  const n = (i: number, mod: number): number => Number((BigInt("0x" + h) >> BigInt(i * 6)) & 63n) % mod;
  const ageMarks: 0 | 1 | 2 | 3 = c.age >= 65 ? 3 : c.age >= 50 ? 2 : c.age >= 35 ? 1 : 0;
  const hairAge: 0 | 1 | 2 = c.age >= 60 ? 2 : c.age >= 45 ? 1 : 0;
  const isKid = c.traits.includes("kid");
  return {
    skin: n(0, 6),
    head: n(1, 6),
    hair: n(2, 14),
    hairAge,
    brows: n(3, 5),
    eyes: n(4, 8),
    nose: n(5, 6),
    mouth: n(6, 7),
    facialHair: isKid || c.age < 20 ? 0 : n(7, 9),
    ageMarks,
    clothing: isKid ? 7 : (CLOTHING_BY_RANK[c.rank] ?? 0),
    accessory: n(8, 8),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Layout: a town is streets of buildings, a piazza at the top, and an edge that says what kind of place it is.
// ---------------------------------------------------------------------------------------------------------------

const WIDTH_BY_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };

function edgeTile(archetype: string): TileKind {
  if (archetype.includes("harbor") || archetype.includes("coastal") || archetype.includes("island")) return "water";
  if (archetype.includes("agricultural")) return "field";
  return "street";
}

export function layoutTown(world: World, town: Town): Pick<SceneView, "width" | "height" | "tiles" | "buildings"> {
  const buildings: SceneBuilding[] = [];
  const rows: Array<{ blockId: string; businesses: Business[] }> = [];
  for (const blockId of town.blockIds) {
    const block = world.geo.blocks.byId[blockId];
    if (!block) continue;
    rows.push({ blockId, businesses: block.businessIds.map((id) => world.geo.businesses.byId[id]).filter((b): b is Business => !!b) });
  }
  const rowWidths = rows.map((r) => r.businesses.reduce((n, b) => n + (WIDTH_BY_SIZE[b.size] ?? 1) + 1, 1));
  const width = Math.max(12, ...rowWidths, 0);
  // Row plan: 2 rows of piazza, then per block: 1 row of buildings, 1 row of street; then 2 rows of edge.
  const height = 2 + rows.length * 2 + 2;
  const tiles: TileKind[][] = [];
  for (let y = 0; y < height; y++) tiles.push(new Array<TileKind>(width).fill("street"));
  for (let x = 0; x < width; x++) {
    tiles[0]![x] = "piazza";
    tiles[1]![x] = "piazza";
  }
  tiles[0]![Math.floor(width / 2)] = "church";
  tiles[1]![1] = "police";
  const edge = edgeTile(town.archetype);
  for (let x = 0; x < width; x++) {
    tiles[height - 2]![x] = edge === "water" ? "quay" : edge;
    tiles[height - 1]![x] = edge;
  }
  if (edge === "water") tiles[height - 2]![Math.floor(width / 2)] = "harbor";

  const me = world.characters.byId[world.player.characterId];
  const myClaims = new Set(
    world.claims.order.map((id) => world.claims.byId[id]!).filter((c) => c.holderId === world.player.characterId && c.subject.kind === "business").map((c) => c.subject.id),
  );
  const sponsorClaims = new Set(
    me?.onRecordWith
      ? world.claims.order.map((id) => world.claims.byId[id]!).filter((c) => c.holderId === me.onRecordWith && c.subject.kind === "business").map((c) => c.subject.id)
      : [],
  );
  rows.forEach((row, i) => {
    const y = 2 + i * 2;
    let x = 1;
    for (const b of row.businesses) {
      const w = WIDTH_BY_SIZE[b.size] ?? 1;
      for (let k = 0; k < w; k++) tiles[y]![x + k] = "wall";
      const state: BuildingState = myClaims.has(b.id) ? "yours" : sponsorClaims.has(b.id) ? "sponsor" : b.refusalStage > 0 ? "refusing" : "open";
      buildings.push({ businessId: b.id, blockId: row.blockId, x, y, width: w, type: b.type, size: b.size, state, label: `${b.type} ${b.size} on ${row.blockId}` });
      x += w + 1;
    }
  });
  return { width, height, tiles, buildings };
}

// ---------------------------------------------------------------------------------------------------------------
// Clips: the log, filtered to the place, one beat per entry the player may see.
// ---------------------------------------------------------------------------------------------------------------

function businessTown(world: World, businessId: string): string | null {
  const b = world.geo.businesses.byId[businessId];
  const block = b ? world.geo.blocks.byId[b.blockId] : undefined;
  return block ? block.townId : null;
}

function characterTown(world: World, characterId: string): string | null {
  const c = world.characters.byId[characterId];
  const family = c?.familyId ? world.families.byId[c.familyId] : undefined;
  return family?.townIds[0] ?? null;
}

/** The clip for a fact about `placeId`, or null when the fact is not about the place or not animated. */
export function clipOf(world: World, entry: LogEntry, placeId: string, texts: Map<string, string>): SceneClip | null {
  if (entry.visibility !== "player") return null;
  if (entry.kind === "note") return { tick: entry.tick, kind: "note", text: entry.text, visibility: "known", cause: { rule: "note" } };
  if (entry.kind !== "fact") return null;
  const f: Fact = entry.fact;
  const cause = { rule: f.cause.rule, ...(f.cause.templateId ? { templateId: f.cause.templateId } : {}), ...(f.cause.instanceId ? { instanceId: f.cause.instanceId } : {}) };
  const me = world.player.characterId;
  switch (f.kind) {
    case "MoneyMint": {
      if (f.source === "protectionTax" && f.cause.subjectId && businessTown(world, f.cause.subjectId) === placeId) {
        return { tick: entry.tick, kind: "collect", text: `Collected ${f.amount} kL.`, actorId: f.cause.actorId ?? me, businessId: f.cause.subjectId, visibility: "known", cause };
      }
      if (f.source === "cardGame" && f.to === world.characters.byId[me]?.accounts.personal && characterTown(world, me) === placeId) {
        return { tick: entry.tick, kind: "game", text: `The table paid ${f.amount} kL.`, actorId: me, visibility: "known", cause };
      }
      if (f.source === "kidErrand" && characterTown(world, me) === placeId) {
        return { tick: entry.tick, kind: "kid", text: `The kid brought ${f.amount} kL.`, actorId: me, visibility: "known", cause };
      }
      return null;
    }
    case "CollectionMissed":
      if (businessTown(world, f.businessId) !== placeId) return null;
      return { tick: entry.tick, kind: "missed", text: "A shop came up short.", actorId: f.collectorId, businessId: f.businessId, visibility: "known", cause };
    case "FearDelta":
      if (f.delta < 40 || businessTown(world, f.businessId) !== placeId) return null;
      return { tick: entry.tick, kind: "lean", text: "Someone leaned on a shop.", businessId: f.businessId, ...(f.cause.actorId ? { actorId: f.cause.actorId } : {}), visibility: f.cause.actorId ? "known" : "sign", cause };
    case "StatusChange": {
      if (characterTown(world, f.characterId) !== placeId) return null;
      const name = world.characters.byId[f.characterId]?.name ?? "A man";
      if (f.status === "arrested") return { tick: entry.tick, kind: "arrest", text: `${name} was arrested.`, actorId: f.characterId, visibility: "known", cause };
      if (f.status === "free" && f.cause.rule === "detention.ended") return { tick: entry.tick, kind: "release", text: `${name} is out.`, actorId: f.characterId, visibility: "known", cause };
      return null;
    }
    case "HeatDelta":
      if (f.townId !== placeId || f.delta > -50) return null;
      return { tick: entry.tick, kind: "raid", text: "The police swept the block.", visibility: "sign", cause };
    case "RankChange":
      if (f.characterId !== me) return null;
      return { tick: entry.tick, kind: "favor", text: `You are now ${f.rank}: the ceremony.`, actorId: me, visibility: "known", cause };
    case "BandChange": {
      const family = world.families.byId[f.familyId];
      if (!family || !family.townIds.includes(placeId as never)) return null;
      return { tick: entry.tick, kind: "patrol", text: f.to > f.from ? "The state is looking harder at the family." : "The state's interest eases.", visibility: "sign", cause };
    }
    case "ClaimTransfer":
      if (f.toHolderId !== me) return null;
      return { tick: entry.tick, kind: "claim", text: "The chief gave you a stall.", actorId: me, visibility: "known", cause };
    case "LoanOpen":
      if (f.loan.lenderId !== me && !(f.loan.borrower.kind === "character" && f.loan.borrower.id === me)) return null;
      return { tick: entry.tick, kind: "loan", text: `A loan of ${f.loan.principal} kL.`, actorId: me, ...(f.loan.borrower.kind === "business" ? { businessId: f.loan.borrower.id } : {}), visibility: "known", cause };
    case "MoneyMove":
      if (f.cause.rule !== "share" || characterTown(world, me) !== placeId) return null;
      if (f.to !== world.characters.byId[me]?.accounts.personal && f.from !== world.characters.byId[me]?.accounts.personal) return null;
      return { tick: entry.tick, kind: "share", text: `${f.amount} kL went up the ladder.`, actorId: me, visibility: "known", cause };
    case "ReportNote": {
      const channel = f.channel ?? "sponsor";
      const text = texts.get(f.text) ?? f.text;
      // The beat kind follows the card that produced the line: a patrol stop is a patrol beat, the game a game
      // beat, the kid's errand a kid beat; every other card is a favor beat, the newspaper a news beat.
      const t = f.cause.templateId ?? "";
      const kind: ClipKind = channel === "newspaper" ? "news" : t.startsWith("state.patrol") || t.startsWith("state.raid") ? "patrol" : t.startsWith("assoc.game") ? "game" : t.startsWith("assoc.kid") ? "kid" : t.startsWith("assoc.latePayer") ? "lean" : t.startsWith("soldier.loan") ? "loan" : "favor";
      return { tick: entry.tick, kind, text, actorId: me, visibility: "known", cause };
    }
    default:
      return null;
  }
}

/** Places the player may watch: the family's towns first, then towns where the player holds a claim. */
export function placesForPlayer(world: World): PlaceOption[] {
  const me = world.characters.byId[world.player.characterId];
  const family = me?.familyId ? world.families.byId[me.familyId] : undefined;
  const out: PlaceOption[] = [];
  for (const townId of family?.townIds ?? []) {
    const town = world.geo.towns.byId[townId];
    if (town) out.push({ id: town.id, name: town.name, yours: true });
  }
  return out;
}

export function projectScene(world: World, log: TurnLog | null, _content: Content, placeId: string): SceneView | null {
  const town = world.geo.towns.byId[placeId];
  if (!town) return null;
  const layout = layoutTown(world, town);
  const me = world.player.characterId;
  const actors: SceneActor[] = [];
  const buildingByBusiness = new Map(layout.buildings.map((b) => [b.businessId, b]));
  // Actors: the player, the kid, the family's men in this town, placed on the street below their first stall.
  let slot = 0;
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (!c.alive) continue;
    const isYou = c.id === me;
    const isKid = c.traits.includes("kid") && c.onRecordWith === me;
    const inFamily = c.familyId !== null && characterTown(world, c.id) === placeId && c.rank !== "civilian";
    if (!isYou && !isKid && !inFamily) continue;
    const role: ActorRole = isYou ? "you" : isKid ? "kid" : c.rank === "chief" ? "chief" : c.rank === "associate" ? "associate" : c.rank === "civilian" ? "civilian" : "soldier";
    const claim = world.claims.order.map((cid) => world.claims.byId[cid]!).find((cl) => cl.holderId === c.id && cl.subject.kind === "business" && buildingByBusiness.has(cl.subject.id));
    const anchor = claim ? buildingByBusiness.get(claim.subject.id)! : undefined;
    const x = anchor ? anchor.x : 1 + (slot % Math.max(1, layout.width - 2));
    const y = anchor ? anchor.y + 1 : 1;
    slot++;
    actors.push({ id: c.id, name: c.name, role, x, y, portrait: portraitParts(c) });
  }
  const clips: SceneClip[] = [];
  const texts = new Map<string, string>();
  for (const entry of log?.entries ?? []) {
    const clip = clipOf(world, entry, placeId, texts);
    if (clip) clips.push(clip);
  }
  clips.sort((a, b) => a.tick - b.tick);
  return { placeId, placeName: town.name, archetype: town.archetype, ...layout, actors, clips };
}
