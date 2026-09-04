#!/usr/bin/env bash
# Fetch one environment's credentials from AWS Secrets Manager into
# .env.<target>.local (ADR 0005, ADR 0011). Never writes DATABASE_URL for
# the master/owner role — only the restricted previo_app credential
# (ADR 0007) is ever put in a local file. Never fetches 'prod'/'production'.
#
# Usage: pnpm env:fetch dev
#        pnpm env:fetch staging
#
# Requires: AWS CLI configured (`aws sso login`) with read access to the
# target environment's secrets (dev is granted by default; staging needs
# an explicit, separately-granted permission — see ADR 0011). Requires
# Terraform state for that environment to already exist (non-secret
# values like the API URL and Cognito IDs come from `terraform output`).

set -euo pipefail

TARGET="${1:-}"
PROJECT="previo-schuco"

if [[ -z "$TARGET" ]]; then
  echo "Usage: pnpm env:fetch <dev|staging>" >&2
  exit 1
fi

if [[ "$TARGET" == "local" ]]; then
  echo "Error: 'local' doesn't need fetching — its values already live in .env.local." >&2
  exit 1
fi

if [[ "$TARGET" == "prod" || "$TARGET" == "production" ]]; then
  echo "Error: production secrets are never fetched to a developer workstation (ADR 0011)." >&2
  exit 1
fi

if [[ "$TARGET" != "dev" && "$TARGET" != "staging" ]]; then
  echo "Error: unknown target '$TARGET' — must be dev or staging." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$REPO_ROOT/infra/terraform/environments/$TARGET"
OUT_FILE="$REPO_ROOT/.env.$TARGET.local"

if [[ ! -d "$TF_DIR" ]]; then
  echo "Error: $TF_DIR doesn't exist — this environment hasn't been provisioned yet." >&2
  exit 1
fi

command -v terraform >/dev/null || { echo "Error: terraform CLI not found." >&2; exit 1; }
command -v aws >/dev/null || { echo "Error: aws CLI not found." >&2; exit 1; }
command -v jq >/dev/null || { echo "Error: jq not found (brew install jq)." >&2; exit 1; }

echo "Reading Terraform outputs for $TARGET..."
TF_OUTPUT=$(terraform -chdir="$TF_DIR" output -json)

api_url=$(echo "$TF_OUTPUT" | jq -r '.api_url.value // empty')
cognito_region=$(echo "$TF_OUTPUT" | jq -r '.cognito_region.value // "eu-central-1"')
cognito_user_pool_id=$(echo "$TF_OUTPUT" | jq -r '.cognito_user_pool_id.value // empty')
cognito_client_id=$(echo "$TF_OUTPUT" | jq -r '.cognito_client_id.value // empty')
cognito_domain=$(echo "$TF_OUTPUT" | jq -r '.cognito_domain.value // empty')
app_secret_arn=$(echo "$TF_OUTPUT" | jq -r '.rds_app_secret_arn.value // empty')

if [[ -z "$app_secret_arn" ]]; then
  echo "Error: rds_app_secret_arn output not found — is Terraform applied for $TARGET?" >&2
  exit 1
fi

echo "Fetching the restricted app-role DB credential (never the master) from Secrets Manager..."
db_url=$(aws secretsmanager get-secret-value --secret-id "$app_secret_arn" --query SecretString --output text | jq -r '.url')

TARGET_UPPER=$(echo "$TARGET" | tr '[:lower:]' '[:upper:]')

cat > "$OUT_FILE" <<EOF
# Fetched by scripts/env-fetch.sh for target: $TARGET
# Do not hand-edit values that came from Terraform/Secrets Manager — re-run
# \`pnpm env:fetch $TARGET\` instead. This file is gitignored.

DATABASE_URL_${TARGET_UPPER}=$db_url
API_URL_${TARGET_UPPER}=$api_url
COGNITO_REGION_${TARGET_UPPER}=$cognito_region
COGNITO_USER_POOL_ID_${TARGET_UPPER}=$cognito_user_pool_id
COGNITO_CLIENT_ID_${TARGET_UPPER}=$cognito_client_id
COGNITO_DOMAIN_${TARGET_UPPER}=$cognito_domain
# REDIS_URL_${TARGET_UPPER}= (not yet provisioned — see ADR 0009)
EOF

echo "Wrote $OUT_FILE"
echo "Set the matching *_TARGET var(s) in .env.local (e.g. DB_TARGET=$TARGET) to use it."
