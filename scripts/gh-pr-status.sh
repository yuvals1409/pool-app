#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed. Run: brew install gh && gh auth login"
  exit 1
fi

echo "== Current branch =="
git branch --show-current

echo
echo "== Open PR for this branch =="
gh pr view --json number,title,state,url,statusCheckRollup 2>/dev/null || echo "No PR found for current branch."

echo
echo "== Recent workflow runs =="
gh run list --limit 5

echo
echo "== PR checks (if PR exists) =="
gh pr checks 2>/dev/null || true
