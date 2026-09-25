// Facts: the only way state changes (design 01 §4, design 02 §6).
// Phase 0: ledger, calendar, rank. Phase 1 wave 1: claims, relationships, towns and businesses.
// Each later phase adds its kinds here and its reducer in ./reducers.

import type { AccountId, BlockId, BusinessId, ChainInstanceId, CharacterId, ClaimId, CrewId, DistrictId, FamilyId, KiloLire, Permille, ProcessInstanceId, TownId } from "@borgata/shared";
import type { AttentionBand, CharStatus, CrisisFlagName, EvidenceItem, Loan, Rank, Request, ShareRule, SlotFiller, ToolId, Obligation, ObligationKind, Lifestyle, FamilyState } from "./world.js";
import type { ProcessInstance, ScheduledEntry } from "./engine/types.js";

export type Cause = {
  templateId?: string;
  instanceId?: string;
  actorId?: CharacterId;
  /** The thing the fact is about when the fact itself does not name it (a collection's shop): for the report and the book view. */
  subjectId?: string;
  rule: string;
};

export type MoneyKind = "dirty" | "clean";

export type LedgerFact =
  | { kind: "MoneyMint"; to: AccountId; amount: KiloLire; money: MoneyKind; source: string; cause: Cause }
  | { kind: "MoneyMove"; from: AccountId; to: AccountId; amount: KiloLire; money: MoneyKind; cause: Cause }
  | { kind: "MoneyDestroy"; from: AccountId; amount: KiloLire; money: MoneyKind; sink: string; cause: Cause }
  | { kind: "Launder"; account: AccountId; amount: KiloLire; feePermille: Permille; cause: Cause }
  // Loan book (design 09 §6). LoanOpen moves principal lender -> borrower's account (or the civilians account for a business).
  | { kind: "LoanOpen"; loan: Loan; cause: Cause }
  // `principalPaid` (design 09 §6): the portion of `amount` that pays down principal rather than interest,
  // for the chief's capital loan on a character (the ledger case does not derive this on its own).
  | { kind: "LoanPayment"; lenderId: CharacterId; loanId: string; amount: KiloLire; paid: boolean; principalPaid?: number; cause: Cause }
  // `businessId` (design 10 §8): set only when the borrower is a business, so a content template can bind the
  // business a defaulted loan was against (`spawnFrom`, design 09 §7 item 4). The ledger reducer ignores this
  // field entirely -- `LoanDefault`'s own case ignores everything but `lenderId`/`loanId` (reducers/ledger.ts).
  | { kind: "LoanDefault"; lenderId: CharacterId; loanId: string; businessId?: BusinessId; cause: Cause };

export type CharacterFact =
  | { kind: "RankChange"; characterId: CharacterId; rank: Rank; cause: Cause }
  | { kind: "SuperiorSet"; characterId: CharacterId; superiorId: CharacterId | null; cause: Cause }
  | { kind: "ShareRuleSet"; superiorId: CharacterId; subordinateId: CharacterId; rule: ShareRule; cause: Cause }
  | { kind: "LifestyleSet"; characterId: CharacterId; lifestyle: Lifestyle; cause: Cause } // design 12
  | { kind: "StatusChange"; characterId: CharacterId; status: CharStatus; untilTurn?: number; cause: Cause }
  | { kind: "CooperationSet"; characterId: CharacterId; cause: Cause }
  | { kind: "CharacterCreate"; id: CharacterId; name: string; rank: Rank; age: number; familyId: FamilyId | null; superiorId: CharacterId | null; crewId: CrewId | null; onRecordWith: CharacterId | null; traits: string[]; cause: Cause };

export type EvidenceFact =
  | { kind: "EvidenceAdd"; characterId: CharacterId; item: Omit<EvidenceItem, "turn">; cause: Cause }
  | { kind: "EvidenceRemove"; characterId: CharacterId; crimeRef: string; cause: Cause };

export type PressureFact =
  | { kind: "HeatDelta"; townId: TownId; delta: number; cause: Cause }
  | { kind: "AttentionDelta"; familyId: FamilyId; delta: number; cause: Cause }
  | { kind: "BandChange"; familyId: FamilyId; from: AttentionBand; to: AttentionBand; cause: Cause }
  | { kind: "ToolUnlock"; familyId: FamilyId; tool: ToolId; cause: Cause };

export type TerritoryFact =
  | { kind: "BlockAssign"; blockId: BlockId; crewId: CrewId | null; cause: Cause }
  | { kind: "CrewMemberAdd"; crewId: CrewId; characterId: CharacterId; cause: Cause }
  | { kind: "CrewMemberRemove"; crewId: CrewId; characterId: CharacterId; cause: Cause }
  | { kind: "CrewChiefSet"; crewId: CrewId; chiefId: CharacterId; cause: Cause }
  | { kind: "FamilyStateSet"; familyId: FamilyId; state: FamilyState; cause: Cause } // design 12
  | { kind: "FamilyShortfallSet"; familyId: FamilyId; streak: number; cause: Cause } // design 12
  | { kind: "WarStateSet"; familyId: FamilyId; enemyFamilyId: FamilyId | null; cause: Cause } // design 13
  | { kind: "DistrictHeadSet"; districtId: DistrictId; familyId: FamilyId; cause: Cause }; // design 13

