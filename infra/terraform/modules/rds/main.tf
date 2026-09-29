resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-${var.environment}-rds-sg"
  description = "RDS Postgres access from ECS"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-${var.environment}-rds-sg"
  }

  lifecycle {
    # Ingress rules are separate aws_security_group_rule resources below
    # (not inline), deliberately: an inline ingress block is authoritative
    # over ALL rules on the group and deletes anything added outside
    # Terraform on the next apply. infra/scripts/update-dev-db-access-ip.sh
    # adds/rotates a developer-IP rule via the AWS CLI between applies —
    # that rule must survive `terraform apply`, so this group owns zero
    # inline ingress rules.
  }
}

# ECS tasks' access — the only ingress rule Terraform manages directly.
resource "aws_security_group_rule" "rds_from_ecs" {
  type                     = "ingress"
  security_group_id        = aws_security_group.rds.id
  from_port                = var.db_port
  to_port                  = var.db_port
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_group_id
  description              = "ECS API tasks"
}

resource "aws_db_subnet_group" "main" {
  # A distinct name (not an in-place subnet_ids change on the same name)
  # when publicly_accessible flips — RDS refuses to shrink a subnet
  # group's membership while an instance still lives in the subnet being
  # removed ("Some of the subnets to be deleted are currently in use").
  # A new subnet group + aws_db_instance.main switching db_subnet_group_name
  # to it is the supported way to relocate an instance across subnets.
  name       = "${var.project}-${var.environment}-db-subnet${var.publicly_accessible ? "-public" : ""}"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.project}-${var.environment}-db-subnet"
  }

  lifecycle {
    # Create the new group and move aws_db_instance.main onto it before
    # destroying the old one — the default destroy-then-create ordering
    # for a replaced resource fails here (RDS won't delete a subnet group
    # a running instance still references).
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier                 = "${var.project}-${var.environment}-postgres"
  engine                     = "postgres"
  engine_version             = "16"
  instance_class             = "db.t4g.micro"
  allocated_storage          = 20
  db_name                    = var.db_name
  username                   = var.db_username
  password                   = random_password.db.result
  db_subnet_group_name       = aws_db_subnet_group.main.name
  vpc_security_group_ids     = [aws_security_group.rds.id]
  port                       = var.db_port
  publicly_accessible        = var.publicly_accessible
  skip_final_snapshot        = true
  backup_retention_period    = 1
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project}-${var.environment}-postgres"
  }
}

resource "aws_secretsmanager_secret" "db" {
  name = "${var.project}/${var.environment}/database"
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = var.db_name
    url      = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
  })
}

# Restricted app-role credential (ADR 0007, ADR 0011) — the ONLY secret
# apps/api's (and the worker's) DATABASE_URL may ever be built from. The
# master/owner secret above is for migrations and one-off admin operations
# only; never point a running service at it. This role itself is created
# by a SQL migration (packages/db/migrations/0001_rls.sql), not by
# Terraform — Terraform only generates and stores the password both sides
# must agree on. Terraform state holding this value is an explicit,
# accepted trade-off (see ADR 0011) since the role's password must match
# what the SQL migration sets, which needs a single source Terraform can
# feed into both the migration step and the running service.
resource "random_password" "app" {
  length  = 24
  special = false
}

resource "aws_secretsmanager_secret" "db_app" {
  name = "${var.project}/${var.environment}/database-app"
}

resource "aws_secretsmanager_secret_version" "db_app" {
  secret_id = aws_secretsmanager_secret.db_app.id
  secret_string = jsonencode({
    username = var.app_db_username
    password = random_password.app.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = var.db_name
    url      = "postgresql://${var.app_db_username}:${random_password.app.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
  })
}
