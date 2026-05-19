import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Build and cache directories
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "node_modules/**",
    ".venv/**",
    ".venv-convert/**",
    ".vitest/**",
    "test-results/**",
    "playwright-report/**",

    // Project assets and data
    "public/**",
    "scripts/**",
    "tests/**",

    // Config and data files
    "*.json",
    "*.csv",
    "next-env.d.ts",
    "eslint.config.mjs",
    "vitest.config.ts",
    "playwright.config.ts",
  ]),
]);

export default eslintConfig;
