# 🏛️ Guias de Arquitetura, Resiliência & APIs

<div align="center">

[![Category](https://img.shields.io/badge/Category-Architecture%20%26%20APIs-6366F1?style=for-the-badge)](../../README.md)
[![Standards](https://img.shields.io/badge/Standards-Clean%20Arch%20%7C%20System%20Design%20%7C%20Resilience%20%7C%20DDD-10B981?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Padrões canônicos corporativos e agnósticos para engenharia de software, Clean Architecture, System Design distribuído, resiliência defensiva, segurança Zero-Trust e modelagem de domínio DDD (Frontend & Backend).</b>
</p>

</div>

---

## 📂 Guias Disponíveis no Diretório

```text
guides/architecture/
├── guia-arquitetura-software-design-clean-code.md ──> Clean/Hexagonal, SOLID, GoF, Monólito Modular e Refatoração (Front & Back)
├── guia-system-design-sistemas-distribuidos.md    ──> Macro-arquitetura distribuída, CDN/Edge, Sharding, CAP/PACELC e Alta Escala (Front & Back)
├── guia-padroes-resiliencia-defensiva.md          ──> Circuit Breaker, Retries com Jitter, Bulkhead e Handshake Resiliente (Front & Back)
├── guia-seguranca-defensiva-zero-trust.md         ──> Diretrizes Zero-Trust, OWASP Top 10 e OWASP LLM Top 10 (Front & Back)
└── domain-documentation-standards.md              ──> Modelagem DDD Bounded Context, Transição de Estados e RBAC/ABAC (Front & Back)
```

---

## 📋 Detalhamento dos Guias

> ⚙️ Os 5 guias deste diretório têm **Heurísticas Executáveis** aplicadas pelo `/setup`: `arquitetura-clean-code` (ARCH-01..06, requer `padrao-criacao-adrs`), `system-design-distribuidos` (SYSD-01..03, requer `padrao-criacao-adrs`), `resiliencia-defensiva` (RESIL-01..05), `seguranca-zero-trust` (ZT-01..07 — `.env`/`.env.example`/sandbox já cobertos por `construcao-harness`, `1password-credentials` e `ai-jail-sandbox`) e `domain-documentation-standards` (DOM-01..04). Cada um instala seu checklist em `.agents/rules/<slug>.md`, fiscaliza com linters quando a stack permite e referencia o guia no `CLAUDE.md`.

| Guia Técnico | Descrição & Propósito |
| :--- | :--- |
| [`guia-arquitetura-software-design-clean-code.md`](guia-arquitetura-software-design-clean-code.md) ⚙️ `arquitetura-clean-code` | Manual canônico de Clean Architecture, Hexagonal (Ports & Adapters), Monólito Modular, SOLID rigoroso, catálogo GoF com avaliação de trade-offs, Clean Code e refatoração Strangler Fig com separação explícita entre Frontend e Backend. |
| [`guia-system-design-sistemas-distribuidos.md`](guia-system-design-sistemas-distribuidos.md) ⚙️ `system-design-distribuidos` | Engenharia de macro-arquitetura e topologias distribuídas: CDN/Edge computing e SSR/hydration no Frontend; particionamento horizontal, consistência eventual (CAP/PACELC), sharding, replicação e mensageria no Backend. |
| [`guia-padroes-resiliencia-defensiva.md`](guia-padroes-resiliencia-defensiva.md) ⚙️ `resiliencia-defensiva` | Padrões de resiliência e tolerância a falhas simétrica: UI Boundaries, rollback otimista e cancelamento de requisições no Frontend; Circuit Breaker, Retries com Full Jitter, Bulkhead, Outbox defensivo e Handshake Resiliente no Backend. |
| [`guia-seguranca-defensiva-zero-trust.md`](guia-seguranca-defensiva-zero-trust.md) ⚙️ `seguranca-zero-trust` | Diretrizes canônicas de segurança defensiva e arquitetura Zero-Trust: princípios Never Trust, Always Verify, mitigação exaustiva de OWASP Top 10 e LLM Top 10, sanitização rigorosa de inputs, proteção de credenciais e conformidade LGPD/GDPR/PII no Frontend e Backend. |
| [`domain-documentation-standards.md`](domain-documentation-standards.md) ⚙️ `domain-documentation-standards` | Metodologia unificada para documentação de regras de negócio, modelagem de Bounded Contexts em Domain-Driven Design (DDD), diagramas de transição de estados Mermaid e matrizes de permissão RBAC/ABAC para Frontend e Backend. |

---

## 🔌 Integrações & Ferramentas Externas

Para padrões de integração com ferramentas de terceiros, bibliotecas de Developer Experience (DX) e documentação interativa de APIs com OpenAPI 3.1 & suíte oficial Scalar, consulte a categoria dedicada:

- [`guides/integrations/`](../integrations/README.md) ──> Padrões corporativos de integrações, OpenAPI 3.1 e DX de APIs com `@scalar/*` (FastAPI, Express, Hono, SPAs e CDN).
