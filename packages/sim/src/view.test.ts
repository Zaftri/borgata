// Tests for the player's view projection (design 07 §5, brainstorm S-1 and I3). Mirrors the pattern used by
// generation.test.ts: content is a small inline set of archetypes/templates rather than the real @borgata/content
// package, since sim's tests are exempt from the sim-only-imports rule but production code under packages/sim
// still may not depend on packages/content.

import { mintId, tableInsert, type TemplateId } from "@borgata/shared";
import { describe, expect, it } from "vitest";
import type { Content, NamePools, TownArchetype } from "./content-types.js";
import { EMPTY_CONTENT } from "./content-types.js";
import type { ProcessInstance, ProcessTemplate } from "./engine/types.js";
import { addBlock, addBusiness, addTown } from "./fixtures.js";
import { generateWorld } from "./generation/index.js";
import { step } from "./step.js";
import { buildStarterWorld } from "./starter.js";
import { actionAllowed, projectView, type ActionSpec, type Estimate } from "./view.js";
import { addCharacter, addCrew, addFamily, createEmptyWorld, playerCharacter, type GameSetup, type World } from "./world.js";

const setup: GameSetup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false };

function starter(seed: string): World {
  return buildStarterWorld(seed, setup, EMPTY_CONTENT);
}

function withinBand(band: Estimate | undefined, trueValue: number): boolean {
  return !!band && band.low <= trueValue && trueValue <= band.high;
}

function actionOf<K extends ActionSpec["kind"]>(actions: ActionSpec[], kind: K): Extract<ActionSpec, { kind: K }> | undefined {
  return actions.find((a): a is Extract<ActionSpec, { kind: K }> => a.kind === kind);
}

describe("projectView: you", () => {
  it("reports exact values for the player's own account, rank and loyalty", () => {
    const world = starter("view-you-1");
    const p = playerCharacter(world);
    const view = projectView(world, null, EMPTY_CONTENT);

    expect(view.you.id).toBe(p.id);
    expect(view.you.name).toBe(p.name);
    expect(view.you.rank).toBe(p.rank);
    expect(view.you.weight).toBe(p.weight);
    expect(view.you.loyalty).toBe(p.loyalty);
    const account = world.ledger.accounts.byId[p.accounts.personal]!;
    expect(view.you.dirty).toBe(account.dirty);
    expect(view.you.clean).toBe(account.clean);
  });

  it("sponsorName, familyName and townName come from superiorId and the family's first town", () => {
    const world = starter("view-you-2");
    const p = playerCharacter(world);
    const view = projectView(world, null, EMPTY_CONTENT);

    const sponsor = world.characters.byId[p.superiorId!]!;
    const family = world.families.byId[p.familyId!]!;
    const town = world.geo.towns.byId[family.townIds[0]!]!;
    expect(view.you.sponsorName).toBe(sponsor.name);
    expect(view.you.familyName).toBe(family.name);
    expect(view.you.townName).toBe(town.name);
  });

  it("sponsorName and familyName are null with no superior or family", () => {
    const world = createEmptyWorld("view-you-3", setup, EMPTY_CONTENT.version);
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.you.sponsorName).toBeNull();
    expect(view.you.familyName).toBeNull();
    expect(view.you.townName).toBeNull();
  });

  it("layers mirror world.player.uiLayersUnlocked", () => {
    const world = starter("view-you-4");
    world.player.uiLayersUnlocked.push("loanBook");
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.you.layers).toEqual(world.player.uiLayersUnlocked);
  });
});

describe("projectView: report and requests", () => {
  it("uses projectReport when a log is given", () => {
    const world = starter("view-report-1");
    const result = step(world, [], EMPTY_CONTENT, { debug: true });
    const view = projectView(result.world, result.log, EMPTY_CONTENT);
    expect(view.report).toEqual(result.report);
  });

  it("falls back to an empty report when no log is given", () => {
    const world = starter("view-report-2");
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.report.lines).toEqual([]);
    expect(view.report.turn).toBe(world.meta.turn);
    expect(view.report.turnLength).toBe(world.meta.turnLength);
  });

  it("requests mirror the player's request queue", () => {
    const world = starter("view-requests-1");
    world.player.requestQueue.push({ id: "req-1", turn: 0, text: "A man wants a word.", instanceId: null, priority: 0 });
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.requests).toEqual([{ id: "req-1", text: "A man wants a word.", turn: 0, instanceId: null, kind: "news" }]);
  });

  it("crises mirror world.meta.crises' flags", () => {
    const world = starter("view-crises-1");
    world.meta.crises.push({ flag: "war", ttl: 4, cause: "test" });
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.crises).toEqual(["war"]);
  });
});

