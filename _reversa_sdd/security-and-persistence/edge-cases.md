# Unit: `security-and-persistence`, Casos Extremos (Edge Cases)

> Extraído do binário Mach-O (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## EC-SEC-01: Exclusão Manual da Pasta Nominal `~/Library/Application Support/Cisdem AppCrypt`
- **Evidência no binário (`ACPreferences +preferenceFilePath` em `0x100011c48` e `+preferenceBackFilePath` em `0x100011d8c`):**
  - A pasta nominal `~/Library/Application Support/Cisdem AppCrypt` guarda apenas o recibo de licença (`configure.ascfg`), logs (`log/`) e fotos de tentativas falhas (`FailedAttempts`).
  - O arquivo de configuração real fica em `~/Library/Application Support/com.apple.sdev/csdv.dsc` com cópia em `~/Library/Application Support/com.app.cadlvq/dgh.xvc`.
- **Comportamento:** Apagar `~/Library/Application Support/Cisdem AppCrypt` ou `~/Library/Preferences/com.cisdem.appencrypt.plist` **não** remove a senha nem desbloqueia os aplicativos/sites. 🟢 CONFIRMADO

## EC-SEC-02: Exclusão de Apenas Um dos Arquivos Camuflados (`csdv.dsc` ou `dgh.xvc`)
- **Evidência no binário (`ACPreferences +sharedPreference` em `0x100011bb4`):**
  - Se `csdv.dsc` for deletado enquanto o app está fechado, na próxima inicialização `+sharedPreference` detecta a ausência de `csdv.dsc`, verifica a existência de `dgh.xvc`, copia `dgh.xvc` de volta para `csdv.dsc` e carrega todas as regras normalmente. 🟢 CONFIRMADO

## EC-SEC-03: Mac Sem Câmera Integrada ou com Tampa Fechada (Clamshell Mode)
- **Evidência no binário (`ACCameraShot` em `0x1000279fc`):**
  - Se `[AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo]` retornar `nil` ou falhar ao iniciar a sessão, o handler conclui graciosamente sem travar o fluxo de registro de `ACFailedAttempt`. 🟢 CONFIRMADO
