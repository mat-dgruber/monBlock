# Documentação de Domínio (DDD) (`.agents/rules/domain-documentation-standards.md`)

<!-- Fonte canônica: templates/rules/domain-documentation-standards.md (guides/architecture/domain-documentation-standards.md) — instalado por DOM-03 -->

Regra always-on ao receber "documente o domínio X", "crie as regras de negócio de X" ou "explique como o módulo X está estruturado":

1. Crie `docs/domains/<nome_em_snake_case>/` com **exatamente** `overview.md`, `business-rules.md` e `tech-design.md`, copiados de `docs/domains/_template/` (nunca invente outra estrutura nem misture com specs temporárias).
2. Escreva em Português BR e mantenha os títulos canônicos das seções; preencha entidades, máquina de estados (Mermaid), matriz RBAC/ABAC, auditoria/LGPD e assinaturas de endpoints.
3. Antes de commitar: `python3 .agents/scripts/domains/validate_domains.py` deve retornar `ok`.
4. Regras de negócio mudaram no código ⇒ atualize `business-rules.md` no mesmo PR.

Guia completo em `.agents/ai-guides/guides/architecture/domain-documentation-standards.md`.
