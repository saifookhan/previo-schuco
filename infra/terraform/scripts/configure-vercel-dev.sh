#!/usr/bin/env bash
set -euo pipefail

# Sync Vercel env vars for previo-schuco-web from Terraform dev outputs.
# Web → ECS API → RDS (Vercel never connects to Postgres directly).

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_DIR="${ROOT}/infra/terraform/environments/dev"
WEB_DIR="${ROOT}/apps/web"
VERCEL_APP_URL="${VERCEL_APP_URL:-https://previo-schuco-web.vercel.app}"

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "AWS credentials expired. Run: aws sso login"
  exit 1
fi

eval "$(aws configure export-credentials --format env)"

cd "${ENV_DIR}"
terraform init -input=false >/dev/null

API_URL="$(terraform output -raw api_url 2>/dev/null || true)"
if [ -z "${API_URL}" ] || [ "${API_URL}" = "http://" ]; then
  echo "ERROR: api_url is empty — finish Terraform apply first:"
  echo "  ./infra/terraform/scripts/apply-dev.sh -auto-approve"
  exit 1
fi

COGNITO_POOL="$(terraform output -raw cognito_user_pool_id)"
COGNITO_CLIENT="$(terraform output -raw cognito_client_id)"
COGNITO_DOMAIN="$(terraform output -raw cognito_domain)"
AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"

cd "${WEB_DIR}"
vercel link --project previo-schuco-web --yes >/dev/null 2>&1 || true

add_env() {
  local name="$1"
  local value="$2"
  local extra_args="${3:-}"
  vercel env add "${name}" production,preview,development \
    --value "${value}" --no-sensitive --yes --force \
    -S einsteinsaifoos-projects ${extra_args} >/dev/null
  echo "  ✓ ${name}"
}

echo "Setting Vercel env vars for ${VERCEL_APP_URL}..."
add_env "NEXT_PUBLIC_APP_URL" "${VERCEL_APP_URL}"
add_env "NEXT_PUBLIC_API_URL" "${API_URL}"
add_env "NEXT_PUBLIC_COGNITO_REGION" "eu-central-1"
add_env "NEXT_PUBLIC_COGNITO_USER_POOL_ID" "${COGNITO_POOL}"
add_env "NEXT_PUBLIC_COGNITO_CLIENT_ID" "${COGNITO_CLIENT}"
add_env "NEXT_PUBLIC_COGNITO_DOMAIN" "${COGNITO_DOMAIN}"
vercel env add "AUTH_SECRET" production,preview \
  --value "${AUTH_SECRET}" --sensitive --yes --force \
  -S einsteinsaifoos-projects >/dev/null
echo "  ✓ AUTH_SECRET (production + preview)"

echo ""
echo "Done. Redeploy Vercel:"
echo "  cd apps/web && vercel --prod"
echo ""
echo "Ensure ECS API is deployed and RDS is migrated:"
echo "  ./infra/terraform/scripts/apply-dev.sh -auto-approve   # Cognito callbacks + CORS"
echo "  # push API image + force ECS deployment (see docs/deployment.md)"
