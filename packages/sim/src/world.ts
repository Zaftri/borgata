// The world state tree (design 02). Phase 0 carried the full shape with empty tables; phase 1 wave 1 types
// claims, relationships (loyalty, favors, memory) and towns with blocks and businesses.

import {
  SCHEMA_VERSION,
  emptyTable,
  tableInsert,
  mintId,
  type Table,
  type IdCounter,
  type CharacterId,
  type FamilyId,
  type HouseholdId,
  type AccountId,
  type ClaimId,
  type TownId,
  type ProvinceId,
  type DistrictId,
  type BlockId,
  type BusinessId,
  type CrewId,
  type Meter,
  type SignedMeter,
  type KiloLire,
  type Permille,
  type ChainInstanceId,
} from "@borgata/shared";
import { createRngState, type RngState } from "./rng.js";
import type { ClaimSubject } from "./facts.js";
import type { ProcessInstance, ScheduledEntry, RecentFact } from "./engine/types.js";

export type Rank = "civilian" | "associate" | "soldier" | "chief" | "underboss" | "counselor" | "head";
export type CharStatus = "free" | "arrested" | "jailed" | "hiding" | "shelved" | "exiled" | "dead";

/** Evidence against one character (design 03 §3). Items never decay; removal only by listed causes. */
export type EvidenceSource = "witness" | "wire" | "collaborator" | "seizure" | "document" | "participation";
export type EvidenceItem = { crimeRef: string; weight: number; source: EvidenceSource; turn: number };
export type Dossier = { characterId: CharacterId; items: EvidenceItem[] };

/** State tools unlocked against a family by Attention band (design 03 §2). */
export type ToolId = "patrols" | "informants" | "squad" | "magistrate" | "wiretaps" | "seizures" | "collaboratorProgram" | "army" | "hardPrison";
/** Attention bands 0..4: Quiet, Noticed, Watched, Targeted, Besieged (design 03 §2). */
export type AttentionBand = 0 | 1 | 2 | 3 | 4;
export type TurnLength = 1 | 2 | 4;
export type CrisisFlagName = "war" | "campaign" | "trial" | "succession" | "magistrateArrival" | "operationPending" | "negotiation";
export type CrisisFlag = { flag: CrisisFlagName; ttl: number; cause: string };
export type DifficultyPreset = "gentle" | "normal" | "hard";

export type GameSetup = {
  archetype: string | null;      // starting-place archetype id (design 05) or null for seed-chosen
  background: "family" | "outsider";
  difficulty: DifficultyPreset;
  ironman: boolean;
};

export type Meta = {
  schemaVersion: number;
  contentVersion: string;
  seed: string;
  turn: number;
  calendar: { year: number; week: number };
  turnLength: TurnLength;
  crises: CrisisFlag[];
  setup: GameSetup;
  ids: IdCounter;
};

export type Account = {
  id: AccountId;
  ownerRef: { kind: "character" | "family" | "business" | "external"; id: string };
  dirty: KiloLire;
  clean: KiloLire;
};

/** Income minted into each account during the current turn; reset at the start of every step. Used by shares. */
export type Ledger = { accounts: Table<Account>; minted: KiloLire; destroyed: KiloLire; turnIncome: Record<string, KiloLire> };

export type FamilyState = "healthy" | "weakened" | "regency" | "dormant" | "dissolved";

export type Family = {
  id: FamilyId;
  name: string;
  districtId: DistrictId | null;
  townIds: TownId[];
  state: FamilyState;
  headId: CharacterId | null;
  underbossId: CharacterId | null;
  counselorId: CharacterId | null;
  crewIds: CrewId[];
  policy: { intakeOpen: boolean; treasuryCut: Permille; bonesRequired: boolean };
  treasury: AccountId;
  /** Design 12: consecutive turns of income below duties (positive) or above (negative). Owner: territory. */
  shortfallStreak: number;
  /** Design 13: the family this one is at war with, or null. Owner: territory. */
  warWith: FamilyId | null;
  /** Owner: pressure. Family-level Attention 0..1000 and its band with hysteresis (design 03 §2). */
  attention: Meter;
  attentionBand: AttentionBand;
};

