output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_client_id" {
  value = module.cognito.client_id
}

output "cognito_domain" {
  value = module.cognito.domain
}

output "api_url" {
  value = module.ecs.api_url
}

output "ecr_repository_url" {
  value = module.ecs.ecr_repository_url
}

output "rds_endpoint" {
  value     = module.rds.endpoint
  sensitive = true
}

# Master/owner secret ARN — fetch for migrations only (`pnpm db:migrate`
# needs DDL rights). Never point a running service at this.
output "rds_master_secret_arn" {
  value = module.rds.secret_arn
}

# Restricted app-role secret ARN — what apps/api's DATABASE_URL is built
# from at runtime (ADR 0007). Also fetch this to get the APP_DB_PASSWORD
# value the migration step needs (the SQL migration creates/updates the
# `previo_app` role's password to match this secret).
output "rds_app_secret_arn" {
  value = module.rds.app_secret_arn
}

# apps/web (Vercel) session-signing secret — set as a Vercel env var, not
# consumed by any Terraform-managed service (ADR 0011).
output "auth_secret_arn" {
  value = aws_secretsmanager_secret.auth_secret.arn
}

output "documents_bucket" {
  value = module.s3.bucket_name
}

output "ecs_cluster_name" {
  value = module.ecs.ecs_cluster_name
}

output "ecs_service_name" {
  value = module.ecs.ecs_service_name
}
