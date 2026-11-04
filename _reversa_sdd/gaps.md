# Relatório de Lacunas e Limitações Intrínsecas do Alvo (`gaps.md`)

> Registro de lacunas da extração reversa e limitações técnicas comprovadas no próprio software analisado (`Cisdem AppCrypt v7.11.0`).

---

## 1. Lacunas de Extração Reversa (🔴 LACUNA)

- **Lacunas abertas:** conflito de modelos de agenda (`ACSchedule`/`ACScheduleHelper` vs. `ACScheduleGroup`/`ACScheduleUnit`) e endereços `0x100009b70`/`0x100009730` para `monitorItemScheduleAvailable:`; relação e endereço corretos não demonstrados. Fontes brutas citadas em specs não foram preservadas, a cobertura de metadados Swift/NIB/imports é limitada e testes de comportamento/recuperação permanecem pendentes. Ver [`schedule-engine/tasks.md`](schedule-engine/tasks.md), [`rea-evidence-dossier.md`](rea-evidence-dossier.md) e [`confidence-report.md`](confidence-report.md).

---

## 2. Limitações Técnicas e Bugs Reais Identificados no Binário Legado (🟢 CONFIRMADO)

| ID | Subsistema | Descrição Técnica da Limitação no AppCrypt v7.11.0 | Evidência no Binário |
|---|---|---|---|
| **LIM-01** | `web-block-engine` | **Possível incompatibilidade do Firefox:** `ACMonitorFirfoxBrowser` parece herdar AppleScript baseado em Chromium (`active tab`); ausência de dialeto próprio não prova falha em toda versão/ambiente. Validar com Firefox e TCC antes de declarar inoperância. | `0x1000495ec` (`-browserName`); inferência estática, teste dinâmico pendente |
| **LIM-02** | `security-and-persistence` | **Hash de senha com `CC_MD5` sem salt:** A senha mestra é resumida com MD5 simples de 32 caracteres hexadecimais (`-[NSString md5String]`), vulnerável a reversão instantânea caso o atacante tenha acesso local ao Keychain/UserDefaults da sessão. | `0x1000222f4` (`-[NSString(MD5) md5String]` chama `CC_MD5`) |
| **LIM-03** | `security-and-persistence` | **Segurança por obscuridade nos arquivos `csdv.dsc` e `dgh.xvc`:** As listas de apps/sites bloqueados e a dica de senha (`passwordTips`) são salvas sem criptografia em arquivos `bplist00` (`NSKeyedArchiver`) apenas escondidos sob nomes que imitam pacotes da Apple (`com.apple.sdev`). | `0x100011c48` / `0x100011d8c` + inspeção `plutil -p` |
| **LIM-04** | `self-defense-and-lifecycle` | **Autodefesa contornável via encerramento de processo + exclusão:** Como `ACMonitorAppSelf` vive dentro do mesmo processo user-space (`Cisdem AppCrypt`), se o processo for morto (`kill -9`) antes de deletar o `.app` e os arquivos `csdv.dsc`/`dgh.xvc`, o watchdog `FSEvents` não estará ativo para restaurar o `.tgz.gz`. | `0x10002d068` (`ACMonitorAppSelf`) |
| **LIM-05** | `web-block-engine` | **Polling AppleEvents sujeito a permissão TCC do usuário:** Se o usuário revogar a permissão do navegador em *Ajustes do Sistema → Privacidade e Segurança → Automação*, o AppCrypt perde a capacidade de ler e redirecionar URLs daquele navegador (exibindo apenas um alerta via `ACPermissionAlertHelper`). | `0x10003aa2c` (`ACPermissionAlertHelper`) |
