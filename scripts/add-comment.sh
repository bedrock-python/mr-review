#!/usr/bin/env bash
#
# Adds a comment to a GitHub issue or PR.
# Usage: ./scripts/add-comment.sh "Comment text here"
#
# The issue/PR number is read from the workflow event payload.
#

set -euo pipefail

# Read from event payload
ISSUE=$(jq -r '.issue.number // .pull_request.number // empty' "${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH not set}")
if ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Error: no issue/PR number in event payload" >&2
  exit 1
fi

COMMENT="${1:-}"
if [[ -z "$COMMENT" ]]; then
  echo "Error: comment text required" >&2
  exit 1
fi

gh issue comment "$ISSUE" --body "$COMMENT"
echo "Comment added to issue/PR #$ISSUE"
