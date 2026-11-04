<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-04 | adr-governor   | Criação da ADR 0004 detalhando a tripla persistência do vínculo do Ajudante e recuperação de senha em 3 níveis.
================================================================================
-->

# ADR 0004: Pareamento Durável em Tripla Persistência e Recuperação de Senha em 3 Níveis Anti-Impulso

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-04) |
| **Decisores** | Arquitetura monBlock, SecOps, Produto, Tech Lead |
| **Tags** | `[persistence]`, `[keychain]`, `[recovery]`, `[time-lock]`, `[resilience]` |
| **Impacto Sistêmico** | Alto (`partner-auth`, `sqlite-store`, `keychain-adapter`, `recovery-engine`) |
| **ADRs Relacionadas** | Complementa ADR-0001 e ADR-0003; Evolui ADR-003 de `_reversa_sdd/` |

## Contexto
Em um sistema com bloqueio ao nível do sistema operacional (`/etc/hosts` imutável com `chflags uchg` e Enterprise Policies), dois extremos operacionais precisam ser evitados simultaneamente:
1. **Perda do Vínculo com o Ajudante em Atualizações ou Limpezas**: Se uma atualização do aplicativo ou limpeza de arquivos de usuário apagar o registro do Ajudante, o sistema não pode falhar aberto (desbloqueando tudo) nem perder as chaves criptográficas que permitem ao Ajudante aprovar pedidos.
2. **Esquecimento da Senha pelo Ajudante vs. Brecha de Impulso**: Se o Ajudante esquecer a Senha Mestra ou perder acesso ao celular, precisa existir um protocolo de recuperação que impeça o inutilizamento permanente (*brick*) do computador, mas que **jamais** permita ao usuário contornar o bloqueio durante uma crise de impulso (que dura tipicamente de minutos a poucas horas).

### Riscos Identificados e Problemas a Resolver:
1. **Exclusão ou Corrupção de Cofre Único**: Guardar o vínculo do Ajudante em apenas um arquivo local sujeita o pareamento a corrupção acidental ou tentativa de sabotagem.
2. **Fluxo de "Esqueci a Senha" Tradicional Inseguro**: Enviar um link de redefinição para o e-mail do próprio usuário permitiria que ele mesmo redefinisse a senha do Ajudante em 30 segundos.
3. **Bloqueio Permanente Irreversível (*Deadlock*)**: Caso o Ajudante fique incomunicável e perca a senha e os códigos de emergência, o usuário precisa de uma válvula de escape segura de longo prazo.

---

## 1. Fundamentação Jurídica & Fontes Normativas Diretas (Se aplicável)

| Diploma Legal / Normativo | Artigos / Dispositivos Principais | Aplicação Prática no Sistema |
| :--- | :--- | :--- |
| **Guia de Segurança Defensiva Zero-Trust** | `.agents/ai-guides/guides/architecture/guia-seguranca-defensiva-zero-trust.md` | Armazenamento de segredos em cofre nativo do SO (System Keychain), assinatura de integridade por linha e validação em tempo constante. |
| **Guia de Padrões de Resiliência Defensiva** | `.agents/ai-guides/guides/architecture/guia-padroes-resiliencia-defensiva.md` | Redundância de estado crítico, auto-reparo (*self-healing*) no boot e degradação segura (*Fail-Closed*). |

---

## 2. Decisão de Arquitetura

Adotar a **Tripla Persistência com Auto-Reparo (`Self-Healing`) para o Vínculo do Ajudante** e o **Protocolo de Recuperação de Senha em 3 Níveis Anti-Impulso**:

