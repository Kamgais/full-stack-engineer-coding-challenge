locals {
  name_prefix = "pricing-${var.environment}"

  services = {
    auth_service    = { port = 3001, path_prefix = "/auth" }
    pricing_service = { port = 3000, path_prefix = "/pricing" }
  }

  frontend_services = {
    partner_portal = { port = 4200, subdomain = "app" }
    admin_portal   = { port = 4201, subdomain = "admin" }
  }
}

# ─── Networking ───────────────────────────────────────────────────────────────

module "networking" {
  source      = "./modules/networking"
  name_prefix = local.name_prefix
  environment = var.environment
}

# ─── RDS ─────────────────────────────────────────────────────────────────────

module "rds" {
  source              = "./modules/rds"
  name_prefix         = local.name_prefix
  environment         = var.environment
  vpc_id              = module.networking.vpc_id
  private_subnet_ids  = module.networking.private_subnet_ids
  ecs_security_group  = module.networking.ecs_security_group_id
  db_instance_class   = var.db_instance_class
  db_password         = var.db_password
}

# ─── Secrets Manager ─────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${local.name_prefix}/jwt-secret"
  description = "Shared JWT secret for auth-service and pricing-service"
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = jsonencode({ JWT_SECRET = "changeme-set-in-console" })
}

resource "aws_secretsmanager_secret" "db_password" {
  name        = "${local.name_prefix}/db-password"
  description = "RDS master password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({ password = var.db_password })
}

# ─── ECR ─────────────────────────────────────────────────────────────────────

module "ecr_auth_service" {
  source      = "./modules/ecr"
  name        = "${local.name_prefix}-auth-service"
  environment = var.environment
}

module "ecr_pricing_service" {
  source      = "./modules/ecr"
  name        = "${local.name_prefix}-pricing-service"
  environment = var.environment
}

module "ecr_partner_portal" {
  source      = "./modules/ecr"
  name        = "${local.name_prefix}-partner-portal"
  environment = var.environment
}

module "ecr_admin_portal" {
  source      = "./modules/ecr"
  name        = "${local.name_prefix}-admin-portal"
  environment = var.environment
}

# ─── ECS Cluster ─────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ─── IAM Role für ECS Tasks ───────────────────────────────────────────────────

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_secrets" {
  name = "${local.name_prefix}-ecs-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "kms:Decrypt"
      ]
      Resource = [
        aws_secretsmanager_secret.jwt_secret.arn,
        aws_secretsmanager_secret.db_password.arn,
      ]
    }]
  })
}

# ─── Application Load Balancer ────────────────────────────────────────────────

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [module.networking.alb_security_group_id]
  subnets            = module.networking.public_subnet_ids

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  # Redirect HTTP → HTTPS in production
  # For sandbox: forward directly
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}

# API Target Groups
resource "aws_lb_target_group" "auth_service" {
  name        = "${local.name_prefix}-auth"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = module.networking.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/v1/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

resource "aws_lb_target_group" "pricing_service" {
  name        = "${local.name_prefix}-pricing"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.networking.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/v1/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

resource "aws_lb_target_group" "partner_portal" {
  name        = "${local.name_prefix}-partner"
  port        = 4200
  protocol    = "HTTP"
  vpc_id      = module.networking.vpc_id
  target_type = "ip"

  health_check {
    path              = "/"
    healthy_threshold = 2
    interval          = 30
  }
}

resource "aws_lb_target_group" "admin_portal" {
  name        = "${local.name_prefix}-admin"
  port        = 4201
  protocol    = "HTTP"
  vpc_id      = module.networking.vpc_id
  target_type = "ip"

  health_check {
    path              = "/"
    healthy_threshold = 2
    interval          = 30
  }
}

# ALB Listener Rules — path-based routing
resource "aws_lb_listener_rule" "auth_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.auth_service.arn
  }

  condition {
    host_header {
      values = ["api.${var.domain}"]
    }
  }

  condition {
    path_pattern {
      values = ["/auth/*"]
    }
  }
}

resource "aws_lb_listener_rule" "pricing_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.pricing_service.arn
  }

  condition {
    host_header {
      values = ["api.${var.domain}"]
    }
  }

  condition {
    path_pattern {
      values = ["/pricing/*"]
    }
  }
}

resource "aws_lb_listener_rule" "partner_portal" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.partner_portal.arn
  }

  condition {
    host_header {
      values = ["app.${var.domain}"]
    }
  }
}

resource "aws_lb_listener_rule" "admin_portal" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 40

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.admin_portal.arn
  }

  condition {
    host_header {
      values = ["admin.${var.domain}"]
    }
  }
}

# ─── ECS Services ─────────────────────────────────────────────────────────────

module "auth_service" {
  source = "./modules/ecs_service"

  name            = "${local.name_prefix}-auth-service"
  environment     = var.environment
  cluster_id      = aws_ecs_cluster.main.id
  vpc_id          = module.networking.vpc_id
  subnet_ids      = module.networking.private_subnet_ids
  security_group  = module.networking.ecs_security_group_id
  execution_role  = aws_iam_role.ecs_task_execution.arn
  target_group    = aws_lb_target_group.auth_service.arn
  image           = "${module.ecr_auth_service.repository_url}:${var.image_tag}"
  container_port  = 3001

