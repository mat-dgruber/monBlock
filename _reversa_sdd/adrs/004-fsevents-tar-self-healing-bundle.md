# ADR-004: Autodefesa ("Self-Healing") do Pacote `.app` via `FSEvents` e Backup `.tgz.gz`

- **Status:** Aceito (Extraído retroativamente da versão 7.11.0)
- **Confiança:** 🟢 CONFIRMADO (`ACMonitorAppSelf`, `ACFileSystemEventMonitor`, `ACLoginItemSharedFileList`)

---

## Contexto

Como o aplicativo roda com permissões do próprio usuário logado no macOS (sem daemon `root`), um usuário tentando contornar o bloqueio pode arrastar `/Applications/Cisdem AppCrypt.app` para a Lixeira enquanto o aplicativo está em execução.

## Decisão

Implementar o subsistema `ACMonitorAppSelf`:
1. Exigir que o aplicativo resida obrigatoriamente em `/Applications/Cisdem AppCrypt.app` (`+[ACLoginItemSharedFileList installedApplicationsPath]`).
2. Na inicialização (`Creating app backup`), compactar o próprio pacote `.app` em um arquivo oculto `.tgz.gz` invocando `/usr/bin/tar -czf` via `NSTask` (`-[ACMonitorAppSelf backupAppSelf]`).
3. Monitorar `/Applications/Cisdem AppCrypt.app` em tempo real usando a API `FSEventStreamCreate` (`ACFileSystemEventMonitor`).
4. Ao detectar remoção ou modificação do bundle (`-fileSystemMonitorURLs:didChanged:`), descompactar imediatamente o `.tgz.gz` de volta para `/Applications/` via `/usr/bin/tar -xvf` (`-restoreAppSelf`) e relançar o aplicativo (`-launchRestoreApp`).

## Alternativas Consideradas

1. **Daemon Privilegiado (`LaunchDaemon` em `/Library/LaunchDaemons` rodando como `root`) e flags `chflags uchg/schg`:**
   - Exigiria instalador `.pkg` solicitando senha de administrador do macOS na instalação e desinstalação, contradizendo a proposta de instalação drag-and-drop simples em `/Applications`.

## Consequências

### Positivas
- Impede a remoção casual do aplicativo pelo Finder enquanto o processo `Cisdem AppCrypt` estiver ativo em background.
- Não requer privilégios de `root` nem instalador `.pkg`.

### Negativas / Limitações Técnicas
- Adiciona ~2 segundos e I/O de disco a cada inicialização do app (`Creating app backup` via `/usr/bin/tar -czf`).
- Consome espaço adicional em disco equivalente ao tamanho compactado do próprio `.app`.
