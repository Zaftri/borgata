# Design 02: State Model

Status: design, 2026-09-21. Defines the world state tree, the entities, the ownership table (which system may write which value) and the Fact catalogue. Types are TypeScript sketches: shapes and names are binding, exact field lists may grow.

Conventions: all ids are branded strings (`CharacterId`, `FamilyId`, ...). Every entity table is `{ byId: Record<Id, T>; order: Id[] }`. Money is an integer in thousands of lire. Meters are integers 0 to 1000 unless stated. Probabilities are integers per 10,000.

---

## 1. The tree

```ts
type World = {
  meta: Meta;
  geo: Geo;               // provinces, districts, towns, blocks, businesses, institutions, routes
  families: Table<Family>;
  characters: Table<Character>;
  households: Table<Household>;
  claims: Table<Claim>;   // who has what on record
  ledger: Ledger;         // accounts and money
  chains: Table<ChainInstance>;     // slot boards (design 03 §4)
  processes: Table<ProcessInstance>; // event engine instances (design 04)
  schedule: ScheduledEntry[];       // future firings, ordered
  evidence: Evidence;     // dossiers, cases, witnesses
  pressure: Pressure;     // heat by town, Attention by family, tools unlocked
  towns: Table<TownState>; // Sentiment, compliance, petty crime
  politics: Politics;     // politicians, votes, elections, Commission
  player: PlayerState;
  history: History;       // newspaper archive, legacy counters
  rng: RngState;          // per-stream cursors
};
```

---

## 2. Meta and calendar

```ts
type Meta = {
  schemaVersion: number; contentVersion: string; seed: string;
  turn: number;                       // monotonically increasing
  calendar: { year: number; week: number }; // week 1..52; the look is 1970s-80s, years are relative (year 1 = start)
  turnLength: 1 | 2 | 4;              // weeks per turn; set by design 03 §6
  crises: CrisisFlag[];               // what is holding the turn short
  difficulty: DifficultyPreset; ironman: boolean;
};
```

---

## 3. Geography

```ts
type Geo = {
  provinces: Table<Province>;   // fixed nine, with detail level
  districts: Table<District>;   // 3+ families each; has a districtHead FamilyId | null
  towns: Table<Town>;           // a town or a Palermo neighborhood; archetype; owned by one family
  blocks: Table<Block>;         // a stretch of a town assigned to a crew; businesses live here
  businesses: Table<Business>;  // type, size, owner (civilian or family), compliance, onRecordClaimId
  institutions: Table<Institution>; // harbor, market, water consortium, contract table, planning office, union-like bodies; each has slots
  routes: Table<Route>;         // smuggling chains' geography: landing nodes, harbors, sea legs with interdiction risk
};

type Province = { id; name; detail: "full" | "compact"; districtIds: DistrictId[]; character: ProvinceCharacter; attentionShared: Meter };
type Town = { id; name; provinceId; districtId; archetype: TownArchetype; familyId: FamilyId | null; blockIds: BlockId[]; institutionIds: InstitutionId[]; population: number; parishId: CharacterId | null };
type Block = { id; townId; crewId: CrewId | null; businessIds: BusinessId[] };
type Business = {
  id; blockId; type: BusinessType; size: 1|2|3|4|5;   // stall .. supermarket/site
  ownerId: CharacterId | null;                        // civilian owner character (generated lazily) or null if family-owned
  familyOwned?: { familyId; via: "partnership"|"default"|"nominee"|"founded"|"inherited"; nomineeId?: CharacterId };
  compliance: Meter; fear: Meter; refusalStage: 0|1|2|3|4; // escalation ladder position
  functions: BusinessFunctions;                       // clean income, laundering cap, jobs, enabler tags, cover
};
type Institution = { id; type: InstitutionType; townId; slots: Table<InstitutionSlot>; controllerFamilyId: FamilyId | null };
```

---

## 4. Families and people

