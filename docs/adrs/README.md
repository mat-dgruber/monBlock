# 📚 Repositório de Architecture Decision Records (ADRs)

> Índice gerado automaticamente com o status consolidado das decisões arquiteturais.

| ADR | Título | Status | Data |
| :---: | :--- | :---: | :---: |
| [0001](0001-arquitetura-split-privilegiada-daemon-monblockd.md) | **Arquitetura Split Privilegiada com UI Electron Desprivilegiada e Daemon Root monblockd** | `Aprovada` | 2026-11-04 |
| [0002](0002-bloqueio-web-em-3-camadas-hosts-policies-watcher.md) | **Defesa em Profundidade para Bloqueio Web em 3 Camadas (/etc/hosts, Enterprise Policies e Watcher Universal)** | `Aprovada` | 2026-11-04 |
| [0003](0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md) | **Catraca Unidirecional Append-Only, Aprovação pelo Ajudante (Telegram + HMAC + Argon2id) e Raio-X com Blur** | `Aprovada` | 2026-11-04 |
| [0004](0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md) | **Pareamento Durável em Tripla Persistência e Recuperação de Senha em 3 Níveis Anti-Impulso** | `Aprovada` | 2026-11-04 |
| [0005](0005-pareamento-telegram-custodia-exclusiva-codigos-emergencia.md) | **Pareamento Delegado via Telegram com Senha Remota e Custódia Exclusiva dos Códigos de Emergência** | `Aprovada` | 2026-11-05 |
| [0006](0006-chave-por-instalacao-e-cofres-cifrados-aes-gcm.md) | **Chave Aleatória por Instalação (safeStorage) e Cofres Cifrados com AES-256-GCM** | `Substituída parcialmente por ADR-0007` | 2026-11-05 |
| [0007](0007-daemon-root-pkg-ipc-relogio-confiavel.md) | **Daemon Root Distribuído por `.pkg` (Node SEA), IPC por Socket com Permissão de Diretório, Relógio Confiável e Tombstone de Pareamento** | `Aprovada` | 2026-11-05 |
| [0008](0008-adocao-ddd-pragmatico-use-cases-unit-of-work.md) | **Adoção de DDD Pragmático com Use Cases e Unit of Work** | `Aprovada` | 2026-11-05 |
| [0009](0009-listas-de-categorias-em-dados-versionados-com-camadas-por-prioridade.md) | **Listas de categorias em dados versionados, com camadas por prioridade** | `Aprovada` | 2026-11-06 |
| [0010](0010-telegram-broker-unico-cofre-do-token.md) | **Broker único do Telegram e token do bot no cofre do daemon** | `Aprovada` | 2026-11-06 |
| [0011](0011-resiliencia-sessao-aqua-launchagent-e-comandos-remotos-telegram.md) | **Resiliência de Monitoramento em Sessão Aqua via LaunchAgent e Comandos Remotos no Telegram** | `Implementada` | 2026-11-09 |
| [0012](0012-criterios-senha-forte-e-integridade-sha256-atualizacoes.md) | **Critérios de Senha Forte (NIST SP 800-63B) para o Ajudante e Integridade SHA-256 de Atualizações In-App** | `Implementada` | 2026-11-10 |
