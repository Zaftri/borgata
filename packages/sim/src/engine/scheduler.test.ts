import { describe, expect, it } from "vitest";
import { mintId } from "@borgata/shared";
import { buildStarterWorld } from "../starter.js";
import { TurnLogBuilder } from "../log.js";
import { applyFacts } from "../reducers/index.js";
import { runInvariants } from "../invariants/all.js";
import { step } from "../step.js";
import { EMPTY_CONTENT, type Content } from "../content-types.js";
import { getLastCancellations, resolveDeciderRoleName, runScheduler, type PlayerDecision } from "./scheduler.js";
import type { ProcessInstance, ProcessTemplate } from "./types.js";

const setup = { archetype: null, background: "family", difficulty: "normal", ironman: false } as const;
const cause = { rule: "test" };

function tpl(overrides: Partial<ProcessTemplate> & { id: string }): ProcessTemplate {
  return {
    version: 1,
    kind: "event",
    scope: "family",
    lane: "civil",
    roles: {},
    preconditions: [],
    duration: 1,
    resolve: [{ id: "out", effects: [] }],
    followUps: [],
    tags: [],
    ...overrides,
  };
}

function content(templates: ProcessTemplate[]): Content {
  return { ...EMPTY_CONTENT, version: "test", templates };
}

function world() {
  return buildStarterWorld("sched-seed", setup, { ...EMPTY_CONTENT, version: "test", templates: [] });
}

function apply(w: ReturnType<typeof world>, facts: ReturnType<typeof runScheduler>) {
  const log = new TurnLogBuilder(w.meta.turn);
  applyFacts(w, facts, log);
  return log;
}

