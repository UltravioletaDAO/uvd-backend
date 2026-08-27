# ============================================
# CloudFront propio delante de Amplify — "Markdown for Agents" (PM-NS-07 / A9 / SCORE-2)
# ============================================
# Audit 2026-08-26. La distribución de Amplify (d1ongz452rso2c.cloudfront.net) vive en la
# cuenta de Amplify, no en la nuestra: no se le pueden adjuntar CloudFront Functions. Este
# stack pone una distribución PROPIA delante del dominio por defecto de la branch main
# (main.dhck0d8f8ypxv.amplifyapp.com) y ahí sí corre la negociación Accept: text/markdown.
#
# TODO el stack está detrás de `enable_agents_cloudfront` (default false => plan "No changes").
# El cutover DNS (apex + www) es un segundo interruptor: `agents_dns_target`.
# Plan, cutover, rollback, costo y generación de los .md:
#   Z:/ultravioleta/code/web/docs/audit-2026-08-26/wave2/cloudfront-plan.md
# Plantilla: 402milly (E4CYKFLYX3KQA, Z:/ultravioleta/dao/million/402milly/terraform/modules/cloudfront).
#
# BLOQUEO DESCUBIERTO EN LA OLA 3 (2026-08-27, ver docs/audit-2026-08-26/wave3/cloudfront-cutover.md):
#   Los alternate domain names ultravioletadao.xyz y www.ultravioletadao.xyz ya están asociados
#   a la distribución de Amplify (d1ongz452rso2c), que vive en la cuenta AWS de Amplify. CloudFront
#   rechaza crear una distribución nuestra con esos aliases (409 CNAMEAlreadyExists: "DNS record
#   that points to another CloudFront distribution") y, según la doc oficial, un APEX no se puede
#   mover entre cuentas ni con wildcard ni con associate-alias (la fuente tendría que estar
#   deshabilitada): solo AWS Support (TXT _.ultravioletadao.xyz) o que Amplify suelte el dominio.
#   Por eso existe `agents_attach_aliases` (default false): la distribución se crea SIN aliases
#   (se prueba por su dominio *.cloudfront.net) y los aliases se adjuntan solo cuando el dominio
#   quede libre (decisión de Saul; secuencia y downtime medidos en cloudfront-cutover.md).
#
# Fases (secuencia VERIFICADA el 2026-08-27, ver cloudfront-cutover.md §3):
#   1. enable_agents_cloudfront=true (attach=false, target=amplify) -> cert + funciones + cache
#      policy + distribución SIN aliases; apex/www siguen en Amplify (adoptados por Terraform con
#      el mismo valor). ESTADO ACTUAL (E2X06GJ7IIP080 / d3pmar3410ktcs.cloudfront.net).
#   2. agents_dns_target="cloudfront" (attach todavía false): apex A + www CNAME apuntan a la
#      distro propia. CERO impacto: CloudFront enruta por el DUEÑO del alias (Host/SNI), no por IP,
#      así que sigue respondiendo Amplify (experimento cloudfront-host-routing-experiment.txt).
#      Este orden es obligatorio: CloudFront rechaza adjuntar el alias mientras el DNS apunte a
#      OTRA distribución (el 409 de la fase 1).
#   3. Amplify suelta apex+www (quitar los sub_domain "" y "www" de amplify.tf, update in-place)
#      o AWS Support mueve el alias (TXT _.ultravioletadao.xyz / _www.ultravioletadao.xyz ->
#      d3pmar3410ktcs.cloudfront.net). Desde que Amplify suelta, el apex responde 403 hasta el paso 4.
#   4. agents_attach_aliases=true -> UpdateDistribution con los aliases (crea también el AAAA).
#      Reintentar si CloudFront aún devuelve 409 (Amplify no soltó todavía).
#   Rollback = orden inverso (attach=false -> target=amplify -> volver a poner los sub_domain en
#      Amplify). NUNCA volver a enable_agents_cloudfront=false sin antes `terraform state rm` del
#      apex (prevent_destroy lo bloquea a propósito: destruir el alias del apex = sitio caído).

variable "enable_agents_cloudfront" {
  description = "Crea la distribución CloudFront propia (cert us-east-1, funciones, cache policy) delante de Amplify main. false => No changes."
  type        = bool
  default     = false
}

variable "agents_attach_aliases" {
  description = "Adjunta ultravioletadao.xyz + www como aliases de la distribución propia. Solo puede ser true cuando esos nombres ya NO estén asociados a la distribución de Amplify (cuenta ajena): si no, CloudFront responde 409 CNAMEAlreadyExists."
  type        = bool
  default     = false
}

