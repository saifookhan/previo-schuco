output "endpoint" {
  value     = aws_db_instance.main.address
  sensitive = true
}

output "port" {
  value = aws_db_instance.main.port
}

output "secret_arn" {
  value = aws_secretsmanager_secret.db.arn
}

# Master/owner secret — migrations and one-off admin operations ONLY.
# Never wire this into a running service's DATABASE_URL (see ADR 0007, ADR 0011).
output "app_secret_arn" {
  value = aws_secretsmanager_secret.db_app.arn
}
# Restricted app-role secret — the ONLY one apps/api or the worker's
# DATABASE_URL may be built from.

output "security_group_id" {
  value = aws_security_group.rds.id
}
