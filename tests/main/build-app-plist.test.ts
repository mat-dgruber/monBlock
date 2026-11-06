import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('build-app.sh: permissão de Automação (watcher de palavras-chave)', () => {
  it('declara NSAppleEventsUsageDescription; sem ela o macOS nega os Apple Events sem perguntar', () => {
    const sh = fs.readFileSync(path.resolve(__dirname, '../../scripts/build-app.sh'), 'utf8');
    expect(sh).toContain('NSAppleEventsUsageDescription');
  });
});

describe('watcher: falha de leitura da aba', () => {
  it('não lança quando o executor rejeita com valor vazio', async () => {
    const { OsascriptBrowserTabAdapter } = await import('../../src/enforcers/macos-watcher.js');
    const adapter = new OsascriptBrowserTabAdapter(async () => Promise.reject(undefined));
    await expect(adapter.getActiveTab()).resolves.toBeNull();
  });
});

describe('watcher: Dia', () => {
  it('lê e redireciona a aba do Dia (mesmo dicionário AppleScript do Chromium)', async () => {
    const { SUPPORTED_MACOS_BROWSERS, OsascriptBrowserTabAdapter } = await import('../../src/enforcers/macos-watcher.js');
    expect(SUPPORTED_MACOS_BROWSERS).toContain('Dia');
    const calls: string[][] = [];
    const adapter = new OsascriptBrowserTabAdapter(async (_cmd, args) => {
      calls.push(args as string[]);
      return { stdout: 'Dia\nhttps://exemplo.com/\nTitulo\n', stderr: '' };
    });
    expect(await adapter.getActiveTab()).toEqual({ browser: 'Dia', url: 'https://exemplo.com/', title: 'Titulo' });
    expect(await adapter.redirectActiveTab('Dia', 'http://127.0.0.1:49152/blocked?domain=x.com')).toBe(true);
    expect(calls.map((c) => c[1]).join('\n')).toContain('tell application "Dia"');
  });
});
