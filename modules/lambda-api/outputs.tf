output "function_name" {
  description = "Nombre de la función Lambda"
  value       = aws_lambda_function.api.function_name
}

output "function_arn" {
  description = "ARN de la función Lambda"
  value       = aws_lambda_function.api.arn
}

output "api_url" {
  description = "URL de invocación de la API"
  value       = "https://${aws_apigatewayv2_api.lambda.id}.execute-api.${data.aws_region.current.name}.amazonaws.com/${aws_apigatewayv2_stage.lambda.name}"
}

output "api_domain" {
  description = "Dominio personalizado de la API"
  value       = "api.ultravioletadao.xyz"
}

output "api_id" {
  description = "ID del API Gateway"
  value       = aws_apigatewayv2_api.lambda.id
}

output "api_execution_arn" {
  description = "ARN de ejecución del API Gateway (para permisos de Lambda)"
  value       = aws_apigatewayv2_api.lambda.execution_arn
}

# Obtener la región actual
data "aws_region" "current" {} 