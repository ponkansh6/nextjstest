# Plan54 dated evidence currentness audit

This is a bounded semantic audit of every dated/checkpoint record named in the
[Plan54 Stage 5 inventory](../../shared_plan/54-domain-naming-and-spec-cleanup.md#stage-5-dated-checkpoint--scenario-traceability-inventory).
For each record, the audit checks only the plan-identified drift dimensions:
schema literals/families, metadata prefix inference, API caller names, writer
outputs, fingerprint/cache identity, and active versus retired route status.
“Current” means the record remains a usable pointer to a current contract or
current evidence; it does not mean that every behavior described by that record
was rerun. Historical JEV, UI, chart/tooltip, and refresh workflows were not
rerun for this audit.

## Current implementation evidence (2026-10-18)

The current canonical contract and requirement source is
[`openspec/specs/nextjstest/spec.md`](../../openspec/specs/nextjstest/spec.md),
with the identifier map and compatibility conditions in
[`cti-contract-evolution.md`](cti-contract-evolution.md). The feature-level
Data Sources, Data Flow, and Component Tree sections remain scoped domain
details beneath the dashboard-level canonical index; the index and those local
sections map together, and the global sections are the source of truth for
cross-domain behavior.

| Global source of truth                                                                      | Scoped detail mapping                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`#current-data-sources`](../../openspec/specs/nextjstest/spec.md#current-data-sources)     | Domain-local source records under annual adjusted CTI, quarterly nominal CTI, official quarterly connection, ten-category registry, real quarterly CTI, and e-Stat refresh sections. |
| [`#current-data-flow`](../../openspec/specs/nextjstest/spec.md#current-data-flow)           | Domain-local loader, estimator, projection, and refresh flow descriptions in those same feature sections.                                                                            |
| [`#current-component-tree`](../../openspec/specs/nextjstest/spec.md#current-component-tree) | Feature-local UI and public projection details; the global tree defines cross-domain composition.                                                                                    |
| [`#current-requirements`](../../openspec/specs/nextjstest/spec.md#current-requirements)     | Sole source for active cross-domain WHEN/THEN requirement bodies. Legacy feature-level Requirements headings remain pointers; retired and dated scenarios are history.               |

The active annual B and A artifacts were regenerated with canonical schema
families. Their SHA-256 values are respectively
`97d576cd69dfef4c88b40e3009fec07027ec648ed55802f5bf4c1ed0e8de8903` and
`26bb734c3fb27dd67fd39fa1a300ae3ca8ea0334278790694a4a8721c02b6ea9`.
L remains unchanged at
`26902849c7d835a1dcf3db130384600d0f853907fac927e7942fb806e2eec076`; the
quarterly CSV remains unchanged at
`e32f7e3627718874cd85cae386216b370563b6ef7dba3ff686a5b456cba4dd78`.
Quarterly metadata is `c4a38eae1fccf8195c52b9e93db7ae6fec7b071923cee7c9ff80ef60c572bbea`,
the audit file is `82511adcd30fdb1c3abc1ee7e862f4ab5eba285e1a9e5e9d601672fc87d7fed1`,
and the manifest is `989e65704ecf98604d8f098a1f679227b1ddfc09ec49213839bab8a02fee8fef`
(revision `2026-10-16`, `retrievedAt` `2026-10-16T18:24:44.540Z`). Historical
artifacts, snapshots, and result files were preserved.

The current analysis result is
[`results/plan39/plan39-analysis-7d3e4a6cb202a310.json`](../../results/plan39/plan39-analysis-7d3e4a6cb202a310.json),
with input fingerprint
`sha256:7d3e4a6cb202a310ea29cd028010af4c74e484eeb4d163be011fc8e44ffc845e`
and analysis fingerprint
`sha256:e01f91f70f245971db44bdc513633b80d3fda9078972d658f598ee2c4c2fc3c6`.
Two additive rollback snapshots were created, verified, and retained: the
pre-canonical active-set snapshot
`a1e71f1f5f0d0c77a122dd7a8559d8d340e1325e6e5134cda63de166159be981` captured
before artifact regeneration, and the post-canonical snapshot
`f8027e1d571402cbeafcf9c64ce2f0fc15eb5d3a3bf7c97bd334a6e5f14e3fed`. Older
pre-existing snapshots and result files remain preserved. The analysis run and `--check`,
rollback verifier, focused suite (22 files, 296 passed, 1 skipped), lint, and
type-check passed. The final numbered vocabulary generator produced 403 files /
2,366 matching lines, with Plan54 tallied separately as 1 file / 53 lines and
0 safe rename candidates. The bare-plan validator passed with 1,281
occurrences, 1,039 distinct lines, and 190 files (356 historical, 827 generic,
98 literal, 0 ambiguous/unclassified). `git diff --check` also passed. These
checks cover current
CTI contracts and evidence integrity; they do not re-establish historical JEV,
UI/chart/tooltip, or refresh workflow results.

### Reproducibility commands

The focused verification invocation and adjacent gates recorded for this
checkpoint are:

```sh
pnpm exec vitest run tests/unit/cti-adjusted-connection-estimate-v2.test.ts tests/unit/plan40-annual-anchor-validation.test.ts tests/unit/server/lib/data-loader/ctiValidation.test.ts tests/unit/quarterly-public-projection-boundary.test.ts tests/unit/plan39-quarterly-nominal.test.ts tests/unit/cti-adjusted-publication-gate-fingerprint.test.ts tests/components/quarterly-public-metadata.test.tsx tests/components/plan39-public-metadata.test.tsx tests/unit/cti-estimates-coverage.test.ts tests/unit/view-models-coverage.test.ts tests/unit/server/lib/data-loader/ctiAdjusted.test.ts tests/unit/server/lib/consumptionTotal12Ma.test.ts tests/data-quality/earning-data-integrity.test.ts tests/integration/plan40-real-artifact-runtime.test.ts tests/integration/plan40-quarterly-runtime-evidence.test.ts tests/unit/server/lib/ctiDomainContract.test.ts tests/unit/server/lib/data-loader/ctiAdjusted-writer-parity.test.ts tests/unit/server/lib/dataLoader-facade.test.ts tests/scripts/plan39/run-analysis.test.mjs tests/scripts/plan39/rollback.test.mjs tests/unit/coverage-core-utilities.test.ts tests/unit/quarterly-consumption-completeness.test.ts
pnpm lint:fast
pnpm type-check
pnpm run plan39:analysis
pnpm exec tsx scripts/plan39/run-analysis.mjs --check
node scripts/plan39/rollback.mjs --verify
node scripts/plan54/generate-vocabulary-ledger.mjs
node scripts/plan54/verify-bare-plan-ledger.mjs
git diff --check
```

The focused Vitest command was recorded at 22 files / 296 passed / 1 skipped;
lint, type-check, both analysis commands, and rollback verification passed in
the implementation run. The numbered vocabulary generator produced the
current totals recorded in Plan54. The bare-plan validator and `git diff --check`
passed on the final ledger and documentation state. Historical JEV,
UI/chart/tooltip, and
refresh workflows remain unrun.

## Record-by-record disposition

| Plan54 inventory record                              | Currentness                                 | Bounded semantic audit                                                                                                                                                                | Current canonical reference / evidence                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan40 JEV checkpoint record                         | Archive-only                                | Historical JEV result; no current schema, writer, cache, or route claim adopted from it.                                                                                              | [Current quarterly contract](../../openspec/specs/nextjstest/spec.md#current-quarterly-nominal-cti-contract); this audit’s [current evidence](#current-implementation-evidence-2026-10-18).                   |
| Plan38 replacement contract                          | Superseded / route retired                  | Dedicated Plan38 route remains retired; active quarterly schemas and generic row kinds belong to the integrated route. Prefix inference is not a route selector.                      | [Retired route record and active contract](cti-contract-evolution.md#retired-plan38-quarterly-cti-route); [current contract](../../openspec/specs/nextjstest/spec.md#current-quarterly-nominal-cti-contract). |
| SharedPlan40 integrated contract                     | Current pointer; Plan54 evidence scope only | Current integrated quarterly contract remains valid. Canonical/legacy schema families are distinguished from public `estimateVersion`; repository callers use generic names.          | [Current quarterly contract](../../openspec/specs/nextjstest/spec.md#current-quarterly-nominal-cti-contract); canonical artifacts and metadata listed above.                                                  |
| SharedPlan41 current section                         | Current pointer; adjacent scope             | Official quarterly connection remains a current domain contract. This Plan54 audit does not re-run Plan41 UI/JEV scenarios.                                                           | [Official quarterly connection](../../openspec/specs/nextjstest/spec.md#current-official-quarterly-connection); current annual/quarterly artifact evidence above.                                             |
| Plan41 checkpoint (2026-09-23)                       | Archive-only / stale                        | Predates nominal B/A and L/D updates; its writer hashes and cache identity are superseded.                                                                                            | [Plan41 checkpoint history](../../openspec/specs/nextjstest/spec.md#current-official-quarterly-connection); superseding current artifact hashes above.                                                        |
| Plan41 final record (2026-09-23)                     | Archive-only / stale                        | Old placeholders and verification status are not current evidence; no historical JEV/UI rerun is claimed.                                                                             | [Current contract](../../openspec/specs/nextjstest/spec.md#current-quarterly-nominal-cti-contract); [current test/evidence summary](#current-implementation-evidence-2026-10-18).                             |
| Plan41 JEV v2                                        | Archive-only / stale                        | JEV conclusions remain historical; not used to establish current metadata inference, writer output, or cache identity.                                                                | [Current metadata contract](../../openspec/specs/nextjstest/spec.md#current-quarterly-nominal-cti-contract); this audit’s current evidence.                                                                   |
| Plan40 runtime continuation                          | Superseded intermediate record              | Intermediate runtime assertions yield to later canonical writer/artifact and fingerprint evidence.                                                                                    | [Current annual/quarterly contract](../../openspec/specs/nextjstest/spec.md#current-annual-adjusted-cti-contract); [current fingerprints](#current-implementation-evidence-2026-10-18).                       |
| Old Plan40 checkpoint                                | Archive-only / stale                        | Its B/A/L/D hashes predate regeneration and must not be treated as current writer output.                                                                                             | [Current artifact hashes and manifest](#current-implementation-evidence-2026-10-18); [canonical contract](../../openspec/specs/nextjstest/spec.md#current-quarterly-nominal-cti-contract).                    |
| Old user verification                                | Archive-only / stale                        | Historical user workflow only; no UI/chart workflow rerun is claimed.                                                                                                                 | [Current domain contract index](../../openspec/specs/nextjstest/spec.md#current-dashboard-contract); this audit’s current non-UI evidence.                                                                    |
| Old JEV                                              | Archive-only / stale                        | Historical JEV review; it does not validate current schema-family matching or public metadata.                                                                                        | [Schema and metadata contract](../../openspec/specs/nextjstest/spec.md#current-cti-domain-identifiers-requirement); current artifact hashes above.                                                            |
| Old decision                                         | Archive-only / stale                        | Decision was based on pre-regeneration evidence; current decision uses the new manifest, analysis identity, and verified snapshot.                                                    | [Current implementation evidence](#current-implementation-evidence-2026-10-18); [compatibility conditions](cti-contract-evolution.md#conditions-for-removing-retained-compatibility-names).                   |
| Continuation checkpoint                              | Superseded intermediate record              | Retained as chronology; current results and cache identity are the new fingerprinted analysis.                                                                                        | [Current analysis and fingerprints](#current-implementation-evidence-2026-10-18).                                                                                                                             |
| Verification / unresolved matters                    | Archive-only / stale                        | Historical unresolved items are superseded where current artifact/snapshot evidence exists; unrelated historical workflows remain unrerun.                                            | [Current verified snapshot and analysis](#current-implementation-evidence-2026-10-18); [current requirements](../../openspec/specs/nextjstest/spec.md#current-requirements).                                  |
| Tooltip parity addendum                              | Superseded historical evidence              | Does not establish present tooltip parity; prefix-only metadata classification was removed and explicit metadata is the current boundary.                                             | [Current contract requirement](../../openspec/specs/nextjstest/spec.md#current-cti-domain-identifiers-requirement); no tooltip runtime rerun is claimed.                                                      |
| JEV re-review                                        | Superseded historical evidence              | JEV record remains historical and is not promoted to current schema/writer evidence.                                                                                                  | [Current artifact and analysis evidence](#current-implementation-evidence-2026-10-18).                                                                                                                        |
| Production final evidence                            | Superseded historical evidence              | Current artifact bytes and manifest replace only its artifact-currentness claims; historical production/UI claims remain unverified here.                                             | [Current artifact hashes and manifest](#current-implementation-evidence-2026-10-18); [current contract](../../openspec/specs/nextjstest/spec.md#current-quarterly-nominal-cti-contract).                      |
| Issue resolution / final verification                | Archive-only / stale                        | Historical issue closure is not a substitute for current focused checks. Current reader/writer/fingerprint and rollback checks are separately recorded.                               | [Current focused verification](#current-implementation-evidence-2026-10-18); [domain identifier requirement](../../openspec/specs/nextjstest/spec.md#current-cti-domain-identifiers-requirement).             |
| Final JEV addendum                                   | Superseded historical evidence              | No current JEV result is inferred from the addendum; current test results cover non-JEV implementation scope.                                                                         | [Current implementation evidence](#current-implementation-evidence-2026-10-18).                                                                                                                               |
| Final interaction / public series                    | Archive-only for its runtime claims         | Historical UI/chart assertions remain historical. Current public JSON shape and row-kind behavior are covered by the current writer-focused suite, not by replaying old UI workflows. | [Current public quarterly contract](../../openspec/specs/nextjstest/spec.md#current-quarterly-nominal-cti-contract); focused suite result above.                                                              |
| SharedPlan47                                         | Current pointer; adjacent scope             | Canonical ten-category registry remains current; Plan54 confirms current schema/writer boundary only, not historical chart behavior.                                                  | [Ten-category registry](../../openspec/specs/nextjstest/spec.md#current-ten-category-registry); current writer evidence above.                                                                                |
| SharedPlan48 and record                              | Current pointer; adjacent scope             | Real-series contract remains current; historical chart/UI evidence is outside this audit.                                                                                             | [Real quarterly CTI contract](../../openspec/specs/nextjstest/spec.md#current-real-quarterly-cti-contract); no chart workflow rerun claimed.                                                                  |
| Plan52 refresh current contract and superseded audit | Current contract; audit archive-only        | Refresh contract remains active. This Plan54 work does not rerun refresh commands or certify historical refresh output.                                                               | [Current refresh contract](../../openspec/specs/nextjstest/spec.md#current-estat-refresh-contract); historical refresh audit remains archive-only.                                                            |
| Final Plan39 audit synchronization (period-unified)  | Archive-only / stale                        | Historical period-unification record is not current cache evidence; active analysis is keyed by the new exact input fingerprint.                                                      | [Current analysis fingerprint](#current-implementation-evidence-2026-10-18); [current annual contract](../../openspec/specs/nextjstest/spec.md#current-annual-adjusted-cti-contract).                         |
| Plan49 source reference and old requirement stubs    | Current link/anchor references              | Anchor preservation is current; Plan49 runtime evidence is not re-run here. Current strict12MA source remains the domain contract.                                                    | [Current Plan49 source reference](../../openspec/specs/nextjstest/spec.md#current-dashboard-contract); [current strict12MA requirement](../../openspec/specs/nextjstest/spec.md#current-requirements).        |

The inventory contains 25 records: current contract/link pointers remain
current within their stated scope; dated checkpoints and replaced claims remain
archive-only or superseded. No historical record was rewritten or removed.
