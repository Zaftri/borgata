// Entity tables: a record by id plus an ordered id array for deterministic iteration (design 02, conventions).

export type Table<T> = { byId: Record<string, T>; order: string[] };

export function emptyTable<T>(): Table<T> {
  return { byId: {}, order: [] };
}

export function tableInsert<T>(t: Table<T>, id: string, value: T): void {
  if (id in t.byId) throw new Error(`duplicate id in table: ${id}`);
  t.byId[id] = value;
  t.order.push(id);
}

export function tableRemove<T>(t: Table<T>, id: string): boolean {
  if (!(id in t.byId)) return false;
  delete t.byId[id];
  const i = t.order.indexOf(id);
  if (i >= 0) t.order.splice(i, 1);
  return true;
}

export function tableGet<T>(t: Table<T>, id: string): T | undefined {
  return t.byId[id];
}

export function* tableValues<T>(t: Table<T>): IterableIterator<T> {
  for (const id of t.order) yield t.byId[id]!;
}

export function tableSize<T>(t: Table<T>): number {
  return t.order.length;
}

/** Integrity check used by invariants: order and byId agree, no duplicates. */
export function tableIntegrity<T>(t: Table<T>): string | null {
  const seen = new Set<string>();
  for (const id of t.order) {
    if (seen.has(id)) return `duplicate id in order: ${id}`;
    seen.add(id);
    if (!(id in t.byId)) return `id in order but not in byId: ${id}`;
  }
  const keys = Object.keys(t.byId);
  if (keys.length !== t.order.length) return `byId has ${keys.length} keys but order has ${t.order.length}`;
  return null;
}