describe("projectView: determinism", () => {
  it("the same world produces an identical view", () => {
    const world = starter("view-determinism-1");
    const v1 = projectView(world, null, EMPTY_CONTENT);
    const v2 = projectView(world, null, EMPTY_CONTENT);
    expect(v1).toEqual(v2);
  });

  it("a different turn may shift estimate centers but bands still contain the truth", () => {
    let world = starter("view-determinism-2");
    const p = playerCharacter(world);
    const soldier1Id = p.superiorId!;

    const viewBefore = projectView(world, null, EMPTY_CONTENT);
    const personBefore = viewBefore.people.find((person) => person.id === soldier1Id)!;
    expect(withinBand(personBefore.loyalty.band, world.characters.byId[soldier1Id]!.loyalty)).toBe(true);

    const result = step(world, [], EMPTY_CONTENT, { debug: true });
    world = result.world;
    const viewAfter = projectView(world, null, EMPTY_CONTENT);
    const personAfter = viewAfter.people.find((person) => person.id === soldier1Id)!;
    expect(withinBand(personAfter.loyalty.band, world.characters.byId[soldier1Id]!.loyalty)).toBe(true);
  });
});

describe("projectView: people, relations and fog precision", () => {
  it("the player appears as 'you' with exact loyalty, exposure and weight", () => {
    const world = starter("view-people-1");
    const p = playerCharacter(world);
    const view = projectView(world, null, EMPTY_CONTENT);
    const you = view.people.find((person) => person.id === p.id)!;
    expect(you.relation).toBe("you");
    expect(you.loyalty).toEqual({ precision: "exact", value: p.loyalty });
    expect(you.exposure).toEqual({ precision: "exact", value: p.exposure });
    expect(you.weight).toEqual({ precision: "exact", value: p.weight });
  });

  it("the sponsor (superiorId) is related 'sponsor', with rumor-band loyalty and hidden exposure", () => {
    const world = starter("view-people-2");
    const p = playerCharacter(world);
    const view = projectView(world, null, EMPTY_CONTENT);
    const sponsor = view.people.find((person) => person.id === p.superiorId)!;
    expect(sponsor.relation).toBe("sponsor");
    expect(sponsor.loyalty.precision).toBe("rumor");
    expect(withinBand(sponsor.loyalty.band, world.characters.byId[p.superiorId!]!.loyalty)).toBe(true);
    expect(sponsor.exposure).toEqual({ precision: "hidden" });
    expect(sponsor.weight.precision).toBe("estimate");
    expect(withinBand(sponsor.weight.band, world.characters.byId[p.superiorId!]!.weight)).toBe(true);
  });

  it("a subordinate gets estimate-band loyalty and exposure", () => {
    const world = starter("view-people-3");
    const p = playerCharacter(world);
    const sub = addCharacter(world, { name: "Made Man", rank: "civilian", familyId: p.familyId, superiorId: p.id });
    sub.loyalty = 640;
    sub.exposure = 220;

    const view = projectView(world, null, EMPTY_CONTENT);
    const person = view.people.find((pv) => pv.id === sub.id)!;
    expect(person.relation).toBe("subordinate");
    expect(person.loyalty.precision).toBe("estimate");
    expect(withinBand(person.loyalty.band, sub.loyalty)).toBe(true);
    expect(person.exposure.precision).toBe("estimate");
    expect(withinBand(person.exposure.band, sub.exposure)).toBe(true);
  });

  it("a crewmate gets estimate-band loyalty but hidden exposure", () => {
    const world = starter("view-people-4");
    const p = playerCharacter(world);
    const chief = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.rank === "chief")!;
    p.crewId = chief.crewId;
    const crewmate = world.characters.order
      .map((id) => world.characters.byId[id]!)
      .find((c) => c.crewId === chief.crewId && c.rank === "soldier" && c.id !== p.superiorId)!;

    const view = projectView(world, null, EMPTY_CONTENT);
    const person = view.people.find((pv) => pv.id === crewmate.id)!;
    expect(person.relation).toBe("crewmate");
    expect(person.loyalty.precision).toBe("estimate");
    expect(withinBand(person.loyalty.band, crewmate.loyalty)).toBe(true);
    expect(person.exposure).toEqual({ precision: "hidden" });
  });

  it("a distant family member (not sponsor, subordinate or crewmate) is related 'family' with rumor loyalty", () => {
    const world = starter("view-people-5");
    const head = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.rank === "head")!;
    const view = projectView(world, null, EMPTY_CONTENT);
    const person = view.people.find((pv) => pv.id === head.id)!;
    expect(person.relation).toBe("family");
    expect(person.loyalty.precision).toBe("rumor");
    expect(person.exposure).toEqual({ precision: "hidden" });
  });

  it("weight is estimate-band for every family member but the player, and always contains the truth", () => {
    const world = starter("view-people-6");
    const view = projectView(world, null, EMPTY_CONTENT);
    for (const person of view.people) {
      if (person.relation === "you" || person.relation === "rival") continue;
      const c = world.characters.byId[person.id]!;
      expect(person.weight.precision).toBe("estimate");
      expect(withinBand(person.weight.band, c.weight)).toBe(true);
    }
  });

  it("notes surface only 'arrested'/'poached'/'conceded'/'paidOff' memory tags, only for subordinates and crewmates", () => {
    const world = starter("view-people-7");
    const p = playerCharacter(world);
    const sub = addCharacter(world, { name: "Note Bearer", rank: "civilian", familyId: p.familyId, superiorId: p.id });
    sub.memory = [
      { tag: "poached", weight: 30, turn: 0 },
      { tag: "irrelevantTag", weight: 5, turn: 0 },
    ];
    const view = projectView(world, null, EMPTY_CONTENT);
    const person = view.people.find((pv) => pv.id === sub.id)!;
    expect(person.notes).toEqual(["was poached from a rival"]);

    const head = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.rank === "head")!;
    head.memory = [{ tag: "poached", weight: 30, turn: 0 }];
    const view2 = projectView(world, null, EMPTY_CONTENT);
    expect(view2.people.find((pv) => pv.id === head.id)!.notes).toEqual([]);
  });

  it("dead family members are excluded from people", () => {
    const world = starter("view-people-8");
    const p = playerCharacter(world);
    const deadKin = addCharacter(world, { name: "Departed", rank: "civilian", familyId: p.familyId, superiorId: p.id, alive: false });
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.people.some((pv) => pv.id === deadKin.id)).toBe(false);
  });
});

