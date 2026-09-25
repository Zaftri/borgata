// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "**/dist/**", "docs/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["packages/*/src/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // packages/ui's Preact components (design 07 §4, build plan phase 6): plain .tsx with the preact
    // JSX runtime (jsxImportSource set in packages/ui/tsconfig.json). Same import/unused-vars rules as
    // the rest of the workspace; this does not touch the sim-only rules below.
    files: ["packages/ui/src/**/*.tsx"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Rules for the simulation core (design 01 §5 and §10): no platform random, no clock,
    // no timers, no floating-point literals, and imports only from @borgata/shared.
    files: ["packages/sim/src/**/*.ts"],
    ignores: ["packages/sim/src/**/*.test.ts"],
    rules: {
      "no-restricted-globals": ["error", "Date", "setTimeout", "setInterval", "performance", "crypto"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded stream (rng.ts)." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[raw=/^[0-9]*\\.[0-9]+$/]",
          message: "No floating-point literals in the simulation core. Use integers, permille or per-ten-thousand.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Anything that is not @borgata/shared and not a relative path inside the package.
              regex: "^(?!@borgata/shared$)(?!\\.\\.?/)",
              message: "packages/sim may import only @borgata/shared and its own files.",
            },
          ],
        },
      ],
    },
  },
);
