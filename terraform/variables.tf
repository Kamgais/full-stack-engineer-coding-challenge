variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-central-1"
}

variable "domain" {
  description = "Base domain (e.g. example.com). Used for ALB listener rules."
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy for all services"
  type        = string
  default     = "latest"
}

variable "environment" {
  description = "Environment name (e.g. staging, production)"
  type        = string
  default     = "production"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_password" {
  description = "RDS master password — injected via Secrets Manager in production"
  type        = string
  sensitive   = true
  default     = "changeme"
}