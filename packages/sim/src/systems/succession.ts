// The dead leave the books (design 02 §6 invariants claims.holderValid and families.superiorAlive). A death is a
// StatusChange applied by the characters reducer; this system, run after the turn's facts, emits the follow-on
// facts for the owners concerned: the dead man's claims are released (claims) and his subordinates lose their
// superior (characters). Replacement of a dead crew chief or head is a later phase (rise and fall of families).
import type { CharacterId } from "@borgata/shared";
import type { Content } from "../content-types.js";
import type { Cause, Fact } from "../facts.js";
import { claimsHeldBy } from "../reducers/claims.js";
import type { World } from "../world.js";
import { buildSubordinateIndex, computeWeight } from "./progression.js";

export function successionStep(world: World, _content: Content): Fact[] {
  const facts: Fact[] = [];
  const dead = new Set<CharacterId>();
  for (const id of world.characters.order) if (!world.characters.byId[id]!.alive) dead.add(id as CharacterId);
  if (dead.size === 0) return facts;
  for (const deadId of dead) {
    const cause: Cause = { rule: "succession.death", actorId: deadId };
    for (const claim of claimsHeldBy(world, deadId)) facts.push({ kind: "ClaimRelease", claimId: claim.id, cause });
  }
  for (const id of world.characters.order) {
    const c = world.characters.byId[id]!;
    if (c.alive && c.superiorId && dead.has(c.superiorId)) facts.push({ kind: "SuperiorSet", characterId: c.id, superiorId: null, cause: { rule: "succession.death", actorId: c.superiorId } });
  }
  // A dead crew chief is replaced by the crew's soldier of most Weight (design 13; U-6's factions come later).
  // The reducer requires rank chief, so the RankChange comes first in the same list; the SuperiorSet null above
  // for the crew's men is undone the turn after when the family AI resets shares, and the new chief's own superior
  // is set by CrewChiefSet.
  for (const crewId of world.crews.order) {
    const crew = world.crews.byId[crewId]!;
    if (!dead.has(crew.chiefId)) continue;
    const index = buildSubordinateIndex(world);
    let best: { id: CharacterId; weight: number } | null = null;
    for (const mid of crew.memberIds) {
      const m = world.characters.byId[mid];
      if (!m || !m.alive || m.status === "dead" || m.rank !== "soldier") continue;
      const w = computeWeight(world, m.id, index);
      if (!best || w > best.weight) best = { id: m.id, weight: w };
    }
    if (!best) continue;
    const cause: Cause = { rule: "succession.crewChief", actorId: crew.chiefId };
    facts.push({ kind: "RankChange", characterId: best.id, rank: "chief", cause });
    facts.push({ kind: "CrewChiefSet", crewId: crew.id, chiefId: best.id, cause });
  }
  return facts;
}
