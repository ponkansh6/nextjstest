# SharedPlan 55 P1 CTI validation contract memo

This memo records the pre-refactor contract and the test inventory used for the
P1 boundary change. Validation remains synchronous and sequential, with no
parallel I/O or broad all-input prefetch. One existing ordering exception is
retained: the distribution-adjusted CSV is read when the two-entry CSV-digest
snapshot is formed, before the loop rechecks main metadata and its CSV digest.
This preserves the original exception precedence, where a distribution CSV read
error can surface before the main CSV digest mismatch.

## Validation order and contract

| Order | Input and rule                                                                                                                                                                                             | First failure / reason code                                                                                                                                                                                                                                                                                           | Exception boundary and caller effect                                                                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `pair.mainPath`, series map, official snapshot, main metadata, distribution-adjusted CSV and metadata, quarterly CSV and metadata: `existsSync` in array order, short-circuiting on the first missing path | `missing required CTI set file` → `cti_source_missing`                                                                                                                                                                                                                                                                | A missing path returns a reason; no reads occur. `selectCtiPair` logs and returns nullable 2025 status.                                                                                                                                                                                    |
| 2     | Main CSV UTF-8 read and PapaParse (`header:false`, `skipEmptyLines:true`); locate `年月`/`月` header                                                                                                       | read exceptions propagate; missing header → `missing CTI 年月 header` → `cti_source_missing`                                                                                                                                                                                                                          | Main parser errors are not inspected; parsed rows enter the pure main-row helper. Invalid status remains fail-closed.                                                                                                                                                                      |
| 3     | Main CSV required nominal/real totals, non-empty unique continuous months, finite numeric totals                                                                                                           | missing totals → `missing required CTI total headers` → `cti_schema_invalid`; duplicate month → `invalid or duplicate CTI 年月` → `cti_period_invalid`; empty/gapped/bad month → `invalid or discontinuous CTI 年月` → `cti_period_invalid`; bad number → `invalid CTI required numeric value` → `cti_schema_invalid` | First failing rule wins in that order.                                                                                                                                                                                                                                                     |
| 4     | Read and parse series-map header, then verify required columns                                                                                                                                             | `invalid 2025 series map headers` → `cti_metadata_invalid`                                                                                                                                                                                                                                                            | Read exceptions propagate. Snapshot header is not read if this stage fails.                                                                                                                                                                                                                |
| 5     | Read and parse official-snapshot header, then verify required columns                                                                                                                                      | `invalid 2025 official snapshot headers` → `cti_metadata_invalid`                                                                                                                                                                                                                                                     | Read exceptions propagate.                                                                                                                                                                                                                                                                 |
| 6     | Main metadata: `existsSync`, UTF-8 read, JSON parse, ready/base-year, file pairing, SHA-256 shape                                                                                                          | missing → `missing metadata` → `cti_source_missing`; bad read/JSON → `invalid metadata` → `cti_metadata_invalid`; not ready / wrong file → `cti_metadata_invalid`; malformed digest → `metadata SHA-256 is missing or invalid` → `cti_hash_mismatch`                                                                  | `existsSync` is outside `try`; read, JSON parse, and value access are caught and converted to `invalid metadata`.                                                                                                                                                                          |
| 7     | Main metadata source basis and comparison normalization                                                                                                                                                    | `2025 CTI metadata basis fields are missing` → `cti_metadata_invalid`                                                                                                                                                                                                                                                 | No additional I/O.                                                                                                                                                                                                                                                                         |
| 8     | Read map and snapshot bytes; compare their computed hashes and source identities to metadata                                                                                                               | `2025 CTI derived map/snapshot identity or SHA-256 mismatch` → `cti_fail_closed`                                                                                                                                                                                                                                      | Both reads happen before the check; read exceptions propagate. Hashes are computed by orchestration and compared by a pure helper.                                                                                                                                                         |
| 9     | Main metadata period against accepted monthly rows                                                                                                                                                         | `2025 CTI metadata period mismatch` → `cti_period_invalid`                                                                                                                                                                                                                                                            | No additional I/O.                                                                                                                                                                                                                                                                         |
| 10    | Form the two-entry CSV-digest snapshot (main content plus distribution-adjusted CSV content), then recheck main metadata/hash followed by distribution metadata/hash                                       | metadata reasons use the same mapping as stage 6; CSV digest mismatch → `metadata SHA-256 mismatch` → `cti_hash_mismatch`                                                                                                                                                                                             | As in the original array-literal construction, the distribution CSV read occurs before the main metadata/digest loop. This is a narrow compatibility exception, not a broader prefetch. Metadata read/parse exceptions are caught by `validateCtiMetadata`; CSV read exceptions propagate. |
| 11    | Read quarterly CSV                                                                                                                                                                                         | no local reason                                                                                                                                                                                                                                                                                                       | Read exceptions propagate.                                                                                                                                                                                                                                                                 |
| 12    | Read/parse quarterly metadata, then annual manifest using `process.cwd()`                                                                                                                                  | `invalid official quarterly metadata or composition-adjusted annual manifest` → `cti_fail_closed`                                                                                                                                                                                                                     | Both reads and JSON parses share one `try/catch`; either failure maps to the same reason.                                                                                                                                                                                                  |
| 13    | Read/parse annual `A.json`, then read its bytes                                                                                                                                                            | no local reason                                                                                                                                                                                                                                                                                                       | JSON/read exceptions propagate; this remains outside stage 12's catch.                                                                                                                                                                                                                     |
| 14    | Compute quarterly CSV, quarterly metadata, and annual artifact hashes; read official source workbook                                                                                                       | missing workbook → `missing official quarterly source workbook` → `cti_required_support_unavailable`                                                                                                                                                                                                                  | Quarterly metadata hash read exceptions propagate. Only workbook read is caught and mapped to the support reason.                                                                                                                                                                          |
| 15    | Quarterly artifact metadata, source workbook, annual artifact, and manifest identity/hash bindings                                                                                                         | `official quarterly CTI artifact/metadata/manifest mismatch` → `cti_fail_closed`                                                                                                                                                                                                                                      | Pure comparison over loaded values and precomputed hashes.                                                                                                                                                                                                                                 |
| 16    | Parse quarterly CSV and validate parse errors, 2017Q1 start, continuity, and adopted range                                                                                                                 | `invalid official quarterly CTI period range` → `cti_fail_closed`                                                                                                                                                                                                                                                     | PapaParse `errors` produces the same reason before the pure range helper.                                                                                                                                                                                                                  |
| 17    | Read/parse map records, then snapshot records                                                                                                                                                              | no local reason                                                                                                                                                                                                                                                                                                       | PapaParse errors are ignored as before; read exceptions propagate. Both record sets are loaded before row validation.                                                                                                                                                                      |
| 18    | Map rows: required identity, uniqueness, source ID, dashboard column                                                                                                                                       | invalid/duplicate rows → `cti_schema_invalid`; source ID or absent dashboard column → `cti_fail_closed`                                                                                                                                                                                                               | Pure helper returns the first map-row failure.                                                                                                                                                                                                                                             |
| 19    | Snapshot rows: required identity and uniqueness                                                                                                                                                            | `invalid or duplicate 2025 official snapshot rows` → `cti_schema_invalid`                                                                                                                                                                                                                                             | Pure helper runs only after all map rows pass.                                                                                                                                                                                                                                             |
| 20    | Map/snapshot code-set equality, official names, representative month/value matches                                                                                                                         | code-set mismatch → `cti_schema_invalid`; dynamic representative failures → `cti_fail_closed`                                                                                                                                                                                                                         | Pure helper preserves map iteration order and first failure.                                                                                                                                                                                                                               |
| 21    | Count finite nominal observations in calendar 2025                                                                                                                                                         | `incomplete 2025 CTI calendar year` → `cti_period_invalid`                                                                                                                                                                                                                                                            | Pure helper runs last; success returns the original 2025 pair.                                                                                                                                                                                                                             |

