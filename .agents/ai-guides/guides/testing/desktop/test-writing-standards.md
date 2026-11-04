# 🧪 Padrões de Escrita de Testes Desktop

> **Fonte Normativa:** `guides/testing/desktop/test-writing-standards.md`  
> **Padrão Obrigatório:** Pirâmide de Testes Desktop & Convenção AAA (*Arrange, Act, Assert*)

---

## 1. O Padrão AAA (Arrange, Act, Assert) no Desktop

Todo teste automatizado de aplicações desktop deve estruturar-se rigorosamente em 3 blocos conceituais e visuais bem delimitados:

1. **Arrange (Preparação):** Configuração do estado inicial, instanciação de contratos tipados, banco SQLite em memória (`:memory:`) e mocks de módulos nativos do Electron (`app`, `dialog`, `shell`).
2. **Act (Ação / Execução):** Disparo de handler IPC (`ipcMain.handle`), mutação de banco no `utilityProcess` ou acionamento de interface pelo usuário.
3. **Assert (Verificação):** Prova empírica do resultado esperado (resposta estruturada RFC 9457, registro gravado com integridade ou elemento visível no DOM).

---

## 2. Testes Unitários de Main Process e Handlers IPC

Executam em milissegundos sem instanciar janelas gráficas (`BrowserWindow`), usando **Vitest** com mocks limpos de Electron.

### 2.1 Teste de Handler IPC com Validação de Entrada
```typescript
// test/unit/main/preferences-ipc.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSavePreferences } from '../../../src/main/ipc/preferences';
import type { UserPreferences } from '../../../src/common/ipc-contracts';

describe('Main Process: handleSavePreferences', () => {
  let mockStore: Map<string, unknown>;

  beforeEach(() => {
    mockStore = new Map();
  });

  it('deve persistir preferências válidas com sucesso (AAA)', async () => {
    // Arrange
    const validPayload: UserPreferences = { theme: 'dark', autoLaunch: true };
    const fakeContext = { event: null, store: mockStore };

    // Act
    const result = await handleSavePreferences(fakeContext as any, validPayload);

    // Assert
    expect(result).toEqual({ success: true });
    expect(mockStore.get('theme')).toBe('dark');
  });

  it('deve rejeitar e disparar erro semântico quando o tema for inválido', async () => {
    // Arrange
    const invalidPayload = { theme: 'magenta-invalido', autoLaunch: false } as any;

    // Act & Assert
    await expect(handleSavePreferences({ store: mockStore } as any, invalidPayload))
      .rejects
      .toThrowError('Tema não suportado');
  });
});
```

---

## 3. Testes Unitários de SQLite (`better-sqlite3`) em UtilityProcess

Bancos locais devem ser validados em modo de memória rápida (`:memory:`) testando schemas, migrações e transações atômicas:

```typescript
// test/unit/utility/db-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

describe('UtilityProcess: TaskRepository SQLite', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Arrange: Cria banco volátil em memória para isolamento total
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('deve inserir e recuperar uma tarefa com integridade atômica', () => {
    // Arrange
    const insertStmt = db.prepare('INSERT INTO tasks (id, title, completed) VALUES (?, ?, ?)');
    const selectStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');

    // Act
    insertStmt.run('task-1', 'Implementar Playwright Electron', 0);
    const row = selectStmt.get('task-1') as { id: string; title: string; completed: number };

    // Assert
    expect(row).toBeDefined();
    expect(row.title).toBe('Implementar Playwright Electron');
    expect(row.completed).toBe(0);
  });
});
```

---

## 4. Testes de Componentes e Camada de Apresentação (Renderer)

Executam em ambiente `jsdom` ou `happy-dom`, simulando a ponte `window.desktopAPI` exposta pelo `preload.js`:

```typescript
// test/renderer/PreferencesView.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PreferencesView } from '../../../src/renderer/components/PreferencesView';

describe('Renderer: PreferencesView', () => {
  it('deve disparar desktopAPI.savePreferences ao alternar o seletor de tema', async () => {
    // Arrange
    const saveMock = vi.fn().mockResolvedValue({ success: true });
    window.desktopAPI = {
      loadPreferences: vi.fn().mockResolvedValue({ theme: 'light', autoLaunch: true }),
      savePreferences: saveMock
    } as any;

    render(<PreferencesView />);

    // Act
    const themeSelect = await screen.findByLabelText(/Tema do Aplicativo/i);
    fireEvent.change(themeSelect, { target: { value: 'dark' } });

    // Assert
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
    });
  });
});
```

---

## 5. Testes End-to-End (E2E) com Playwright Electron

O padrão corporativo para testes E2E em Desktop utiliza a API `_electron` do **Playwright**:

```typescript
// test/e2e/window-management.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test.describe('E2E: Gerenciamento de Janelas e Diálogos', () => {
  test('deve iniciar janela sem white-flash e com dimensões corretas', async () => {
    // Arrange: Lança o executável compilado do Electron
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')]
    });

    // Act: Espera a janela renderizar o DOM
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Assert: Avalia propriedades da janela nativa
    const bounds = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      return mainWindow.getBounds();
    });

    expect(bounds.width).toBeGreaterThanOrEqual(800);
    expect(bounds.height).toBeGreaterThanOrEqual(600);

    // Teardown gracioso
    await electronApp.close();
  });
});
```
