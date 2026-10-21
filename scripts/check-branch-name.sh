#!/usr/bin/env bash
# Branch names follow the Conventional Commits types: `feat/touch-gestures`,
# `fix/issue-18`. `main` and the bots' own branches are exempt.
set -euo pipefail

branch="${PRE_COMMIT_REMOTE_BRANCH:-$(git branch --show-current)}"
branch="${branch#refs/heads/}"

if [[ -z "$branch" ]]; then
	exit 0
fi
if [[ "$branch" =~ ^(main|releaser/.+|renovate/.+|dependabot/.+)$ ]]; then
	exit 0
fi
if [[ "$branch" =~ ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)/[a-z0-9][a-z0-9._-]*$ ]]; then
	exit 0
fi

echo "Branch '$branch' isn't <type>/<kebab-slug> (feat/, fix/, docs/, chore/, ...)." >&2
exit 1
