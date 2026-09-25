// Invariants for character creation (design 09 §5, `CharacterCreate`), registered by importing this module
// from ./all.ts.

import { registerInvariant, type Violation } from "../invariants.js";

registerInvariant({
  name: "characters.createdValid",
  check(world): Violation[] {
    const out: Violation[] = [];
    for (const id of world.characters.order) {
      const c = world.characters.byId[id]!;
      if (!world.ledger.accounts.byId[c.accounts.personal]) {
        out.push({ name: "characters.createdValid", message: `character ${id} account ${c.accounts.personal} does not exist` });
      }
      if (c.superiorId !== null && !world.characters.byId[c.superiorId]) {
        out.push({ name: "characters.createdValid", message: `character ${id} superior ${c.superiorId} does not exist` });
      }
    }
    return out;
  },
});