describe("projectView: rivals", () => {
  it("a character is not listed as a rival until a recent fact names them", () => {
    const world = starter("view-rivals-1");
    const family2Id = world.families.order[1]!;
    const rival = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.familyId === family2Id)!;

    const before = projectView(world, null, EMPTY_CONTENT);
    expect(before.people.some((pv) => pv.id === rival.id)).toBe(false);

    world.meta.turn = 30;
    world.history.recentFacts.push({ turn: 10, kind: "RankChange", subjects: [rival.id] });
    const after = projectView(world, null, EMPTY_CONTENT);
    const rivalView = after.people.find((pv) => pv.id === rival.id);
    expect(rivalView).toBeDefined();
    expect(rivalView!.relation).toBe("rival");
    expect(rivalView!.rank).toBe(rival.rank);
    expect(rivalView!.status).toBe(rival.status);
    expect(rivalView!.loyalty).toEqual({ precision: "hidden" });
    expect(rivalView!.exposure).toEqual({ precision: "hidden" });
    expect(rivalView!.weight).toEqual({ precision: "hidden" });
    expect(rivalView!.detainedUntilTurn).toBeNull();
  });

  it("a fact older than 26 turns does not surface a rival", () => {
    const world = starter("view-rivals-2");
    const family2Id = world.families.order[1]!;
    const rival = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.familyId === family2Id)!;

    world.meta.turn = 30;
    world.history.recentFacts.push({ turn: 2, kind: "RankChange", subjects: [rival.id] }); // 30 - 26 = 4, so turn 2 is stale
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.people.some((pv) => pv.id === rival.id)).toBe(false);
  });

  it("a family member named in a recent fact is not duplicated as a rival", () => {
    const world = starter("view-rivals-3");
    const p = playerCharacter(world);
    world.history.recentFacts.push({ turn: 0, kind: "RankChange", subjects: [p.superiorId!] });
    const view = projectView(world, null, EMPTY_CONTENT);
    const matches = view.people.filter((pv) => pv.id === p.superiorId);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.relation).toBe("sponsor");
  });
});

