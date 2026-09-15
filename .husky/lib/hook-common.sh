#!/usr/bin/env bash

# Shared by repository hooks. Hooks intentionally run with bash because pipefail
# is part of the failure contract.
set -euo pipefail

HOOK_COMMON_PIDS=()
HOOK_COMMON_LOGS=()
HOOK_COMMON_CLEANED=0

hook_cleanup() {
  local status=$?
  local pid log

  if (( HOOK_COMMON_CLEANED == 1 )); then
    return "$status"
  fi
  HOOK_COMMON_CLEANED=1

  for pid in "${HOOK_COMMON_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "${HOOK_COMMON_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  for log in "${HOOK_COMMON_LOGS[@]}"; do
    rm -f -- "$log" || true
  done

  return "$status"
}

hook_interrupt() {
  local signal="$1"
  local status=130
  [[ "$signal" == TERM ]] && status=143
  echo "[hook] interrupted by $signal; stopping hook children" >&2
  exit "$status"
}

trap hook_cleanup EXIT
trap 'hook_interrupt INT' INT
trap 'hook_interrupt TERM' TERM

hook_gate() {
  local gate="$1"
  shift
  echo "[hook] gate: $gate"
  if "$@"; then
    echo "[hook] gate passed: $gate"
  else
    local status=$?
    echo "[hook] gate failed: $gate (exit $status)" >&2
    return "$status"
  fi
}

hook_start_parallel_gate() {
  local gate="$1"
  shift
  local log
  log=$(mktemp "${TMPDIR:-/tmp}/nextjstest-hook.XXXXXX")
  HOOK_COMMON_LOGS+=("$log")
  echo "[hook] gate started: $gate"
  "$@" >"$log" 2>&1 &
  HOOK_COMMON_PIDS+=("$!")
  HOOK_COMMON_GATE_NAMES+=("$gate")
  HOOK_COMMON_GATE_LOGS+=("$log")
}

HOOK_COMMON_GATE_NAMES=()
HOOK_COMMON_GATE_LOGS=()

hook_wait_parallel_gates() {
  local index pid status gate log first_failure=0
  for index in "${!HOOK_COMMON_PIDS[@]}"; do
    pid="${HOOK_COMMON_PIDS[$index]}"
    gate="${HOOK_COMMON_GATE_NAMES[$index]}"
    log="${HOOK_COMMON_GATE_LOGS[$index]}"
    if wait "$pid"; then
      status=0
    else
      status=$?
    fi
    echo ""
    echo "--- $gate output ---"
    cat -- "$log"
    if (( status != 0 )); then
      echo "[hook] gate failed: $gate (exit $status)" >&2
      (( first_failure == 0 )) && first_failure=$status
    else
      echo "[hook] gate passed: $gate"
    fi
  done
  return "$first_failure"
}

staged_typecheck_required() {
  local -a staged_paths=()
  local path lower base staged_file

  staged_file=$(mktemp "${TMPDIR:-/tmp}/nextjstest-staged.XXXXXX")
  HOOK_COMMON_LOGS+=("$staged_file")
  if ! git diff --cached --name-only --diff-filter=ACMRTUXB -z >"$staged_file"; then
    echo "[hook] staged typecheck decision unavailable; full typecheck required" >&2
    return 0
  fi
  if ! mapfile -d '' -t staged_paths <"$staged_file"; then
    echo "[hook] staged typecheck decision unavailable; full typecheck required" >&2
    return 0
  fi

  # Deletions and renames can affect the type boundary even when their paths
  # are not TypeScript files. Treat an inability to inspect them as unsafe.
  if ! git diff --cached --quiet --diff-filter=D || ! git diff --cached --quiet --diff-filter=R; then
    return 0
  fi

  ((${#staged_paths[@]} == 0)) && return 1
  for path in "${staged_paths[@]}"; do
    lower=${path,,}
    base=${lower##*/}
    case "$base" in
      tsconfig*|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|next.config.*|vitest.config.*|playwright.config.*|*.d.ts)
        return 0
        ;;
    esac
    case "$lower" in
      *.ts|*.tsx|*/types/*|*/type/*|*/shared/*|*/models/*|*/schema/*|*/generated/*|*/generated.*|*types.*|*type-boundary*)
        return 0
        ;;
    esac
  done
  return 1
}
