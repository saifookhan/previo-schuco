variable "project" {
  type    = string
  default = "previo-schuco"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "db_username" {
  type    = string
  default = "previo"
}

variable "db_name" {
  type    = string
  default = "previo"
}

variable "cognito_domain_prefix" {
  type    = string
  default = "previo-schuco-dev"
}

variable "callback_urls" {
  type = list(string)
  default = [
    "http://localhost:3000/api/auth/callback",
    "https://previo-schuco-web.vercel.app/api/auth/callback",
  ]
}

variable "logout_urls" {
  type = list(string)
  default = [
    "http://localhost:3000/login",
    "https://previo-schuco-web.vercel.app/login",
  ]
}

variable "cors_origins" {
  type = list(string)
  default = [
    "http://localhost:3000",
    "https://previo-schuco-web.vercel.app",
  ]
}

variable "api_image" {
  type    = string
  default = ""
}