describe("projectView: towns", () => {
  it("the player's town is first, marked yours, with blocks and business claim state", () => {
    const world = starter("view-towns-1");
    const p = playerCharacter(world);
    const family = world.families.byId[p.familyId!]!;
    const town = world.geo.towns.byId[family.townIds[0]!]!;

    const view = projectView(world, null, EMPTY_CONTENT);
    const townView = view.towns[0]!;
    expect(townView.id).toBe(town.id);
    expect(townView.yours).toBe(true);
    expect(townView.blocks.length).toBe(town.blockIds.length);
    for (const block of townView.blocks) {
      expect(block.businesses.length).toBeGreaterThan(0);
      for (const business of block.businesses) {
        // Every business in the starter world is claimed by a soldier of the player's own family.
        expect(business.holderId).not.toBeNull();
        expect(business.claimable).toBe(false); // player is an associate: cannot claim
      }
    }
  });

  it("compliance and fear are exact on the player's crew's blocks, estimate elsewhere in town", () => {
    const world = starter("view-towns-2");
    const p = playerCharacter(world);
    const chief = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.rank === "chief")!;
    p.crewId = chief.crewId; // the whole family1 crew is now "the player's crew's blocks"

    const view = projectView(world, null, EMPTY_CONTENT);
    const townView = view.towns[0]!;
    for (const block of townView.blocks) {
      for (const business of block.businesses) {
        expect(business.compliance.precision).toBe(block.yours ? "exact" : "estimate");
        expect(business.fear.precision).toBe(block.yours ? "exact" : "estimate");
        if (business.compliance.precision === "estimate") {
          expect(withinBand(business.compliance.band, world.geo.businesses.byId[business.id]!.compliance)).toBe(true);
        }
        expect(business.refusalStage).toBe(block.yours ? world.geo.businesses.byId[business.id]!.refusalStage : null);
      }
    }
  });

  it("claimable is true only for a soldier-plus player on an unclaimed business on their crew's blocks", () => {
    const world = createEmptyWorld("view-towns-3", setup, EMPTY_CONTENT.version);
    const p = playerCharacter(world);
    p.rank = "soldier";
    const town = addTown(world, { name: "Testville", archetype: "x" });
    const block = addBlock(world, town.id);
    const biz = addBusiness(world, block.id, { type: "stall", size: 1 });
    const family = addFamily(world, { name: "Fam", townIds: [town.id] });
    addCrew(world, family.id, p.id, [], [block.id]);
    p.familyId = family.id;

    const view = projectView(world, null, EMPTY_CONTENT);
    const townView = view.towns.find((t) => t.id === town.id)!;
    const bizView = townView.blocks[0]!.businesses.find((b) => b.id === biz.id)!;
    expect(bizView.claimable).toBe(true);
  });

  it("neighboring towns in the same district appear with no blocks and sentiment/heat signs above threshold", () => {
    const names: NamePools = {
      givenMale: ["Salvatore"], givenFemale: ["Maria"], surnames: ["Russo"], nicknames: [],
      townNames: ["Uno", "Due", "Tre", "Quattro"], neighborhoodNames: ["Kalsa"], islandNames: ["Isola"],
      familyNameSuffixes: [], provinceName: "Provincia", capitalName: "Città",
    };
    const neighborhoodArchetype: TownArchetype = {
      id: "n1", label: "N", isNeighborhood: true, population: { min: 100, max: 200 }, blocks: { min: 1, max: 1 },
      businessesPerBlock: { min: 1, max: 1 }, businessMix: [{ type: "stall", weight: 1, sizes: [1] }],
      compliance: { min: 500, max: 500 }, fear: { min: 100, max: 100 }, institutions: [], nameStyle: "neighborhood", playerStart: true,
    };
    const townArchetype: TownArchetype = {
      id: "t1", label: "T", isNeighborhood: false, population: { min: 100, max: 200 }, blocks: { min: 1, max: 1 },
      businessesPerBlock: { min: 1, max: 1 }, businessMix: [{ type: "stall", weight: 1, sizes: [1] }],
      compliance: { min: 500, max: 500 }, fear: { min: 100, max: 100 }, institutions: [], nameStyle: "town", playerStart: true,
    };
    const content: Content = { version: "test", templates: [], archetypes: [neighborhoodArchetype, townArchetype], names: names };

    const { world } = generateWorld("view-neighbors-1", setup, content);
    const p = playerCharacter(world);
    const family = world.families.byId[p.familyId!]!;
    const playerTown = world.geo.towns.byId[family.townIds[0]!]!;
    expect(playerTown.districtId).not.toBeNull();

    const neighborTownId = world.geo.towns.order.find(
      (id) => id !== playerTown.id && world.geo.towns.byId[id]!.districtId === playerTown.districtId,
    )!;
    expect(neighborTownId).toBeDefined();
    world.towns.byId[neighborTownId]!.sentiment = -500;
    world.pressure.heatByTown[neighborTownId] = 200;

    const view = projectView(world, null, content);
    const neighborView = view.towns.find((t) => t.id === neighborTownId)!;
    expect(neighborView.yours).toBe(false);
    expect(neighborView.blocks).toEqual([]);
    expect(neighborView.sentimentSign).not.toBeNull();
    expect(neighborView.heatSign).not.toBeNull();
  });

  // docs/event-storming-2026-09-25.md §3 hotspot 1: `BusinessView.ownerName`/`ownerTrait`.
  it("ownerName/ownerTrait are exact only for the player's own crew's shops", () => {
    const world = createEmptyWorld("view-towns-owner-1", setup, EMPTY_CONTENT.version);
    const p = playerCharacter(world);
    p.rank = "soldier";
    const town = addTown(world, { name: "Testville", archetype: "x" });
    const myBlock = addBlock(world, town.id);
    const otherBlock = addBlock(world, town.id);
    const myShop = addBusiness(world, myBlock.id, { type: "shop", size: 1 });
    const otherShop = addBusiness(world, otherBlock.id, { type: "shop", size: 1 });
    const family = addFamily(world, { name: "Fam", townIds: [town.id] });
    addCrew(world, family.id, p.id, [], [myBlock.id]);
    const otherChief = addCharacter(world, { name: "Other Chief", rank: "chief", familyId: family.id });
    addCrew(world, family.id, otherChief.id, [], [otherBlock.id]);
    p.familyId = family.id;

    const owner1 = addCharacter(world, { name: "Owner One", rank: "civilian", familyId: null, traits: ["reporter"] });
    const owner2 = addCharacter(world, { name: "Owner Two", rank: "civilian", familyId: null, traits: ["proud"] });
    world.geo.businesses.byId[myShop.id]!.ownerId = owner1.id;
    world.geo.businesses.byId[otherShop.id]!.ownerId = owner2.id;

    const view = projectView(world, null, EMPTY_CONTENT);
    const townView = view.towns.find((t) => t.id === town.id)!;
    const myBlockView = townView.blocks.find((b) => b.id === myBlock.id)!;
    const otherBlockView = townView.blocks.find((b) => b.id === otherBlock.id)!;
    const myBizView = myBlockView.businesses.find((b) => b.id === myShop.id)!;
    const otherBizView = otherBlockView.businesses.find((b) => b.id === otherShop.id)!;

    expect(myBlockView.yours).toBe(true);
    expect(myBizView.ownerName).toBe("Owner One");
    expect(myBizView.ownerTrait).toBe("reporter");

    expect(otherBlockView.yours).toBe(false);
    expect(otherBizView.ownerName).toBeNull();
    expect(otherBizView.ownerTrait).toBeNull();
  });
});

