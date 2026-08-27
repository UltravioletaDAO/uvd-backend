output "function_name" {
  description = "Nombre de la función Lambda"
  value       = aws_lambda_function.this.function_name
}

output "function_arn" {
  description = "ARN de la función Lambda"
  value       = aws_lambda_function.this.arn
}

output "api_id" {
  description = "ID del API Gateway HTTP"
  value       = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  description = "Endpoint público de la API (lo consume el frontend en /stream-summaries)"
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "log_group_name" {
  description = "Log group de la Lambda"
  value       = aws_cloudwatch_log_group.lambda.name
}
