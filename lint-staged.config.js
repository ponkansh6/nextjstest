export default {
  "*.{ts,tsx}": ["oxfmt --write", "vitest related --passWithNoTests"],
  "*.{js,jsx,json,md,mjs,cjs,css}": "oxfmt --write",
};
