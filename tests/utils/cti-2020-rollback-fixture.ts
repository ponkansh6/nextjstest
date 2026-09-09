import { loadCtiData, loadTotalEarningData } from "../../server/lib/dataLoader";

/**
 * Explicit legacy fixture for regression tests that assert 2020-base support
 * series behavior. Production loaders must continue to use automatic source
 * selection, which prefers the validated 2025 set.
 */
const rollback2020 = { source: "rollback-2020" } as const;

export const loadCti2020RollbackFixture = () => loadCtiData(rollback2020);

export const loadEarning2020RollbackFixture = () => loadTotalEarningData(rollback2020);