1. **Tripla Persistência Anti-Perda do Pareamento**:
   O registro do Ajudante (`partner_name`, `password_argon2id_hash`, `hmac_secret_encrypted`, `telegram_bot_token_enc`, `telegram_chat_id` e hashes dos códigos de recuperação) é gravado e sincronizado simultaneamente em 3 cofres independentes controlados por `root`:
   - **Cofre 1 (Banco Primário)**: SQLite `/Library/Application Support/monBlock/monblock.db` (`root:wheel`, permissão `0600`, modo `WAL` + `STRICT` + assinatura `row_hmac`).
   - **Cofre 2 (Cofre Criptográfico do SO)**: **macOS System Keychain** (`/Library/Keychains/System.keychain`, serviço `com.ccat.monblock.partner`).
   - **Cofre 3 (Selo Imutável de Disco)**: Arquivo selado `/var/db/monblock/partner.seal` protegido com flag de imutabilidade do kernel (`chflags uchg`).
   - **Regra de Auto-Reparo no Boot**: Sempre que o `monblockd` inicia, compara os 3 cofres; se qualquer um tiver sido removido ou corrompido durante atualização ou tentativa de adulteração, restaura automaticamente a partir dos cofres íntegros mantendo o bloqueio **100% ativo (Fail-Closed)**.

2. **Recuperação de Senha em 3 Níveis Sem Brecha de Impulso**:
   - **Nível 1 — Redefinição Remota Imediata via Telegram (`/reset_senha`)**: Se o Ajudante esquecer a Senha Mestra local, envia `/reset_senha` a partir do seu `telegram_chat_id` pareado; o `monblockd` valida a origem e atualiza o hash `Argon2id` em segundos.
   - **Nível 2 — Kit de Emergência com 5 Recovery Codes de Uso Único**: No momento do pareamento inicial, o sistema gera 5 códigos de recuperação de alta entropia entregues exclusivamente ao Ajudante. Cada código é armazenado como hash e invalidado permanentemente após o primeiro uso (`timingSafeEqual`).
   - **Nível 3 — Cooldown Time-Lock Rigoroso de 72 Horas**: Caso o Ajudante esteja inacessível e os Níveis 1 e 2 não estejam disponíveis, o usuário pode iniciar o *Timer de Desvinculação de Emergência de 72 Horas*. Durante todas as 72 horas:
     - O bloqueio de sites e categorias permanece **100% ativo** (impedindo qualquer gratificação imediata por impulso).
     - O `monblockd` dispara alertas automáticos a cada 6 horas para o Ajudante via Telegram, permitindo **cancelar o timer com 1 clique** caso seja uma tentativa de burla.

### Matriz de Avaliação de Alternativas (Trade-off Matrix)

| Critério de Avaliação | Opção A: Reset por E-mail Local ou Arquivo Único | Opção B: Sem Recuperação (Risco de Brick) | Opção C: Tripla Persistência + Recuperação 3 Níveis com Time-Lock 72h (Eleita) |
| :--- | :--- | :--- | :--- |
| **Custo / Esforço** | Baixo | Baixo | Médio |
| **Resistência a Impulso** | Nula (usuário reseta sozinho) | Alta | Alta (72h de bloqueio ativo + alerta ao Ajudante) |
| **Segurança contra Perda/Update** | Baixa | Baixa | Muito Alta (SQLite `0600` + System Keychain + `partner.seal`) |
| **Complexidade Operacional** | Baixa | Alta (suporte manual para desinstalar) | Baixa (auto-gerenciado pelo daemon) |
| **Curva de Aprendizado** | Rápida | Rápida | Moderada |

```text
+-------------------------------------------------------------------------+
| TRIPLA PERSISTÊNCIA DO VÍNCULO (Auto-Reparo / Self-Healing no Boot)     |
|                                                                         |
|  [1. SQLite 0600] <===> [2. System.keychain] <===> [3. partner.seal]    |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| ESCADA DE RECUPERAÇÃO DE SENHA (ZERO BRECHA DE IMPULSO)                 |
|                                                                         |
|  Nível 1: Comando /reset_senha no Telegram do Ajudante (Imediato)       |
|     |                                                                   |
|     v (Se sem Telegram)                                                 |
|  Nível 2: 1 dos 5 Recovery Codes de Uso Único do Ajudante (Imediato)    |
|     |                                                                   |
|     v (Se perda total de contato/códigos)                               |
|  Nível 3: Cooldown Time-Lock de 72h (Bloqueio 100% ativo + Alerta 6/6h) |
+-------------------------------------------------------------------------+
```

---

## 3. Matriz de Implementação Técnica (*IN-CODE*)

