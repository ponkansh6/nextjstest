#!/usr/bin/env bash

push_profile_normalize() {
  case "${1-}" in
    full|changed) printf '%s\n' "$1" ;;
    *) printf '%s\n' "full" ;;
  esac
}

push_profile_normalize_env() {
  if [[ -v PREPUSH_PROFILE ]]; then
    push_profile_normalize "$PREPUSH_PROFILE"
  else
    printf '%s\n' "changed"
  fi
}
