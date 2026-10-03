#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/hook-common.sh"
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/push-impact.sh"
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/prepush-profile.sh"

PREPUSH_TIMING_ROWS=()
PREPUSH_TIMING_ENABLED=0
PREPUSH_TIMING_PROFILE=unclassified
PREPUSH_TIMING_GATE_START_NS=0
PREPUSH_TIMING_GATE_START_UTC=
if [[ -n "${PREPUSH_TIMING_FILE:-}" ]]; then
  PREPUSH_TIMING_ENABLED=1
  PREPUSH_TIMING_START_NS=$(date +%s%N)
  PREPUSH_TIMING_START_UTC=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')
fi

prepush_timing_clean_field() {
  local value="$1"
  value=${value//$'\t'/ }
  value=${value//$'\r'/ }
  value=${value//$'\n'/ }
  printf '%s' "$value"
}

prepush_timing_gate_begin() {
  (( PREPUSH_TIMING_ENABLED )) || return 0
  PREPUSH_TIMING_GATE_START_NS=$(date +%s%N)
  PREPUSH_TIMING_GATE_START_UTC=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')
}

prepush_timing_record_gate() {
  local gate="$1" status="$2" end_ns end_utc duration
  (( PREPUSH_TIMING_ENABLED )) || return 0
  end_ns=$(date +%s%N)
  end_utc=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')
  duration=$(( (end_ns - PREPUSH_TIMING_GATE_START_NS) / 1000000 ))
  PREPUSH_TIMING_ROWS+=("$(printf 'gate\t%s\t%s\t%s\t%s\t%s' "$(prepush_timing_clean_field "$gate")" "$PREPUSH_TIMING_GATE_START_UTC" "$end_utc" "$duration" "$status")")
}

prepush_timing_finish() {
  local status="$1" end_ns end_utc duration row scenario cache_condition
  local -a fields=()
  (( PREPUSH_TIMING_ENABLED )) || return 0
  end_ns=$(date +%s%N)
  end_utc=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')
  duration=$(( (end_ns - PREPUSH_TIMING_START_NS) / 1000000 ))
  scenario=$(prepush_timing_clean_field "${PREPUSH_TIMING_SCENARIO:-unspecified}")
  cache_condition=$(prepush_timing_clean_field "${PREPUSH_CACHE_CONDITION:-unspecified}")
  {
    if [[ ! -s "$PREPUSH_TIMING_FILE" ]]; then
      printf 'record_type\tscenario\tprofile\tcache_condition\tgate\tstarted_at_utc\tended_at_utc\tduration_ms\texit_code\n'
    fi
    for row in "${PREPUSH_TIMING_ROWS[@]}"; do
      IFS=$'\t' read -r -a fields <<<"$row"
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "${fields[0]}" "$scenario" "$PREPUSH_TIMING_PROFILE" "$cache_condition" \
        "${fields[1]}" "${fields[2]}" "${fields[3]}" "${fields[4]}" "${fields[5]}"
    done
    printf 'total\t%s\t%s\t%s\t\t%s\t%s\t%s\t%s\n' \
      "$scenario" "$PREPUSH_TIMING_PROFILE" "$cache_condition" \
      "$PREPUSH_TIMING_START_UTC" "$end_utc" "$duration" "$status"
  } >>"$PREPUSH_TIMING_FILE" 2>/dev/null || true
}

# Do not let local-only fixes make validation pass when they are not part of
# the commit snapshot sent to the remote build.
hook_gate "clean worktree check" bash "$HOOK_DIR/check-clean-worktree.sh" || exit $?

# --- Detached HEAD leftover check ---
hook_gate "detached HEAD leftover check" bash "$HOOK_DIR/check-detached-leftover.sh" || exit $?

# Git sends one line per ref: local-ref local-oid remote-ref remote-oid.
# Consume that protocol directly; never substitute origin/main...HEAD.
push_impact_collect
push_impact_print
PUSH_FILES=$(printf '%s\n' "${PUSH_IMPACT_PATHS[@]:-}")
FULL_PROFILE_RAN=0
COMPONENT_BROWSER_RAN=0
PREPUSH_PROFILE_NORMALIZED=$(push_profile_normalize_env)
if [[ "$PREPUSH_PROFILE_NORMALIZED" == full || "$PUSH_IMPACT_FULL" == 1 ]]; then
  PREPUSH_TIMING_PROFILE=full
else
  PREPUSH_TIMING_PROFILE=changed
fi
if [[ -v PREPUSH_PROFILE ]] && [[ "$PREPUSH_PROFILE_NORMALIZED" == full ]] && [[ "$PREPUSH_PROFILE" != full ]]; then
  echo "[hook] fallback reason: PREPUSH_PROFILE was not full or changed; using full profile"
fi

# --- Spec staleness check ---
has_src_server_tests=0
has_spec_md=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if [[ "$line" =~ ^(src/|server/|tests/) ]]; then
    has_src_server_tests=1
  fi
  if [[ "$line" =~ ^openspec/specs/.*/spec\.md$ ]]; then
    has_spec_md=1
  fi
done <<< "$PUSH_FILES" || true

if (( has_src_server_tests )); then
  if (( has_spec_md )); then
    echo "Spec file updated."
  else
    echo ""
    echo "⚠️  Warning: Source/test files changed but openspec/specs/nextjstest/spec.md was NOT updated."
    echo "   Please review whether the spec needs updating before pushing."
    echo ""
  fi
fi

# --- Test file staleness check ---
has_src=0
has_tests=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if [[ "$line" =~ ^src/ ]]; then
    has_src=1
  fi
  if [[ "$line" =~ ^tests/ ]]; then
    has_tests=1
  fi
done <<< "$PUSH_FILES" || true

if (( has_src )); then
  if (( has_tests )); then
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
    echo "[hook] fallback profile: full validation with pre-push Browser Mode selection"
    run_full_profile prepush-browser || return $?
    return
  fi
  prepush_timing_gate_begin
  if pnpm exec vitest related --run --passWithNoTests --reporter=json --outputFile="$result" "${PUSH_IMPACT_RELATED_PATHS[@]}" >"$log" 2>&1; then
    prepush_timing_record_gate "changed integration tests" 0
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
        echo "[hook] fallback profile: full validation with pre-push Browser Mode selection"
        run_full_profile prepush-browser || return $?
      else
        echo "[hook] related test files: $related_files"
        echo "[hook] gate passed: changed integration tests"
        hook_gate "test:browser:prepush:component" pnpm run test:browser:prepush:component || return $?
        COMPONENT_BROWSER_RAN=1
      fi
    else
      echo "[hook] fallback reason: related test result was indeterminate (missing, invalid, or incompatible Vitest JSON)"
      echo "[hook] fallback profile: full validation with pre-push Browser Mode selection"
      run_full_profile prepush-browser || return $?
    fi
  else
    status=$?
    prepush_timing_record_gate "changed integration tests" "$status"
    cat -- "$log"
    echo "[hook] fallback reason: related tests failed (exit $status)"
    echo "[hook] fallback profile: full validation with pre-push Browser Mode selection"
    run_full_profile prepush-browser || return $?
  fi
}

run_full_profile() {
  local browser_profile=${1:-all}
  FULL_PROFILE_RAN=1
  PREPUSH_TIMING_PROFILE=full
  # Keep this order in sync with test:full. Every gate must stop the hook.
  hook_gate "lint:fast" pnpm run lint:fast || return $?
  hook_gate "type-check" pnpm run type-check || return $?
  hook_gate "test:coverage" env \
    -u GIT_DIR \
    -u GIT_WORK_TREE \
    -u GIT_INDEX_FILE \
    -u GIT_PREFIX \
    -u GIT_COMMON_DIR \
    -u GIT_OBJECT_DIRECTORY \
    -u GIT_ALTERNATE_OBJECT_DIRECTORIES \
    VITEST_MAX_WORKERS=2 pnpm run test:coverage || return $?
  if [[ "$browser_profile" == prepush-browser ]]; then
    hook_gate "test:browser:prepush:component" pnpm run test:browser:prepush:component || return $?
  else
    hook_gate "test:browser:component:all" pnpm run test:browser:component:all || return $?
  fi
  COMPONENT_BROWSER_RAN=1
  hook_gate "build" pnpm run build || return $?
  if [[ "$browser_profile" == prepush-browser ]]; then
    hook_gate "test:browser:next-route-poc:prepush:built" pnpm run test:browser:next-route-poc:prepush:built || return $?
  else
    hook_gate "test:browser:next-route-poc:built:all" pnpm run test:browser:next-route-poc:built:all || return $?
  fi
  hook_gate "test:build-parity" pnpm run test:build-parity || return $?
  hook_gate "security-check" pnpm run security-check || return $?
  echo "[hook] production validation: not run (separate gate; PROD_URL/network availability is not established)"
}

if [[ "$PREPUSH_PROFILE_NORMALIZED" == full || "${PUSH_IMPACT_FULL}" == 1 ]]; then
  if [[ -v PREPUSH_PROFILE ]] && [[ "$PREPUSH_PROFILE" == full ]]; then
    echo "[hook] explicit full profile requested"
  fi
  run_full_profile prepush-browser || exit $?
else
  if ((PUSH_IMPACT_HAS_RELATED_INPUT)); then
    run_changed_tests || exit $?
  else
    echo "[hook] changed integration tests: not applicable for docs/assets-only change"
  fi
  if ((FULL_PROFILE_RAN == 0)); then
    if ((COMPONENT_BROWSER_RAN == 0)); then
      hook_gate "test:browser:prepush:component" pnpm run test:browser:prepush:component || exit $?
      COMPONENT_BROWSER_RAN=1
    fi
    hook_gate "build" pnpm run build || exit $?
    hook_gate "test:browser:next-route-poc:prepush:built" pnpm run test:browser:next-route-poc:prepush:built || exit $?
    echo "[hook] production validation: not run (separate gate; PROD_URL/network availability is not established)"
  fi
fi
