# Phase 2: Full Browser Mode Migration Plan and Completion Record

## Goal and scope

The original goal was to move 89 candidate scenarios (the disjoint prior-51 and B3m-38 rosters) to full Vitest Browser Mode ownership, reaching `partial=0`. This work is complete: the [89-row audit crosswalk](full-migration-roster.md) records all 89 as `Verified/full` across five batches. The target stack was Vitest and `@vitest/browser-playwright` 4.1.11 with Playwright 1.62.1.

Viewport, DOM/layout, hover, keyboard/focus, wheel/scroll, Chromium/WebKit, and touch emulation are supported or achievable with setup. Current component fixtures do not establish production Next route or server-data coverage; this is an unproven integration boundary, not evidence of technical impossibility.

## Original staged execution (completed)

1. **Freeze and reconcile the ledger.** The roster was frozen at 89 unique IDs in sequential 20/20/20/20/9 batches. Original classifications were prior-51 A=0/B=44/C=7 and B3m-38 A=0/B=36/C=2 (combined A=0/B=80/C=9). These were candidate classifications, not proof that every row had a live unmigrated predicate. Source predicates, ownership, and flagged mappings were reconciled in the final roster before each row was marked complete.
2. **Prove the production-route path.** The production Next.js route PoC and Playwright-provider custom command were implemented and exercised through Browser Mode. The route test observes the production URL, server-provided data, and rendered chart/result predicates. The implementation used the repository's installed-version guidance and recorded route evidence in the crosswalk.
3. **Reconcile source status and known mappings.** A/B/C retain their original meanings: component-reproducible, production integration dependent, and source ownership/mapping requiring reconciliation. The acceptance-187/readability-191 mapping and row201 LazyMount ownership notes are recorded at their source callsites in the roster. Rows #17 and #18 required supplementary production-route cases because the earlier component-only tests used synthetic data.
4. **Migrate in five batches.** The 89 scenarios were migrated in batches of 20, 20, 20, 20, and 9. Predicate parity was established before corresponding E2E cases were removed. The batch E2E gates completed at their respective checkpoints; the last E2E checkpoint was Batch5. The later targeted repair for rows #17/#18 reran the production-route suite, but did not rerun E2E.
5. **Close the ledger.** The crosswalk audit is complete: all 89 IDs are accounted for exactly once, with source ownership, Browser Mode destination, and verification evidence recorded. All 89 rows are `Verified/full`.

## Fidelity and parity requirements

For each scenario, preserve the source predicate and its meaningful inputs. The coverage map must state whether data comes from the real production route/server path or a fixture, and identify the route/build/page-shell boundary; viewport and layout dimensions; pointer, keyboard, focus, wheel, or touch interaction; and Chromium or WebKit engine. Use production route/data coverage wherever the source assertion depends on it. A component fixture is sufficient only where it reproduces the complete source predicate without a production integration dependency. Do not weaken thresholds, selected values, output expectations, page-error checks, or interaction assertions to make migration pass.

## Original gates, risks, and decisions (historical criteria)

- The route PoC is the first decision gate. A failure should produce a minimal reproducer and a tested next supported path (for example, provider custom command/context lifecycle or server startup/teardown adjustment). Escalate a claimed technical boundary with exact evidence and JEV review before changing scenario eligibility.
- C-row reconciliation is a ledger/source-mapping gate, not a browser-capability gate. Keep any missing source assertion visible until its owner and disposition are established.
- At each batch gate, compare the Browser Mode predicate and the E2E predicate side by side before deletion. Failed parity or E2E regression blocks that batch’s removals; unrelated assertions remain intact.
- Browser engine, viewport, touch, and production-data fidelity can vary by row. Run the row in every engine/input context required by its source contract; do not infer WebKit or touch coverage from Chromium mouse coverage.

## Acceptance criteria and completion status

The acceptance criteria were met: all 89 eligible rows have complete Browser Mode owners and `Verified/full` status; `partial=0`; source predicate ownership and route coverage are recorded in the roster; and the five batch E2E gates completed. The post-Batch5 route repair for #17/#18 was verified with the production-route suite; E2E was not rerun after that targeted repair. Standalone type-check still exits 2 on existing Browser Mode component diagnostics, so not every verification check is green.

## Completion and verification results

- All 89/89 eligible scenarios are `Verified/full` across five batches, as recorded in [the roster](full-migration-roster.md).
- Rows #17/#18 received supplementary production-route cases because their earlier component-only tests used synthetic data. After that fix, the production-route suite passed with Chromium 80/80 and WebKit 21 passed/5 skipped; the command exited 0.
- `pnpm lint` passed. `pnpm run build` passed, including its embedded TypeScript phase.
- Standalone `pnpm type-check` exits 2 from existing Browser Mode component diagnostics: `Locator.locator` typing, implicit `any`, `strokeOpacity`/raw CSS typing, and fixture typing. It reported no errors in the new production-route cases.
- The last E2E checkpoint was Batch5: 32 passed, 19 skipped, 51 total. E2E was not rerun for the targeted #17/#18 route repair.
- Final post-implementation JEV: `valid_as_defined`, confidence 0.86, passProbability 0.89, diagnosis complete/no follow-up. Result: `results/plan45/phase2/jev-full-migration-post-implementation-checkpoint-result.json`.

## Capability references

Official references consulted for the spike and per-row evidence: [Vitest Browser Mode](https://vitest.dev/guide/browser/), [Vitest browser viewport](https://vitest.dev/config/browser/viewport.html), [browser interactivity](https://vitest.dev/config/browser/interactivity), [custom browser commands](https://vitest.dev/api/browser/commands), [Playwright provider](https://vitest.dev/config/browser/playwright), [Playwright BrowserContext](https://playwright.dev/docs/api/class-browsercontext), [Playwright page](https://playwright.dev/docs/api/class-page), and [Playwright emulation](https://playwright.dev/docs/emulation). APIs were confirmed against the pinned project versions during the PoC.
