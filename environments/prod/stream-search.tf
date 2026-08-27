# Stream search (búsqueda full-text de /stream-summaries) — vive en us-east-1, misma región que el bucket
# `ultravioletadao`. Recursos creados por CLI el 2026-07-21 (uvdweb/infra/stream-search/deploy.sh) e importados
# a Terraform en el audit 2026-08-26 (PM-NS-05 / PM-NS-09). El código Python se sigue desplegando con deploy.sh.

provider "aws" {
  alias  = "use1"
  region = "us-east-1"
}

module "stream_search" {
  source = "../../modules/stream-search"

  providers = {
    aws = aws.use1
  }

  # Solo referencia (ignore_changes en la función); zip real en el repo del frontend.
  code_zip_path      = "../../../uvdweb/infra/stream-search/fn.zip"
  log_retention_days = 14
}

# ---------- Imports (idempotentes: Terraform los ignora una vez que el recurso está en el state) ----------
import {
  to = module.stream_search.aws_iam_role.lambda
  id = "uvd-stream-search-lambda"
}

import {
  to = module.stream_search.aws_iam_role_policy_attachment.lambda_basic
  id = "uvd-stream-search-lambda/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

import {
  to = module.stream_search.aws_iam_role_policy.s3_read_index
  id = "uvd-stream-search-lambda:s3-read-index"
}

import {
  to = module.stream_search.aws_cloudwatch_log_group.lambda
  id = "/aws/lambda/uvd-stream-search"
}

import {
  to = module.stream_search.aws_lambda_function.this
  id = "uvd-stream-search"
}

import {
  to = module.stream_search.aws_apigatewayv2_api.this
  id = "pbs5xr8wye"
}

# Sin import para stage/route/integration: el provider rechaza los recursos "quick create"
# ("API Gateway v2 Integration (q3xovee) was created via quick create"). Ver modules/stream-search/main.tf.

import {
  to = module.stream_search.aws_lambda_permission.apigw
  id = "uvd-stream-search/apigw-invoke"
}

# ---------- Outputs ----------
output "stream_search_api_endpoint" {
  description = "Endpoint de la API de búsqueda de streams (us-east-1)"
  value       = module.stream_search.api_endpoint
}

output "stream_search_function" {
  value = module.stream_search.function_name
}
