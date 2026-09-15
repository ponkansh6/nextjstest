export default {
  // This is a commit-only contract: related discovery may find zero tests,
  // which is a successful no-op. pre-push never treats unknown/empty diffs as
  // success and does not call lint-staged.
  "*.{ts,tsx}": ["oxfmt --write", "vitest related --passWithNoTests"],
  "*.{js,jsx,json,md,mjs,cjs,css}": "oxfmt --write --no-error-on-unmatched-pattern",
};