describe("runScheduler: spawn pass", () => {
  it("weight 10000 spawns once per scope entity, and maxActivePerScope stops a second round", () => {
    const w = world();
    const businessCount = w.geo.businesses.order.length;
    expect(businessCount).toBeGreaterThan(0);

    const template = tpl({
      id: "t.spawnBusiness",
      spawn: { weight: 10_000, per: "business", maxActivePerScope: 1 },
      roles: { shop: { entity: "business", pick: "first" } },
      duration: 5,
    });

    const facts1 = runScheduler(w, content([template]), []);
    const spawns1 = facts1.filter((f) => f.kind === "ProcessSpawn");
    expect(spawns1).toHaveLength(businessCount);

    apply(w, facts1);
    expect(w.processes.order.length).toBe(businessCount);

    const facts2 = runScheduler(w, content([template]), []);
    expect(facts2.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(0);
  });
});

describe("runScheduler: instant resolution", () => {
  it("duration 0 resolves in the same call with the outcome's fact", () => {
    const w = world();
    const townId = w.geo.towns.order[0]!;
    const template = tpl({
      id: "t.instant",
      spawn: { weight: 10_000, per: "town" },
      roles: { town: { entity: "town", pick: "first" } },
      duration: 0,
      resolve: [{ id: "out", effects: [{ fact: "SentimentDelta", townId: "$town", delta: -10, cause: { rule: "instant" } }] }],
    });

    const facts = runScheduler(w, content([template]), []);
    expect(facts.some((f) => f.kind === "ProcessSpawn")).toBe(true);
    expect(facts.some((f) => f.kind === "ProcessResolve" && f.outcomeId === "out")).toBe(true);
    const sentimentFact = facts.find((f) => f.kind === "SentimentDelta");
    expect(sentimentFact).toEqual({ kind: "SentimentDelta", townId, delta: -10, cause: expect.objectContaining({ rule: "instant" }) });

    apply(w, facts);
    expect(w.processes.order.length).toBe(0); // spawned then resolved in the same call: never left in the table
  });
});

describe("runScheduler: duration through step()", () => {
  it("duration 2 resolves at the right turn", () => {
    const w0 = world();
    const template = tpl({
      id: "t.duration2",
      spawn: { weight: 10_000, per: "town" },
      roles: { town: { entity: "town", pick: "first" } },
      duration: 2,
      resolve: [{ id: "out", effects: [{ fact: "SentimentDelta", townId: "$town", delta: -9, cause: { rule: "duration2" } }] }],
    });
    const c = content([template]);

    const r0 = step(w0, [], c); // turn 0: spawns, resolveTurn = 2
    const inst = r0.world.processes.byId[r0.world.processes.order.find((id) => r0.world.processes.byId[id]!.templateId === "t.duration2")!];
    expect(inst).toBeDefined();
    expect(inst!.state).toBe("active");
    expect(inst!.resolveTurn).toBe(2);

    const r1 = step(r0.world, [], c); // turn 1: not due yet
    expect(r1.world.processes.byId[inst!.id]).toBeDefined();
    expect(r1.log.entries.some((e) => e.kind === "fact" && e.fact.kind === "SentimentDelta")).toBe(false);

    const r2 = step(r1.world, [], c); // turn 2: due, resolves
    expect(r2.world.processes.byId[inst!.id]).toBeUndefined();
    expect(r2.log.entries.some((e) => e.kind === "fact" && e.fact.kind === "SentimentDelta" && e.fact.delta === -9)).toBe(true);
  });
});

describe("runScheduler: follow-ups", () => {
  it("a follow-up is scheduled and fires", () => {
    const w = world();
    const townFollowUp = tpl({
      id: "t.followupA",
      spawn: { weight: 10_000, per: "town" },
      roles: { town: { entity: "town", pick: "first" } },
      duration: 0,
      resolve: [{ id: "out", effects: [] }],
      followUps: [{ templateId: "t.followupB", delay: 1, bind: { town: "town" } }],
    });
    const followUpB = tpl({
      id: "t.followupB",
      roles: { town: { entity: "town", pick: "first" } },
      duration: 0,
      resolve: [{ id: "outB", effects: [{ fact: "SentimentDelta", townId: "$town", delta: -3, cause: { rule: "followup" } }] }],
    });
    const c = content([townFollowUp, followUpB]);

    const facts0 = runScheduler(w, c, []);
    expect(facts0.some((f) => f.kind === "ScheduleAdd" && f.entry.templateId === "t.followupB")).toBe(true);
    apply(w, facts0);
    // Two towns (starter.ts): "per: town" spawns one parent per town, each scheduling its own follow-up.
    expect(w.schedule).toHaveLength(2);

    w.meta.turn = 1;
    const facts1 = runScheduler(w, c, []);
    expect(facts1.some((f) => f.kind === "ScheduleRemove")).toBe(true);
    expect(facts1.some((f) => f.kind === "ProcessSpawn" && f.instance.templateId === "t.followupB")).toBe(true);
    expect(facts1.some((f) => f.kind === "SentimentDelta" && f.delta === -3)).toBe(true);
    expect(getLastCancellations()).toEqual([]);
  });

  it("a follow-up whose when fails at fire time is removed and recorded in getLastCancellations()", () => {
    const w = world();
    const headId = w.families.byId[w.families.order[0]!]!.headId!;

    const spawnHeadFollowUp = tpl({
      id: "t.followupC.parent",
      spawn: { weight: 10_000, per: "character" },
      roles: { target: { entity: "character", pick: "first" } },
      preconditions: [{ rank: { role: "target", in: ["head"] } }],
      duration: 0,
      resolve: [{ id: "out", effects: [] }],
      followUps: [{ templateId: "t.followupC", delay: 1, bind: { char: "target" }, when: [{ alive: { role: "char" } }] }],
    });
    const followUpC = tpl({
      id: "t.followupC",
      roles: { char: { entity: "character", pick: "first" } },
      duration: 0,
      resolve: [{ id: "outC", effects: [{ fact: "LoyaltyDelta", characterId: "$char", delta: -50, cause: { rule: "followupC" } }] }],
    });
    const c = content([spawnHeadFollowUp, followUpC]);

    const facts0 = runScheduler(w, c, []);
    expect(facts0.some((f) => f.kind === "ScheduleAdd" && f.entry.templateId === "t.followupC" && f.entry.bind["char"]?.id === headId)).toBe(
      true,
    );
    apply(w, facts0);
    // Two families (starter.ts) each have a head: "per: character" spawns a parent for each,
    // each scheduling its own follow-up.
    expect(w.schedule).toHaveLength(2);
    const headEntry = w.schedule.find((e) => e.templateId === "t.followupC" && e.bind["char"]?.id === headId)!;

    // The head dies before the follow-up fires: its `when` (alive) now fails. The other family's
    // head is untouched, so its own follow-up still fires normally.
    w.characters.byId[headId]!.alive = false;
    w.meta.turn = 1;
    const facts1 = runScheduler(w, c, []);
    expect(facts1.some((f) => f.kind === "ScheduleRemove" && f.entryId === headEntry.id)).toBe(true);
    expect(
      facts1.some((f) => f.kind === "ProcessSpawn" && f.instance.templateId === "t.followupC" && f.instance.roles["char"]?.id === headId),
    ).toBe(false);
    expect(facts1.some((f) => f.kind === "LoyaltyDelta" && f.characterId === headId)).toBe(false);
    expect(getLastCancellations().some((c2) => c2.includes("t.followupC"))).toBe(true);
  });
});

describe("runScheduler: exclusive tags and locks", () => {
  it("exclusiveTag prevents a second template from spawning in the same scope this turn", () => {
    const w = world();
    const templateA = tpl({
      id: "t.tagA",
      spawn: { weight: 10_000, per: "family", maxActivePerScope: 5 },
      roles: { family: { entity: "family", pick: "first" } },
      exclusiveTag: "war",
      duration: 5,
    });
    const templateB = tpl({
      id: "t.tagB",
      spawn: { weight: 10_000, per: "family", maxActivePerScope: 5 },
      roles: { family: { entity: "family", pick: "first" } },
      exclusiveTag: "war",
      duration: 5,
    });

    const facts = runScheduler(w, content([templateA, templateB]), []);
    const spawns = facts.filter((f): f is Extract<(typeof facts)[number], { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn");
    // Two families (starter.ts): exclusiveTag is enforced per scope, so each family's scope
    // independently picks one winner, both "t.tagA" (registered first).
    expect(spawns).toHaveLength(2);
    for (const spawn of spawns) expect(spawn.instance.templateId).toBe("t.tagA");
  });

  it("locks prevent two operations on one subject in a turn", () => {
    const w = world();
    const templateA = tpl({
      id: "t.lockA",
      spawn: { weight: 10_000, per: "character", maxActivePerScope: 5 },
      roles: { target: { entity: "character", pick: "first" } },
      locks: ["target"],
      duration: 5,
    });
    const templateB = tpl({
      id: "t.lockB",
      spawn: { weight: 10_000, per: "character", maxActivePerScope: 5 },
      roles: { target: { entity: "character", pick: "first" } },
      locks: ["target"],
      duration: 5,
    });

    const facts = runScheduler(w, content([templateA, templateB]), []);
    const spawns = facts.filter((f): f is Extract<(typeof facts)[number], { kind: "ProcessSpawn" }> => f.kind === "ProcessSpawn");
    // For every character, only one of the two templates could grab the lock.
    const byTarget = new Map<string, number>();
    for (const s of spawns) {
      const targetId = s.instance.roles["target"]!.id;
      byTarget.set(targetId, (byTarget.get(targetId) ?? 0) + 1);
    }
    for (const count of byTarget.values()) expect(count).toBe(1);
    expect(getLastCancellations().some((c2) => c2.startsWith("locked:"))).toBe(true);
  });
});

describe("runScheduler: request budget", () => {
  it("with the player as scope and 5 player-facing templates at rank associate, only 3 push and 2 defer", () => {
    const w = world();
    expect(w.characters.byId[w.player.characterId]!.rank).toBe("associate");

    const templates = Array.from({ length: 5 }, (_, i) =>
      tpl({
        id: `t.budget.${i}`,
        spawn: { weight: 10_000, per: "character", maxActivePerScope: 5 },
        roles: { who: { entity: "character", pick: "first" } },
        preconditions: [{ playerControlled: { role: "who", is: true } }],
        duration: 5,
        // The budget caps the player's own decisions (2026-09-25); news is never counted, so these are decisions.
        decision: { role: "who", prompt: "?", options: [{ id: "ok", label: "ok", hint: "nothing", effects: [] }], aiDefault: "ok", timeoutTurns: 1, timeoutOption: "ok" },
        report: { visibility: "sign", sign: `budget test ${i}` },
      }),
    );

    const facts = runScheduler(w, content(templates), []);
    expect(facts.filter((f) => f.kind === "RequestPush")).toHaveLength(3);
    expect(facts.filter((f) => f.kind === "RequestDefer")).toHaveLength(2);
    expect(facts.filter((f) => f.kind === "ProcessSpawn")).toHaveLength(3);
  });
});

describe("runScheduler: decisions", () => {
  function buildAwaitingDecision(w: ReturnType<typeof world>, template: ProcessTemplate, pendingSince: number) {
    const townId = w.geo.towns.order[0]!;
    const playerId = w.player.characterId;
    const instanceId = mintId<"ProcessInstanceId">(w.meta.ids, "proc");
    const instance: ProcessInstance = {
      id: instanceId,
      templateId: template.id as ProcessInstance["templateId"],
      templateVersion: template.version,
      kind: template.kind,
      lane: template.lane,
      state: "active",
      roles: { who: { kind: "character", id: playerId }, town: { kind: "town", id: townId } },
      startedTurn: pendingSince,
      resolveTurn: pendingSince,
      progress: 0,
      locks: [],
      causeChainId: `chain-${instanceId}`,
      priority: 0,
    };
    const log = new TurnLogBuilder(w.meta.turn);
    applyFacts(
      w,
      [
        { kind: "ProcessSpawn", instance, cause },
        { kind: "ProcessAwaitDecision", instanceId, options: ["optA", "optB"], cause },
      ],
      log,
    );
    return instanceId as string;
  }

  function decisionTemplate(): ProcessTemplate {
    return tpl({
      id: "t.decision",
      roles: { who: { entity: "character", pick: "first" }, town: { entity: "town", pick: "first" } },
      duration: 1,
      decision: {
        role: "who",
        prompt: "choose",
        options: [
          { id: "optA", label: "A", effects: [{ fact: "SentimentDelta", townId: "$town", delta: -5, cause: { rule: "optA" } }] },
          { id: "optB", label: "B", effects: [{ fact: "SentimentDelta", townId: "$town", delta: 7, cause: { rule: "optB" } }] },
        ],
        aiDefault: "optB",
        timeoutTurns: 3,
        timeoutOption: "optB",
      },
      resolve: [{ id: "out", effects: [] }],
    });
  }

  it("a decide action resolves with the chosen option's effect", () => {
    const w = world();
    const template = decisionTemplate();
    w.meta.turn = 0;
    const instanceId = buildAwaitingDecision(w, template, 0);

    const decisions: PlayerDecision[] = [{ instanceId, optionId: "optA" }];
    const facts = runScheduler(w, content([template]), decisions);

    expect(facts.some((f) => f.kind === "ProcessDecide" && f.optionId === "optA")).toBe(true);
    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === -5)).toBe(true);
    expect(facts.some((f) => f.kind === "ProcessResolve" && f.instanceId === instanceId)).toBe(true);

    apply(w, facts);
    expect(w.processes.byId[instanceId]).toBeUndefined();
  });

  it("timeout takes the timeoutOption", () => {
    const w = world();
    const template = decisionTemplate();
    w.meta.turn = 0;
    const instanceId = buildAwaitingDecision(w, template, 0);

    w.meta.turn = 3; // turn - pendingSince (0) >= timeoutTurns (3)
    const facts = runScheduler(w, content([template]), []);

    expect(facts.some((f) => f.kind === "ProcessDecide" && f.optionId === "optB")).toBe(true);
    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === 7)).toBe(true);
    expect(facts.some((f) => f.kind === "ProcessResolve" && f.instanceId === instanceId)).toBe(true);
  });
});

