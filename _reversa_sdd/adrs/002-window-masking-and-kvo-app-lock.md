# ADR-002: Bloqueio de Aplicativos por Observação KVO (`NSWorkspace`) e Mascaramento de Janelas (`CGWindowList` + `CIGaussianBlur`)

- **Status:** Aceito (Extraído retroativamente da versão 7.11.0)
- **Confiança:** 🟢 CONFIRMADO (`ACMonitorTask`, `ACRunningAppsMgr`, `ACRunningApp`, `ACWindowServer`, `ACMaskWndControl`)

---

## Contexto

No macOS sem extensão de kernel (`EndpointSecurity` / `kext`), um processo em espaço de usuário não pode impedir síncronamente a syscall `execve()` de outro aplicativo no kernel. Ainda assim, o produto precisa impedir que usuários não autorizados visualizem ou interajam com aplicativos bloqueados.

## Decisão

Adotar uma estratégia de **interdição reativa em tempo real em 3 etapas**:
1. **Monitoramento KVO de Processos:** `ACRunningAppsMgr` observa `[NSWorkspace sharedWorkspace].runningApplications` e cada `ACRunningApp` observa as propriedades KVO `"active"` e `"hidden"` do `NSRunningApplication`.
2. **Mascaramento Gráfico Imediato (`ACWindowServer` + `ACMaskWndControl`):** Ao detectar ativação/lançamento de um app bloqueado, consulta `CGWindowListCopyWindowInfo` para localizar todas as janelas na tela pertencentes ao PID (`windowOnScreenForProccessorWithID:`), gera uma captura borrada com `CIGaussianBlur` (ou imagem customizada) e sobrepõe janelas `ACMaskWindow` nas mesmas coordenadas.
3. **Ocultação e Encerramento Forçado:** Oculta o processo (`-hideWithoutNotification` + `_hiddenTimer`) e exibe o prompt de senha `ACPWDInputWndCtrl`. Se a autenticação for recusada ou cancelada, oculta ou encerra o aplicativo (`[NSRunningApplication terminate]` com fallback `osascript -e 'tell application "..." quit'`).

## Alternativas Consideradas

1. **Alteração de Permissões POSIX (`chmod 000`) ou Criptografia do Binário em `/Applications`:**
   - Quebraria a assinatura digital (`codesign`) de aplicativos da App Store e do sistema, exigiria `root` e falharia completamente em aplicativos protegidos pelo SIP (System Integrity Protection) em `/System/Applications/` (como `System Settings`, `Activity Monitor` e `Terminal`).
2. **API `EndpointSecurity` (`ES_EVENT_TYPE_AUTH_EXEC`):**
   - Exige System Extension assinada com entitlement restrito da Apple (indisponível para utilitários de consumidor distribuídos diretamente sem aprovação corporativa MDM).

## Consequências

### Positivas
- Compatível com aplicativos protegidos pelo SIP (`/System/Applications/Utilities/Terminal.app`, `Activity Monitor.app`, `System Settings.app`).
- Não modifica nenhum byte dos aplicativos protegidos no disco, evitando corrupção caso o AppCrypt seja desinstalado.
- Permite sessões temporárias autorizadas (`granted = YES`) com relock automático por desativação (`_resignTimer`), ociosidade (`HIDIdleTime`) ou repouso (`NSWorkspaceWillSleepNotification`).

### Negativas / Limitações Técnicas
- O processo bloqueado chega a iniciar por alguns milissegundos antes de ser ocultado/mascarado ou encerrado.
- Para cobrir o conteúdo real da janela com o efeito `CIGaussianBlur`, depende de `CGWindowListCreateImage` (que no macOS moderno exibe apenas o fundo da área de trabalho caso a permissão de Gravação de Tela não esteja ativa).
