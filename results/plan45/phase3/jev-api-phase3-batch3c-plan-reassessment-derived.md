# B3c corrected plan reassessment result

**Verdict:** `valid_as_defined` (confidence 0.92; pass probability 0.93). JEV returned probabilities `valid_as_defined=0.93`, `requirements_mismatch=0.03`, `implementation_issue=0.01`, `scope_violation=0.01`, `other=0.01`, and 0 for `missing_prerequisites_info`, `incomplete_implementation_info`, and `indeterminate`. Diagnosis is complete; no follow-up was recommended. Response validation passed. The corrected plan authorizes implementation of the two B3c candidate cases. The prior approved plan and its reviews remain preserved as historical records.

## Accepted candidate contracts and retained E2E boundaries

- `tests/browser-mode/CagrPanel.browser.test.tsx`: mount actual `CagrPanel` and actual `useCagrState` with deterministic chart data; verify dialog visibility initially and after changing the start year, calculate, and assert visible result text matching the signed optional-minus/two-decimal percent pattern `^-?\d+\.\d{2}%$` for P42-046–049. Keep production route/section trigger P42-040/-041, production data wiring, and route integration in E2E.
- `tests/browser-mode/SpendingBarChart-tooltip-dismiss.browser.test.tsx`: mount actual nominal `SpendingBarChart` with actual `useChartTooltipController({ suppressed: false, isTouch: false })`, wired through actual `tooltipProps`, `onPointerDown`, `onPointerMove`, `onMouseMove`, `onPointerLeave`, and `onMouseLeave` chart event props. Real pointer hover over a rendered bar must activate the controller and show the tooltip; send a real Escape key via the established Browser Mode `userEvent.keyboard("{Escape}")` API and assert the tooltip becomes hidden. Never set `activeChartId`, tooltip active state, or tooltip content directly. This tests component/controller behavior only; P42-577 is the only proposed transfer.

Retain P42-575/-576, P42-578–583 (including re-hover, mouseleave, heading/bounds, and outside-click), P42-603/-604, production route and coordinate assertions, and other E2E ownership. Keep `A=123`, `E=90`, `M=1`; the two cases are partial candidates and do not complete either stable row. Do not run E2E until all ten new named Batch3 Browser Mode cases pass.

## Review history and correction

Oracle identified the prior Escape plan's omission of the actual desktop controller and chart-event handler path as a blocking plan gap because direct activation could pass without testing real hover-to-dismiss behavior. The corrected controller-wired pointer and Escape requirement closes this gap. Earlier approved B3c plan reviews are preserved; this fresh initial review applies to the corrected plan.

## JEV response

The fresh initial review selected `valid_as_defined`, confidence 0.92, pass probability 0.93. Diagnosis status is complete and no follow-up was recommended. No credentials are included in this derived record.
