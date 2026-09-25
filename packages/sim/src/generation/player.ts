// Generation stage 5 (design 05 stage 8, K3, K5): choose the start town, attach the player as an
// associate on record with a soldier of that town's family, and give the sponsor's crew chief the
// exposed-vacancy setup the tutorial needs. Draws from "generation.player" only. Also exports
// `assignShopkeeperOwners`, called by generation/index.ts after stage 6 to give every shop on the sponsor's
// crew's blocks a civilian owner (design 09 §5, docs/event-storming-2026-09-25.md §3 hotspot 1) -- see that
// function's own comment for why it runs after stage 6 rather than inline here.

import { mintId, tableInsert, type ClaimId, type CharacterId, type CrewId, type FamilyId, type TownId } from "@borgata/shared";
import type { Content } from "../content-types.js";
import { getStream, type Stream } from "../rng.js";
import { addCharacter, playerCharacter, type Character, type Crew, type Dossier, type EvidenceItem, type GameSetup, type Town, type World } from "../world.js";
import { pickManName } from "./names.js";

/** Design 09 §5: the sponsor's personality, drawn with equal weight. Templates (content, in parallel)
 * read these traits to weight the associate favor and card-game decisions. */
const SPONSOR_PERSONALITIES = ["patient", "hothead", "schemer", "gambler"] as const;

/** Design 09 §5: 30 percent of families require "bones" (a killing) before they make an associate. */
const BONES_REQUIRED_CHANCE = 3000;

/** Design 09 §5: the player starts able to run the card game, and with the cash to bank it once. */
const PLAYER_STARTING_CASH = 20;

/** Design 09 §5's shopkeeper traits, per ten thousand ("reporter 15 percent, proud 20, latePayer 25, none").
 * docs/event-storming-2026-09-25.md §3 hotspot 1: these traits belong on the shop's OWNER character, not the
 * business itself, which is exactly what was missing before this generator addition. */
const SHOPKEEPER_TRAIT_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["reporter", 1500],
  ["proud", 2000],
  ["latePayer", 2500],
];

/** One draw from "generation.player": the owner's trait, or none (design 09 §5: the remaining 40 percent).
 * Always consumes exactly one draw, like town-content.ts's `pickWeighted`, so the stream stays deterministic
 * regardless of which branch is taken. */
function pickShopkeeperTrait(stream: Stream): string | null {
  let r = stream.nextInt(10_000);
  for (const [trait, weight] of SHOPKEEPER_TRAIT_WEIGHTS) {
    if (r < weight) return trait;
    r -= weight;
  }
  return null;
}

export type PlayerPlacement = {
  startTown: Town;
  familyId: FamilyId;
  sponsorId: CharacterId;
  chiefId: CharacterId;
  crewId: CrewId;
  /** The rival associate on record with the sponsor (design 09 §5, §2.4). */
  rivalId: CharacterId;
  /** The player's kid, a civilian errand boy on record with the player (design 09 §5). */
  kidId: CharacterId;
};

function findFamilyByTown(world: World, townId: TownId): FamilyId {
  for (const id of world.families.order) {
    const family = world.families.byId[id]!;
    if (family.townIds.includes(townId)) return family.id;
  }
  throw new Error(`generation: no family found for town ${townId}`);
}

function soldiersOfFamily(world: World, familyId: FamilyId): Character[] {
  const out: Character[] = [];
  for (const id of world.families.byId[familyId]!.crewIds) {
    const crew = world.crews.byId[id]!;
    for (const memberId of crew.memberIds) out.push(world.characters.byId[memberId]!);
  }
  return out;
}

function crewOfMember(world: World, characterId: CharacterId): Crew {
  for (const id of world.crews.order) {
    const crew = world.crews.byId[id]!;
    if (crew.memberIds.includes(characterId)) return crew;
  }
  throw new Error(`generation: no crew found for member ${characterId}`);
}

/** Stage 5: pick the start town (the setup archetype if set, else a random `playerStart` archetype
 * town), put the player on record with one of its family's soldiers, and set up the K5 tutorial cast. */
