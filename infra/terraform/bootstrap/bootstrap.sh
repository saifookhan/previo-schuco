#!/usr/bin/env bash
set -euo pipefail

# Bootstrap remote Terraform state (run once per AWS account/region).
REGION="${AWS_REGION:-eu-central-1}"
BUCKET="previo-schuco-terraform-state"
TABLE="previo-schuco-terraform-lock"

echo "Using region: ${REGION}"
aws sts get-caller-identity

if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "Bucket ${BUCKET} already exists"
else
  echo "Creating state bucket ${BUCKET}..."
  aws s3api create-bucket \
    --bucket "${BUCKET}" \
    --region "${REGION}" \
    --create-bucket-configuration LocationConstraint="${REGION}"
  aws s3api put-bucket-versioning \
    --bucket "${BUCKET}" \
    --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption \
    --bucket "${BUCKET}" \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
fi

if aws dynamodb describe-table --table-name "${TABLE}" --region "${REGION}" >/dev/null 2>&1; then
  echo "Lock table ${TABLE} already exists"
else
  echo "Creating lock table ${TABLE}..."
  aws dynamodb create-table \
    --table-name "${TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}"
fi

echo "Bootstrap complete."
