# Example `aws` provider configuration for running your Terraform from
# challenge §3.4.2 against LocalStack instead of a real AWS account.
#
# Usage:
#   1. Bring up LocalStack:
#        docker compose -f infrastructure/localstack-compose.yml up -d
#   2. Copy this file (or its contents) into your terraform/ directory as,
#      e.g., `terraform/localstack/provider.tf` — or keep it as a separate
#      workspace / variant switched via a TF variable.
#   3. Run `terraform plan` from the directory where this provider lives.
#
# Notes:
#   - `s3_use_path_style`, `skip_credentials_validation`, etc. are required
#     because LocalStack's edge router can't satisfy the real STS handshake.
#   - The endpoint list maps each AWS API your Terraform calls to the
#     LocalStack edge port. Add new entries if you reach for additional
#     services (e.g. `route53`, `sns`, `lambda`).

provider "aws" {
  region                      = "eu-central-1"
  access_key                  = "test"
  secret_key                  = "test"
  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    ec2            = "http://localhost:4566"
    ecs            = "http://localhost:4566"
    ecr            = "http://localhost:4566"
    elbv2          = "http://localhost:4566"
    iam            = "http://localhost:4566"
    rds            = "http://localhost:4566"
    s3             = "http://localhost:4566"
    secretsmanager = "http://localhost:4566"
    logs           = "http://localhost:4566"
    sts            = "http://localhost:4566"
    cloudwatch     = "http://localhost:4566"
    route53        = "http://localhost:4566"
  }
}