describe("runScheduler: decision.role priority list (design 04 hotspot 5, 2026-09-25)", () => {
  function listDecisionTemplate(roleList: string[]): ProcessTemplate {
    return tpl({
      id: "t.decisionList",
      roles: {
        holder: { entity: "character", pick: "first" },
        chief: { entity: "character", pick: "first" },
        town: { entity: "town", pick: "first" },
      },
      duration: 1,
      decision: {
        role: roleList,
        prompt: "choose",
        options: [
          { id: "optA", label: "A", effects: [{ fact: "SentimentDelta", townId: "$town", delta: -5, cause: { rule: "optA" } }] },
          { id: "optB", label: "B", effects: [{ fact: "SentimentDelta", townId: "$town", delta: 7, cause: { rule: "optB" } }] },
        ],
        aiDefault: "optB",
        timeoutTurns: 3,
        timeoutOption: "optB",
      },
      resolve: [{ id: "out", effects: [] }],
    });
  }

  function buildActive(w: ReturnType<typeof world>, template: ProcessTemplate, roles: ProcessInstance["roles"]) {
    const instanceId = mintId<"ProcessInstanceId">(w.meta.ids, "proc");
    const instance: ProcessInstance = {
      id: instanceId,
      templateId: template.id as ProcessInstance["templateId"],
      templateVersion: template.version,
      kind: template.kind,
      lane: template.lane,
      state: "active",
      roles,
      startedTurn: 0,
      resolveTurn: 0,
      progress: 0,
      locks: [],
      causeChainId: `chain-${instanceId}`,
      priority: 0,
    };
    const log = new TurnLogBuilder(w.meta.turn);
    applyFacts(w, [{ kind: "ProcessSpawn", instance, cause }], log);
    return instanceId as string;
  }

  it("routes to the player-controlled role even when it is listed first", () => {
    const w = world();
    const playerId = w.player.characterId;
    const npcId = w.characters.order.find((id) => id !== playerId)!;
    const townId = w.geo.towns.order[0]!;
    const template = listDecisionTemplate(["holder", "chief"]);
    w.meta.turn = 0;
    const instanceId = buildActive(w, template, {
      holder: { kind: "character", id: playerId },
      chief: { kind: "character", id: npcId },
      town: { kind: "town", id: townId },
    });

    const facts = runScheduler(w, content([template]), []);
    expect(facts.some((f) => f.kind === "ProcessAwaitDecision" && f.instanceId === instanceId)).toBe(true);
    // Awaiting, not yet decided: the option's own effect (design 04 §3 step 4) has not run either.
    expect(facts.some((f) => f.kind === "SentimentDelta")).toBe(false);
  });

  it("falls back to the list's last role (the NPC default) when no earlier role is player-controlled", () => {
    const w = world();
    const playerId = w.player.characterId;
    const npcId = w.characters.order.find((id) => id !== playerId)!;
    const townId = w.geo.towns.order[0]!;
    const template = listDecisionTemplate(["holder", "chief"]);
    w.meta.turn = 0;
    const instanceId = buildActive(w, template, {
      holder: { kind: "character", id: npcId },
      chief: { kind: "character", id: npcId },
      town: { kind: "town", id: townId },
    });

    const facts = runScheduler(w, content([template]), []);
    expect(facts.some((f) => f.kind === "ProcessAwaitDecision")).toBe(false);
    // Neither `holder` nor `chief` is player-controlled here, so the last role in the list (`chief`, the NPC
    // default) decides and resolves immediately with `aiDefault` ("optB")'s own effect.
    expect(facts.some((f) => f.kind === "SentimentDelta" && f.delta === 7)).toBe(true);
    expect(facts.some((f) => f.kind === "ProcessResolve" && f.instanceId === instanceId)).toBe(true);
  });

  it("resolveDeciderRoleName: first player-controlled role in the list wins; a plain string is unaffected", () => {
    const w = world();
    const playerId = w.player.characterId;
    const npcId = w.characters.order.find((id) => id !== playerId)!;
    const roles = {
      a: { kind: "character" as const, id: npcId },
      b: { kind: "character" as const, id: playerId },
      c: { kind: "character" as const, id: npcId },
    };

    expect(resolveDeciderRoleName(w, ["a", "b", "c"], roles)).toBe("b");
    expect(resolveDeciderRoleName(w, ["a", "c"], roles)).toBe("c"); // neither bound role is player-controlled: last wins
    expect(resolveDeciderRoleName(w, "a", roles)).toBe("a"); // single-string form unchanged
  });
});

