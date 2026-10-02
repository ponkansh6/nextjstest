#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/hook-common.sh"

hook_gate "lint:fast" pnpm run lint:fast

if staged_typecheck_required; then
  echo "[hook] staged typecheck decision requires the caller to run full typecheck"
  hook_gate "typecheck" pnpm exec tsgo --noEmit
else
  echo "[hook] staged changes do not cross the type boundary; typecheck skipped"
fi

# lint-staged owns the staged-file list. Its related Vitest task is allowed to
# discover zero files and uses --passWithNoTests; this contract is commit-only.
hook_gate "lint-staged (commit related; zero tests pass)" env \
  -u GIT_DIR \
  -u GIT_WORK_TREE \
  -u GIT_INDEX_FILE \
  -u GIT_PREFIX \
  -u GIT_COMMON_DIR \
  -u GIT_OBJECT_DIRECTORY \
  -u GIT_ALTERNATE_OBJECT_DIRECTORIES \
  pnpm exec lint-staged
