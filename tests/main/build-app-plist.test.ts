import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('build-app.sh: permissão de Automação (watcher de palavras-chave)', () => {
  it('declara NSAppleEventsUsageDescription; sem ela o macOS nega os Apple Events sem perguntar', () => {
    const sh = fs.readFileSync(path.resolve(__dirname, '../../scripts/build-app.sh'), 'utf8');
    expect(sh).toContain('NSAppleEventsUsageDescription');
  });
});
