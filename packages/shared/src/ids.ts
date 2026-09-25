// Branded ids (design 02, conventions). A brand is a compile-time tag only; at runtime ids are strings.

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CharacterId = Brand<string, "CharacterId">;
export type FamilyId = Brand<string, "FamilyId">;
export type CrewId = Brand<string, "CrewId">;
export type HouseholdId = Brand<string, "HouseholdId">;
export type ProvinceId = Brand<string, "ProvinceId">;
export type DistrictId = Brand<string, "DistrictId">;
export type TownId = Brand<string, "TownId">;
export type BlockId = Brand<string, "BlockId">;
export type BusinessId = Brand<string, "BusinessId">;
export type InstitutionId = Brand<string, "InstitutionId">;
export type InstitutionSlotId = Brand<string, "InstitutionSlotId">;
export type RouteId = Brand<string, "RouteId">;
export type ClaimId = Brand<string, "ClaimId">;
export type AccountId = Brand<string, "AccountId">;
export type ChainInstanceId = Brand<string, "ChainInstanceId">;
export type ProcessInstanceId = Brand<string, "ProcessInstanceId">;
export type TemplateId = Brand<string, "TemplateId">;

/** Construct a branded id from a plain string. Use at generation and parsing boundaries only. */
export function id<B extends string>(value: string): Brand<string, B> {
  return value as Brand<string, B>;
}

/**
 * Deterministic id factory: ids are `${prefix}-${counter}` and the counter lives in the world,
 * so two runs from the same seed produce the same ids (design 01 §5).
 */
export type IdCounter = { next: number };

export function mintId<B extends string>(counter: IdCounter, prefix: string): Brand<string, B> {
  const n = counter.next;
  counter.next = n + 1;
  return `${prefix}-${n.toString(36)}` as Brand<string, B>;
}
