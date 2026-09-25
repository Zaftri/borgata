import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@borgata/shared": `${root}packages/shared/src/index.ts`,
      "@borgata/sim": `${root}packages/sim/src/index.ts`,
      "@borgata/content": `${root}packages/content/src/index.ts`,
      "@borgata/harness": `${root}packages/harness/src/index.ts`,
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    environment: "node",
  },
});