export type Crew = {
  id: CrewId;
  familyId: FamilyId;
  chiefId: CharacterId;
  memberIds: CharacterId[];
  blockIds: BlockId[];
};

/** A slot filler for a chain (design 03 §4, B13). */
export type SlotFiller = { kind: "character"; id: CharacterId } | { kind: "block"; id: BlockId };

/** A running slot board. Owner: processes. `templateId` names the chain kind (phase 1: "chain.protectionTax"). */
export type ChainInstance = {
  id: ChainInstanceId;
  templateId: string;
  familyId: FamilyId;
  ownerId: CharacterId;
  slots: Record<string, SlotFiller[]>;
  lastRunTurn: number;
};

/** Design 12: what a man owes and to whom. Owner: obligations (its own reducer). */
export type ObligationKind = "prisonerSupport" | "lawyer" | "funeral" | "feast" | "fugitiveUpkeep" | "gift" | "charity";
export type ObligationBeneficiary = { kind: "character"; id: CharacterId } | { kind: "family"; id: FamilyId } | { kind: "external"; id: string };
export type Obligation = {
  id: string;
  kind: ObligationKind;
  debtorId: CharacterId;
  beneficiary: ObligationBeneficiary;
  amount: KiloLire;
  /** Null: due once. */
  everyTurns: number | null;
  nextDueTurn: number;
  untilTurn: number | null;
  met: number;
  missed: number;
  lastResult: "met" | "missed" | null;
  status: "open" | "closed";
};

export type Lifestyle = "modest" | "ordinary" | "lavish";
/** A made man lives ordinarily by default; civilians and associates modestly (design 12). */
export function defaultLifestyle(rank: Rank): Lifestyle {
  return rank === "civilian" || rank === "associate" ? "modest" : "ordinary";
}
/** Weekly cost, Weight term and heat per turn by lifestyle (design 12 §2; PC-4, P-3). */
export const LIFESTYLE_COST: Record<Lifestyle, KiloLire> = { modest: 0, ordinary: 5, lavish: 40 }; // ordinary 5, not 10: an associate earns about 25 a week
export const LIFESTYLE_WEIGHT: Record<Lifestyle, number> = { modest: 0, ordinary: 10, lavish: 30 };
export const LIFESTYLE_HEAT: Record<Lifestyle, number> = { modest: 0, ordinary: 1, lavish: 3 };

/** Per-character counters behind la proposta and associate Weight (design 09 §2, §3). Owner: progression. */
export type CharacterRecord = { weeksPaid: number; weeksMissed: number; jobsDone: number; jobsRefused: number; jobsBotched: number; arrests: number; streakPaid: number; streakRefused: number };
export const EMPTY_RECORD: CharacterRecord = { weeksPaid: 0, weeksMissed: 0, jobsDone: 0, jobsRefused: 0, jobsBotched: 0, arrests: 0, streakPaid: 0, streakRefused: 0 };

/** A loan in a lender's book (design 09 §6). Owner: ledger. The borrower is a business (a shopkeeper) or a character (the chief's capital). */
export type Loan = { id: string; lenderId: CharacterId; borrower: { kind: "business"; id: BusinessId } | { kind: "character"; id: CharacterId }; principal: KiloLire; points: number; openedTurn: number; weeksLate: number };

/** Bounded list of things a character remembers (design 02 §4, A6). */
export type MemoryEntry = { tag: string; aboutId?: CharacterId; weight: number; turn: number };

/** A superior's rule for one subordinate's share (design 03 §4). Owner: characters (set by the superior). */
export type ShareRule = { fixedPerTurn: KiloLire; percent: Permille };

