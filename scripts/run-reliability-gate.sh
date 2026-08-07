#!/usr/bin/env bash

set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

mkdir -p coverage/reliability
rm -f \
  coverage/reliability/application-smoke.json \
  coverage/reliability/application-smoke.log \
  coverage/reliability/postgres.json \
  coverage/reliability/qdrant.json \
  coverage/reliability/queue-redis.json

allocate_port() {
  node -e '
    const server = require("node:net").createServer();
    server.listen(0, "127.0.0.1", () => {
      process.stdout.write(String(server.address().port));
      server.close();
    });
  '
}

project_suffix="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
project_suffix="$(printf '%s' "${project_suffix}" | tr -cd 'a-zA-Z0-9_-')"
compose_project="cvg-reliability-${project_suffix}"
if [[ ! "${compose_project}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]+$ ]]; then
  echo "Unable to derive a safe disposable Compose project name" >&2
  exit 1
fi

compose_files=(-f docker-compose.yml -f docker-compose.integration.yml)
compose=(docker compose --project-name "${compose_project}" "${compose_files[@]}" --profile standalone-qdrant)
agent_pid=""

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "${agent_pid}" ]] && kill -0 "${agent_pid}" 2>/dev/null; then
    kill -TERM "${agent_pid}" 2>/dev/null || true
    for _ in {1..40}; do
      agent_state="$(ps -o stat= -p "${agent_pid}" 2>/dev/null || true)"
      if [[ -z "${agent_state}" || "${agent_state}" == Z* ]]; then
        break
      fi
      sleep 0.25
    done
    kill -KILL "${agent_pid}" 2>/dev/null || true
    wait "${agent_pid}" 2>/dev/null || true
  fi
  if [[ "${exit_code}" -ne 0 && -f coverage/reliability/application-smoke.log ]]; then
    echo "Application smoke log (last 100 lines):" >&2
    tail -n 100 coverage/reliability/application-smoke.log >&2
  fi
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

export NODE_ENV=test
export POSTGRES_DB="${POSTGRES_DB:-cvg_agent_reliability}"
export POSTGRES_ADMIN_USER="${POSTGRES_ADMIN_USER:-cvg_migrator}"
export POSTGRES_ADMIN_PASSWORD="${POSTGRES_ADMIN_PASSWORD:-reliability-admin-not-for-production}"
export POSTGRES_APP_USER="${POSTGRES_APP_USER:-cvg_agent}"
export POSTGRES_APP_PASSWORD="${POSTGRES_APP_PASSWORD:-reliability-app-not-for-production}"
export REDIS_USERNAME="${REDIS_USERNAME:-cvg-agent}"
export REDIS_PASSWORD="${REDIS_PASSWORD:-reliability-redis-not-for-production}"
export POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-$(allocate_port)}"
export REDIS_HOST_PORT="${REDIS_HOST_PORT:-$(allocate_port)}"
export QDRANT_HOST_PORT="${QDRANT_HOST_PORT:-$(allocate_port)}"
export QDRANT_GRPC_HOST_PORT="${QDRANT_GRPC_HOST_PORT:-$(allocate_port)}"
export DATABASE_URL="postgresql://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/${POSTGRES_DB}"
export MIGRATION_DATABASE_URL="postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/${POSTGRES_DB}"
export REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-reliability-openai-placeholder-not-for-production}"
export CHATWOOT_API_URL="${CHATWOOT_API_URL:-https://chatwoot.invalid}"
export CHATWOOT_API_TOKEN="${CHATWOOT_API_TOKEN:-reliability-chatwoot-placeholder}"
export CHATWOOT_ACCOUNT_ID="${CHATWOOT_ACCOUNT_ID:-1}"
export CHATWOOT_INBOX_IDS="${CHATWOOT_INBOX_IDS:-1}"
export CHATWOOT_WEBHOOK_SECRET="${CHATWOOT_WEBHOOK_SECRET:-reliability-webhook-secret}"
export API_JWT_PUBLIC_KEY="${API_JWT_PUBLIC_KEY:-reliability-unused-public-key}"
export API_JWT_ISSUER="${API_JWT_ISSUER:-https://identity.invalid}"
export API_JWT_AUDIENCE="${API_JWT_AUDIENCE:-cvg-agent-reliability}"
export KNOWLEDGE_VECTOR_STORE=qdrant
export QDRANT_URL="http://127.0.0.1:${QDRANT_HOST_PORT}"
export QDRANT_COLLECTION="${QDRANT_COLLECTION:-cvg_store_integration}"
export QDRANT_VECTOR_NAME="${QDRANT_VECTOR_NAME:-dense}"
export QDRANT_SPARSE_VECTOR_NAME="${QDRANT_SPARSE_VECTOR_NAME:-sparse}"
export QDRANT_CREATE_COLLECTION=true
export QDRANT_READ_ONLY=false
export RUN_STORE_INTEGRATION=true
export RUN_RELIABILITY_INTEGRATION=true
export PORT="${RELIABILITY_AGENT_PORT:-$(allocate_port)}"

