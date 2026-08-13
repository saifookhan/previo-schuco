#!/usr/bin/env bash
set -euo pipefail

# Register Vercel OAuth callback/logout URLs on the dev Cognito app client.

USER_POOL_ID="${COGNITO_USER_POOL_ID:-eu-central-1_O3VugIw1K}"
CLIENT_ID="${COGNITO_CLIENT_ID:-6qrdukgt5tkdhiqamkvdlspsi3}"
VERCEL_APP_URL="${VERCEL_APP_URL:-https://previo-schuco-web.vercel.app}"
REGION="${AWS_REGION:-eu-central-1}"

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "AWS credentials missing. Run: aws login  (or aws sso login)"
  exit 1
fi

echo "Updating Cognito client ${CLIENT_ID} for ${VERCEL_APP_URL}..."

aws cognito-idp update-user-pool-client \
  --region "${REGION}" \
  --user-pool-id "${USER_POOL_ID}" \
  --client-id "${CLIENT_ID}" \
  --callback-urls \
    "http://localhost:3000/api/auth/callback" \
    "${VERCEL_APP_URL}/api/auth/callback" \
  --logout-urls \
    "http://localhost:3000/login" \
    "${VERCEL_APP_URL}/login" \
  --allowed-o-auth-flows-user-pool-client \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --supported-identity-providers COGNITO \
  --explicit-auth-flows ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH

echo "✓ Cognito URLs updated. Test Cognito login at ${VERCEL_APP_URL}/login"
