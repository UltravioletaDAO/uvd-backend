output "layer_arn" {
  description = "ARN del Lambda Layer"
  value       = aws_lambda_layer_version.dependencies.arn
} 