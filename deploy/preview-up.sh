#!/usr/bin/env bash
#
# Starts (or replaces) the backend preview container for one pull request.
#
# Runs on the deploy host. Every value arrives through the environment so no
# secret is ever passed on the command line, where it would show up in `ps`.
#
# Required: PR_NUMBER IMAGE PORT MONGODB_URI
# Optional: CLERK_SECRET_KEY CLERK_JWT_KEY CLERK_WEBHOOK_SECRET GITHUB_TOKEN
#           ADMIN_SECRET FRONTEND_URL ALLOWED_ORIGINS NSUT_API_URL
#           INSTITUTE_EMAIL_DOMAIN SEED_CONTENT
set -euo pipefail

: "${PR_NUMBER:?PR_NUMBER is required}"
: "${IMAGE:?IMAGE is required}"
: "${PORT:?PORT is required}"
: "${MONGODB_URI:?MONGODB_URI is required}"

NAME="codeovertake-preview-pr-${PR_NUMBER}"

echo "==> Pulling ${IMAGE}"
docker pull "${IMAGE}"

# Idempotent: a re-deploy on every push to the PR must replace cleanly
echo "==> Replacing container ${NAME}"
docker rm -f "${NAME}" >/dev/null 2>&1 || true

# Written to a file rather than passed as -e flags so secrets stay out of
# `docker inspect` output and the process list.
ENV_FILE="$(mktemp)"
trap 'rm -f "${ENV_FILE}"' EXIT
chmod 600 "${ENV_FILE}"

cat >"${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=5000
MONGODB_URI=${MONGODB_URI}
FRONTEND_URL=${FRONTEND_URL:-}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-}
CLERK_SECRET_KEY=${CLERK_SECRET_KEY:-}
CLERK_JWT_KEY=${CLERK_JWT_KEY:-}
CLERK_WEBHOOK_SECRET=${CLERK_WEBHOOK_SECRET:-}
GITHUB_TOKEN=${GITHUB_TOKEN:-}
ADMIN_SECRET=${ADMIN_SECRET:-}
NSUT_API_URL=${NSUT_API_URL:-}
INSTITUTE_EMAIL_DOMAIN=${INSTITUTE_EMAIL_DOMAIN:-}
DISABLE_CRON=true
EOF

echo "==> Starting ${NAME} on port ${PORT}"
docker run -d \
  --name "${NAME}" \
  --label "codeovertake.preview=true" \
  --label "codeovertake.pr=${PR_NUMBER}" \
  --restart unless-stopped \
  --env-file "${ENV_FILE}" \
  -p "${PORT}:5000" \
  --memory 512m \
  "${IMAGE}"

# ---------------------------------------------------------------- health gate
echo "==> Waiting for health check"
HEALTHY=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    HEALTHY=1
    echo "    healthy after ${attempt}s"
    break
  fi
  sleep 1
done

if [ "${HEALTHY}" -ne 1 ]; then
  echo "!!! Preview failed its health check. Recent logs:" >&2
  docker logs --tail 60 "${NAME}" >&2 || true
  docker rm -f "${NAME}" >/dev/null 2>&1 || true
  exit 1
fi

# ------------------------------------------------------------------- seeding
# A fresh preview database has no curated sheets or company kits, which makes
# most of the app untestable. Seeding is best-effort: it reaches out to external
# APIs, and a slow upstream should not fail an otherwise working preview.
if [ "${SEED_CONTENT:-true}" = "true" ]; then
  echo "==> Seeding curated content (best effort)"
  if docker exec "${NAME}" npm run --silent seed:content; then
    echo "    seeded"
  else
    echo "    seeding failed; preview is up but Sheets/Companies may be empty" >&2
  fi
fi

echo "==> Preview for PR #${PR_NUMBER} is live on port ${PORT}"
