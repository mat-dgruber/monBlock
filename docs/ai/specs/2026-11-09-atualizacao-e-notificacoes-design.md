# Especificação de Design: Atualização Constante e Notificações Nativas no macOS

**Data:** 2026-11-09  
**Status:** Proposto (Auditado via `/plan-criticize`)  
**Autor:** Engenheiro de Software / Pair Programming  
**Escopo:** `src/main/notifications.ts`, `src/main/updater.ts`, `src/preload/`, `src/renderer/`  
**Governança:** Padrão canônico de artefatos em `docs/ai/specs/`, alinhado aos guias de resiliência e desenvolvimento desktop do repositório. Necessidade de ADR: Avaliado como extensão natural do MOD-04 (não altera o protocolo do daemon ADR-0007).

---

## 1. Contexto e Motivação

O **monBlock** opera como uma aplicação desktop híbrida no macOS:
1. **Interface Electron (Userland):** Painel de controle, configuração de categorias, pedidos de liberação e monitoramento do compromisso com o Ajudante.
2. **Daemon Privilegiado (`monblockd` Root):** Executa em `/Library/PrivilegedHelperTools/` como `LaunchDaemon` para garantir a persistência da proteção no `/etc/hosts` e nos perfis de navegador `.mobileconfig`.

Atualmente, o usuário não possui visibilidade de novas versões diretamente pelo aplicativo, dependendo de download e reinstalação manual externa do pacote `.pkg`. Além disso, eventos críticos como respostas do Ajudante ao Telegram, término de cooldown de 72h e disponibilidade de atualizações não emitem notificações nativas do sistema operacional, exigindo que o usuário mantenha a janela aberta ou verifique ativamente a barra de menu.

Esta especificação define o **Subsistema de Notificações Nativas do macOS** e o **Fluxo de Atualização Constante (In-App Updater)** com foco em segurança Zero-Trust e resiliência offline-first.

---

## 2. Objetivos e Não-Objetivos

### Objetivos
- **Notificações Nativas no macOS (`UNUserNotificationCenter` via Electron):**
  - Notificar sobre atualizações disponíveis ou baixadas.
  - Notificar respostas do Ajudante (aprovação de 15m/60m/permanente ou recusa).
  - Notificar marcos temporais do cronômetro de 72h (início, 24h restantes, término).
  - Respeitar preferências do sistema (`prefers-reduced-motion`, foco/Não Perturbe do macOS).
- **Verificação e Atualização In-App:**
  - Consulta segura a releases oficiais (GitHub Releases API via HTTPS).
  - Indicador visual e não intrusivo no campinho de versão recém-adicionado na sidebar.
  - Download assistido com barra de progresso para a pasta temporária do usuário.
  - Verificação de integridade via checksum SHA-256 antes da execução.
  - Disparo do assistente de instalação `.pkg` com 1 clique (`shell.openPath`), garantindo atualização atômica do app e do daemon root.

### Não-Objetivos
- Auto-reinicialização forçada do aplicativo no meio de uma sessão de foco sem consentimento explícito do usuário.
- Substituição do daemon root sem a devida confirmação de credenciais de administrador exigida pelo instalador `.pkg` do macOS.
- Telemetria de uso ou envio de dados do usuário para o servidor de release.

---

## 3. Matriz de Alternativas Arquiteturais

| Critério | Alternativa A (Escolhida): Download Assistido de `.pkg` com Validação SHA-256 | Alternativa B: `electron-updater` com Squirrel.Mac | Alternativa C: Sparkle Framework Nativo |
| :--- | :--- | :--- | :--- |
| **Compatibilidade com Daemon Root** | **Excelente:** O `.pkg` oficial atualiza atomicamente o app `/Applications/monBlock.app` e o daemon `/Library/PrivilegedHelperTools/com.ccat.monblockd` | **Crítica:** Squirrel só atualiza o `.app` em userland, deixando o daemon root desatualizado (divergência de versão e estado) | **Média:** Exige bindings Objective-C/Swift nativos e script privilegiado separado |
| **Exigência de Assinatura Apple** | Funciona com certificados Developer ID e também com compilações ad-hoc locais | Exige obrigatoriamente assinatura Developer ID e infraestrutura de delta updates | Exige setup complexo de feeds Sparkle |
| **Complexidade e Dependências** | **Zero dependências externas:** Usa `net.request`/`fetch` nativo do Node/Electron e `crypto.createHash('sha256')` | Adiciona dependências pesadas (`electron-updater`, `builder-util-runtime`) | Adiciona binários compilados adicionais |
| **Resiliência e Falha Graciosa** | Se o download falhar, o app em execução permanece 100% íntegro e funcional | Risco de corrupção do bundle `.app` durante substituição atômica em voo | Risco de travamento de subprocesso |

---

## 4. Restrições Técnicas & Limites

