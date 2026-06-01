output "alb_dns_name" {
  description = "ALB DNS name — point your domain's CNAME here"
  value       = aws_lb.main.dns_name
}

output "ecr_urls" {
  description = "ECR repository URLs for CI/CD"
  value = {
    auth_service    = module.ecr_auth_service.repository_url
    pricing_service = module.ecr_pricing_service.repository_url
    partner_portal  = module.ecr_partner_portal.repository_url
    admin_portal    = module.ecr_admin_portal.repository_url
  }
}

output "rds_endpoint" {
  description = "RDS endpoint (internal, not publicly accessible)"
  value       = module.rds.endpoint
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}