#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 to skip the build, 1 to build.
# Lives in a file because vercel.json caps ignoreCommand at 256 characters.
# Builds whenever we can't prove web/ is unchanged (shallow clones may lack
# the previous commit, and a first deploy has no previous SHA).
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$prev" ]; then
  if git cat-file -e "${prev}^{commit}" 2>/dev/null; then
    git diff --quiet "$prev" HEAD -- .
    exit $?
  fi
  exit 1
fi
if git rev-parse -q --verify "HEAD^" >/dev/null; then
  git diff --quiet HEAD^ HEAD -- .
  exit $?
fi
exit 1
