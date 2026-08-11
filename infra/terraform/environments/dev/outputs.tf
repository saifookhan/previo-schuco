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

output "documents_bucket" {
  value = module.s3.bucket_name
}

output "ecs_cluster_name" {
  value = module.ecs.ecs_cluster_name
}

output "ecs_service_name" {
  value = module.ecs.ecs_service_name
}
