// Sponsor mood (design 09 §3): a sentence from the favor ledger, sponsor -> player, personality-flavored.
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT } from "./content-types.js";
import { buildStarterWorld } from "./starter.js";
import { projectView } from "./view.js";
import { favorKey, playerCharacter } from "./world.js";

const setup = { archetype: null, background: "outsider", difficulty: "normal", ironman: false } as const;

function sponsorOf(world: ReturnType<typeof buildStarterWorld>) {
  const player = playerCharacter(world);
  return world.characters.byId[player.superiorId!]!;
}

describe("sponsorMood", () => {
  it("is null when the player has no sponsor", () => {
    const world = buildStarterWorld("mood-none", setup, EMPTY_CONTENT);
    playerCharacter(world).superiorId = null;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBeNull();
  });

  it("moves through five bands as favor(sponsor -> player) moves", () => {
    const world = buildStarterWorld("mood-bands", setup, EMPTY_CONTENT);
    const player = playerCharacter(world);
    const sponsor = sponsorOf(world);
    const key = favorKey(sponsor.id, player.id);

    world.favors[key] = -200;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBe("Your padrino (sponsor) has had enough of you.");

    world.favors[key] = -100;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBe("Your padrino (sponsor) is unhappy with you.");

    world.favors[key] = 0;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBe("Your padrino (sponsor) has no strong opinion of you either way.");

    world.favors[key] = 100;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBe("Your padrino (sponsor) is glad to have you.");

    world.favors[key] = 200;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBe("Your padrino (sponsor) speaks well of you to others.");
  });

  it("treats -150 and 49 as within their lower bands (band edges are inclusive on the low side)", () => {
    const world = buildStarterWorld("mood-edges", setup, EMPTY_CONTENT);
    const player = playerCharacter(world);
    const sponsor = sponsorOf(world);
    const key = favorKey(sponsor.id, player.id);

    world.favors[key] = -150;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBe("Your padrino (sponsor) has had enough of you.");

    world.favors[key] = 149;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBe("Your padrino (sponsor) is glad to have you.");

    world.favors[key] = 150;
    expect(projectView(world, null, EMPTY_CONTENT).sponsorMood).toBe("Your padrino (sponsor) speaks well of you to others.");
  });

  it("adds a personality-flavored clause when the sponsor has a known trait", () => {
    const world = buildStarterWorld("mood-trait", setup, EMPTY_CONTENT);
    const player = playerCharacter(world);
    const sponsor = sponsorOf(world);
    sponsor.traits = ["hothead"];
    world.favors[favorKey(sponsor.id, player.id)] = -200;

    const mood = projectView(world, null, EMPTY_CONTENT).sponsorMood;
    expect(mood).toBe("Your padrino (sponsor) has had enough of you. He does not hide what he feels.");
  });

  it("adds no clause for a sponsor with no known personality trait", () => {
    const world = buildStarterWorld("mood-no-trait", setup, EMPTY_CONTENT);
    const sponsor = sponsorOf(world);
    sponsor.traits = ["someOtherTrait"];

    const mood = projectView(world, null, EMPTY_CONTENT).sponsorMood;
    expect(mood).toBe("Your padrino (sponsor) has no strong opinion of you either way.");
  });
});