```ts
type Family = {
  id; name; townIds: TownId[]; districtId;
  state: "healthy" | "weakened" | "regency" | "dormant" | "dissolved";
  regentFamilyId?: FamilyId;
  headId: CharacterId | null; underbossId; counselorId; crewIds: CrewId[];
  policy: { intakeOpen: boolean; bansObeyed: Record<BanId, boolean>; treasuryCut: Permille; bonesRequired: boolean };
  treasury: AccountId;
  attention: Meter;                    // family-level (owner: pressure)
  weightCache: { value: Meter; inputsHash: string };
  goals: FamilyGoals;                  // AI
  standing: Record<FamilyId, Meter>;   // -1000..1000 toward each other family
  factions: Faction[];
};
type Crew = { id; familyId; chiefId: CharacterId; memberIds: CharacterId[]; blockIds: BlockId[]; meetingPlaceId: BusinessId | null };

type Character = {
  id; name; familyId: FamilyId | null; rank: Rank;    // "civilian"|"associate"|"soldier"|"chief"|"underboss"|"counselor"|"head"
  role?: CivilRole;                                   // politician, magistrate, police chief, prefect, priest, journalist, lawyer, accountant, judge, customs officer ...
  age: number; born: { year: number }; alive: boolean; status: CharStatus; // free|arrested|jailed(until)|hiding|shelved|exiled|dead
  traits: TraitId[]; skills: { collecting; violence; business; discretion }: Meter;
  sponsorId?: CharacterId; onRecordWith?: CharacterId; // for associates
  loyalty: Meter;                 // toward direct superior (owner: relationships)
  exposure: Meter;                // derived from dossier (owner: evidence)
  reputation: Record<FacetId, Meter>;
  memory: MemoryEntry[];          // slights, favors, deaths; bounded list
  householdId: HouseholdId;
  careerTrack?: CareerProgress;   // FR-T
  accounts: { personal: AccountId };
  lifestyle: 0|1|2|3;             // modest .. lavish
  isSecretMemberOf?: FamilyId;    // FR-V secret men
  playerControlled: boolean;
};
type Household = { id; headId; spouseId?; childIds: CharacterId[]; kinIds: CharacterId[]; godchildIds: CharacterId[]; marriagesWith: FamilyId[] };
```

---

## 5. Claims, ledger, evidence, pressure, towns, politics, player

```ts
type Claim = { id; subject: { kind: "business"; id: BusinessId } | { kind: "associate"; id: CharacterId } | { kind: "institutionSlot"; id: InstitutionSlotId }; holderId: CharacterId; since: number };

type Ledger = { accounts: Table<Account>; minted: number; destroyed: number };
type Account = { id; ownerRef: { kind: "character"|"family"|"business"|"external"; id: string }; dirty: number; clean: number };

type Evidence = {
  dossiers: Table<Dossier>;           // one per character
  cases: Table<Case>;                 // association cases per family
  witnesses: Table<Witness>;
};
type Dossier = { characterId; items: EvidenceItem[] };           // { crimeRef, weight, source: "witness"|"wire"|"collaborator"|"seizure"|"document", turn }
type Case = { familyId; strength: Meter; openedTurn; magistrateId?: CharacterId; status: "building"|"indicted"|"trial"|"closed" };

type Pressure = {
  heatByTown: Record<TownId, Meter>;
  toolsByFamily: Record<FamilyId, ToolId[]>;         // unlocked state tools
  stateActors: { policeChiefByTown; prefectByProvince; magistrateByProvince; squadByTown }; // CharacterIds
  warrants: Warrant[];
};
type TownState = { townId; sentiment: SignedMeter; pettyCrime: Meter; feastCommitteeFamilyId: FamilyId | null; antagonistIds: CharacterId[] };

type Politics = {
  politicians: CharacterId[]; elections: ElectionSchedule; votesByTown: Record<TownId, number>;
  commissions: Table<Commission>;     // provincial; members are district heads
  bans: Record<BanId, { active: boolean; since: number }>;
  contractTables: Table<ContractTable>;
};

type PlayerState = { characterId; uiLayersUnlocked: UiLayer[]; heirId?: CharacterId; setup: GameSetup; requestQueue: RequestId[] };
type History = { newspaper: NewspaperIssue[]; legacy: LegacyCounters; prehistoryEvents: HistoricalEvent[] };
```

---

## 6. Fact catalogue and owners

Each Fact is `{ kind, payload, cause }`. The table below is the ownership table the build plan requires. A system may only emit Facts that its owner reducer accepts, and only reducers write state.