export function placePlayer(world: World, content: Content, setup: GameSetup, towns: readonly Town[], headSurnames: ReadonlyMap<FamilyId, string>): PlayerPlacement {
  const stream = getStream(world.rng, "generation.player");

  let startTown = setup.archetype ? towns.find((t) => t.archetype === setup.archetype) : undefined;
  if (!startTown) {
    const archetypesById = new Map(content.archetypes.map((a) => [a.id, a]));
    const candidates = towns.filter((t) => archetypesById.get(t.archetype)?.playerStart);
    const pool = candidates.length > 0 ? candidates : towns;
    startTown = stream.pick(pool);
  }

  const familyId = findFamilyByTown(world, startTown.id);
  const soldiers = soldiersOfFamily(world, familyId);
  if (soldiers.length === 0) throw new Error(`generation: start family ${familyId} has no soldiers to sponsor the player`);
  const sponsor = stream.pick(soldiers);
  const sponsorCrew = crewOfMember(world, sponsor.id);
  const chief = world.characters.byId[sponsorCrew.chiefId]!;

  // Design 09 §5: the sponsor gets exactly one personality trait, equal weight.
  const personality = stream.pick(SPONSOR_PERSONALITIES);
  if (!sponsor.traits.includes(personality)) sponsor.traits = [...sponsor.traits, personality];

  // Design 09 §5: the family requires "bones" (a killing before the proposal) 30 percent of the time.
  const family = world.families.byId[familyId]!;
  family.policy.bonesRequired = stream.chance(BONES_REQUIRED_CHANCE);

  const player = playerCharacter(world);
  player.superiorId = sponsor.id;
  player.familyId = familyId;
  player.onRecordWith = sponsor.id;
  sponsor.shareRules[player.id] = { fixedPerTurn: 0, percent: 500 };

  const claimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "associate", id: player.id }, holderId: sponsor.id, since: world.meta.turn });

  // Background (brief PC-1): "family" draws the player's surname from the family head's and adds the
  // kin trait; "outsider" draws a random surname. Both draw a given name; the player character has no
  // surname field of its own, so it becomes part of `name` like every other generated character.
  const givenName = stream.pick(content.names.givenMale);
  const surname = setup.background === "family" ? headSurnames.get(familyId) ?? stream.pick(content.names.surnames) : stream.pick(content.names.surnames);
  player.name = `${givenName} ${surname}`;
  if (setup.background === "family" && !player.traits.includes("kin")) player.traits = [...player.traits, "kin"];

  // K5: the sponsor's crew chief carries high exposure so a vacancy is plausible. Generation writes
  // evidence state directly (CLAUDE.md generation exception) rather than emitting EvidenceAdd facts,
  // since there is no turn/cause to attach them to before turn 0.
  if (!chief.traits.includes("exposed")) chief.traits = [...chief.traits, "exposed"];
  const items: EvidenceItem[] = [
    { crimeRef: "generation.sponsorChiefExposure", weight: 200, source: "document", turn: world.meta.turn },
    { crimeRef: "generation.sponsorChiefExposure", weight: 200, source: "document", turn: world.meta.turn },
  ];
  const dossier: Dossier = { characterId: chief.id, items };
  tableInsert(world.evidence.dossiers, chief.id, dossier);
  chief.exposure = 400;

  // Design 09 §5, §2.4: a second associate on record with the sponsor, the rival. He is added as a
  // collector on the sponsor's crew chain the same way the player is: `ai/family-ai.ts` `ensureChain`
  // sweeps every associate whose `onRecordWith` names a crew member, no extra wiring needed here.
  const rivalName = pickManName(stream, content.names, new Set());
  const rival = addCharacter(world, {
    name: rivalName.full,
    rank: "associate",
    age: stream.nextRange(18, 30),
    familyId,
    superiorId: sponsor.id,
    onRecordWith: sponsor.id,
    traits: ["ambitious"],
  });
  const rivalClaimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, rivalClaimId, { id: rivalClaimId, subject: { kind: "associate", id: rival.id }, holderId: sponsor.id, since: world.meta.turn });
  sponsor.shareRules[rival.id] = { fixedPerTurn: 0, percent: 500 };

  // Design 09 §5, §4: the kid, a civilian errand boy on record with the player. He carries the `kid`
  // trait and the player's family scope (a family owns exactly one town in phase 5, so this is also his
  // town scope); he draws no share of anything (design 09 §5: "no account income of his own"). A claim
  // backs `onRecordWith` here (as it does for the player and the rival above) because
  // `invariants/claims.ts` `claims.associateOnRecordConsistent` requires exactly one associate-claim for
  // any character with `onRecordWith` set, regardless of rank; design 09 §10 names the same rule as a
  // planned invariant ("a claim if on record"), so this keeps the kid consistent with both today and that
  // future check rather than leaving him claim-less and `onRecordWith`-less.
  const kid = addCharacter(world, {
    name: pickManName(stream, content.names, new Set()).full,
    rank: "civilian",
    age: stream.nextRange(14, 17),
    familyId,
    superiorId: player.id,
    onRecordWith: player.id,
    traits: ["kid"],
  });
  const kidClaimId = mintId<"ClaimId">(world.meta.ids, "clm") as ClaimId;
  tableInsert(world.claims, kidClaimId, { id: kidClaimId, subject: { kind: "associate", id: kid.id }, holderId: player.id, since: world.meta.turn });

  // Design 09 §5: the player starts running the card game (memory tag read by `assoc.game.stake`,
  // design 09 §4) and with 20 kL of dirty cash to bank it. Money is minted straight into the ledger, the
  // way the K5 evidence above is written directly rather than through a fact (CLAUDE.md generation
  // exception: there is no turn or cause to attach a `MoneyMint` to before turn 0), while still keeping
  // `money.conservation` satisfied (accounts sum equals `minted - destroyed`).
  player.memory.push({ tag: "runsGame", weight: 100, turn: world.meta.turn });
  const playerAccount = world.ledger.accounts.byId[player.accounts.personal]!;
  playerAccount.dirty += PLAYER_STARTING_CASH;
  world.ledger.minted += PLAYER_STARTING_CASH;

  return { startTown, familyId, sponsorId: sponsor.id, chiefId: chief.id, crewId: sponsorCrew.id, rivalId: rival.id, kidId: kid.id };
}

