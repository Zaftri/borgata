// Aggregator: the core registry first, then every system's invariant module (they register on import).
// Import THIS module (not ../invariants.js) wherever invariants are run, so system invariants are always loaded.
export * from "../invariants.js";
import "./claims.js";
import "./relationships.js";
import "./towns.js";
import "./chains.js";
import "./families.js";
import "./evidence.js";
import "./pressure.js";
import "./engine.js";
import "./progression.js";
import "./generation.js";
import "./ledger.js";
import "./characters.js";
import "./economy.js";
