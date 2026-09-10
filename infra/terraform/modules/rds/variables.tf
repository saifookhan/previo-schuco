variable "project" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_id" { type = string }
variable "db_username" { type = string }
variable "db_name" { type = string }
variable "app_db_username" {
  type    = string
  default = "previo_app"
}

variable "publicly_accessible" {
  description = <<-EOT
    Whether the instance gets a public IP. Only ever true for dev — a
    deliberate, documented tradeoff to let developers reach dev Postgres
    directly from a laptop without a VPN/bastion (AWS Client VPN's fixed
    hourly cost isn't justified at this stage; see infra-status.md).
    Access is still gated by the security group, restricted to specific
    IPs via infra/scripts/update-dev-db-access-ip.sh — never opened to
    0.0.0.0/0. Never set true for staging/prod.
  EOT
  type        = bool
  default     = false
}

variable "db_port" {
  description = "Non-default when publicly_accessible is true, to cut down on automated scanner noise (not a real security boundary on its own — the IP-restricted SG rule is what actually matters)."
  type        = number
  default     = 5432
}
