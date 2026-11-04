# Guias de Integrações, Ferramentas & Developer Experience (DX)

<div align="center">

[![Category](https://img.shields.io/badge/Category-Integrations%20%26%20DX-3B82F6?style=for-the-badge)](../../README.md)
[![Standards](https://img.shields.io/badge/Standards-OpenAPI%203.1%20%7C%20Official%20Scalar%20%7C%20SDKs-10B981?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Repositório de padrões técnicos para integração com ferramentas de terceiros, bibliotecas de Developer Experience (DX), documentação interativa e SDKs recomendados no ecossistema corporativo.</b>
</p>

</div>

---

## Governanca e Escopo da Categoria

Esta categoria estabelece os padrões institucionais de adoção, configuração e manutenção de ferramentas externas, bibliotecas complementares de produtividade e SDKs homologados. Todos os guias aqui contidos baseiam-se em distribuições e pacotes oficiais da comunidade ou dos fornecedores mantenedores, prezando por:

1. **Reprodutibilidade e Estabilidade:** Uso de registros públicos e pacotes canônicos (npm, PyPI, Composer), eliminando dependências de forks individuais e repositórios efêmeros.
2. **Segurança e Zero-Trust:** Não utilização de tokens pessoais (PATs) compartilhados ou dependências não auditadas.
3. **Isolamento e Desacoplamento:** Integrações padronizadas através de contratos claros, adaptadores isolados e documentação reprodutível.

---

## Guias Disponiveis no Diretorio

```text
guides/integrations/
└── guia-scalar-openapi-dx.md ──> Documentação e DX de APIs com OpenAPI 3.1 & Suíte Scalar Oficial
```

---

## Detalhamento dos Guias

> ⚙️ O guia tem **Heurísticas Executáveis** aplicadas pelo `/setup`: `scalar-openapi` (SCALAR-01..06 — integração oficial `@scalar` da stack, rota `/scalar`, `docs/api/openapi.json` 3.1, CI `openapi-diff`, regra always-on e `CLAUDE.md`; só entra quando FastAPI/Express/Hono/NestJS/Fastify/Laravel é detectado).

| Guia Tecnico | Descricao & Proposito |
| :--- | :--- |
| [`guia-scalar-openapi-dx.md`](guia-scalar-openapi-dx.md) ⚙️ `scalar-openapi` | Padrão institucional de documentação interativa e Developer Experience (DX) para APIs RESTful utilizando OpenAPI 3.1 e a suíte oficial `@scalar` (FastAPI, Express, Hono, SPAs e distribuição estática via CDN). |

---

## Governanca

- **Mantenedor:** Comitê Corporativo de Arquitetura & Engenharia de Software
- **Vigencia:** Corporativa / Multi-equipes
