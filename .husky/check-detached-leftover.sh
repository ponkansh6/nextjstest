#!/bin/sh
# Check if HEAD is detached and there are leftover commits not reachable from any branch.

# Check if HEAD is detached
if ! git symbolic-ref -q HEAD >/dev/null 2>&1; then
  # HEAD is detached. Check if HEAD is contained in any local or remote branch.
  # git branch -a --contains HEAD lists branches containing HEAD.
  # If it is empty, or only contains detached HEAD references (though --contains usually lists branch names),
  # wait, let's see what git branch -a --contains HEAD outputs.
  CONTAINING_BRANCHES=$(git branch -a --contains HEAD 2>/dev/null)
  
  # Clean up branch output to see if there are actual branches (excluding HEAD itself or empty lines)
  # Actually, if HEAD points to a commit that is not part of any branch, git branch -a --contains HEAD
  # might be empty, or only list * (current detached) or something.
  # Let's write a robust check:
  # Check all local and remote branch tips. If the current HEAD commit is an ancestor of any branch tip,
  # or equal to any branch tip, then it's reachable.
  # Alternatively, `git branch -a --contains HEAD` returns lines like:
  #   * (HEAD detached at c5c8921)
  #   remotes/origin/main
  # If there are no other branches, it might only list the detached head or nothing.
  # Let's check using `git rev-parse HEAD` and `git branch -a --contains HEAD`.
  
  # Let's filter out lines starting with '*' or containing 'detached'
  REAL_BRANCHES=$(echo "$CONTAINING_BRANCHES" | grep -v '^\*' | grep -v 'detached' | sed 's/^[ *]*//')
  
  if [ -z "$REAL_BRANCHES" ]; then
    echo ""
    echo "❌ Error: You are on a detached HEAD with uncommitted/un-pushed leftover commits!"
    echo "   Current HEAD commit: $(git rev-parse HEAD)"
    echo "   These commits are not reachable from any local or remote branch and will be lost"
    echo "   if you push without attaching them to a branch or merging into main."
    echo ""
    echo "   To fix this:"
    echo "     1. Create a branch here: git checkout -b your-branch-name"
    echo "     2. Or switch to main and merge/cherry-pick: git checkout main && git merge $(git rev-parse HEAD)"
    echo ""
    exit 1
  fi
fi

exit 0