### 3.1 Camada de Backend / Daemon (`partner-auth` & `recovery-engine`)
- **Sincronizador de Tripla Persistência (`PartnerVaultSync`)**: No startup do `monblockd`, verifica a presença e o HMAC de `partner_config` no SQLite, System Keychain e `/var/db/monblock/partner.seal`. Se ao menos 1 cofre válido existir, reconstrói os demais. Se os dados divergirem, prevalece a versão com `updated_at` mais recente cuja assinatura HMAC com a chave do System Keychain seja válida.
- **Motor de Time-Lock (`CooldownTimerEngine`)**: Usa timestamps monotônicos e UTC persistidos em disco para evitar burla por alteração do relógio do sistema operacional (detecta saltos retroativos ou avanços não naturais de relógio comparando com `uptime` do kernel e cabeçalho HTTP `Date` de `1.1.1.1` / `api.telegram.org`).

### 3.2 Camada de Frontend / Client (`Electron UI`)
- **Onboarding do Kit de Emergência**: Exige confirmação explícita de que os 5 Recovery Codes foram enviados/salvos pelo Ajudante antes de concluir o pareamento.
- **Banner de Cooldown Ativo**: Quando o Nível 3 está em curso, exibe contador regressivo (`tabular-nums`) em todas as telas informando o tempo restante das 72h e botão para o próprio usuário cancelar o pedido caso tenha superado o momento de impulso.

### 3.3 Camada de Persistência e Banco de Dados (ANSI SQL)
```sql
CREATE TABLE partner_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    partner_name TEXT NOT NULL,
    password_argon2id_hash TEXT NOT NULL,
    hmac_secret_encrypted TEXT NOT NULL,
    telegram_bot_token_enc TEXT,
    telegram_chat_id TEXT,
    lock_incognito_flag INTEGER NOT NULL DEFAULT 0 CHECK (lock_incognito_flag IN (0, 1)),
    cooldown_started_at TEXT,
    cooldown_expires_at TEXT,
    updated_at TEXT NOT NULL,
    row_hmac CHAR(64) NOT NULL
) STRICT;

CREATE TABLE partner_recovery_code (
    code_index INTEGER PRIMARY KEY CHECK (code_index BETWEEN 1 AND 5),
    code_argon2id_hash TEXT NOT NULL,
    consumed_at TEXT,
    row_hmac CHAR(64) NOT NULL
) STRICT;
```

---

## 6. Matriz de Conformidade e Mitigação de Riscos

| Risco Mapeado no Contexto | Impacto Potencial | Mitigação Arquitetural e Técnica Adotada |
| :--- | :--- | :--- |
| **Manipulação do relógio do SO (NTP/Date) para pular as 72h** | Alto | Validação cruzada de tempo decorrido via delta de `os.uptime()` acumulado + checagem de timestamp remoto seguro antes de liberar o Time-Lock. |
| **Perda de configuração durante upgrade do app Electron** | Alto | O vínculo fica fora do bundle `.app`, replicado em `/Library/Application Support`, `System.keychain` e `/var/db/monblock/partner.seal`. |
| **Tentativa de força bruta nos Recovery Codes** | Médio | Rate limit estrito no `monblockd` (máximo de 3 tentativas a cada 15 minutos) + entropia de 128 bits por código. |

---

## 7. Consequências e Resultados

### Positivas
- **Continuidade Absoluta do Vínculo**: Reinstalações ou atualizações do cliente Electron nunca desvinculam o Ajudante nem resetam as categorias ativas.
- **Equilíbrio entre Segurança Antirrecidiva e Recuperabilidade**: O usuário nunca fica com a máquina permanentemente inutilizada em caso de imprevisto grave, mas qualquer tentativa impulsiva de burla esbarra em 72 horas de bloqueio contínuo e notificações ativas ao Ajudante.

### Negativas e Trade-offs Assumidos
- **Sincronização de Escrita em 3 Destinos**: Toda rotação de senha ou atualização do vínculo do Ajudante exige transação coordenada entre SQLite, `security` CLI / Keychain API e arquivo `.seal` com `chflags`.
- **Espera Obrigatória de 72h em Caso de Perda Total**: Se o Ajudante perder simultaneamente a Senha Mestra, o acesso ao Telegram e a folha com os 5 Recovery Codes, não haverá desbloqueio instantâneo, devendo cumprir o protocolo de 72 horas.
