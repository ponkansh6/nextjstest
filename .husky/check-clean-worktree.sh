#!/bin/sh

# Prevent local-only fixes from making validation pass when they are not part
# of the commit snapshot sent to the remote build.
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  exit 0
fi

DIRTY=$(git diff --name-only HEAD)
if [ -n "$DIRTY" ]; then
  echo ""
  echo "❌ 未コミットの変更があります。push を中止しました。"
  echo "$DIRTY" | sed 's/^/   - /'
  echo ""
  exit 1
fi

ORPHAN=$(git ls-files --others --exclude-standard -- src server tests)
if [ -n "$ORPHAN" ]; then
  echo ""
  echo "❌ src/ server/ tests/ に未追跡ファイルがあります。HEAD に含まれないため push を中止しました。"
  echo "$ORPHAN" | sed 's/^/   - /'
  echo ""
  exit 1
fi

exit 0
