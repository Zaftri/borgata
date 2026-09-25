import { describe, expect, it } from "vitest";
import { CONTENT_VERSION, loadContent } from "./index.js";

const TEMPLATE_ID_PATTERN = /^[a-z]+(\.[a-zA-Z0-9]+)+$/;

describe("content loader", () => {
  it("loads the bundled content with unique, well-formed template ids", () => {
    // ALL_TEMPLATES (packages/content/src/templates/index.ts) is owned by a parallel agent; it may be empty
    // or already contain templates. We assert only the invariants the loader itself is responsible for.
    const c = loadContent();
    expect(c.version).toBe(CONTENT_VERSION);

    const ids = c.templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(TEMPLATE_ID_PATTERN);
  });

  it("rejects malformed content with a readable message", () => {
    expect(() => loadContent({ version: "not-a-version" })).toThrow(/version/);
  });
});
