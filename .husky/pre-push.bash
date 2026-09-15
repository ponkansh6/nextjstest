#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/hook-common.sh"
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/push-impact.sh"
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/prepush-profile.sh"

# --- Detached HEAD leftover check ---
hook_gate "detached HEAD leftover check" bash "$HOOK_DIR/check-detached-leftover.sh"

# Git sends one line per ref: local-ref local-oid remote-ref remote-oid.
# Consume that protocol directly; never substitute origin/main...HEAD.
push_impact_collect
push_impact_print

PUSH_FILES=$(printf '%s\n' "${PUSH_IMPACT_PATHS[@]:-}")
FULL_PROFILE_RAN=0
PREPUSH_PROFILE_NORMALIZED=$(push_profile_normalize_env)
if [[ -v PREPUSH_PROFILE ]] && [[ "$PREPUSH_PROFILE_NORMALIZED" == full ]] && [[ "$PREPUSH_PROFILE" != full ]]; then
  echo "[hook] fallback reason: PREPUSH_PROFILE was not full or changed; using full profile"
fi

# --- Spec staleness check ---
if grep -qE "^(src/|server/|tests/)" <<<"$PUSH_FILES"; then
  if grep -qE "^openspec/specs/.*/spec\.md$" <<<"$PUSH_FILES"; then
    echo "Spec file updated."
  else
    echo ""
    echo "⚠️  Warning: Source/test files changed but openspec/specs/nextjstest/spec.md was NOT updated."
    echo "   Please review whether the spec needs updating before pushing."
    echo ""
  fi
fi

# --- Test file staleness check ---
if grep -qE "^src/" <<<"$PUSH_FILES"; then
  if grep -qE "^tests/" <<<"$PUSH_FILES"; then
    echo "Test files updated."
  else
    echo ""
    echo "⚠️  Warning: src/ files changed but tests/ was NOT updated."
    echo "   Consider adding or updating tests for the changed source code."
    echo ""
  fi
fi

run_changed_tests() {
  local log result status related_files
  log=$(mktemp "${TMPDIR:-/tmp}/nextjstest-related.XXXXXX")
  result=$(mktemp "${TMPDIR:-/tmp}/nextjstest-related-result.XXXXXX")
  HOOK_COMMON_LOGS+=("$log")
  HOOK_COMMON_LOGS+=("$result")
  echo "[hook] gate: changed integration tests"
  if ((${#PUSH_IMPACT_RELATED_PATHS[@]} == 0)); then
    echo "[hook] fallback reason: related test candidates were empty or unsafe"
    echo "[hook] fallback profile: full (lint:fast → type-check → test:all → build → build-parity → security → E2E)"
    run_full_profile
    return
  fi
  if pnpm exec vitest related --run --passWithNoTests --reporter=json --outputFile="$result" "${PUSH_IMPACT_RELATED_PATHS[@]}" >"$log" 2>&1; then
    cat -- "$log"
    if related_files=$(node - "$result" <<'NODE'
const fs = require('node:fs');
const resultPath = process.argv[2];
const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
if (!Array.isArray(data.testResults)) {
  throw new Error('Vitest JSON did not contain testResults');
}
process.stdout.write(String(data.testResults.length));
NODE
    ); then
      if [[ "$related_files" == 0 ]]; then
        echo "[hook] fallback reason: related test set was empty (Vitest JSON testResults=0)"
        echo "[hook] fallback profile: full (lint:fast → type-check → test:all → build → build-parity → security → E2E)"
        run_full_profile
      else
        echo "[hook] related test files: $related_files"
        echo "[hook] gate passed: changed integration tests"
      fi
    else
      echo "[hook] fallback reason: related test result was indeterminate (missing, invalid, or incompatible Vitest JSON)"
      echo "[hook] fallback profile: full (lint:fast → type-check → test:all → build → build-parity → security → E2E)"
      run_full_profile
    fi
  else
    status=$?
    cat -- "$log"
    echo "[hook] fallback reason: related tests failed (exit $status)"
    echo "[hook] fallback profile: full (lint:fast → type-check → test:all → build → build-parity → security → E2E)"
    run_full_profile
  fi
}

run_e2e() {
  hook_gate "test:e2e:clean" pnpm run test:e2e:clean
  hook_gate "test:e2e" pnpm run test:e2e
}

run_full_profile() {
  FULL_PROFILE_RAN=1
  # Keep this order in sync with test:full. Every gate must stop the hook.
  hook_gate "lint:fast" pnpm run lint:fast
  hook_gate "type-check" pnpm run type-check
  hook_gate "test:all" pnpm run test:all
  hook_gate "build" pnpm run build
  hook_gate "test:build-parity" pnpm run test:build-parity
  hook_gate "security-check" pnpm run security-check
  run_e2e
  echo "[hook] production validation: not run (separate gate; PROD_URL/network availability is not established)"
}

if [[ "$PREPUSH_PROFILE_NORMALIZED" == full || "${PUSH_IMPACT_FULL}" == 1 ]]; then
  if [[ -v PREPUSH_PROFILE ]] && [[ "$PREPUSH_PROFILE" == full ]]; then
    echo "[hook] explicit full profile requested"
  fi
  run_full_profile
else
  if ((PUSH_IMPACT_HAS_RELATED_INPUT)); then
    run_changed_tests
  else
    echo "[hook] changed integration tests: not applicable for docs/assets-only change"
  fi
  if ((FULL_PROFILE_RAN == 0)); then
    hook_gate "build" pnpm run build
    run_e2e
    echo "[hook] production validation: not run (separate gate; PROD_URL/network availability is not established)"
  fi
fi
