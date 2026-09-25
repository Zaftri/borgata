import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root,
  // GitHub Pages serves the site under /<repo>/; the workflow sets VITE_BASE. Local dev and plain hosts use "/".
  base: process.env["VITE_BASE"] ?? "/",
  plugins: [preact()],
  resolve: {
    alias: {
      "@borgata/shared": `${repo}packages/shared/src/index.ts`,
      "@borgata/sim": `${repo}packages/sim/src/index.ts`,
      "@borgata/content": `${repo}packages/content/src/index.ts`,
    },
  },
  build: { outDir: `${repo}dist`, emptyOutDir: true },
});