export type ProcessFact =
  | { kind: "ChainCreate"; chainId: ChainInstanceId; templateId: string; familyId: FamilyId; ownerId: CharacterId; slotNames: string[]; cause: Cause }
  | { kind: "ChainSlotFill"; chainId: ChainInstanceId; slot: string; filler: SlotFiller; cause: Cause }
  | { kind: "ChainSlotVacate"; chainId: ChainInstanceId; slot: string; filler: SlotFiller; cause: Cause }
  | { kind: "ChainRemove"; chainId: ChainInstanceId; cause: Cause }
  // Event engine (design 04): instance lifecycle and the schedule are owned by processes.
  | { kind: "ProcessSpawn"; instance: ProcessInstance; cause: Cause }
  | { kind: "ProcessProgress"; instanceId: ProcessInstanceId; progress: number; cause: Cause }
  | { kind: "ProcessAwaitDecision"; instanceId: ProcessInstanceId; options: string[]; cause: Cause }
  | { kind: "ProcessDecide"; instanceId: ProcessInstanceId; optionId: string; cause: Cause }
  | { kind: "ProcessResolve"; instanceId: ProcessInstanceId; outcomeId: string; cause: Cause }
  | { kind: "ProcessCancel"; instanceId: ProcessInstanceId; reason: string; cause: Cause }
  | { kind: "ScheduleAdd"; entry: ScheduledEntry; cause: Cause }
  | { kind: "ScheduleRemove"; entryId: string; reason: string; cause: Cause };

export type UiLayer = "block" | "loanBook" | "crew" | "territory" | "family" | "district" | "commission" | "politics";

export type ProgressionFact =
  | { kind: "WeightSet"; characterId: CharacterId; value: number; cause: Cause }
  | { kind: "UiLayerUnlock"; layer: UiLayer; cause: Cause }
  | { kind: "PermissionAsked"; characterId: CharacterId; what: "makeAssociate" | "openBook"; cause: Cause }
  | { kind: "ReportNote"; text: string; channel?: "sponsor" | "sign" | "newspaper" | "lawyer"; cause: Cause } // a player-facing sentence from a template outcome (design 09 §8: the report names the choice); no state // logged only: soldier templates spawn from it (design 09 §6)
  | { kind: "RecordDelta"; characterId: CharacterId; field: "weeksPaid" | "weeksMissed" | "jobsDone" | "jobsRefused" | "jobsBotched" | "arrests" | "streakPaid" | "streakRefused"; delta: number; set?: boolean; cause: Cause }
  | { kind: "RequestPush"; request: Request; cause: Cause }
  | { kind: "RequestResolve"; requestId: string; cause: Cause }
  | { kind: "RequestDefer"; request: Request; cause: Cause };

/** Subjects a claim can be held on (design 02 §5). Phase 1: businesses and associates. */
export type ClaimSubject = { kind: "business"; id: BusinessId } | { kind: "associate"; id: CharacterId };

export type ClaimFact =
  | { kind: "ClaimSet"; claimId: ClaimId; subject: ClaimSubject; holderId: CharacterId; cause: Cause }
  | { kind: "ClaimTransfer"; claimId: ClaimId; toHolderId: CharacterId; cause: Cause }
  | { kind: "ClaimRelease"; claimId: ClaimId; cause: Cause };

export type RelationshipFact =
  | { kind: "LoyaltyDelta"; characterId: CharacterId; delta: number; cause: Cause }
  | { kind: "FavorDelta"; from: CharacterId; to: CharacterId; delta: number; cause: Cause }
  | { kind: "StandingDelta"; familyA: FamilyId; familyB: FamilyId; delta: number; cause: Cause } // design 13
  | { kind: "MemoryAdd"; characterId: CharacterId; memory: { tag: string; aboutId?: CharacterId; weight: number }; cause: Cause };

export type TownFact =
  | { kind: "SentimentDelta"; townId: TownId; delta: number; cause: Cause }
  | { kind: "ComplianceDelta"; businessId: BusinessId; delta: number; cause: Cause }
  | { kind: "FearDelta"; businessId: BusinessId; delta: number; cause: Cause }
  | { kind: "RefusalStage"; businessId: BusinessId; stage: 0 | 1 | 2 | 3 | 4; cause: Cause }
  | { kind: "PettyCrimeDelta"; townId: TownId; delta: number; cause: Cause }
  /** Logged, not stored: a collection that failed this turn, so `recent` predicates and spawnFrom can see it (design 09 §1). */
  | { kind: "CollectionMissed"; businessId: BusinessId; collectorId: CharacterId; cause: Cause }
  /** Sets a business's civilian owner (docs/event-storming-2026-09-25.md §3 hotspot 1): the reducer requires the
   * business and the character to exist and the character to be a civilian. Generation sets `Business.ownerId`
   * directly for the player's sponsor's crew's blocks (the generation exception, no turn/cause yet); this fact
   * is the path for anything created after turn 0 (a future lazy `CharacterCreate` elsewhere in town). */
  | { kind: "BusinessOwnerSet"; businessId: BusinessId; ownerId: CharacterId; cause: Cause };

