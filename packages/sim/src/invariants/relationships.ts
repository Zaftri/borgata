// Invariants for the relationships system (design 02 §4, design 03 §5), registered by importing this
// module from ./all.ts.

import { registerInvariant, type Violation } from "../invariants.js";

const MEMORY_LIMIT = 32;
const FAVOR_KEY_RE = /^(.+)\|(.+)$/;

registerInvariant({
  name: "relationships.loyaltyInRange",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      if (!Number.isInteger(c.loyalty) || c.loyalty < 0 || c.loyalty > 1000) {
        out.push({ name: "relationships.loyaltyInRange", message: `character ${id} loyalty out of range: ${c.loyalty}` });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "relationships.favorsValid",
  check(world) {
    const out: Violation[] = [];
    for (const [key, value] of Object.entries(world.favors)) {
      const m = FAVOR_KEY_RE.exec(key);
      if (!m) {
        out.push({ name: "relationships.favorsValid", message: `favor key malformed: ${key}` });
        continue;
      }
      const [, from, to] = m;
      if (from === to) out.push({ name: "relationships.favorsValid", message: `favor key ${key} has equal characters` });
      if (!world.characters.byId[from!]) out.push({ name: "relationships.favorsValid", message: `favor key ${key} references unknown character ${from}` });
      if (!world.characters.byId[to!]) out.push({ name: "relationships.favorsValid", message: `favor key ${key} references unknown character ${to}` });
      if (!Number.isInteger(value) || value === 0 || value < -1000 || value > 1000) {
        out.push({ name: "relationships.favorsValid", message: `favor key ${key} value out of range: ${value}` });
      }
    }
    return out;
  },
});

registerInvariant({
  name: "relationships.memoryBounded",
  check(world) {
    const out: Violation[] = [];
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      if (c.memory.length > MEMORY_LIMIT) {
        out.push({ name: "relationships.memoryBounded", message: `character ${id} has ${c.memory.length} memories, over the ${MEMORY_LIMIT} limit` });
      }
      for (const m of c.memory) {
        if (!Number.isInteger(m.weight) || m.weight <= 0) {
          out.push({ name: "relationships.memoryBounded", message: `character ${id} memory "${m.tag}" has non-positive weight: ${m.weight}` });
        }
      }
    }
    return out;
  },
});