`selectCtiPair` maps the first validation message with `mapCtiReasonToCode`,
logs the existing message, and returns `{ baseYear: null, pair: null, valid: false,
reason }`. Success remains `{ pair }` for the fixed 2025 pair. `getCtiDataStatus`
preserves that invalid status or maps success to `{baseYear: 2025, pair: "2025",
valid: true}`. `loadCtiDataInternal` logs invalid status and returns `[]`.

Reason mapping is unchanged: source missing includes missing metadata, required
set file, and main header; metadata invalid includes readiness, pairing, metadata
parse, map/snapshot headers, and missing basis; hash mismatch includes malformed
metadata CSV hash and CSV digest mismatch; schema invalid includes missing totals,
bad numeric values, malformed map/snapshot rows, and code-set mismatch; period
invalid includes monthly continuity/duplicates, metadata range, and calendar
completeness; missing official workbook maps to required support unavailable; all
other messages default to `cti_fail_closed`.

## Existing and added tests

- `tests/unit/server/lib/data-loader/ctiValidation.test.ts`: valid selection,
  metadata parsing, derived map/snapshot digest and source identity, reason-code
  mapping, and validation-order conflicts (required file before main header;
  main header before metadata parse; main CSV read propagation with metadata read
  catch; distribution CSV read before main digest mismatch; map header before metadata parse; basis before
  derived hash; derived hash before metadata period; quarterly artifact identity
  before quarterly period; quarterly metadata read failure mapped to its combined
  JSON reason. Added branch cases cover null metadata, the `年月` header selection
  branch, and quarterly PapaParse errors.
- `tests/unit/cti-loader-validation-coverage.test.ts`: main CSV headers, required
  totals, empty/duplicate/discontinuous months, numeric values, and reason mapping.
- `tests/unit/server/lib/data-fixture-comparison.test.ts`: loader/status fixture
  comparison, including invalid source status.
- `tests/data-quality/cti-source-integrity.test.ts` and
  `tests/data-quality/cti-source-artifacts.test.ts`: source identity and artifact
  integrity contracts.
- `tests/unit/cpi-loading-coverage.test.ts` and
  `tests/unit/server/lib/dataLoader-facade.test.ts`: status conversion, failure
  empty-array behavior, and facade forwarding contracts.
- `PINNED_PROJECT_FILES` fingerprints were refreshed for
  `server/lib/data-loader/cpi.ts` and
  `server/lib/data-loader/ctiValidation.ts` to reflect the reviewed implementation.

## Orchestrator verification results

- CTI focused validation — 42/42 passed.
- `pnpm run test:coverage` — 122 files, 1410 passed, 1 skipped; statements, branches, functions, and lines all at 100%.
- `pnpm run type-check` — passed.
- `pnpm run lint:fast` — passed.
- `git diff --check` — passed.

## Final plan audit

- P1 is complete: the staged snapshot/acquisition boundaries, pure validation
  helpers, validation order, first-reason behavior, exception boundaries, and
  caller status/empty-array behavior were matched against the plan's technical
  key points.
- P2 was not implemented because no concrete duplication-linked inconsistency
  or change-propagation risk was established.
- The final audit found the plan's stated preservation contract represented in
  implementation, tests, and OpenSpec requirements.

## Narrow snapshot boundaries

`validateCtiPair` coordinates stage order but hands each I/O stage through a
small acquisition function before invoking its pure rule:

- `CtiMainCsvSnapshot` contains the main CSV content and PapaParse rows.
- `CtiHeaderSnapshot` contains only the first parsed header row for one file.
- `CtiMetadataSnapshot` distinguishes missing, read/parse-invalid, and loaded
  metadata. The public `validateCtiMetadata` contract still converts these to
  the same string or metadata object.
- `CtiDerivedIdentitySnapshot` contains the map and snapshot bytes read in their
  existing order; orchestration computes hashes, then pure helpers compare them.
- `CtiCsvDigestSnapshot[]` contains main/distribution metadata paths, expected
  filenames, and content. Its acquisition retains the existing distribution CSV
  read-ahead before the digest loop; metadata validation and hash comparison
  remain sequential within the loop.
- `CtiQuarterlyArtifactSnapshot` contains the quarterly CSV, parsed quarterly
  metadata/manifest/annual A document, bytes and precomputed digests, and source
  workbook bytes. Its acquisition preserves the shared JSON catch, uncaught
  annual A parse/read, metadata hash read, and workbook-only catch.
- `CtiOfficialRowsSnapshot` contains map records followed by official snapshot
  records, both parsed and trimmed before the pure row matcher runs.

No snapshot loads the full input set in advance. `process.cwd()`, filesystem,
PapaParse, and hash generation stay in acquisition/orchestration functions; pure
helpers receive only strings, records, parsed rows, metadata, and already computed
digests.