export type Character = {
  id: CharacterId;
  name: string;
  familyId: FamilyId | null;
  /** The man this character pays his share to: sponsor for associates, crew chief for soldiers, head for chiefs. */
  superiorId: CharacterId | null;
  /** Share rules this character has set for subordinates, keyed by subordinate id. */
  shareRules: Record<string, ShareRule>;
  crewId: CrewId | null;
  rank: Rank;
  age: number;
  alive: boolean;
  status: CharStatus;
  traits: string[];
  /** Loyalty toward the direct superior, 0..1000, owner relationships (design 03 §5). */
  loyalty: Meter;
  /** Derived from the dossier by the evidence owner: min(1000, sum of item weights). */
  exposure: Meter;
  /** Weight (design 03 §1), recomputed each turn by the progression owner via WeightSet. */
  weight: Meter;
  /** Set with status arrested or jailed: the turn the character is released. Owner: characters. */
  detainedUntilTurn: number | null;
  /** True once the character has cooperated with the state (design 03 §3). Owner: characters. */
  cooperating: boolean;
  /** For associates: the man of honor they are on record with. Owner: claims (an associate is a claim subject). */
  onRecordWith: CharacterId | null;
  memory: MemoryEntry[];
  record: CharacterRecord;
  loans: Loan[];
  /** Design 12: visible wealth. Owner: characters. */
  lifestyle: Lifestyle;
  householdId: HouseholdId | null;
  accounts: { personal: AccountId };
  playerControlled: boolean;
};

export type Claim = { id: ClaimId; subject: ClaimSubject; holderId: CharacterId; since: number };

export type BusinessType = "stall" | "shop" | "bar" | "workshop" | "restaurant" | "site" | "supermarket";
/** 1 stall .. 5 supermarket or large site (design 02 §3, B1a). */
export type BusinessSize = 1 | 2 | 3 | 4 | 5;

export type Business = {
  id: BusinessId;
  blockId: BlockId;
  type: BusinessType;
  size: BusinessSize;
  /** Civilian owner, generated lazily as a character when first involved in an event; null until then. */
  ownerId: CharacterId | null;
  /** Owner: towns. Compliance 0..1000 is the disposition to pay; fear 0..1000; refusal ladder 0..4 (B6a). */
  compliance: Meter;
  fear: Meter;
  refusalStage: 0 | 1 | 2 | 3 | 4;
};

export type Block = { id: BlockId; townId: TownId; crewId: CrewId | null; businessIds: BusinessId[] };

export type Town = {
  id: TownId;
  name: string;
  archetype: string;          // TownArchetype id from content (design 05)
  provinceId: ProvinceId | null;
  districtId: DistrictId | null;
  familyId: FamilyId | null;
  blockIds: BlockId[];
  population: number;
  /** True for a neighborhood of the provincial capital (a Palermo borgata) rather than a separate town. */
  isNeighborhood: boolean;
};

export type ProvinceCharacter = "commissionPolitics" | "orthodoxBusiness" | "feudProne" | "businessSymbiosis" | "weakSubsidy";

export type Province = {
  id: ProvinceId;
  name: string;
  detail: "full" | "compact";
  character: ProvinceCharacter;
  capitalTownIds: TownId[];     // the capital's neighborhoods
  districtIds: DistrictId[];
  attentionShared: Meter;
};

/** Three or more contiguous families (design 02 §3, C2). */
export type District = {
  id: DistrictId;
  name: string;
  provinceId: ProvinceId;
  familyIds: FamilyId[];
  districtHeadFamilyId: FamilyId | null;
};

/** Owner: towns. Sentiment -1000..1000 (negative is against the family), petty crime 0..1000 (design 03 §5). */
export type TownState = { townId: TownId; sentiment: SignedMeter; pettyCrime: Meter };

/** A player-facing request produced by the engine (design 04 §4 budget, design 07). Owner: progression. */
export type Request = { id: string; turn: number; text: string; instanceId: string | null; priority: number };

export type PlayerState = {
  characterId: CharacterId;
  uiLayersUnlocked: string[];
  heirId: CharacterId | null;
  requestQueue: Request[];
  /** Spawns deferred by the per-turn budget, with aging priority (design 04 §4). */
  deferred: Request[];
};

export type Geo = {
  provinces: Table<Province>;
  districts: Table<District>;
  towns: Table<Town>;
  blocks: Table<Block>;
  businesses: Table<Business>;
  institutions: Table<Record<string, unknown>>;
  routes: Table<Record<string, unknown>>;
};

