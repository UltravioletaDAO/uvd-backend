# ============================================
# DNS agéntico del apex ultravioletadao.xyz (zona Z020459338J0JDK9OGP8T)
# ============================================
# Audit 2026-08-26 · PM-NS-04 / SCORE-3 (DNS-AID) y SCORE-6 (ARD).
# La zona ya está firmada con DNSSEC (Route53 SIGNING, DS en .xyz), así que solo
# faltan los registros. Plantilla: _index._agents.karmakadabra.ultravioletadao.xyz
# (kk-semantica-27/terraform/dashboard/agent_ready.tf).
#
# Se publica SOLO _index._agents (índice de descubrimiento: llms.txt, api-catalog,
# agent-skills, ai-catalog — todo servido hoy). NO se publica _mcp._agents ni
# _a2a._agents: no hay servidor MCP ni A2A en ese host (api/mcp = 404).

data "aws_route53_zone" "root" {
  name         = "ultravioletadao.xyz."
  private_zone = false
}

# DNS-AID (draft-mozleywilliams-dnsop-dnsaid + RFC 9460 SVCB, ServiceMode = priority > 0)
resource "aws_route53_record" "dns_aid_index" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "_index._agents.ultravioletadao.xyz"
  type    = "SVCB"
  ttl     = 3600
  records = ["1 ultravioletadao.xyz. alpn=\"h2\" port=443 mandatory=alpn,port"]
}

# ARD (Agent Resource Discovery): puntero DNS al catálogo /.well-known/ai-catalog.json
resource "aws_route53_record" "ard_catalog" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "_catalog._agents.ultravioletadao.xyz"
  type    = "TXT"
  ttl     = 3600
  records = ["url=https://ultravioletadao.xyz/.well-known/ai-catalog.json"]
}
