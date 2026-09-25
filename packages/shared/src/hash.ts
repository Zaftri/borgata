// Deterministic 64-bit hash of a string (two independent 32-bit lanes, cyrb-style mixing).
// Non-cryptographic, pure integer math, identical across JS engines (design 01 §5, design 08 §7).
// Output is a 16-character lowercase hex string.

export function hash64(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return hex32(h2 >>> 0) + hex32(h1 >>> 0);
}

/** Four 32-bit words derived from a string, for seeding a generator (design 01 §5). */
export function hashToWords(input: string): [number, number, number, number] {
  const a = hash64(input, 0x9e3779b9);
  const b = hash64(input, 0x7f4a7c15);
  return [parseInt(a.slice(0, 8), 16), parseInt(a.slice(8, 16), 16), parseInt(b.slice(0, 8), 16), parseInt(b.slice(8, 16), 16)];
}

function hex32(n: number): string {
  return n.toString(16).padStart(8, "0");
}