echo "Starting disposable reliability environment ${compose_project}"
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait postgres redis qdrant

export RELIABILITY_POSTGRES_CONTAINER
RELIABILITY_POSTGRES_CONTAINER="$("${compose[@]}" ps -q postgres)"
export RELIABILITY_REDIS_CONTAINER
RELIABILITY_REDIS_CONTAINER="$("${compose[@]}" ps -q redis)"
export RELIABILITY_QDRANT_CONTAINER
RELIABILITY_QDRANT_CONTAINER="$("${compose[@]}" ps -q qdrant)"
if [[ -z "${RELIABILITY_POSTGRES_CONTAINER}" \
  || -z "${RELIABILITY_REDIS_CONTAINER}" \
  || -z "${RELIABILITY_QDRANT_CONTAINER}" ]]; then
  echo "Disposable store container discovery failed" >&2
  exit 1
fi

npm run build
npm run migrate
npm run migrate
npx vitest run tests/integration/real-stores.integration.test.ts \
  --reporter=default \
  --testTimeout=30000 \
  --hookTimeout=30000

application_smoke_started_at="$(date +%s%3N)"
node dist/server.js > coverage/reliability/application-smoke.log 2>&1 &
agent_pid=$!
node -e '
  const port = process.env.PORT;
  const deadline = Date.now() + 30_000;
  const waitFor = async (path, validate) => {
    let lastError;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          signal: AbortSignal.timeout(2_000),
        });
        const body = await response.json();
        if (response.ok && validate(body)) return body;
        lastError = new Error(`${path} returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw lastError ?? new Error(`${path} did not become ready`);
  };
  (async () => {
    await waitFor("/health", (body) => body?.status === "healthy");
    await waitFor("/ready", (body) => body?.ready === true);
  })().catch((error) => {
    process.stderr.write(`Application smoke failed: ${error.message}\n`);
    process.exitCode = 1;
  });
'
kill -TERM "${agent_pid}"
for _ in {1..40}; do
  agent_state="$(ps -o stat= -p "${agent_pid}" 2>/dev/null || true)"
  if [[ -z "${agent_state}" || "${agent_state}" == Z* ]]; then
    break
  fi
  sleep 0.25
done
agent_state="$(ps -o stat= -p "${agent_pid}" 2>/dev/null || true)"
if [[ -n "${agent_state}" && "${agent_state}" != Z* ]]; then
  echo "Application did not complete graceful shutdown within 10 seconds" >&2
  exit 1
fi
if ! wait "${agent_pid}"; then
  echo "Application exited unsuccessfully during smoke shutdown" >&2
  exit 1
fi
agent_pid=""
application_smoke_duration_ms="$(( $(date +%s%3N) - application_smoke_started_at ))"
APPLICATION_SMOKE_DURATION_MS="${application_smoke_duration_ms}" node -e '
  const fs = require("node:fs");
  const evidence = {
    schemaVersion: 1,
    commit: process.env.GITHUB_SHA ?? null,
    measuredAt: new Date().toISOString(),
    suite: "application-start-readiness-graceful-shutdown",
    evidence: {
      health: "healthy",
      ready: true,
      gracefulShutdown: true,
      durationMs: Number(process.env.APPLICATION_SMOKE_DURATION_MS),
      passed: true,
    },
  };
  fs.writeFileSync(
    "coverage/reliability/application-smoke.json",
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8"
  );
  process.stdout.write(`[reliability] ${JSON.stringify(evidence.evidence)}\n`);
'

npx vitest run \
  tests/integration/reliability-queue.test.ts \
  tests/integration/reliability-postgres.test.ts \
  tests/integration/reliability-qdrant.test.ts \
  --reporter=default \
  --maxWorkers=3

echo "Reliability gate passed; evidence is available in coverage/reliability"