describe("runScheduler: crisis flags", () => {
  it("sets the crisis flag on spawn and clears it on resolve", () => {
    const w = world();
    const template = tpl({
      id: "t.crisis",
      spawn: { weight: 10_000, per: "town" },
      roles: { town: { entity: "town", pick: "first" } },
      duration: 0,
      crisis: { flag: "campaign", ttl: 3 },
      // Crisis flags are the player's (design 03 §6): only a player-facing instance sets one, so this template reports.
      report: { visibility: "known", sign: "A campaign begins." },
      resolve: [{ id: "out", effects: [] }],
    });

    const facts = runScheduler(w, content([template]), []);
    const sets = facts.filter((f) => f.kind === "CrisisFlagSet");
    // Two towns (starter.ts): "per: town" spawns one instance per town, but only the player's town is player-facing,
    // so only that instance sets (then clears) the crisis flag.
    // (duration 0) before the next instance is processed, in pairs.
    expect(sets).toHaveLength(2);
    expect(sets[0]).toMatchObject({ active: true, flag: "campaign" });
    expect(sets[1]).toMatchObject({ active: false, flag: "campaign" });

    apply(w, facts);
    expect(w.meta.crises).toEqual([]); // set then cleared in the same turn
  });
});

describe("runScheduler: determinism", () => {
  it("the same seed and content produce the same facts", () => {
    const guaranteed = tpl({
      id: "t.deterministic.guaranteed",
      spawn: { weight: 10_000, per: "town" },
      roles: { town: { entity: "town", pick: "first" } },
      duration: 3,
    });
    const chancy = tpl({
      id: "t.deterministic.chancy",
      spawn: { weight: 5_000, per: "character", maxActivePerScope: 5 },
      roles: { who: { entity: "character", pick: "first" } },
      duration: 3,
    });
    const c = content([guaranteed, chancy]);

    const w1 = world();
    const w2 = world();
    const facts1 = runScheduler(w1, c, []);
    const facts2 = runScheduler(w2, c, []);
    expect(facts1).toEqual(facts2);
    expect(facts1.length).toBeGreaterThan(0);
  });
});

describe("runScheduler + step(): invariants stay green with active templates", () => {
  it("does not violate engine invariants across a few turns", () => {
    const w0 = world();
    const template = tpl({
      id: "t.invariantCheck",
      spawn: { weight: 10_000, per: "town" },
      roles: { town: { entity: "town", pick: "first" } },
      duration: 2,
      resolve: [{ id: "out", effects: [{ fact: "SentimentDelta", townId: "$town", delta: -1, cause: { rule: "check" } }] }],
    });
    const c = content([template]);
    let w = w0;
    for (let i = 0; i < 4; i++) w = step(w, [], c).world;
    expect(runInvariants(w).filter((v) => v.name.startsWith("engine."))).toEqual([]);
  });
});
