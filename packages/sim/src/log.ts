// The turn log (every fact with its cause, every rejection, every invariant) and the player-facing report
// projected from it (design 01 §3 steps 7, §7, §9).

import type { Fact } from "./facts.js";
import type { World } from "./world.js";

export type Visibility = "debug" | "player";

export type LogEntry =
  | { tick: number; kind: "fact"; fact: Fact; visibility: Visibility }
  | { tick: number; kind: "rejected"; fact: Fact; reason: string; visibility: "debug" }
  | { tick: number; kind: "invariant"; name: string; message: string; visibility: "debug" }
  | { tick: number; kind: "note"; text: string; visibility: Visibility };

export type TurnLog = { turn: number; entries: LogEntry[] };

export class TurnLogBuilder {
  private tick = 0;
  readonly entries: LogEntry[] = [];
  constructor(readonly turn: number) {}

  fact(fact: Fact, visibility: Visibility = "player"): void {
    this.entries.push({ tick: this.tick++, kind: "fact", fact, visibility });
  }
  rejected(fact: Fact, reason: string): void {
    this.entries.push({ tick: this.tick++, kind: "rejected", fact, reason, visibility: "debug" });
  }
  invariant(name: string, message: string): void {
    this.entries.push({ tick: this.tick++, kind: "invariant", name, message, visibility: "debug" });
  }
  note(text: string, visibility: Visibility = "player"): void {
    this.entries.push({ tick: this.tick++, kind: "note", text, visibility });
  }
  build(): TurnLog {
    return { turn: this.turn, entries: this.entries };
  }
}

export type Report = {
  turn: number;
  calendar: { year: number; week: number };
  turnLength: number;
  lines: string[];
};

/** Player-facing projection of the log. Phase 0: money lines and notes. Fog of war rules arrive with design 07 §5. */
export function projectReport(world: World, log: TurnLog): Report {
  const lines: string[] = [];
  const me = world.player.characterId;
  const myAccount = world.characters.byId[me]?.accounts.personal;
  for (const e of log.entries) {
    if (e.visibility !== "player") continue;
    if (e.kind === "note") lines.push(e.text);
    if (e.kind === "fact") {
      const f = e.fact;
      if (f.kind === "ReportNote" && f.channel !== "newspaper") lines.push(f.text);
      // Design 12: duties, lifestyle and the family's health.
      if (f.kind === "ObligationMet") {
        const o = world.obligations.byId[f.obligationId];
        const who = o?.beneficiary.kind === "character" ? (world.characters.byId[o.beneficiary.id]?.name ?? "someone") : o?.beneficiary.kind === "family" ? "the family" : "the account";
        if (o?.debtorId === me) lines.push(`You paid ${who} ${o.amount} kL (${o.kind}).`);
        else if (f.paidBy === "treasury" && o && world.characters.byId[o.debtorId]?.familyId === world.characters.byId[me]?.familyId) lines.push(`The family paid ${who} ${o.amount} kL for ${world.characters.byId[o.debtorId]?.name ?? "a man"} (${o.kind}).`);
      }
      if (f.kind === "ObligationMissed" && f.debtorId === me) {
        const o = world.obligations.byId[f.obligationId];
        const who = o?.beneficiary.kind === "character" ? (world.characters.byId[o.beneficiary.id]?.name ?? "someone") : "the account";
        lines.push(`${who} went without this week (${f.obligationKind}).`);
      }
      if (f.kind === "LifestyleSet" && f.characterId === me) lines.push(f.cause.rule === "lifestyle.unaffordable" ? "You could not keep up your way of living; you live modestly now." : `You live ${f.lifestyle === "lavish" ? "lavishly" : f.lifestyle === "ordinary" ? "an ordinary life" : "modestly"} now.`);
      if (f.kind === "FamilyStateSet" && world.characters.byId[me]?.familyId === f.familyId) lines.push(f.state === "weakened" ? "The family's income no longer covers its duties: the family is weakened." : `The family is ${f.state}.`);
      if (f.kind === "LoanOpen" && f.loan.borrower.kind === "character" && f.loan.borrower.id === me) lines.push(`Capital arrived: ${f.loan.principal} kL from ${world.characters.byId[f.loan.lenderId]?.name ?? "your chief"}, at ${f.loan.points} point${f.loan.points === 1 ? "" : "s"} a week.`);
      if (f.kind === "LoanOpen" && f.loan.lenderId === me) lines.push(`You lent ${f.loan.principal} kL at ${f.loan.points} point${f.loan.points === 1 ? "" : "s"} a week.`);
      if (f.kind === "ClaimTransfer" && f.toHolderId === me) lines.push("The chief gives you a stall of your own: it is on your round from next week.");
      if (f.kind === "LoanPayment" && f.paid && world.characters.byId[me]?.loans.some((l) => l.id === f.loanId)) lines.push(`Interest came in: ${f.amount} kL (loan).`);
      if (f.kind === "LoanDefault" && world.characters.byId[me]?.loans.some((l) => l.id === f.loanId)) lines.push("A loan of yours went bad.");
      if (f.kind === "MoneyMint" && f.to === myAccount) lines.push(`Received ${f.amount} kL (${f.source}).`);
      if (f.kind === "MoneyMove" && f.from === myAccount) lines.push(`Paid ${f.amount} kL (${f.cause.rule}).`);
      if (f.kind === "MoneyMove" && f.to === myAccount) lines.push(`Received ${f.amount} kL (${f.cause.rule}).`);
      if (f.kind === "TurnLengthSet") lines.push(`The pace changes: ${f.weeks} week${f.weeks === 1 ? "" : "s"} per turn (${f.cause.rule}).`);
      if (f.kind === "RankChange" && f.characterId === me) lines.push(`You are now ${f.rank}.`);
      // The three plain orders answer in the report too (event storming 2026-09-25, hotspot 3).
      if (f.kind === "ShareRuleSet" && f.superiorId === me) lines.push(`You set ${world.characters.byId[f.subordinateId]?.name ?? "your man"}'s share: ${f.rule.fixedPerTurn} kL plus ${f.rule.percent / 10} percent.`);
      if (f.kind === "ClaimSet" && f.holderId === me && f.subject.kind === "business") lines.push(`You claimed a shop (${world.geo.businesses.byId[f.subject.id]?.type ?? "business"} on your crew's block).`);
      if (f.kind === "ClaimRelease" && f.cause.actorId === me) lines.push("You gave up a claim.");
      if (f.kind === "UiLayerUnlock") lines.push(`New to you: ${f.layer}.`);
      if (f.kind === "BandChange") lines.push(`The state's interest in the family has ${f.to > f.from ? "risen" : "eased"} (${f.cause.rule}).`);
      if (f.kind === "StatusChange" && f.status === "arrested") lines.push(`${world.characters.byId[f.characterId]?.name ?? "A man"} was arrested (${f.cause.rule}).`);
      if (f.kind === "StatusChange" && f.status === "free" && f.cause.rule === "detention.ended") lines.push(`${world.characters.byId[f.characterId]?.name ?? "A man"} is out.`);
      if (f.kind === "CooperationSet") lines.push(`Word is that ${world.characters.byId[f.characterId]?.name ?? "someone"} is talking.`, );
    }
  }
  return { turn: world.meta.turn, calendar: { ...world.meta.calendar }, turnLength: world.meta.turnLength, lines };
}
