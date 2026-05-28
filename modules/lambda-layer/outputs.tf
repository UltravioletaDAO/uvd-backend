output "layer_arn" {
  description = "ARN de la versión del Lambda Layer"
  value       = aws_lambda_layer_version.layer.arn
}

output "layer_version" {
  description = "Número de versión del layer"
  value       = aws_lambda_layer_version.layer.version
}
