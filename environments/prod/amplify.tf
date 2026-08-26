# ============================================
# AWS Amplify — frontend uvdweb (ultravioletadao.xyz)
# ============================================
# App creada por consola el 2025-02-08 e importada a Terraform el 2026-08-26
# (audit prod 2026-08-26, ítems PM-NS-02 / PM-NS-03 / PM-NS-11).
#   terraform import aws_amplify_app.uvdweb dhck0d8f8ypxv
#   terraform import aws_amplify_branch.main dhck0d8f8ypxv/main
#   terraform import aws_amplify_branch.develop dhck0d8f8ypxv/develop
#   terraform import aws_amplify_domain_association.uvdweb dhck0d8f8ypxv/ultravioletadao.xyz
#
# Dominios: ultravioletadao.xyz (main) · dev.ultravioletadao.xyz (develop).
# Las env vars son REACT_APP_* (CRA las inlinea en el bundle público): no son secretos.
# El token de GitHub del repo NO se gestiona acá (lifecycle ignore_changes).

resource "aws_amplify_app" "uvdweb" {
  name       = "uvdweb"
  repository = "https://github.com/UltravioletaDAO/uvdweb"
  platform   = "WEB"

  enable_branch_auto_build    = false
  enable_branch_auto_deletion = false
  enable_basic_auth           = false
  enable_auto_branch_creation = false

  # Buildspec de la consola (amplify.yml del repo lo pisa en cada build).
  build_spec = <<-EOT
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci --cache .npm --prefer-offline
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: build
    files:
      - '**/*'
  cache:
    paths:
      - .npm/**/*
  EOT

  environment_variables = {
    REACT_APP_API_URL             = "https://api.ultravioletadao.xyz"
    REACT_APP_DEBUG               = "false"
    REACT_APP_SHOW_SIGNUP_BUTTONS = "true"
    REACT_APP_STREAM_SEARCH_API   = "https://pbs5xr8wye.execute-api.us-east-1.amazonaws.com"
    REACT_APP_TTS_ENABLED         = "true"
    REACT_APP_TWITCH_CLIENT_ID    = "bk2tvufdg3nodg70rzyt7pxbfwuho8"
    REACT_APP_WHEEL_VERIFY_WALLET = "false"
  }

  cache_config {
    type = "AMPLIFY_MANAGED"
  }

  # Rewrites/redirects: se evalúan de arriba hacia abajo, primera que matchea gana.
  # PM-NS-11: www → apex (301). Regla de dominio: no admite path en source, Amplify
  # anexa el path solo (docs: redirect-rewrite-examples.html).
  custom_rule {
    source = "https://www.ultravioletadao.xyz"
    target = "https://ultravioletadao.xyz"
    status = "301"
  }

  custom_rule {
    source = "/.well-known/api-catalog"
    target = "/.well-known/api-catalog.json"
    status = "200"
  }

  custom_rule {
    source = "/.well-known/oauth-protected-resource"
    target = "/.well-known/oauth-protected-resource.json"
    status = "200"
  }

  custom_rule {
    source = "/.well-known/openid-configuration"
    target = "/.well-known/openid-configuration.json"
    status = "200"
  }

  custom_rule {
    source = "/.well-known/oauth-authorization-server"
    target = "/.well-known/oauth-authorization-server.json"
    status = "200"
  }

  custom_rule {
    source = "/<*>"
    target = "/index.html"
    status = "404-200"
  }

  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|md|svg|woff|ttf|map|json|xml|xsl|webp|mp4|webmanifest)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }
  lifecycle {
    ignore_changes = [access_token, oauth_token]
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.uvdweb.id
  branch_name = "main"

  display_name = "main"
  stage        = "PRODUCTION"
  framework    = "React"
  ttl          = "5"

  enable_auto_build           = true
  enable_pull_request_preview = false
  enable_notification         = false
  enable_basic_auth           = false
  enable_performance_mode     = false
}

resource "aws_amplify_branch" "develop" {
  app_id      = aws_amplify_app.uvdweb.id
  branch_name = "develop"

  display_name = "develop"
  ttl          = "5"

  enable_auto_build           = true
  enable_pull_request_preview = false
  enable_notification         = false
  enable_basic_auth           = false
  enable_performance_mode     = false
}

resource "aws_amplify_domain_association" "uvdweb" {
  app_id      = aws_amplify_app.uvdweb.id
  domain_name = "ultravioletadao.xyz"

  enable_auto_sub_domain = false

  certificate_settings {
    type = "AMPLIFY_MANAGED"
  }

  # apex → main
  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = ""
  }

  # dev.ultravioletadao.xyz → develop
  sub_domain {
    branch_name = aws_amplify_branch.develop.branch_name
    prefix      = "dev"
  }

  # www.ultravioletadao.xyz → main (PM-NS-11); la regla 301 de arriba lo manda al apex
  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "www"
  }

  # No bloquear el apply esperando la verificación del cert (se verifica a mano con
  # get-domain-association); el cert AMPLIFY_MANAGED ya cubre *.ultravioletadao.xyz.
  wait_for_verification = false
}

# NOTA: el CNAME www.ultravioletadao.xyz → d1ongz452rso2c.cloudfront.net lo crea y
# gestiona Amplify solo (la zona está en la misma cuenta; igual que apex y dev, TTL 500).
# No se declara acá para que Terraform no pelee con Amplify por ese registro.
