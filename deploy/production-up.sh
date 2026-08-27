#!/usr/bin/env bash
#
# Deploys the backend to production, with an automatic rollback.
#
# The previously running image is recorded before anything changes. If the new
# container fails its health check, the old image is brought back so a bad merge
# never leaves the API down.
#
# Required: IMAGE MONGODB_URI
# Optional: PORT (default 6754) plus the same env passthrough as previews
set -euo pipefail

: "${IMAGE:?IMAGE is required}"
: "${MONGODB_URI:?MONGODB_URI is required}"

NAME="codeovertake-backend"
PORT="${PORT:-6754}"

# Note what is running now so we can go back to it
PREVIOUS_IMAGE="$(docker inspect --format '{{.Config.Image}}' "${NAME}" 2>/dev/null || echo '')"
if [ -n "${PREVIOUS_IMAGE}" ]; then
  echo "==> Currently running: ${PREVIOUS_IMAGE}"
else
  echo "==> No existing container (first deploy)"
fi

echo "==> Pulling ${IMAGE}"
docker pull "${IMAGE}"

ENV_FILE="/etc/codeovertake/backend.env"
TMP_ENV=""
if [ -f "${ENV_FILE}" ]; then
  # Long-lived config lives on the host; the workflow only supplies what changes
  echo "==> Using host env file ${ENV_FILE}"
else
  echo "==> No ${ENV_FILE}; building env from the workflow environment"
  TMP_ENV="$(mktemp)"
  chmod 600 "${TMP_ENV}"
  cat >"${TMP_ENV}" <<EOF
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
EOF
  ENV_FILE="${TMP_ENV}"
fi
cleanup() { [ -n "${TMP_ENV}" ] && rm -f "${TMP_ENV}"; }
trap cleanup EXIT

start_container() {
  local image="$1"
  docker rm -f "${NAME}" >/dev/null 2>&1 || true
  docker run -d \
    --name "${NAME}" \
    --restart unless-stopped \
    --env-file "${ENV_FILE}" \
    -p "${PORT}:5000" \
    "${image}"
}

wait_for_health() {
  for attempt in $(seq 1 40); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      echo "    healthy after ${attempt}s"
      return 0
    fi
    sleep 1
  done
  return 1
}

echo "==> Starting ${NAME} from ${IMAGE}"
start_container "${IMAGE}"

echo "==> Waiting for health check"
if wait_for_health; then
  echo "==> Deploy succeeded"
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

echo "!!! New container is unhealthy. Logs:" >&2
docker logs --tail 80 "${NAME}" >&2 || true

if [ -z "${PREVIOUS_IMAGE}" ]; then
  echo "!!! No previous image to roll back to; leaving the container for inspection" >&2
  exit 1
fi

echo "==> Rolling back to ${PREVIOUS_IMAGE}" >&2
start_container "${PREVIOUS_IMAGE}"
if wait_for_health; then
  echo "==> Rollback succeeded; production is serving the previous image" >&2
else
  echo "!!! Rollback also failed to become healthy" >&2
fi

# Fail the workflow either way: a rollback is still a failed deploy
exit 1
