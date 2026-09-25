// Content package (design 06). Phase 3: templates are content, loaded from ALL_TEMPLATES and validated against
// the schema (schema.ts) plus referential integrity against the sim's fact catalogue and predicate fn registry.

import { z } from "zod";
import type { Content, ProcessTemplate } from "@borgata/sim";
import { OWNER_OF_FACT, predicateFnNames } from "@borgata/sim";
import { ALL_TEMPLATES } from "./templates/index.js";
import { ARCHETYPES } from "./archetypes/index.js";
import { NAMES } from "./names/index.js";
import { validateContentData, validateTemplates } from "./schema.js";

export * from "./schema.js";

/** Semantic version of the content package, stamped into saves (design 01 §6). Templates are content now,
 * so this bumped from 0.1.0 (phase 0 scaffold) to 0.2.0. Phase 5's content task adds the seven town archetypes
 * and validated name pools, bumping to 0.3.0 (minor: additive content, no template reshaping). */
export const CONTENT_VERSION = "0.4.0";

export const ContentRootSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "semantic version"),
  templates: z.array(z.unknown()).default([]),
});

export type ContentRoot = z.infer<typeof ContentRootSchema>;

const RAW_CONTENT: ContentRoot = {
  version: CONTENT_VERSION,
  templates: ALL_TEMPLATES,
};

/** Validate and return the content the core consumes. Throws with a readable message listing every failure,
 * on either a schema failure or a referential-integrity failure (design 06 §5). */
export function loadContent(raw: unknown = RAW_CONTENT): Content {
  const parsedRoot = ContentRootSchema.safeParse(raw);
  if (!parsedRoot.success) {
    const issues = parsedRoot.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`content validation failed:\n${issues}`);
  }

  const result = validateTemplates(parsedRoot.data.templates, {
    factKinds: Object.keys(OWNER_OF_FACT),
    fnNames: predicateFnNames(),
  });
  if (!result.ok) {
    throw new Error(`content validation failed:\n${result.errors.join("\n")}`);
  }

  const templates: readonly ProcessTemplate[] = result.templates;

  const dataResult = validateContentData(ARCHETYPES, NAMES);
  if (!dataResult.ok) {
    throw new Error(`content validation failed:\n${dataResult.errors.join("\n")}`);
  }

  return { version: parsedRoot.data.version, templates, archetypes: dataResult.archetypes, names: dataResult.names };
}