/** Signed favor ledger between characters, keyed `${from}|${to}` (design 03 §5). Owner: relationships. */
export type FavorLedger = Record<string, SignedMeter>;

export type World = {
  meta: Meta;
  geo: Geo;
  families: Table<Family>;
  crews: Table<Crew>;
  characters: Table<Character>;
  households: Table<Record<string, unknown>>;
  claims: Table<Claim>;
  favors: FavorLedger;
  /** Design 13: family-to-family standing, symmetric, keyed by `standingKey`. Owner: relationships. */
  standing: Record<string, SignedMeter>;
  ledger: Ledger;
  /** Design 12. */
  obligations: Table<Obligation>;
  chains: Table<ChainInstance>;
  processes: Table<ProcessInstance>;
  schedule: ScheduledEntry[];
  evidence: { dossiers: Table<Dossier>; cases: Table<Record<string, unknown>>; witnesses: Table<Record<string, unknown>> };
  pressure: { heatByTown: Record<string, Meter>; toolsByFamily: Record<string, ToolId[]>; warrants: unknown[] };
  towns: Table<TownState>;
  politics: { bans: Record<string, { active: boolean; since: number }> };
  player: PlayerState;
  history: { newspaper: unknown[]; legacy: Record<string, number>; recentFacts: RecentFact[] };
  rng: RngState;
};

export const EXTERNAL_INCOME_ACCOUNT = "acct-external-income" as AccountId;
export const EXTERNAL_SINK_ACCOUNT = "acct-external-sink" as AccountId;

export function favorKey(from: CharacterId, to: CharacterId): string {
  return `${from}|${to}`;
}

/** Symmetric key for family standing (design 13). */
export function standingKey(a: FamilyId, b: FamilyId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * The empty world for a seed and setup. Phase 0: one player character with a personal account, nothing else.
 * Generation (design 05) will populate the rest in phase 5.
 */
export function createEmptyWorld(seed: string, setup: GameSetup, contentVersion: string): World {
  const ids: IdCounter = { next: 1 };
  const ledger: Ledger = { accounts: emptyTable(), minted: 0, destroyed: 0, turnIncome: {} };
  const playerAccountId = mintId<"AccountId">(ids, "acct");
  tableInsert(ledger.accounts, playerAccountId, {
    id: playerAccountId,
    ownerRef: { kind: "character", id: "pending" },
    dirty: 0,
    clean: 0,
  });

  const playerId = mintId<"CharacterId">(ids, "chr");
  ledger.accounts.byId[playerAccountId]!.ownerRef.id = playerId;

  const characters: Table<Character> = emptyTable();
  tableInsert(characters, playerId, {
    id: playerId,
    name: "You",
    familyId: null,
    superiorId: null,
    shareRules: {},
    crewId: null,
    rank: "associate",
    age: 22,
    alive: true,
    status: "free",
    traits: [],
    loyalty: 500,
    exposure: 0,
    weight: 0,
    detainedUntilTurn: null,
    cooperating: false,
    onRecordWith: null,
    memory: [],
    record: { ...EMPTY_RECORD },
    loans: [],
    lifestyle: "modest",
    householdId: null,
    accounts: { personal: playerAccountId },
    playerControlled: true,
  });

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      contentVersion,
      seed,
      turn: 0,
      calendar: { year: 1, week: 1 },
      turnLength: 1,
      crises: [],
      setup,
      ids,
    },
    geo: {
      provinces: emptyTable(),
      districts: emptyTable(),
      towns: emptyTable(),
      blocks: emptyTable(),
      businesses: emptyTable(),
      institutions: emptyTable(),
      routes: emptyTable(),
    },
    families: emptyTable(),
    crews: emptyTable(),
    characters,
    households: emptyTable(),
    claims: emptyTable(),
    favors: {},
    standing: {},
    ledger,
    obligations: emptyTable(),
    chains: emptyTable(),
    processes: emptyTable(),
    schedule: [],
    evidence: { dossiers: emptyTable(), cases: emptyTable(), witnesses: emptyTable() },
    pressure: { heatByTown: {}, toolsByFamily: {}, warrants: [] },
    towns: emptyTable(),
    politics: { bans: {} },
    player: { characterId: playerId, uiLayersUnlocked: ["block"], heirId: null, requestQueue: [], deferred: [] },
    history: { newspaper: [], legacy: {}, recentFacts: [] },
    rng: createRngState(seed),
  };
}

