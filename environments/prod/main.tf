terraform {
  required_providers {
    time = {
      source = "hashicorp/time"
      version = "~> 0.9.0"
    }
  }
}

provider "aws" {
  region = "us-east-2"
}

provider "time" {}

# Bucket para artefactos Lambda - configurado para usar el existente
resource "aws_s3_bucket" "lambda_artifacts" {
  bucket = "ultravioleta-artifacts-20250225"
  
  # Permitir destrucción cuando sea necesario
  force_destroy = true
  
  # Configuración especial para manejar bucket existente
  lifecycle {
    # Prevenir error "BucketAlreadyOwnedByYou"
    prevent_destroy = false
    ignore_changes = [
      # Ignorar estos atributos ya que pueden causar conflictos
      server_side_encryption_configuration,
      cors_rule,
      website,
      replication_configuration
    ]
  }
}

# Las configuraciones de versionado y acceso público se aplican
# a un bucket existente sin problemas
resource "aws_s3_bucket_versioning" "lambda_artifacts" {
  bucket = aws_s3_bucket.lambda_artifacts.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "lambda_artifacts" {
  bucket = aws_s3_bucket.lambda_artifacts.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# API de nuevos aplicantes
module "new_applicants_api" {
  source = "../../modules/lambda-api"

  function_name = "ultravioleta-new-applicants"
  source_dir    = "../../services/new-applicants"
  artifact_bucket = aws_s3_bucket.lambda_artifacts.bucket
  artifact_key  = "new-applicants.zip"

  environment_variables = {
    NODE_ENV = "production"
  }
}

# API de Stream Summaries con x402 Payment Protection
module "stream_summaries_api" {
  source = "../../modules/lambda-api"

  function_name   = "ultravioleta-stream-summaries"
  source_dir      = "../../services/stream-summaries"
  artifact_bucket = aws_s3_bucket.lambda_artifacts.bucket
  artifact_key    = "stream-summaries.zip"

  # Permisos de lectura al bucket de resúmenes
  s3_read_buckets = ["ultravioletadao"]

  environment_variables = {
    NODE_ENV          = "production"
    S3_BUCKET         = "ultravioletadao"
    S3_REGION         = "us-east-1"
    FACILITATOR_URL   = "https://facilitator.ultravioletadao.xyz"
    RECEIVING_WALLET  = "0x52110a2Cc8B6bBf846101265edAAe34E753f3389"
  }
}

# Outputs
output "new_applicants_api_url" {
  value = "https://api.ultravioletadao.xyz"
}

output "new_applicants_stage_url" {
  value = module.new_applicants_api.api_url
}

output "new_applicants_function" {
  value = module.new_applicants_api.function_name
}

# Bucket generado
output "artifact_bucket" {
  value = aws_s3_bucket.lambda_artifacts.bucket
  description = "Nombre del bucket S3 creado para almacenar los artefactos de Lambda"
}

# Stream Summaries API outputs
output "stream_summaries_api_url" {
  value       = module.stream_summaries_api.api_url
  description = "URL del API de Stream Summaries con x402"
}

output "stream_summaries_function" {
  value       = module.stream_summaries_api.function_name
  description = "Nombre de la función Lambda de Stream Summaries"
} 