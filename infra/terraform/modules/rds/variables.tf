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