describe("projectView: actions by rank", () => {
  it("an associate has neither claimBusiness nor askPermission (phase 6b: the associate's week is cards); a soldier has both", () => {
    const world = starter("view-actions-1");
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(actionOf(view.actions, "claimBusiness")).toBeUndefined();
    expect(actionOf(view.actions, "askPermission")).toBeUndefined();
    playerCharacter(world).rank = "soldier";
    const soldierView = projectView(world, null, EMPTY_CONTENT);
    expect(actionOf(soldierView.actions, "askPermission")).toBeDefined();
  });

  it("a soldier with a crew sees unclaimed businesses on the crew's blocks for claimBusiness", () => {
    const world = createEmptyWorld("view-actions-2", setup, EMPTY_CONTENT.version);
    const p = playerCharacter(world);
    p.rank = "soldier";
    const town = addTown(world, { name: "Testville", archetype: "x" });
    const block = addBlock(world, town.id);
    const claimedBiz = addBusiness(world, block.id, { type: "stall", size: 1 });
    const unclaimedBiz = addBusiness(world, block.id, { type: "shop", size: 2 });
    const family = addFamily(world, { name: "Fam" });
    addCrew(world, family.id, p.id, [], [block.id]);
    p.familyId = family.id;
    const claimId = mintId<"ClaimId">(world.meta.ids, "clm");
    tableInsert(world.claims, claimId, { id: claimId, subject: { kind: "business", id: claimedBiz.id }, holderId: p.id, since: 0 });

    const view = projectView(world, null, EMPTY_CONTENT);
    const spec = actionOf(view.actions, "claimBusiness")!;
    expect(spec.businesses.map((b) => b.id)).toEqual([unclaimedBiz.id]);
  });

  it("setShare lists direct subordinates with their current share rule", () => {
    const world = starter("view-actions-3");
    const p = playerCharacter(world);
    const sub = addCharacter(world, { name: "Sub", rank: "civilian", familyId: p.familyId, superiorId: p.id });
    p.shareRules[sub.id] = { fixedPerTurn: 10, percent: 400 };

    const view = projectView(world, null, EMPTY_CONTENT);
    const spec = actionOf(view.actions, "setShare")!;
    expect(spec.subordinates).toEqual([{ id: sub.id, name: sub.name, current: { fixedPerTurn: 10, percent: 400 } }]);
  });

  it("releaseClaim lists claims the player holds", () => {
    const world = starter("view-actions-4");
    playerCharacter(world).rank = "soldier"; // an associate has no claims to give up (2026-09-25)
    const p = playerCharacter(world);
    const claim = world.claims.order.map((id) => world.claims.byId[id]!).find((c) => c.holderId === p.superiorId)!;
    // Reassign a claim to the player directly so releaseClaim has something to list.
    claim.holderId = p.id;

    const view = projectView(world, null, EMPTY_CONTENT);
    const spec = actionOf(view.actions, "releaseClaim")!;
    expect(spec.claims.some((c) => c.claimId === claim.id)).toBe(true);
  });
});

