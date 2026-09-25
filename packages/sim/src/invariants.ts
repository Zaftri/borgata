// Executable invariants (build plan S6; design 02 §9; design 08 §4). Run every turn in debug, sampled in release.

import { tableIntegrity, type Table } from "@borgata/shared";
import { totalMoney } from "./reducers/ledger.js";
import { computeTurnLength } from "./reducers/calendar.js";
import type { World } from "./world.js";

export type Violation = { name: string; message: string };
export type Invariant = { name: string; check(world: World): Violation[] };

const registry: Invariant[] = [];

export function registerInvariant(inv: Invariant): void {
  if (registry.some((r) => r.name === inv.name)) throw new Error(`invariant already registered: ${inv.name}`);
  registry.push(inv);
}

export function listInvariants(): readonly string[] {
  return registry.map((r) => r.name);
}

export function runInvariants(world: World): Violation[] {
  const out: Violation[] = [];
  for (const inv of registry) out.push(...inv.check(world));
  return out;
}

/** Health checks (build plan §5b item 5): economy conditions the game should satisfy but that do not make the
 *  world inconsistent when they fail. The step never throws on them; the harness reports them as WARN with counts,
 *  and stories assert the ones they are about. */
const healthRegistry: Invariant[] = [];
export function registerHealthCheck(inv: Invariant): void {
  if (healthRegistry.some((r) => r.name === inv.name)) throw new Error(`health check already registered: ${inv.name}`);
  healthRegistry.push(inv);
}
export function runHealthChecks(world: World): Violation[] {
  const out: Violation[] = [];
  for (const inv of healthRegistry) out.push(...inv.check(world));
  return out;
}

function allTables(world: World): Array<[string, Table<unknown>]> {
  return [
    ["families", world.families],
    ["characters", world.characters],
    ["households", world.households],
    ["claims", world.claims],
    ["ledger.accounts", world.ledger.accounts],
    ["chains", world.chains],
    ["processes", world.processes],
    ["evidence.dossiers", world.evidence.dossiers],
    ["evidence.cases", world.evidence.cases],
    ["evidence.witnesses", world.evidence.witnesses],
    ["towns", world.towns],
    ["geo.provinces", world.geo.provinces],
    ["geo.districts", world.geo.districts],
    ["geo.towns", world.geo.towns],
    ["geo.blocks", world.geo.blocks],
    ["geo.businesses", world.geo.businesses],
    ["geo.institutions", world.geo.institutions],
    ["geo.routes", world.geo.routes],
  ];
}

// ---- built-in invariants (phase 0) ----

registerInvariant({
  name: "money.conservation",
  check(world) {
    const total = totalMoney(world);
    const expected = world.ledger.minted - world.ledger.destroyed;
    return total === expected ? [] : [{ name: "money.conservation", message: `accounts sum to ${total}, minted - destroyed is ${expected}` }];
  },
});

registerInvariant({
  name: "money.nonNegative",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.ledger.accounts.order) {
      const a = world.ledger.accounts.byId[id]!;
      if (a.dirty < 0 || a.clean < 0) out.push({ name: "money.nonNegative", message: `account ${id} negative: dirty ${a.dirty}, clean ${a.clean}` });
      if (!Number.isSafeInteger(a.dirty) || !Number.isSafeInteger(a.clean)) out.push({ name: "money.nonNegative", message: `account ${id} non-integer` });
    }
    return out;
  },
});

registerInvariant({
  name: "tables.integrity",
  check(world) {
    const out: Violation[] = [];
    for (const [name, t] of allTables(world)) {
      const problem = tableIntegrity(t);
      if (problem) out.push({ name: "tables.integrity", message: `${name}: ${problem}` });
    }
    return out;
  },
});

registerInvariant({
  name: "calendar.turnLengthConsistent",
  check(world) {
    const expected = computeTurnLength(world);
    return world.meta.turnLength === expected
      ? []
      : [{ name: "calendar.turnLengthConsistent", message: `turnLength ${world.meta.turnLength} but rank and crises imply ${expected}` }];
  },
});

registerInvariant({
  name: "calendar.weekInRange",
  check(world) {
    const w = world.meta.calendar.week;
    return w >= 1 && w <= 52 ? [] : [{ name: "calendar.weekInRange", message: `week ${w}` }];
  },
});

registerInvariant({
  name: "player.exists",
  check(world) {
    const c = world.characters.byId[world.player.characterId];
    if (!c) return [{ name: "player.exists", message: "player character missing" }];
    if (!c.playerControlled) return [{ name: "player.exists", message: "player character not flagged playerControlled" }];
    if (!world.ledger.accounts.byId[c.accounts.personal]) return [{ name: "player.exists", message: "player account missing" }];
    return [];
  },
});

registerInvariant({
  name: "rng.streamShape",
  check(world) {
    const out: Violation[] = [];
    for (const [name, s] of Object.entries(world.rng.streams)) {
      if (s.length !== 4 || s.some((x) => !Number.isInteger(x) || x < 0 || x > 0xffffffff)) out.push({ name: "rng.streamShape", message: `stream ${name} malformed` });
      if (s.every((x) => x === 0)) out.push({ name: "rng.streamShape", message: `stream ${name} is all zero` });
    }
    return out;
  },
});
