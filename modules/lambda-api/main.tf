resource "null_resource" "build_lambda_package" {
  triggers = {
    # Forzar reconstrucción siempre
    force_rebuild = uuid()
  }

  provisioner "local-exec" {
    working_dir = var.source_dir
    command     = <<EOT
      $ErrorActionPreference = 'Stop'
      
      Write-Host "========== EMPAQUETADO Y DESPLIEGUE LAMBDA AUTOMATIZADO - VERSIÓN 25FEB2025 =========="
      
      # Verificar si existe el script de despliegue
      if (Test-Path "deploy.ps1") {
        Write-Host "Ejecutando script de despliegue automatizado..."
        & "./deploy.ps1"
        
        if (-not $?) {
          Write-Host "¡ERROR! Falló el script de despliegue automatizado"
          exit 1
        }
        
        Write-Host "Despliegue automatizado completado exitosamente"
      } else {
        # Limpieza agresiva
        if (Test-Path "dist") { 
          Write-Host "Eliminando directorio dist existente"
          Remove-Item -Recurse -Force "dist" 
        }
        if (Test-Path "lambda.zip") { 
          Write-Host "Eliminando lambda.zip existente"
          Remove-Item -Force "lambda.zip" 
        }
        
        # Crear directorio limpio
        Write-Host "Creando directorio dist"
        New-Item -ItemType Directory -Path "dist" -Force
        
        # Comprobar existencia de app.js
        if (Test-Path "app.js") {
          Write-Host "¡ÉXITO! Encontrado app.js, usando como archivo principal"
          
          # Copiar directamente como index.js (el nombre es importante para Lambda)
          Write-Host "Copiando app.js a dist/index.js"
          Copy-Item -Path "app.js" -Destination "dist/index.js"
          
          # Ver contenido para verificar
          Write-Host "Primeras líneas del archivo copiado:"
          Get-Content -Path "dist/index.js" -TotalCount 10
        } else {
          Write-Host "¡ERROR! app.js no encontrado, abortando"
          exit 1
        }
        
        # package.json es necesario
        Write-Host "Copiando package.json"
        Copy-Item -Path "package.json" -Destination "dist/"
        
        # Instalar dependencias
        Write-Host "Instalando dependencias en dist"
        Set-Location -Path "dist"
        npm install --production --no-optional
        
        # Verificar instalación de AWS Secrets Manager
        Write-Host "Verificando instalación de dependencias de AWS Secrets Manager..."
        if (-not (Test-Path "node_modules/@aws-sdk/client-secrets-manager")) {
          Write-Host "Instalando dependencia de AWS Secrets Manager..."
          npm install --save @aws-sdk/client-secrets-manager
        }
        
        Set-Location -Path ".."
        
        # Verificar contenido antes de empaquetar
        Write-Host "Verificando estructura de archivos en dist:"
        Get-ChildItem -Path "dist" -Recurse | Select-Object FullName
        
        # Empaquetar y subir
        Write-Host "Empaquetando lambda.zip"
        Compress-Archive -Path "dist/*" -DestinationPath "lambda.zip" -Force
        
        # Limpiar posibles versiones antiguas en S3
        Write-Host "Eliminando posibles versiones antiguas en S3"
        aws s3 rm s3://${var.artifact_bucket}/${var.artifact_key} --region us-east-2
        
        Write-Host "Subiendo nuevo paquete a S3"
        aws s3 cp lambda.zip s3://${var.artifact_bucket}/${var.artifact_key} --region us-east-2
      }
      
      Write-Host "========== EMPAQUETADO COMPLETADO EXITOSAMENTE =========="
    EOT
    interpreter = ["powershell", "-Command"]
  }
}

resource "time_sleep" "wait_for_lambda_package" {
  depends_on = [null_resource.build_lambda_package]
  create_duration = "15s"  # Incrementado para dar más tiempo
}

# VOLVER AL NOMBRE ORIGINAL
resource "aws_lambda_function" "api" {
  function_name = var.function_name  # Nombre original sin timestamp
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  memory_size   = 256
  timeout       = 30

  s3_bucket = var.artifact_bucket
  s3_key    = var.artifact_key

  # Siempre crear nueva versión
  publish = true
  
  environment {
    variables = merge(var.environment_variables, {
      DEBUG = "true",
      LOG_LEVEL = "verbose",
      FORCE_UPDATE = uuid()  # Forzar actualización
    })
  }

  depends_on = [
    time_sleep.wait_for_lambda_package,
    aws_cloudwatch_log_group.lambda_logs  # Asegura que el grupo de logs existe antes de la función
  ]
}

# API Gateway - CORS simplificado
resource "aws_apigatewayv2_api" "lambda" {
  name          = "${var.function_name}-api"  # Nombre original 
  protocol_type = "HTTP"
  
  # Configurar CORS simple pero completo
  cors_configuration {
    allow_origins = [
      "*"  # Para pruebas, permitir todos los orígenes
    ]
    allow_methods = ["*"]  # Todos los métodos
    allow_headers = ["*"]  # Todos los headers
    expose_headers = ["*"]  # Exponer todos los headers
    max_age      = 86400
    # Sin allow_credentials para evitar conflictos con wildcard
  }
}

resource "aws_apigatewayv2_stage" "lambda" {
  api_id = aws_apigatewayv2_api.lambda.id
  name   = "prod"
  auto_deploy = true
  
  # Logs simplificados
  default_route_settings {
    detailed_metrics_enabled = true
    logging_level           = "INFO"
    throttling_burst_limit  = 5000
    throttling_rate_limit   = 10000
  }
  
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_logs.arn
    format          = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      httpMethod     = "$context.httpMethod"
      path           = "$context.path"
      status         = "$context.status"
    })
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id = aws_apigatewayv2_api.lambda.id

  integration_uri    = aws_lambda_function.api.invoke_arn
  integration_type   = "AWS_PROXY"
  integration_method = "POST"
  payload_format_version = "2.0"  # Usar el formato de payload más nuevo
}

# Agregar ruta raíz explícita
resource "aws_apigatewayv2_route" "root" {
  api_id = aws_apigatewayv2_api.lambda.id
  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Agregar ruta /apply explícita
resource "aws_apigatewayv2_route" "apply" {
  api_id = aws_apigatewayv2_api.lambda.id
  route_key = "ANY /apply"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Ruta comodín para el resto
resource "aws_apigatewayv2_route" "lambda" {
  api_id = aws_apigatewayv2_api.lambda.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.lambda.execution_arn}/*/*"
}

# VOLVER AL GRUPO DE LOGS ORIGINAL 
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.function_name}"  # Nombre original
  retention_in_days = 14
}

# Grupo de logs para API Gateway
resource "aws_cloudwatch_log_group" "api_gateway_logs" {
  name              = "/aws/apigateway/${var.function_name}-api"
  retention_in_days = 14
}

# Certificado ACM para el dominio
resource "aws_acm_certificate" "api" {
  domain_name       = "api.ultravioletadao.xyz"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Registro DNS para validación del certificado
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = "Z020459338J0JDK9OGP8T"
}

# Validación del certificado
resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# Dominio personalizado en API Gateway
resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = "api.ultravioletadao.xyz"

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.api.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  depends_on = [aws_acm_certificate_validation.api]
}

# Mapeo del dominio al stage
resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.lambda.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.lambda.id
}

# Registro DNS para el dominio personalizado
resource "aws_route53_record" "api" {
  name    = "api.ultravioletadao.xyz"
  type    = "A"
  zone_id = "Z020459338J0JDK9OGP8T"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
} 