export function playerCharacter(world: World): Character {
  const c = world.characters.byId[world.player.characterId];
  if (!c) throw new Error("player character missing");
  return c;
}

/** Add a character with a fresh personal account. Used by tests, fixtures and (later) the generator. */
export function addCharacter(
  world: World,
  fields: Partial<Omit<Character, "id" | "accounts">> & { name: string },
): Character {
  const accountId = mintId<"AccountId">(world.meta.ids, "acct");
  const id = mintId<"CharacterId">(world.meta.ids, "chr");
  tableInsert(world.ledger.accounts, accountId, { id: accountId, ownerRef: { kind: "character", id }, dirty: 0, clean: 0 });
  const c: Character = {
    id,
    familyId: null,
    superiorId: null,
    shareRules: {},
    crewId: null,
    rank: "civilian",
    age: 30,
    alive: true,
    status: "free",
    traits: [],
    loyalty: 500,
    exposure: 0,
    weight: 0,
    detainedUntilTurn: null,
    cooperating: false,
    onRecordWith: null,
    memory: [],
    record: { ...EMPTY_RECORD },
    loans: [],
    lifestyle: defaultLifestyle(fields.rank ?? "civilian"),
    householdId: null,
    playerControlled: false,
    ...fields,
    accounts: { personal: accountId },
  };
  tableInsert(world.characters, id, c);
  return c;
}

/** Add a family with a treasury account. Fixtures and (later) the generator. */
export function addFamily(world: World, fields: { name: string; townIds?: TownId[]; headId?: CharacterId | null; treasuryCut?: Permille }): Family {
  const treasury = mintId<"AccountId">(world.meta.ids, "acct");
  const id = mintId<"FamilyId">(world.meta.ids, "fam");
  tableInsert(world.ledger.accounts, treasury, { id: treasury, ownerRef: { kind: "family", id }, dirty: 0, clean: 0 });
  const f: Family = {
    id,
    name: fields.name,
    districtId: null,
    townIds: fields.townIds ?? [],
    state: "healthy",
    headId: fields.headId ?? null,
    underbossId: null,
    counselorId: null,
    crewIds: [],
    policy: { intakeOpen: true, treasuryCut: fields.treasuryCut ?? 100, bonesRequired: false },
    shortfallStreak: 0,
    warWith: null,
    treasury,
    attention: 0,
    attentionBand: 0,
  };
  tableInsert(world.families, id, f);
  for (const t of f.townIds) {
    const town = world.geo.towns.byId[t];
    if (town) town.familyId = id;
  }
  if (f.headId) {
    const head = world.characters.byId[f.headId];
    if (head) head.familyId = id;
  }
  return f;
}

/** Add a crew under a family with a chief; sets the chief's crewId, familyId and superior (the head). */
export function addCrew(world: World, familyId: FamilyId, chiefId: CharacterId, memberIds: CharacterId[] = [], blockIds: BlockId[] = []): Crew {
  const id = mintId<"CrewId">(world.meta.ids, "crew");
  const family = world.families.byId[familyId];
  if (!family) throw new Error(`unknown family ${familyId}`);
  const crew: Crew = { id, familyId, chiefId, memberIds: [...memberIds], blockIds: [...blockIds] };
  tableInsert(world.crews, id, crew);
  family.crewIds.push(id);
  const chief = world.characters.byId[chiefId];
  if (chief) {
    chief.crewId = id;
    chief.familyId = familyId;
    chief.superiorId = family.headId && family.headId !== chiefId ? family.headId : null;
  }
  for (const m of memberIds) {
    const c = world.characters.byId[m];
    if (c) {
      c.crewId = id;
      c.familyId = familyId;
      c.superiorId = chiefId;
    }
  }
  for (const b of blockIds) {
    const block = world.geo.blocks.byId[b];
    if (block) block.crewId = id;
  }
  return crew;
}
