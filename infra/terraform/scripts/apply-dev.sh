#!/usr/bin/env bash
set -euo pipefail

# Run Terraform apply with refreshed AWS SSO/session credentials.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_DIR="${ROOT}/environments/dev"

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "AWS credentials expired or missing. Run: aws sso login (or refresh your session)"
  exit 1
fi

eval "$(aws configure export-credentials --format env)"

cd "${ENV_DIR}"

if [ -f errored.tfstate ]; then
  echo "Recovering state from errored.tfstate..."
  terraform state push errored.tfstate || true
  rm -f errored.tfstate
fi

terraform init -upgrade
terraform apply "$@"

echo ""
echo "Outputs:"
terraform output