variable "agents_dns_target" {
  description = "A dónde apunta el apex ultravioletadao.xyz cuando enable_agents_cloudfront=true: amplify (hoy) o cloudfront (cutover). Solo con cloudfront se crean los registros www y AAAA."
  type        = string
  default     = "amplify"

  validation {
    condition     = contains(["amplify", "cloudfront"], var.agents_dns_target)
    error_message = "agents_dns_target debe ser amplify o cloudfront."
  }
}

# ACM para CloudFront tiene que vivir en us-east-1 (el resto del environment está en us-east-2).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  agents_enabled = var.enable_agents_cloudfront
  agents_cutover = var.enable_agents_cloudfront && var.agents_dns_target == "cloudfront"
  agents_aliases = var.agents_attach_aliases ? ["ultravioletadao.xyz", "www.ultravioletadao.xyz"] : []

  agents_apex   = "ultravioletadao.xyz"
  agents_www    = "www.ultravioletadao.xyz"
  agents_zone   = "Z020459338J0JDK9OGP8T"             # zona Route53 de ultravioletadao.xyz (misma que modules/lambda-api)
  agents_origin = "main.dhck0d8f8ypxv.amplifyapp.com" # default domain de la branch main (app dhck0d8f8ypxv, us-east-2)

  # Alias actual del apex (distribución de Amplify) — target de rollback.
  amplify_cloudfront_domain = "d1ongz452rso2c.cloudfront.net"
  # Hosted zone fija de TODAS las distribuciones CloudFront (para alias records).
  cloudfront_hosted_zone_id = "Z2FDTNDATAQYW2"

  agents_alias_target = local.agents_cutover ? aws_cloudfront_distribution.agents[0].domain_name : local.amplify_cloudfront_domain

  agents_tags = {
    Project   = "ultravioletadao.xyz"
    Component = "agents-cloudfront"
    ManagedBy = "terraform"
    Audit     = "2026-08-26/PM-NS-07"
  }
}

# --------------------------------------------
# Certificado ACM (us-east-1) apex + www, validación DNS en Route53
# --------------------------------------------
resource "aws_acm_certificate" "agents" {
  count    = local.agents_enabled ? 1 : 0
  provider = aws.us_east_1

  domain_name               = local.agents_apex
  subject_alternative_names = [local.agents_www]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.agents_tags
}

