# Documentação de API com Scalar / OpenAPI 3.1 (`.agents/rules/scalar-openapi.md`)

<!-- Fonte canônica: templates/rules/scalar-openapi.md (guides/integrations/guia-scalar-openapi-dx.md) — instalado por SCALAR-05 -->

Regra always-on para qualquer rota HTTP nova ou alterada:

1. **Rota canônica `/scalar`** servida pela integração oficial da stack (`scalar-fastapi`, `@scalar/express-api-reference`, `@scalar/hono-api-reference` ou CDN `cdn.jsdelivr.net/npm/@scalar/api-reference`), fora do schema (`include_in_schema=False`). Nunca forks nem credenciais privadas.
2. **Spec fiel (DX First, §6):** toda rota declara `tags` com metadados, respostas de erro tipadas (400/401/403/404/409/422, `ProblemDetails` RFC 9457), `examples` reais e `securitySchemes` na raiz.
3. **Contrato versionado:** `docs/api/openapi.json` (OpenAPI 3.1) é regenerado e commitado no mesmo PR que muda a API; o CI `openapi-diff` bloqueia breaking changes sem bump MAJOR.
4. **Produção:** avalie restringir `/scalar` (VPN/autenticação), `show_developer_tools="never"`, sem segredos nos exemplos; CSP libera apenas `cdn.jsdelivr.net` e `proxy.scalar.com` (§7).

Guia completo em `.agents/ai-guides/guides/integrations/guia-scalar-openapi-dx.md`.