  environment_vars = [
    { name = "NODE_ENV",         value = "production" },
    { name = "PORT",             value = "3001" },
    { name = "DATABASE_HOST",    value = module.rds.endpoint },
    { name = "DATABASE_PORT",    value = "5432" },
    { name = "DATABASE_USER",    value = "postgres" },
    { name = "DATABASE_NAME",    value = "pricing" },
    { name = "DATABASE_SCHEMA",  value = "auth_service" },
    { name = "JWT_EXPIRES_IN",   value = "7d" },
  ]

  secrets = [
    { name = "JWT_SECRET",        valueFrom = "${aws_secretsmanager_secret.jwt_secret.arn}:JWT_SECRET::" },
    { name = "DATABASE_PASSWORD", valueFrom = "${aws_secretsmanager_secret.db_password.arn}:password::" },
  ]

  log_group = aws_cloudwatch_log_group.auth_service.name
}

module "pricing_service" {
  source = "./modules/ecs_service"

  name            = "${local.name_prefix}-pricing-service"
  environment     = var.environment
  cluster_id      = aws_ecs_cluster.main.id
  vpc_id          = module.networking.vpc_id
  subnet_ids      = module.networking.private_subnet_ids
  security_group  = module.networking.ecs_security_group_id
  execution_role  = aws_iam_role.ecs_task_execution.arn
  target_group    = aws_lb_target_group.pricing_service.arn
  image           = "${module.ecr_pricing_service.repository_url}:${var.image_tag}"
  container_port  = 3000

  environment_vars = [
    { name = "NODE_ENV",         value = "production" },
    { name = "PORT",             value = "3000" },
    { name = "DATABASE_HOST",    value = module.rds.endpoint },
    { name = "DATABASE_PORT",    value = "5432" },
    { name = "DATABASE_USER",    value = "postgres" },
    { name = "DATABASE_NAME",    value = "pricing" },
    { name = "DATABASE_SCHEMA",  value = "pricing_service" },
    { name = "JWT_EXPIRES_IN",   value = "7d" },
  ]

  secrets = [
    { name = "JWT_SECRET",        valueFrom = "${aws_secretsmanager_secret.jwt_secret.arn}:JWT_SECRET::" },
    { name = "DATABASE_PASSWORD", valueFrom = "${aws_secretsmanager_secret.db_password.arn}:password::" },
  ]

  log_group = aws_cloudwatch_log_group.pricing_service.name
}

module "partner_portal" {
  source = "./modules/ecs_service"

  name            = "${local.name_prefix}-partner-portal"
  environment     = var.environment
  cluster_id      = aws_ecs_cluster.main.id
  vpc_id          = module.networking.vpc_id
  subnet_ids      = module.networking.private_subnet_ids
  security_group  = module.networking.ecs_security_group_id
  execution_role  = aws_iam_role.ecs_task_execution.arn
  target_group    = aws_lb_target_group.partner_portal.arn
  image           = "${module.ecr_partner_portal.repository_url}:${var.image_tag}"
  container_port  = 4200

  environment_vars = [
    { name = "VITE_AUTH_API_BASE_URL", value = "https://api.${var.domain}/auth/v1" },
    { name = "VITE_API_BASE_URL",      value = "https://api.${var.domain}/pricing/v1" },
  ]

  secrets   = []
  log_group = aws_cloudwatch_log_group.partner_portal.name
}

module "admin_portal" {
  source = "./modules/ecs_service"

  name            = "${local.name_prefix}-admin-portal"
  environment     = var.environment
  cluster_id      = aws_ecs_cluster.main.id
  vpc_id          = module.networking.vpc_id
  subnet_ids      = module.networking.private_subnet_ids
  security_group  = module.networking.ecs_security_group_id
  execution_role  = aws_iam_role.ecs_task_execution.arn
  target_group    = aws_lb_target_group.admin_portal.arn
  image           = "${module.ecr_admin_portal.repository_url}:${var.image_tag}"
  container_port  = 4201

  environment_vars = [
    { name = "VITE_AUTH_API_BASE_URL", value = "https://api.${var.domain}/auth/v1" },
    { name = "VITE_API_BASE_URL",      value = "https://api.${var.domain}/pricing/v1" },
  ]

  secrets   = []
  log_group = aws_cloudwatch_log_group.admin_portal.name
}

# ─── CloudWatch Log Groups ────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "auth_service" {
  name              = "/ecs/${local.name_prefix}/auth-service"
  retention_in_days = 30

  tags = { Environment = var.environment }
}

resource "aws_cloudwatch_log_group" "pricing_service" {
  name              = "/ecs/${local.name_prefix}/pricing-service"
  retention_in_days = 30

  tags = { Environment = var.environment }
}

resource "aws_cloudwatch_log_group" "partner_portal" {
  name              = "/ecs/${local.name_prefix}/partner-portal"
  retention_in_days = 30

  tags = { Environment = var.environment }
}

resource "aws_cloudwatch_log_group" "admin_portal" {
  name              = "/ecs/${local.name_prefix}/admin-portal"
  retention_in_days = 30

  tags = { Environment = var.environment }
}