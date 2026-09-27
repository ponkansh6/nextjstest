# Plan45 B3e correction and B3f plan checkpoint — derived context

Status: JEV v3 initial plan review passed; diagnosis complete; no follow-up.

## B3e mapping correction

The earlier B3e plan proposed 17 cases. Current mapped implementation is 14 assertion-slice cases: B3e-a six, B3e-b two, B3e-c six. The two earnings viewport candidates remain deferred because their candidate hover/custom placement did not match production mobile click/fixed-wrapper behavior and there is no stable checked-in Geist asset. The proposed P42-262 transfer is withdrawn: immutable Plan42 maps P42-262 to the 12-item legend-label loop at baseline source line 35, already covered by `tests/components/all.test.tsx`; the current first `#section-stacked`/area-path route smoke is a different case with no corresponding P42 ID. That route smoke remains wholly in Playwright and earns no migration count. B3d's two plus B3e's 14 leave the current cadence at 16/20. `A=123`, `E=90`, `M=1` is unchanged.

## B3f plan

B3f proposes two named Browser Mode cases in `tests/browser-mode/CagrPanel.browser.test.tsx`, mounting actual CagrPanel/useCagrState/BottomSheet with deterministic fixture data:

- `p45-a-cagr-sheet-03`, `cagrBackdropDismissesActualSheet`: local actual-component backdrop click and dialog removal for P42-051 only. Keep production route trigger-to-dialog P42-050 in Playwright and add explicit hit-target evidence that `document.elementFromPoint(10,10)` is the production backdrop before the coordinate click.
- `p45-a-cagr-sheet-07`, `cagrResultFitsWithoutInnerScroll375x667`: after actual hook calculation at 375×667, assert sheet `scrollHeight - clientHeight <= 0` for P42-059 only. Retain live route, trigger/open, result calculation, dialog/result checks, and other production assertions in Playwright.

Phase0's full-row ineligibility remains valid for live route, page integration, real production overlay placement and coordinate hit-testing. The partial split transfers only component-local behavior. The existing B3d actual component fixture and 3/3 verification with JEV pass support feasibility; the fixture uses system-font fallback, so keep claims local and preserve production boundary checks. B3f adds two to 16/20, reaching 18/20; no E2E is authorized before 20/20. Both rows remain partial and M does not increase.

## JEV result

The response request identity matches the submitted request; local response validation is valid. JEV selected `valid_as_defined`, confidence 0.98, pass probability 0.99. Distribution: `valid_as_defined` 0.99, `incomplete_implementation_info` 0.01, all other listed criteria 0. Diagnosis is complete; no follow-up was recommended. This result approves the corrected plan only; no implementation or test result is claimed.

- Request SHA-256: `4a928c3b10709b32a6f312fbe49ad3a7c218893c4591f46b1e53710e2ae27123`
- Response SHA-256: `a980a54b539efce9c4e8f9b127027c0aab875065b249e8fe6dc8376f601f6db2`