describe("projectView: decisions", () => {
  function templateAndInstance(world: World, deciderId: string): { content: Content; instance: ProcessInstance } {
    const template: ProcessTemplate = {
      id: "test.decision",
      version: 1,
      kind: "event",
      scope: "family",
      lane: "families",
      roles: {},
      preconditions: [],
      duration: 0,
      decision: {
        role: "arbiter",
        prompt: "What do you do?",
        options: [
          { id: "optA", label: "Do A", effects: [] },
          { id: "optB", label: "Do B", effects: [] },
        ],
        aiDefault: "optA",
        timeoutTurns: 3,
        timeoutOption: "optA",
      },
      resolve: [],
      followUps: [],
      tags: [],
    };

    const instance: ProcessInstance = {
      id: mintId<"ProcessInstanceId">(world.meta.ids, "proc"),
      templateId: template.id as TemplateId,
      templateVersion: 1,
      kind: "event",
      lane: "families",
      state: "awaitingDecision",
      roles: { arbiter: { kind: "character", id: deciderId } },
      startedTurn: world.meta.turn,
      resolveTurn: world.meta.turn + 3,
      progress: 0,
      locks: [],
      causeChainId: "test-chain",
      decision: { pendingSince: world.meta.turn, options: ["optA", "optB"] },
      priority: 0,
    };
    tableInsert(world.processes, instance.id, instance);

    return { content: { ...EMPTY_CONTENT, templates: [template] }, instance };
  }

  it("lists a decision for a player-controlled arbiter, with options filtered to the instance's own options", () => {
    const world = starter("view-decisions-1");
    const arbiter = addCharacter(world, { name: "Arbiter", rank: "chief" });
    arbiter.playerControlled = true;
    const { content, instance } = templateAndInstance(world, arbiter.id);

    const view = projectView(world, null, content);
    expect(view.decisions).toHaveLength(1);
    const d = view.decisions[0]!;
    expect(d.instanceId).toBe(instance.id);
    expect(d.prompt).toBe("What do you do?");
    expect(d.options).toEqual([{ id: "optA", label: "Do A" }, { id: "optB", label: "Do B" }]);
    expect(d.timeoutTurns).toBe(3);
  });

  it("does not list a decision whose deciding role is not player-controlled", () => {
    const world = starter("view-decisions-2");
    const notPlayer = addCharacter(world, { name: "NPC Arbiter", rank: "chief" });
    const { content } = templateAndInstance(world, notPlayer.id);

    const view = projectView(world, null, content);
    expect(view.decisions).toHaveLength(0);
  });
});

