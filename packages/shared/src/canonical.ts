// Canonical JSON: object keys sorted recursively, arrays in order, no whitespace (design 01 §5).
// Used for hashing and for save files. Only JSON-serializable values are allowed in World.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(v: unknown): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) throw new TypeError("non-finite number in canonical JSON");
      if (!Number.isInteger(v)) throw new TypeError(`non-integer number in canonical JSON: ${v}`);
      return String(v);
    case "string":
      return JSON.stringify(v);
    case "undefined":
      throw new TypeError("undefined in canonical JSON");
    case "object": {
      if (Array.isArray(v)) return `[${v.map(stringify).join(",")}]`;
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).sort();
      const parts: string[] = [];
      for (const k of keys) {
        const val = o[k];
        if (val === undefined) continue; // optional fields absent
        parts.push(`${JSON.stringify(k)}:${stringify(val)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`unsupported type in canonical JSON: ${typeof v}`);
  }
}
