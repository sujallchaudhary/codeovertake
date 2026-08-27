#!/usr/bin/env bash
#
# Tears down the preview container for one pull request.
#
# Deliberately forgiving: teardown runs when a PR closes, and a PR that never got
# a successful preview has nothing to remove. Failing here would leave a red X on
# a merged PR for no reason.
#
# Required: PR_NUMBER
set -euo pipefail

: "${PR_NUMBER:?PR_NUMBER is required}"

NAME="codeovertake-preview-pr-${PR_NUMBER}"

if docker inspect "${NAME}" >/dev/null 2>&1; then
  echo "==> Removing container ${NAME}"
  docker rm -f "${NAME}" || true
else
  echo "==> No container named ${NAME}; nothing to remove"
fi

# Reclaim the image layers this preview pulled, if nothing else references them
echo "==> Pruning dangling images"
docker image prune -f >/dev/null 2>&1 || true

echo "==> Teardown for PR #${PR_NUMBER} complete"
