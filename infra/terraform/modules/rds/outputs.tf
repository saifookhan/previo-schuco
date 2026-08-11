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

output "security_group_id" {
  value = aws_security_group.rds.id
}