resource "aws_route53_record" "agents_cert_validation" {
  for_each = local.agents_enabled ? {
    for dvo in aws_acm_certificate.agents[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  zone_id         = local.agents_zone
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
}

resource "aws_acm_certificate_validation" "agents" {
  count    = local.agents_enabled ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.agents[0].arn
  validation_record_fqdns = [for r in aws_route53_record.agents_cert_validation : r.fqdn]
}

# --------------------------------------------
# CloudFront Functions (la API de CloudFront es global; el provider por defecto sirve)
# --------------------------------------------
resource "aws_cloudfront_function" "agents_markdown_negotiation" {
  count = local.agents_enabled ? 1 : 0

  name    = "uvd-agents-markdown-negotiation"
  runtime = "cloudfront-js-2.0"
  comment = "www->apex 301, Accept normalizado, Accept: text/markdown -> copia .md (PM-NS-07)"
  publish = true
  code    = file("${path.module}/cloudfront-agents/markdown-negotiation.js")
}

resource "aws_cloudfront_function" "agents_vary_accept" {
  count = local.agents_enabled ? 1 : 0

  name    = "uvd-agents-vary-accept"
  runtime = "cloudfront-js-2.0"
  comment = "Vary: Accept + Content-Type text/markdown de respaldo para *.md (PM-NS-07)"
  publish = true
  code    = file("${path.module}/cloudfront-agents/vary-accept.js")
}

# --------------------------------------------
# Cache policies
# --------------------------------------------
# Default behavior: Accept en la cache key (normalizado a 2 valores por la función
# viewer-request). max_ttl corto porque Amplify manda s-maxage=31536000 en el HTML y
# nosotros NO recibimos las invalidaciones que Amplify hace en su propia distribución.
resource "aws_cloudfront_cache_policy" "agents_accept" {
  count = local.agents_enabled ? 1 : 0

  name        = "uvd-agents-accept-in-key"
  comment     = "URI + Accept (normalizado) + Accept-Encoding; TTL max 5 min para no servir HTML viejo tras un deploy de Amplify"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 300

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Accept"]
      }
    }

    cookies_config {
      cookie_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# /static/* (assets con hash, Cache-Control immutable desde customHttp.yml): policy gestionada.
data "aws_cloudfront_cache_policy" "caching_optimized" {
  count = local.agents_enabled ? 1 : 0
  name  = "Managed-CachingOptimized"
}

# --------------------------------------------
# Distribución
# --------------------------------------------
resource "aws_cloudfront_distribution" "agents" {
  count = local.agents_enabled ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "ultravioletadao.xyz - Markdown for Agents delante de Amplify main (PM-NS-07)"
  aliases         = local.agents_aliases # vacío hasta que Amplify suelte el dominio (ver cabecera)
  price_class     = "PriceClass_All"     # audiencia LatAm: mismos edges que usa Amplify hoy

  origin {
    domain_name = local.agents_origin
    origin_id   = "amplify-main"

    # Sin origin_request_policy: CloudFront manda Host = domain_name del origen, que es
    # exactamente lo que Amplify espera (main.dhck0d8f8ypxv.amplifyapp.com).
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }

    connection_attempts = 3
    connection_timeout  = 10
  }

  default_cache_behavior {
    target_origin_id       = "amplify-main"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.agents_accept[0].id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.agents_markdown_negotiation[0].arn
    }

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.agents_vary_accept[0].arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/static/*"
    target_origin_id       = "amplify-main"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized[0].id
  }

  # Sin custom_error_response: el fallback SPA (404 -> index.html 200) ya lo hace Amplify.

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.agents[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = local.agents_tags
}

# --------------------------------------------
# Route53: apex + www
# --------------------------------------------
# El apex A (alias a la distro de Amplify) y el CNAME www los creó Amplify al asociar el
# dominio (amplify.tf: aws_amplify_domain_association.uvdweb) y NO están en el state. Con
# allow_overwrite el primer apply los adopta con los MISMOS valores (UPSERT no-op); el
# cutover es solo cambiar agents_dns_target. prevent_destroy evita que un
# enable_agents_cloudfront=false borre el alias del apex (= sitio caído).
# Si Amplify vuelve a escribir esos registros (p. ej. al editar sub_domain de la
# domain association) `terraform plan` lo muestra como drift y `apply` lo restaura.
resource "aws_route53_record" "agents_apex_a" {
  count = local.agents_enabled ? 1 : 0

  zone_id         = local.agents_zone
  name            = local.agents_apex
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = local.agents_alias_target
    zone_id                = local.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  lifecycle {
    prevent_destroy = true
  }
}

# AAAA solo cuando la distro propia ya tiene el alias (fase 4): mientras el alias sea de Amplify,
# no publicar IPv6 para el apex (la distro de Amplify no publica AAAA hoy).
resource "aws_route53_record" "agents_apex_aaaa" {
  count = local.agents_cutover && var.agents_attach_aliases ? 1 : 0

  zone_id         = local.agents_zone
  name            = local.agents_apex
  type            = "AAAA"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.agents[0].domain_name
    zone_id                = local.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# www: Amplify lo creó como CNAME -> d1ongz452rso2c.cloudfront.net (PM-NS-11). Se mantiene
# el MISMO tipo (CNAME) para que el UPSERT lo pise sin conflicto de RRset (un A/AAAA al
# mismo nombre que un CNAME lo rechaza Route53). Igual que el apex: se adopta en la fase 1
# apuntando a Amplify y en el cutover pasa a la distro propia (la función viewer-request
# responde 301 -> apex). En rollback vuelve a Amplify (no se borra: www seguiría resolviendo).
resource "aws_route53_record" "agents_www" {
  count = local.agents_enabled ? 1 : 0

  zone_id         = local.agents_zone
  name            = local.agents_www
  type            = "CNAME"
  ttl             = 300
  records         = [local.agents_alias_target]
  allow_overwrite = true
}

# --------------------------------------------
# Outputs (null mientras el stack está apagado)
# --------------------------------------------
output "agents_cloudfront_distribution_id" {
  description = "ID de la distribución propia (para invalidaciones post-deploy)"
  value       = one(aws_cloudfront_distribution.agents[*].id)
}

output "agents_cloudfront_domain_name" {
  description = "dXXXX.cloudfront.net de la distro propia (para probar con curl --resolve antes del cutover)"
  value       = one(aws_cloudfront_distribution.agents[*].domain_name)
}

output "agents_apex_alias_target" {
  description = "A dónde apunta el alias del apex según Terraform (null = no gestionado, enable_agents_cloudfront=false)"
  value       = local.agents_enabled ? local.agents_alias_target : null
}
