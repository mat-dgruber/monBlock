# ADR-003: Persistência Redundante e Camuflada via `NSKeyedArchiver` (`com.apple.sdev/csdv.dsc` e `com.app.cadlvq/dgh.xvc`)

- **Status:** Aceito (Extraído retroativamente da versão 7.11.0)
- **Confiança:** 🟢 CONFIRMADO (`ACPreferences`, `+preferencesPathFileURL`, `+backupFilePreferencesURL`)

---

## Contexto

Usuários que tentam burlar bloqueadores de aplicativos no macOS frequentemente navegam até `~/Library/Application Support/<NomeDoApp>/` ou `~/Library/Preferences/` e apagam os arquivos de configuração para resetar a lista de bloqueios ou a senha.

## Decisão

1. **Desacoplar a configuração crítica da pasta oficial do app:** Em vez de salvar as listas de bloqueio em `~/Library/Application Support/Cisdem AppCrypt/`, `ACPreferences` serializa o grafo completo de objetos (`ACPreferences` → `ACMonitorItemsMgr` → `ACMonitorItem` → `ACScheduleGroup` → `ACScheduleUnit`) via `NSKeyedArchiver` (`NSSecureCoding`) em dois caminhos camuflados dentro de `~/Library/Application Support/`:
   - **Primário:** `~/Library/Application Support/com.apple.sdev/csdv.dsc`
   - **Backup espelhado:** `~/Library/Application Support/com.app.cadlvq/dgh.xvc`
2. **Separar a senha mestra no Keychain:** O hash MD5 da senha mestra é salvo no macOS Keychain sob o serviço `com.cisdem.keychain` (`ACKeychain` / `ACPasswordMgr`), com fallback para `NSUserDefaults` (`ACSavePInKeychain`).

## Alternativas Consideradas

1. **Salvar tudo em `NSUserDefaults` (`~/Library/Preferences/com.cisdem.appencrypt.plist`):**
   - Facilmente resetável com um único comando `defaults delete com.cisdem.appencrypt` ou removendo o plist óbvio.
2. **Banco SQLite na pasta `~/Library/Application Support/Cisdem AppCrypt/`:**
   - Facilmente localizado pelo nome da pasta do fabricante.

## Consequências

### Positivas
- Apagar `~/Library/Application Support/Cisdem AppCrypt/` remove apenas os logs de texto (`log/*.log`), o histórico de fotos (`appcrypt.aclog`) e metadados de update (`configure.ascfg`), **sem afetar as regras de bloqueio, que residem em `csdv.dsc`/`dgh.xvc`** (inferido pela localização dos arquivos; não testado dinamicamente).
- Se o usuário descobrir e apagar `com.apple.sdev/csdv.dsc`, o método `+[ACPreferences restoreBackup]` restaura automaticamente as configurações (temporização não medida) a partir de `com.app.cadlvq/dgh.xvc`.

### Negativas / Limitações Técnicas
- Polui `~/Library/Application Support/` com duas pastas órfãs (`com.apple.sdev` e `com.app.cadlvq`) que não são removidas quando o usuário arrasta o aplicativo para a Lixeira.
- Segurança por obscuridade nos nomes dos caminhos: uma vez mapeados via engenharia reversa do binário, ambos os caminhos são estáticos e determinísticos.
