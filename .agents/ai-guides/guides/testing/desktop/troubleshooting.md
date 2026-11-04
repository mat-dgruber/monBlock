# 🔧 Guia de Resolução de Problemas em Testes Desktop (Troubleshooting)

> **Fonte Normativa:** `guides/testing/desktop/troubleshooting.md`  
> **Escopo:** Diagnóstico de testes instáveis (*flaky tests*), erros de compilação nativa C++, travamentos de display e concorrência IPC.

---

## 1. Mismatch de Versão de Módulos Nativos C++ (ABI Incompatible)

### Sintoma
```text
Error: The module '/path/to/better_sqlite3.node' was compiled against a different Node.js version using
NODE_MODULE_VERSION 115. This version of Electron requires NODE_MODULE_VERSION 128.
```

### Causa Raiz
O módulo foi compilado contra o runtime do Node.js da máquina local, mas o Electron possui seu próprio ABI C++ específico.

### Resolução
Execute o rebuild explícito para a versão do Electron instalada:
```bash
npx @electron/rebuild -f -w better-sqlite3
```
No `package.json`, garanta que o script de postinstall automatize a recompilação:
```json
{
  "scripts": {
    "postinstall": "electron-rebuild"
  }
}
```

---

## 2. Testes Instáveis (*Flaky Tests*) no Playwright Electron

### Sintoma
O teste passa na máquina do desenvolvedor, mas falha intermitentemente no CI por timeout ao tentar encontrar elementos da janela.

### Causa Raiz
A janela do Electron foi criada com `show: false` e o teste tentou interagir antes do evento `domcontentloaded` ou antes do fim de animações CSS.

### Resolução
1. **Aguarde explicitamente o estado do DOM:**
   ```typescript
   const window = await electronApp.firstWindow();
   await window.waitForLoadState('domcontentloaded');
   ```
2. **Utilize Localizadores Semânticos e Auto-Retrying:**
   Evite seletores de classe CSS voláteis; use `getByRole`, `getByLabel` ou `getByTestId`:
   ```typescript
   // ✅ CORRETO: O Playwright tenta repetidamente até o elemento estar visível
   await expect(window.getByRole('button', { name: 'Salvar' })).toBeVisible({ timeout: 5000 });
   ```
3. **Desative Animações em Ambiente de Teste:**
   Injete CSS de acessibilidade que anula transições (`animation-duration: 0ms !important`).

---

## 3. Falha de Conexão com Display no Linux CI (`X11 / Headless`)

### Sintoma
```text
[1234:5678/090000.123:ERROR:bus.cc(399)] Failed to connect to the bus: Failed to connect to socket /var/run/dbus/system_bus_socket
Gtk-WARNING **: cannot open display:
```

### Causa Raiz
O runner do Linux no GitHub Actions não possui servidor X11 físico ativo para desenhar as janelas do Chromium.

### Resolução
Encapsule o comando de teste utilizando **`xvfb-run`** com resolução fixa:
```bash
xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" -- npm run test:e2e
```
E passe flags de sandbox desativadas apenas no runner CI se executando sob container root:
```typescript
const electronApp = await electron.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox', 'out/main/index.js']
});
```

---

## 4. O Test Runner Não Finaliza (`Vitest did not exit`)

### Sintoma
Todos os testes passam com sucesso, mas o processo do Vitest fica pendente indefinidamente no terminal.

### Causa Raiz
Um timer global (`setInterval`), conexão de banco de dados SQLite aberta ou listener de IPC ativo no Main Process impediu o descarregamento do loop de eventos.

### Resolução
1. Feche explicitamente conexões com banco no hook de teardown:
   ```typescript
   afterAll(() => {
     db.close();
   });
   ```
2. No `vitest.config.ts`, ative a detecção de recursos órfãos com a flag `--detectOpenHandles`.
3. Garanta que o app Electron seja finalizado com `await electronApp.close()` em bloco `afterEach` ou `afterAll`.