describe("projectView: stateSigns", () => {
  it("includes the patrols sign once the family's tools include patrols", () => {
    const world = starter("view-signs-1");
    const p = playerCharacter(world);
    world.pressure.toolsByFamily[p.familyId!] = ["patrols"];
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.stateSigns).toContain("Patrols pass more often than they used to.");
  });

  it("includes a detained sign when a family member is arrested", () => {
    const world = starter("view-signs-2");
    const p = playerCharacter(world);
    const chief = world.characters.order.map((id) => world.characters.byId[id]!).find((c) => c.rank === "chief")!;
    chief.status = "arrested";
    chief.detainedUntilTurn = world.meta.turn + 4;
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(p.familyId).toBe(chief.familyId);
    expect(view.stateSigns).toContain("One of your own is being held.");
  });

  it("no numbers appear anywhere in stateSigns", () => {
    const world = starter("view-signs-3");
    const p = playerCharacter(world);
    world.pressure.toolsByFamily[p.familyId!] = ["patrols", "informants", "squad"];
    world.pressure.heatByTown[world.families.byId[p.familyId!]!.townIds[0]!] = 500;
    const view = projectView(world, null, EMPTY_CONTENT);
    for (const sign of view.stateSigns) expect(/\d/.test(sign)).toBe(false);
  });
});

describe("projectView: attentionBandName", () => {
  it("is null until the 'territory' layer is unlocked", () => {
    const world = starter("view-band-1");
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.attentionBandName).toBeNull();
  });

  it("names the family's Attention band once 'territory' is unlocked", () => {
    const world = starter("view-band-2");
    const p = playerCharacter(world);
    world.player.uiLayersUnlocked.push("territory");
    world.families.byId[p.familyId!]!.attentionBand = 2;
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(view.attentionBandName).toBe("Watched");
  });
});

