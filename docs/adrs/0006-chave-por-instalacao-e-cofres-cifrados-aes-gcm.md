<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-05 | Matheus Diniz  | Criação da ADR 0006 após review geral (chave fixa e hmacSecret legível).
================================================================================
-->

# ADR 0006: Chave Aleatória por Instalação (safeStorage) e Cofres Cifrados com AES-256-GCM

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Implementada** (2026-11-05) |
| **Decisores** | Matheus Diniz |
| **Tags** | `security`, `storage`, `electron` |
| **Impacto Sistêmico** | Alto (`state-store.ts`, `main.ts`, formato dos 3 cofres) |
| **ADRs Relacionadas** | Extends ADR-0004; depende de ADR-0001 para isolamento completo |

## Contexto

O review geral de 2026-11-05 encontrou dois defeitos críticos na persistência tripla (ADR-0004):

1. **Chave de integridade fixa no código** (`'monblock-local-runtime-integrity-key-v1'` em `main.ts`) e fallback determinístico (`platform:arch:USER`) em `resolveVaultIntegrityKey`. Qualquer pessoa com o código-fonte forja cofres com HMAC válido.
2. **Segredos legíveis em disco**: `hmacSecret`, `passwordHash` e hashes de recuperação ficavam em JSON puro em `userData/vaults`. Com o `hmacSecret`, o usuário protegido gera tokens `UNLOCK-PERMANENT`.

## Decisão

- `main.ts` gera, na primeira execução, uma chave aleatória de 256 bits e a persiste em `vaults/vault.key`, cifrada por `safeStorage` (chave mestra no Keychain do macOS). `MONBLOCK_INTEGRITY_KEY` continua como override de desenvolvimento.
- `resolveVaultIntegrityKey` deixa de derivar chave: sem chave explícita ou env, lança erro.
- Cada cofre passa a ser `MBV1.` + base64(`iv(12) | tag(16) | ciphertext`) em AES-256-GCM, com chave de cifra derivada via HKDF-SHA256 (`info = monblock-vault-enc-v1`). O HMAC do envelope é mantido.
- Chave ilegível ou cofre com tag GCM inválida resultam em Fail-Closed (comportamento da ADR-0004).

## Consequências

- **Positivas:** segredos deixam de ser legíveis abrindo o arquivo; forjar cofres exige extrair a chave do Keychain.
- **Negativas:** cofres gravados no formato JSON anterior são tratados como adulterados (Fail-Closed). Aceito: versão 0.1.0 sem instalações em produção, sem migração.
- **Limite conhecido:** em userland o usuário ainda pode ler o item do Keychain com a própria senha de login, apagar os cofres ou alterar o relógio. O isolamento real depende do daemon root previsto na ADR-0001.
