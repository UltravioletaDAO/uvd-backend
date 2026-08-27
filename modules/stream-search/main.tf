# Módulo stream-search: Lambda Python + API Gateway HTTP (us-east-1) que sirve la
# búsqueda full-text de /stream-summaries (índice SQLite FTS5 en s3://ultravioletadao/stream-search/search.db).
#
# Creado originalmente por CLI (uvdweb/infra/stream-search/deploy.sh, 2026-07-21) e importado a Terraform
# en el audit 2026-08-26 (PM-NS-05). El código sigue desplegándose con deploy.sh: por eso
# `ignore_changes = [filename, source_code_hash]` en la función.
#
# La API se creó con `create-api --target` (quick create): stage `$default`, ruta `$default` e integración
# son "ApiGatewayManaged" y el provider de AWS se NIEGA a importarlos ("was created via quick create").
# Quedan fuera del state a propósito (aws_apigatewayv2_api sí está). Para tenerlos en Terraform habría que
# recrear la API sin quick create => nuevo api id/endpoint => cambio en el frontend (decisión pendiente).

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ---------- IAM ----------
resource "aws_iam_role" "lambda" {
  name = "${var.function_name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "s3_read_index" {
  name = "s3-read-index"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:GetObject"
      Resource = "arn:aws:s3:::${var.index_bucket}/stream-search/*"
    }]
  })
}

# ---------- Logs ----------
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
}

# ---------- Lambda ----------
resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = aws_iam_role.lambda.arn
  handler       = "lambda_function.handler"
  runtime       = "python3.12"
  memory_size   = 1024
  timeout       = 30

  # El zip real vive en el repo del frontend (uvdweb/infra/stream-search/fn.zip) y se despliega con deploy.sh.
  # Terraform NO redeploya código: ver ignore_changes.
  filename = var.code_zip_path

  environment {
    variables = {
      INDEX_BUCKET = var.index_bucket
      INDEX_KEY    = var.index_key
    }
  }

  lifecycle {
    # description la usa el refresh del índice como marcador de cache-bust ("index YYYY-MM-DD"): no pisarla.
    ignore_changes = [filename, source_code_hash, description]
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

# ---------- API Gateway HTTP ----------
resource "aws_apigatewayv2_api" "this" {
  name          = var.function_name
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allow_origins
    allow_methods = ["GET"]
  }
}

# Stage `$default`, ruta `$default` e integración AWS_PROXY -> Lambda: ApiGatewayManaged (quick create),
# no importables (ver cabecera). Viven en AWS tal como los dejó deploy.sh:
#   integration q3xovee: AWS_PROXY POST -> aws_lambda_function.this.arn, payload 2.0, timeout 30000 ms
#   route 0zw7xoc: "$default" -> integrations/q3xovee
#   stage "$default": auto_deploy = true

resource "aws_lambda_permission" "apigw" {
  statement_id  = "apigw-invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*"
}
