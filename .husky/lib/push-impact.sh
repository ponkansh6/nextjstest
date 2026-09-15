#!/usr/bin/env bash

# Classify the refs Git is actually about to push.  This file deliberately
# owns both path classification and the conservative fallback policy so that
# pre-push cannot accidentally grow a second, different classifier.
set -euo pipefail

PUSH_IMPACT_PATHS=()
PUSH_IMPACT_RELATED_PATHS=()
PUSH_IMPACT_CATEGORIES=()
PUSH_IMPACT_REASONS=()
PUSH_IMPACT_FULL=0
PUSH_IMPACT_HAS_TESTS=0
PUSH_IMPACT_HAS_SOURCE=0
PUSH_IMPACT_HAS_RELATED_INPUT=0
PUSH_IMPACT_RELATED_SELECTION_FAILED=0
PUSH_IMPACT_REF_COUNT=0

push_impact_reason() {
  local reason="$1"
  PUSH_IMPACT_FULL=1
  PUSH_IMPACT_REASONS+=("$reason")
}

push_impact_category() {
  local category="$1"
  PUSH_IMPACT_CATEGORIES+=("$category")
}

push_impact_related_path() {
  local path="$1"

  # Vitest receives these as positional paths. Reject values that could be
  # interpreted as options or paths outside the repository instead of
  # guessing; the caller will take the conservative full-profile fallback.
  if [[ -z "$path" || "$path" == /* || "$path" == -* || "$path" == *$'\n'* ]]; then
    PUSH_IMPACT_RELATED_SELECTION_FAILED=1
    PUSH_IMPACT_HAS_RELATED_INPUT=1
    push_impact_reason "related path could not be safely selected: $path"
    return 1
  fi
  PUSH_IMPACT_RELATED_PATHS+=("$path")
  PUSH_IMPACT_HAS_RELATED_INPUT=1
}

push_impact_classify_path() {
  local path="$1"
  local lower="${path,,}"

  PUSH_IMPACT_PATHS+=("$path")
  case "$lower" in
    .husky/*|.github/*|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|tsconfig*.json|next.config.*|vercel.*|vitest.config.*|tests/vitest.*.config.*|eslint.config.*|lint-staged.config.*|bunfig.toml)
      push_impact_category "config/dependency"
      push_impact_reason "configuration or dependency change: $path"
      ;;
    playwright.config.*)
      push_impact_category "playwright"
      push_impact_reason "Playwright configuration change: $path"
      ;;
    openspec/*)
      push_impact_category "openspec"
      push_impact_reason "OpenSpec change: $path"
      ;;
    tests/e2e/*|*.e2e.spec.*)
      push_impact_category "e2e"
      push_impact_reason "E2E change: $path"
      ;;
    src/*generated*|*/generated/*|*.generated.*|*.d.ts|public/generated/*)
      push_impact_category "generated"
      push_impact_reason "generated artifact or declaration change: $path"
      ;;
    .next/*|out/*|build/*|scripts/build*|Dockerfile*|*.lock)
      push_impact_category "build"
      push_impact_reason "build artifact/configuration change: $path"
      ;;
    server/*|src/app/api/*)
      push_impact_category "server"
      PUSH_IMPACT_HAS_SOURCE=1
      push_impact_related_path "$path" || true
      ;;
    tests/*)
      push_impact_category "tests"
      PUSH_IMPACT_HAS_TESTS=1
      push_impact_related_path "$path" || true
      ;;
    src/*)
      push_impact_category "source"
      PUSH_IMPACT_HAS_SOURCE=1
      push_impact_related_path "$path" || true
      ;;
    docs/*|*.md|*.mdx|*.txt|*.png|*.jpg|*.jpeg|*.svg|*.ico)
      push_impact_category "docs/assets"
      ;;
    *)
      push_impact_category "unknown"
      push_impact_reason "unclassified path: $path"
      ;;
  esac
}

push_impact_diff_ref() {
  local local_ref="$1"
  local local_oid="$2"
  local remote_ref="$3"
  local remote_oid="$4"
  local path diff_file local_resolved remote_resolved
  local -a paths=()

  PUSH_IMPACT_REF_COUNT=$((PUSH_IMPACT_REF_COUNT + 1))

  if [[ "$local_oid" == 0000000000000000000000000000000000000000 || "$remote_oid" == 0000000000000000000000000000000000000000 ]]; then
    push_impact_reason "initial push or remote deletion for $local_ref -> $remote_ref"
    return 0
  fi
  if [[ ! "$local_ref" =~ ^(refs/)?[A-Za-z0-9._/-]+$ || ! "$remote_ref" =~ ^(refs/)?[A-Za-z0-9._/-]+$ ]] || ! git check-ref-format --allow-onelevel "$local_ref" >/dev/null 2>&1 || ! git check-ref-format --allow-onelevel "$remote_ref" >/dev/null 2>&1; then
    push_impact_reason "push ref syntax could not be resolved: $local_ref -> $remote_ref"
    return 0
  fi
  if ! git cat-file -e "$local_oid^{commit}" 2>/dev/null; then
    push_impact_reason "local oid could not be resolved: $local_oid"
    return 0
  fi
  if ! git cat-file -e "$remote_oid^{commit}" 2>/dev/null; then
    push_impact_reason "remote oid could not be resolved: $remote_oid"
    return 0
  fi
  if ! local_resolved=$(git rev-parse --verify "$local_ref^{commit}" 2>/dev/null) || [[ "$local_resolved" != "$local_oid" ]]; then
    push_impact_reason "local ref could not be resolved: $local_ref"
    return 0
  fi
  # A remote ref is commonly absent from a local clone. When it is present,
  # nevertheless verify that it agrees with the push protocol's remote oid.
  remote_resolved=$(git rev-parse --verify "$remote_ref^{commit}" 2>/dev/null || true)
  if [[ -n "$remote_resolved" && "$remote_resolved" != "$remote_oid" ]]; then
    push_impact_reason "remote ref and oid disagree: $remote_ref"
    return 0
  fi

  # A deletion or rename is conservative by contract: both the old and new
  # path can affect selection, so the full profile is required.
  if git diff --quiet --diff-filter=D "$remote_oid" "$local_oid"; then
    :
  else
    case "$?" in
      1) push_impact_reason "deletion in push range: $local_ref" ;;
      *) push_impact_reason "deletion inspection failed: $local_ref" ;;
    esac
  fi
  if git diff --quiet --diff-filter=R "$remote_oid" "$local_oid"; then
    :
  else
    case "$?" in
      1) push_impact_reason "rename in push range: $local_ref" ;;
      *) push_impact_reason "rename inspection failed: $local_ref" ;;
    esac
  fi

  diff_file=$(mktemp "${TMPDIR:-/tmp}/nextjstest-push-diff.XXXXXX")
  HOOK_COMMON_LOGS+=("$diff_file")
  if git diff --name-only -z "$remote_oid" "$local_oid" >"$diff_file"; then
    if ! mapfile -d '' -t paths <"$diff_file"; then
      push_impact_reason "push diff parsing failed: $local_ref"
      return 0
    fi
  else
    push_impact_reason "push diff inspection failed: $local_ref"
    return 0
  fi
  if ((${#paths[@]} == 0)); then
    push_impact_reason "push diff was empty or could not be classified: $local_ref"
    return 0
  fi
  for path in "${paths[@]}"; do
    push_impact_classify_path "$path"
  done
}

push_impact_collect() {
  local local_ref local_oid remote_ref remote_oid extra
  if [[ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo true)" == true ]]; then
    push_impact_reason "shallow clone"
  fi

  while read -r local_ref local_oid remote_ref remote_oid extra; do
    [[ -z "${local_ref:-}" ]] && continue
    if [[ -n "${extra:-}" || -z "${local_oid:-}" || -z "${remote_ref:-}" || -z "${remote_oid:-}" ]]; then
      push_impact_reason "malformed pre-push ref line"
      continue
    fi
    push_impact_diff_ref "$local_ref" "$local_oid" "$remote_ref" "$remote_oid"
  done

  if ((PUSH_IMPACT_REF_COUNT == 0)); then
    push_impact_reason "no push refs received on stdin"
  fi
}

push_impact_print() {
  local categories reasons
  categories=$(printf '%s\n' "${PUSH_IMPACT_CATEGORIES[@]:-none}" | sort -u | paste -sd, -)
  reasons=$(printf '%s\n' "${PUSH_IMPACT_REASONS[@]:-none}" | awk 'NF' | sort -u | paste -sd';' -)
  echo "[hook] push refs: $PUSH_IMPACT_REF_COUNT"
  echo "[hook] impact categories: ${categories:-none}"
  echo "[hook] impact paths: ${#PUSH_IMPACT_PATHS[@]}"
  echo "[hook] related candidate paths: ${#PUSH_IMPACT_RELATED_PATHS[@]}"
  if ((PUSH_IMPACT_FULL)); then
    echo "[hook] profile: full (safe fallback)"
  else
    echo "[hook] profile: changed integration + build + E2E"
  fi
  echo "[hook] E2E: required (changed and full; no omission condition recorded)"
  echo "[hook] fallback reasons: ${reasons:-none}"
}
