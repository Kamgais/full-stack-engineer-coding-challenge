variable "name_prefix" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "ecs_security_group" {
  type = string
}

variable "db_instance_class" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}