export type CalendarFact =
  | { kind: "CrisisFlagSet"; flag: CrisisFlagName; ttl: number; active: boolean; cause: Cause }
  | { kind: "TurnLengthSet"; weeks: 1 | 2 | 4; cause: Cause }; // emitted by the calendar reducer itself, for the log

/** Design 12: obligations, owner `obligations`. `ObligationDue` changes nothing: templates spawn from it. */
export type ObligationFact =
  | { kind: "ObligationOpen"; obligation: Obligation; cause: Cause }
  | { kind: "ObligationDue"; obligationId: string; debtorId: CharacterId; amount: KiloLire; obligationKind: ObligationKind; cause: Cause }
  | { kind: "ObligationMet"; obligationId: string; paidBy: "debtor" | "treasury"; cause: Cause }
  // `beneficiaryId` (design 12 §3): set only when the obligation's beneficiary is a character (a prisoner's
  // support missed), so `oblig.missed.prisoner`'s `spawnFrom` can bind the prisoner straight off this fact
  // without a relation from the debtor to an unrelated character. Omitted for a family/external beneficiary.
  | { kind: "ObligationMissed"; obligationId: string; debtorId: CharacterId; obligationKind: ObligationKind; beneficiaryId?: CharacterId; cause: Cause }
  | { kind: "ObligationClose"; obligationId: string; reason: string; cause: Cause };

export type Fact = LedgerFact | CharacterFact | EvidenceFact | PressureFact | TerritoryFact | ProcessFact | ProgressionFact | ClaimFact | RelationshipFact | TownFact | CalendarFact | ObligationFact;
export type FactKind = Fact["kind"];

export type OwnerName =
  | "ledger"
  | "obligations"
  | "claims"
  | "characters"
  | "relationships"
  | "evidence"
  | "pressure"
  | "towns"
  | "territory"
  | "politics"
  | "progression"
  | "processes"
  | "calendar";

/** Fixed apply order (design 02 §6). */
export const OWNER_ORDER: readonly OwnerName[] = [
  "ledger",
  "obligations",
  "claims",
  "characters",
  "relationships",
  "evidence",
  "pressure",
  "towns",
  "territory",
  "politics",
  "progression",
  "processes",
  "calendar",
];

export const OWNER_OF_FACT: Record<FactKind, OwnerName> = {
  MoneyMint: "ledger",
  MoneyMove: "ledger",
  MoneyDestroy: "ledger",
  Launder: "ledger",
  LoanOpen: "ledger",
  LoanPayment: "ledger",
  LoanDefault: "ledger",
  CharacterCreate: "characters",
  CollectionMissed: "towns",
  RecordDelta: "progression",
  PermissionAsked: "progression",
  ReportNote: "progression",
  ObligationOpen: "obligations",
  ObligationDue: "obligations",
  ObligationMet: "obligations",
  ObligationMissed: "obligations",
  ObligationClose: "obligations",
  LifestyleSet: "characters",
  FamilyStateSet: "territory",
  FamilyShortfallSet: "territory",
  WarStateSet: "territory",
  DistrictHeadSet: "territory",
  RankChange: "characters",
  SuperiorSet: "characters",
  ShareRuleSet: "characters",
  StatusChange: "characters",
  CooperationSet: "characters",
  EvidenceAdd: "evidence",
  EvidenceRemove: "evidence",
  HeatDelta: "pressure",
  AttentionDelta: "pressure",
  BandChange: "pressure",
  ToolUnlock: "pressure",
  BlockAssign: "territory",
  CrewMemberAdd: "territory",
  CrewMemberRemove: "territory",
  CrewChiefSet: "territory",
  ChainCreate: "processes",
  ChainSlotFill: "processes",
  ChainSlotVacate: "processes",
  ChainRemove: "processes",
  ProcessSpawn: "processes",
  ProcessProgress: "processes",
  ProcessAwaitDecision: "processes",
  ProcessDecide: "processes",
  ProcessResolve: "processes",
  ProcessCancel: "processes",
  ScheduleAdd: "processes",
  ScheduleRemove: "processes",
  WeightSet: "progression",
  UiLayerUnlock: "progression",
  RequestPush: "progression",
  RequestResolve: "progression",
  RequestDefer: "progression",
  ClaimSet: "claims",
  ClaimTransfer: "claims",
  ClaimRelease: "claims",
  LoyaltyDelta: "relationships",
  FavorDelta: "relationships",
  StandingDelta: "relationships",
  MemoryAdd: "relationships",
  SentimentDelta: "towns",
  ComplianceDelta: "towns",
  FearDelta: "towns",
  RefusalStage: "towns",
  PettyCrimeDelta: "towns",
  BusinessOwnerSet: "towns",
  CrisisFlagSet: "calendar",
  TurnLengthSet: "calendar",
};

// Re-exported so reducers can type family references without importing world.
export type { FamilyId };
