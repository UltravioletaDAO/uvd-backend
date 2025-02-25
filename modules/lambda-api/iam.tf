resource "aws_iam_role" "lambda_role" {
  name = "${var.function_name}-role-new"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Política para acceder a Secrets Manager
resource "aws_iam_policy" "secrets_manager_access" {
  name        = "${var.function_name}-secrets-manager-policy"
  description = "Permite a la función Lambda acceder al secreto de MongoDB en Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:secretsmanager:us-east-2:518898403364:secret:ultravioletadao-atlas-mongodb-prod-*"
      }
    ]
  })
}

# Adjuntar la política de Secrets Manager al rol de Lambda
resource "aws_iam_role_policy_attachment" "secrets_manager_attachment" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.secrets_manager_access.arn
} 