| Owner reducer (apply order) | Facts it accepts | Writes |
|---|---|---|
| 1 ledger | `MoneyMove{from,to,amount,kind:"dirty"|"clean"}`, `MoneyMint{to,amount,source}`, `MoneyDestroy{from,amount,sink}`, `Launder{account,amount}` | `ledger.*` |
| 2 claims | `ClaimSet`, `ClaimTransfer`, `ClaimRelease`, `InstitutionSlotSet`, `BusinessOwnershipSet` | `claims.*`, `businesses[].familyOwned`, `institutions[].slots` |
| 3 characters | `StatusChange`, `RankChange`, `RoleAssign`, `Death`, `Birth`, `Marriage`, `Age` (calendar-driven), `CareerProgress`, `LifestyleSet`, `SecretMembership` | `characters[].status/rank/role/age/alive/careerTrack/lifestyle`, `households` |
| 4 relationships | `LoyaltyDelta{characterId,delta}`, `FavorDelta{from,to,delta}`, `StandingDelta{familyA,familyB,delta}`, `MemoryAdd`, `ReputationDelta` | `characters[].loyalty/memory/reputation`, `families[].standing`, favor ledger |
| 5 evidence | `EvidenceAdd{characterId,item}`, `EvidenceRemove` (witness dead/retracted), `CaseOpen`, `CaseStrengthDelta`, `CaseReset`, `WitnessSet`, `WarrantIssue` | `evidence.*`, `characters[].exposure` (derived), `pressure.warrants` |
| 6 pressure | `HeatDelta{townId,delta}`, `AttentionDelta{familyId,delta}`, `ToolUnlock{familyId,tool}`, `StateActorAssign` | `pressure.*`, `families[].attention`, `provinces[].attentionShared` |
| 7 towns | `SentimentDelta{townId,delta}`, `ComplianceDelta{businessId,delta}`, `FearDelta`, `RefusalStage`, `PettyCrimeDelta`, `FeastCommitteeSet`, `AntagonistSpawn` | `towns.*`, `businesses[].compliance/fear/refusalStage` |
| 8 territory | `TerritoryTransfer{townId,toFamilyId}`, `BlockAssign{blockId,crewId}`, `FamilyStateChange`, `RegencySet`, `FamilySplit`, `DistrictRedraw`, `BlockCreate` (development) | `geo.towns[].familyId`, `blocks[].crewId`, `families[].state/regent`, `districts` |
| 9 politics | `VoteBlockSet`, `ElectionResult`, `BanSet`, `CommissionSeatSet`, `ContractAwarded`, `TrialFix` | `politics.*` |
| 10 progression | `WeightRecompute` (derived), `UiLayerUnlock`, `HeirSet` | `families[].weightCache`, `player.*` |
| 11 processes | `ProcessSchedule`, `ProcessCancel{reason}`, `ProcessAdvance`, `ChainSlotFill`, `ChainSlotVacate` | `processes`, `schedule`, `chains` |
| 12 calendar | `TurnLengthSet`, `CrisisFlagSet`, `CalendarAdvance` | `meta.*` |

Cross-owner effects are expressed as multiple Facts from the same cause. Example: a public killing emits `Death` (characters), `EvidenceAdd` for every participant (evidence), `HeatDelta` and `AttentionDelta` (pressure), `SentimentDelta` (towns), `MemoryAdd` grudges for kin (relationships), and `ProcessSchedule` for the funeral and the state response (processes). The turn log shows them all under one cause id.

---

## 7. Derived values (never stored as truth)

| Value | Computed from | Owner of the cache |
|---|---|---|
| Character exposure | Sum of dossier item weights, capped | evidence |
| Family Weight | design 03 §1 | progression |
| Attention band | family attention meter and thresholds | pressure |
| Business compliance probability per collection | compliance, fear, town sentiment, state credibility | towns |
| Vote block per town | sentiment, jobs provided, favors, feast committee | politics |
| Player-visible estimates | true values plus a deterministic error drawn from the `fog` stream, seeded per (viewer, subject, turn) | report projection |

---

## 8. Size expectations

For the performance budget: a full province has 8 to 20 families, 150 to 600 characters with families, 30 to 120 towns and neighborhoods, 400 to 2,000 businesses (civilian owners generated lazily as characters only when first involved in an event), 20 to 60 active processes, 50 to 200 scheduled entries. Compact provinces hold 8 to 20 family records each and no characters. A World serializes to well under a few megabytes; snapshots every 26 turns keep a save under the IndexedDB comfort zone for a 700-turn career.

---

## 9. Invariants owned by this model

- Every `Claim.holderId` is a living character of rank soldier or above (or an associate for sub-claims), and each business or associate has at most one claim.
- `characters[].familyId` matches membership in exactly one `Crew.memberIds` or an administration role, or is null.
- Every `Block.crewId` refers to a crew of the family that owns the block's town.
- `Family.state === "dissolved"` implies `townIds` is empty and `headId` is null.
- Sum over accounts of dirty plus clean equals `ledger.minted - ledger.destroyed`.
- `meta.turnLength` equals the value design 03 §6 computes from rank and crises.
- No two `ProcessInstance` with kind `operation` share a subject character in the same turn.
- Every `ScheduledEntry` refers to an existing template and a valid instance or spawn.