describe("actionAllowed", () => {
  it("noop is always allowed", () => {
    const world = starter("view-allowed-1");
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(actionAllowed(view, { kind: "noop" })).toBe(true);
  });

  it("setShare is allowed only for a listed subordinate", () => {
    const world = starter("view-allowed-2");
    const p = playerCharacter(world);
    const sub = addCharacter(world, { name: "Sub", rank: "civilian", familyId: p.familyId, superiorId: p.id });
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(actionAllowed(view, { kind: "setShare", subordinateId: sub.id, rule: { fixedPerTurn: 0, percent: 100 } })).toBe(true);
    expect(actionAllowed(view, { kind: "setShare", subordinateId: "chr-nope", rule: { fixedPerTurn: 0, percent: 100 } })).toBe(false);
  });

  it("claimBusiness is allowed only for a listed business", () => {
    const world = createEmptyWorld("view-allowed-3", setup, EMPTY_CONTENT.version);
    const p = playerCharacter(world);
    p.rank = "soldier";
    const town = addTown(world, { name: "T", archetype: "x" });
    const block = addBlock(world, town.id);
    const biz = addBusiness(world, block.id, { type: "stall", size: 1 });
    const family = addFamily(world, { name: "Fam" });
    addCrew(world, family.id, p.id, [], [block.id]);
    p.familyId = family.id;

    const view = projectView(world, null, EMPTY_CONTENT);
    expect(actionAllowed(view, { kind: "claimBusiness", businessId: biz.id })).toBe(true);
    expect(actionAllowed(view, { kind: "claimBusiness", businessId: "biz-nope" })).toBe(false);
  });

  it("releaseClaim is allowed only for a listed claim", () => {
    const world = starter("view-allowed-4");
    playerCharacter(world).rank = "soldier"; // an associate has no claims to give up (2026-09-25)
    const p = playerCharacter(world);
    const claim = world.claims.order.map((id) => world.claims.byId[id]!).find((c) => c.holderId === p.superiorId)!;
    claim.holderId = p.id;
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(actionAllowed(view, { kind: "releaseClaim", claimId: claim.id })).toBe(true);
    expect(actionAllowed(view, { kind: "releaseClaim", claimId: "clm-nope" })).toBe(false);
  });

  it("askPermission is allowed only for a listed option", () => {
    const world = starter("view-allowed-5");
    playerCharacter(world).rank = "soldier";
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(actionAllowed(view, { kind: "askPermission", what: "makeAssociate" })).toBe(true);
  });

  it("decide is allowed only for a listed instance and option", () => {
    const world = starter("view-allowed-6");
    const arbiter = addCharacter(world, { name: "Arbiter", rank: "chief" });
    arbiter.playerControlled = true;
    const template: ProcessTemplate = {
      id: "test.decision", version: 1, kind: "event", scope: "family", lane: "families", roles: {}, preconditions: [], duration: 0,
      decision: { role: "arbiter", prompt: "?", options: [{ id: "optA", label: "A", effects: [] }], aiDefault: "optA", timeoutTurns: 1, timeoutOption: "optA" },
      resolve: [], followUps: [], tags: [],
    };
    const instance: ProcessInstance = {
      id: mintId<"ProcessInstanceId">(world.meta.ids, "proc"),
      templateId: template.id as TemplateId,
      templateVersion: 1, kind: "event", lane: "families", state: "awaitingDecision",
      roles: { arbiter: { kind: "character", id: arbiter.id } },
      startedTurn: 0, resolveTurn: 1, progress: 0, locks: [], causeChainId: "c",
      decision: { pendingSince: 0, options: ["optA"] }, priority: 0,
    };
    tableInsert(world.processes, instance.id, instance);
    const content: Content = { ...EMPTY_CONTENT, templates: [template] };

    const view = projectView(world, null, content);
    expect(actionAllowed(view, { kind: "decide", instanceId: instance.id, optionId: "optA" })).toBe(true);
    expect(actionAllowed(view, { kind: "decide", instanceId: instance.id, optionId: "optB" })).toBe(false);
    expect(actionAllowed(view, { kind: "decide", instanceId: "proc-nope", optionId: "optA" })).toBe(false);
  });
});

describe("projectView: never throws on an empty world", () => {
  it("projects a valid view from createEmptyWorld", () => {
    const world = createEmptyWorld("view-empty-1", setup, EMPTY_CONTENT.version);
    let view;
    expect(() => {
      view = projectView(world, null, EMPTY_CONTENT);
    }).not.toThrow();
    expect(view!.people).toEqual([]);
    expect(view!.towns).toEqual([]);
    expect(view!.stateSigns).toEqual([]);
    expect(view!.decisions).toEqual([]);
    expect(view!.attentionBandName).toBeNull();
  });

  it("actionAllowed never throws against the empty-world view", () => {
    const world = createEmptyWorld("view-empty-2", setup, EMPTY_CONTENT.version);
    const view = projectView(world, null, EMPTY_CONTENT);
    expect(() => actionAllowed(view, { kind: "noop" })).not.toThrow();
    expect(() => actionAllowed(view, { kind: "setShare", subordinateId: "x", rule: { fixedPerTurn: 0, percent: 0 } })).not.toThrow();
  });
});