1. **Rate Limiting da API do GitHub:** A API pública não autenticada do GitHub impõe teto de 60 requisições/hora por IP. A checagem automática é limitada a 1 consulta a cada 24 horas (com cache em memória e `localStorage`), permitindo checagem manual mediante clique.
2. **Timeout de Rede:** Operações de checagem têm timeout estrito de 10 segundos. O download do `.pkg` possui timeout de inatividade de 30 segundos.
3. **Privilégios de Notificação no macOS:** Se o usuário revogar notificações nos Ajustes do Sistema do macOS, o `Notification.isSupported()` permanece verdadeiro, mas o sistema silencia. O app deve registrar a emissão sem travar ou gerar exceções (`RN-UI-03`).
4. **Isolamento de Processos (Zero-Trust):** O Renderer jamais manipula sockets, arquivos no disco ou chamadas de rede diretas para update; tudo é intermediado pela ponte Preload estritamente tipada.

---

## 5. Casos de Borda & Invariantes

1. **Invariante 1 — Proteção Contínua em Falha de Download:** Uma falha ou corrupção no download da atualização NUNCA afeta as regras de bloqueio vigentes ou a comunicação com o daemon `monblockd`.
2. **Invariante 2 — Sem Downgrade Acidental:** Se a versão remota for inferior ou igual à versão local (`semver.lte(remote, current)`), nenhuma ação de update é sugerida.
3. **Caso de Borda: Queda de Conexão durante o Download:** O arquivo é baixado em formato `.tmp.download` e somente renomeado para `.pkg` após conferência de tamanho e hash SHA-256. Se a conexão cair, o arquivo parcial é descartado.
4. **Caso de Borda: Concorrência de Cliques:** Se o usuário clicar repetidamente em "Atualizar", o sistema bloqueia chamadas concorrentes mantendo um estado `downloadInProgress: boolean`.
5. **Caso de Borda: Usuário cancela o instalador `.pkg`:** Como o instalador é invocado via `shell.openPath()`, o app continua aberto normalmente sem estado inconsistente.

---

## 6. Arquitetura Técnica

### 6.1. Módulo de Notificações Nativas (`src/main/notifications.ts`)

```typescript
export interface AppNotificationPayload {
  id: 'update-available' | 'update-downloaded' | 'unblock-approved' | 'unblock-rejected' | 'cooldown-started' | 'cooldown-finished';
  title: string;
  body: string;
  silent?: boolean;
  actionText?: string;
}

export class AppNotificationManager {
  private lastFiredTimes = new Map<string, number>();
  private readonly THROTTLE_MS = 60_000;

  notify(payload: AppNotificationPayload): boolean {
    const now = Date.now();
    const last = this.lastFiredTimes.get(payload.id) ?? 0;
    if (now - last < this.THROTTLE_MS) return false;

    if (!Notification.isSupported()) return false;

    const notif = new Notification({
      title: payload.title,
      body: payload.body,
      silent: payload.silent ?? false,
    });
    notif.show();
    this.lastFiredTimes.set(payload.id, now);
    return true;
  }
}
```

### 6.2. Módulo do Updater (`src/main/updater.ts`)

```typescript
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  pkgUrl?: string;
  sha256?: string;
}

export async function checkForAppUpdates(currentVersion: string): Promise<UpdateCheckResult>;
export async function downloadAppUpdatePkg(url: string, expectedSha256?: string, onProgress?: (p: number) => void): Promise<{ success: boolean; pkgPath?: string }>;
```

---

## 7. Critérios de Aceitação BDD

### Cenário 1: Notificação de Nova Versão Encontrada
- **GIVEN** que o usuário está executando a versão `v0.8.1` do monBlock
- **WHEN** o aplicativo consulta a API de releases e identifica a versão `v0.8.2`
- **THEN** o badge da sidebar exibe a indicação de atualização disponível
- **AND** uma notificação nativa do macOS é apresentada: *"Nova versão v0.8.2 disponível — Clique para revisar as melhorias."*

### Cenário 2: Download e Abertura do Instalador
- **GIVEN** que o usuário clicou em "Atualizar agora" no modal de atualização
- **WHEN** o download do instalador `.pkg` for concluído com verificação de integridade SHA-256 válida
- **THEN** uma notificação nativa é disparada: *"Atualização pronta — O assistente de instalação foi aberto."*
- **AND** o arquivo `.pkg` é executado via `shell.openPath()`.

### Cenário 3: Resposta do Ajudante via Telegram
- **GIVEN** que o usuário solicitou uma liberação temporária de 15 minutos para `exemplo.com`
- **WHEN** o Ajudante aprova o pedido no Telegram
- **THEN** o sistema atualiza a regra no daemon root
- **AND** dispara imediatamente uma notificação nativa: *"Liberação Aprovada: exemplo.com liberado por 15 minutos."*

---

## 8. Procedimento de Reversibilidade & Rollback

1. **Rollback de Download Parcial:** Qualquer falha na rede ou mismatch de SHA-256 apaga imediatamente o arquivo temporário de `/tmp` e restaura a interface para o estado padrão, informando o usuário com feedback RFC 9457 sem travar o app.
2. **Rollback de Versão do Software:** Se uma nova versão instalada apresentar inconsistências, o usuário pode reinstalar a versão anterior executando o `.pkg` da release estável correspondente; o daemon `monblockd` preserva a integridade do cofre em `/var/run/monblock/` sem perda de regras ou chaves de pareamento.
3. **Degradação Graciosa Offline:** Sem conectividade, todas as rotinas de update retornam silenciosamente `{ hasUpdate: false }` e o aplicativo opera 100% com suas regras locais.
