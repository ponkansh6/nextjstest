/**
 * Residual accessibility coverage now runs in
 * `tests/browser-mode/phase6-b14-residual-accessibility.browser.test.ts`.
 *
 * The prior six cases were all inside unconditional `describe.skip` groups. Their
 * meaningful dark-theme, keyboard-toggle, focus-visible, and reduced-motion
 * predicates were replaced by active production-route Browser Mode checks. The
 * locator-defined range-picker check and truthy-color-string check were retired
 * because they did not establish the named behavior.
 *
 * Existing focus-management test deletions in this worktree are left as found;
 * this audit does not attribute or revise them.
 */