/** Design 09 §5, docs/event-storming-2026-09-25.md §3 hotspot 1: a civilian owner for every business on the
 * sponsor's crew's blocks (the ones the player's own associate week actually touches), so `roles.ts`'s
 * `ownerOf` relation and the templates that read it (assoc.latePayer's reporter branch, sendKid's shopkeeper
 * memory, assoc.civil.help's named shopkeeper) have someone to bind from turn 0. Businesses on other blocks
 * and other towns stay ownerless -- lazy, later (design 09 §5's own wording).
 *
 * Called from `generateWorld` (generation/index.ts) AFTER stage 6 (`resolveBeats`), not inline in
 * `placePlayer` above: stage 6's `ensureEarlyCollision` (beats.ts) can regenerate every business on the
 * whole start town (including the sponsor's crew's blocks) from scratch to guarantee the K5 collision beat,
 * which would silently orphan any owner set beforehand. Still drawn from "generation.player" only, and still
 * last in that stream's draw sequence, so every earlier draw in this stage (and every other stage's own
 * streams) keeps its position -- golden diverges only from here on, which the harness summary must report. */
export function assignShopkeeperOwners(world: World, content: Content, placement: PlayerPlacement): void {
  const stream = getStream(world.rng, "generation.player");
  const crew = world.crews.byId[placement.crewId];
  if (!crew) return;
  const usedOwnerNames = new Set<string>();
  for (const blockId of crew.blockIds) {
    const block = world.geo.blocks.byId[blockId];
    if (!block) continue;
    for (const businessId of block.businessIds) {
      const shop = world.geo.businesses.byId[businessId];
      if (!shop || shop.ownerId) continue;
      const ownerName = pickManName(stream, content.names, usedOwnerNames);
      const trait = pickShopkeeperTrait(stream);
      const owner = addCharacter(world, {
        name: ownerName.full,
        rank: "civilian",
        age: stream.nextRange(30, 65),
        familyId: null,
        traits: trait ? [trait] : [],
      });
      shop.ownerId = owner.id;
    }
  }
}
