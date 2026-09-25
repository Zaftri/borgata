import { describe, expect, it } from "vitest";
import { tableInsert, type AccountId } from "@borgata/shared";
import { createEmptyWorld, playerCharacter, type World } from "./world.js";
import { TurnLogBuilder } from "./log.js";
import { applyFacts } from "./reducers/index.js";
import { totalMoney } from "./reducers/ledger.js";
import { runInvariants } from "./invariants.js";
import { EMPTY_CONTENT } from "./content-types.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function worldWithTwoAccounts(): { world: World; a: AccountId; b: AccountId } {
  const world = createEmptyWorld("ledger-test", setup, EMPTY_CONTENT.version);
  const a = playerCharacter(world).accounts.personal;
  const b = "acct-b" as AccountId;
  tableInsert(world.ledger.accounts, b, { id: b, ownerRef: { kind: "external", id: "b" }, dirty: 0, clean: 0 });
  return { world, a, b };
}

describe("ledger reducer", () => {
  it("mints, moves and destroys while conserving money", () => {
    const { world, a, b } = worldWithTwoAccounts();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(
      world,
      [
        { kind: "MoneyMint", to: a, amount: 500, money: "dirty", source: "test", cause },
        { kind: "MoneyMove", from: a, to: b, amount: 200, money: "dirty", cause },
        { kind: "MoneyDestroy", from: b, amount: 50, money: "dirty", sink: "bribe", cause },
      ],
      log,
    );
    expect(applied).toBe(3);
    expect(world.ledger.accounts.byId[a]!.dirty).toBe(300);
    expect(world.ledger.accounts.byId[b]!.dirty).toBe(150);
    expect(totalMoney(world)).toBe(450);
    expect(world.ledger.minted - world.ledger.destroyed).toBe(450);
    expect(runInvariants(world).filter((v) => v.name.startsWith("money"))).toEqual([]);
  });

  it("rejects moves that exceed funds, non-integers, and unknown accounts, without throwing", () => {
    const { world, a, b } = worldWithTwoAccounts();
    const log = new TurnLogBuilder(0);
    const applied = applyFacts(
      world,
      [
        { kind: "MoneyMove", from: a, to: b, amount: 1, money: "dirty", cause },
        { kind: "MoneyMint", to: a, amount: 10, money: "dirty", source: "t", cause },
        { kind: "MoneyMint", to: "acct-nope" as AccountId, amount: 10, money: "dirty", source: "t", cause },
        { kind: "MoneyMove", from: a, to: b, amount: 3, money: "dirty", cause },
        { kind: "MoneyMove", from: a, to: a, amount: 1, money: "dirty", cause },
      ],
      log,
    );
    expect(applied).toBe(2);
    const rejected = log.entries.filter((e) => e.kind === "rejected");
    expect(rejected).toHaveLength(3);
    expect(world.ledger.accounts.byId[a]!.dirty).toBe(7);
    expect(world.ledger.accounts.byId[b]!.dirty).toBe(3);
  });

  it("launders dirty into clean minus a fee that leaves the economy", () => {
    const { world, a } = worldWithTwoAccounts();
    const log = new TurnLogBuilder(0);
    applyFacts(
      world,
      [
        { kind: "MoneyMint", to: a, amount: 1000, money: "dirty", source: "t", cause },
        { kind: "Launder", account: a, amount: 1000, feePermille: 200, cause },
      ],
      log,
    );
    const acct = world.ledger.accounts.byId[a]!;
    expect(acct.dirty).toBe(0);
    expect(acct.clean).toBe(800);
    expect(world.ledger.destroyed).toBe(200);
    expect(runInvariants(world).filter((v) => v.name.startsWith("money"))).toEqual([]);
  });
});
