# Plan45 B3d plan checkpoint — derived context

Status: fresh v3 initial plan request prepared; JEV response pending.

## Exact source mapping

- T-E2E-8 at `tests/e2e/cagr-sheet.e2e.spec.ts:175`, stable row `p45-a-cagr-sheet-08`, has four mapped assertions: P42-060 dialog visible; P42-061 result value visible; P42-062 `.cagrResultDetail` bottom at or above the viewport boundary (`<=667`); P42-063 `.cagrSheetNote` bottom `<=667`. Source sets 375×667, loads `/`, intersects/scrolls live `#section-stacked` into view, opens the production trigger, and calculates.
- T-E2E-9 at line 205, stable row `p45-a-cagr-sheet-09`, has three mapped assertions: P42-064 dialog visible; P42-065 result visible; P42-066 detail bottom `<= window.innerHeight + 1` (376px). Source sets 667×375 and performs the same production route/setup flow.

## Candidate boundary

Both named cases are proposed in `tests/browser-mode/CagrPanel.browser.test.tsx`, reusing its actual `CagrPanel` / `useCagrState` fixture and deterministic two-row CPI data. The current fixture uses default 1280×800 and does not import production `globals.css`. The plan therefore requires exact viewport set-and-verify plus an explicit fixture baseline (16px root size, border-box, zero body margin/padding, documented system font fallback); geometry claims stay bounded to that baseline. `BottomSheet` is inline/fixed with 60dvh max-height, compact 45dvh, and landscape under 500px height 70dvh.

Retain live route navigation/intersection, production trigger/location, trigger-to-sheet integration, and page-shell placement in Playwright. Any dialog-visible route smoke is explicitly integration-owned; component fixtures do not claim those guarantees. Only the mapped local assertions are candidates for removal after focused verification, independent review, and implementation JEV approval.

The two rows remain partial; preserve `A=123`, `E=90`, `M=1`. B3d contributes two cases toward 20 further named Browser Mode migrations before the next consolidated E2E run; no E2E is allowed before that threshold.

## JEV plan checkpoint result

The stored response matches the submitted request and passes local response validation. JEV selected `valid_as_defined`, confidence 0.88, pass probability 0.90. Distribution: `valid_as_defined` 0.90, `implementation_issue` 0.03, `requirements_mismatch` 0.02, `incomplete_implementation_info` 0.02, `missing_prerequisites_info` 0.01, `scope_violation` 0.01, `other` 0.01, `indeterminate` 0. Diagnosis is complete; no follow-up was recommended. The plan authorizes the two bounded B3d implementation candidates under the stated retained E2E boundaries.
