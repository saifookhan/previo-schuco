terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "previo-schuco-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "previo-schuco-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

module "network" {
  source      = "../../modules/network"
  project     = var.project
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}

module "cognito" {
  source          = "../../modules/cognito"
  project         = var.project
  environment     = var.environment
  domain_prefix   = var.cognito_domain_prefix
  callback_urls   = var.callback_urls
  logout_urls     = var.logout_urls
}

module "rds" {
  source                    = "../../modules/rds"
  project                   = var.project
  environment               = var.environment
  vpc_id                    = module.network.vpc_id
  subnet_ids                = module.network.private_subnet_ids
  allowed_security_group_id = aws_security_group.api_tasks.id
  db_username               = var.db_username
  db_name                   = var.db_name
}

module "ecs" {
  source                 = "../../modules/ecs"
  project                = var.project
  environment            = var.environment
  vpc_id                 = module.network.vpc_id
  public_subnet_ids      = module.network.public_subnet_ids
  private_subnet_ids     = module.network.private_subnet_ids
  aws_region             = var.aws_region
  db_secret_arn          = module.rds.secret_arn
  cognito_user_pool_id   = module.cognito.user_pool_id
  cors_origins           = join(",", var.cors_origins)
  api_image              = var.api_image
  task_security_group_id = aws_security_group.api_tasks.id
  alb_security_group_id  = aws_security_group.alb.id

  depends_on = [module.rds]
}

module "s3" {
  source      = "../../modules/s3"
  project     = var.project
  environment = var.environment
}
