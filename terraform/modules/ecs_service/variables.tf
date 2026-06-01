variable "name"           { type = string }
variable "environment"    { type = string }
variable "cluster_id"     { type = string }
variable "vpc_id"         { type = string }
variable "subnet_ids"     { type = list(string) }
variable "security_group" { type = string }
variable "execution_role" { type = string }
variable "target_group"   { type = string }
variable "image"          { type = string }
variable "container_port" { type = number }
variable "log_group"      { type = string }

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "environment_vars" {
  type    = list(object({ name = string, value = string }))
  default = []
}

variable "secrets" {
  type    = list(object({ name = string, valueFrom = string }))
  default = []
}