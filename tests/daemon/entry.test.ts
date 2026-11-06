import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon, type RunningDaemon } from '../../src/daemon/entry.js';
import { DaemonClient } from '../../src/main/daemon-client.js';

const base = os.tmpdir().length > 40 ? '/tmp' : os.tmpdir(); // sun_path ≤ 104 bytes

let running: RunningDaemon | null = null;
let client: DaemonClient | null = null;
let root = '';

afterEach(async () => {
  client?.close();
  await running?.close();
  running = null;
  fs.rmSync(root, { recursive: true, force: true });
});

const waitOnline = async (c: DaemonClient) => {
  const end = Date.now() + 2000;
  while (c.status !== 'online') {
    if (Date.now() > end) throw new Error('cliente não conectou');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('entry do monblockd (modo dev, sem root)', () => {
  it('sobe com o layout da spec, aplica regras no boot e responde pelo socket', async () => {
    // Arrange
    root = fs.mkdtempSync(path.join(base, 'mbd-'));

    // Act
    running = await startDaemon({ rootDir: root, isRoot: false, tickMs: 60_000, blockServerPort: null });
    client = new DaemonClient({ socketPath: running.layout.socketPath });
    await waitOnline(client);
    const res = await client.call({ type: 'GET_STATE' });

    // Assert
    expect(res.status).toBe(200);
    expect(fs.readFileSync(running.layout.hostsPath, 'utf8')).toContain('# >>> MONBLOCK START >>>');
    expect(fs.statSync(running.layout.appSupportDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(running.layout.dbDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(running.layout.runDir).mode & 0o777).toBe(0o750);
    expect(fs.statSync(path.join(running.layout.appSupportDir, 'vault.key')).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(running.layout.dbDir, 'state.mirror'))).toBe(true);
  });

  it('reinício reusa a chave e o estado; recusa diretório que é link simbólico', async () => {
    // Arrange
    root = fs.mkdtempSync(path.join(base, 'mbd-'));
    running = await startDaemon({ rootDir: root, isRoot: false, blockServerPort: null });
    const keyPath = path.join(running.layout.appSupportDir, 'vault.key');
    const key = fs.readFileSync(keyPath, 'utf8');
    await running.close();

    // Act
    running = await startDaemon({ rootDir: root, isRoot: false, blockServerPort: null });
    client = new DaemonClient({ socketPath: running.layout.socketPath });
    await waitOnline(client);
    const res = await client.call({ type: 'GET_STATE' });
    const sameKey = fs.readFileSync(keyPath, 'utf8') === key;
    await running.close();
    running = null;
    const db = path.join(root, 'var/db/monblock');
    fs.rmSync(db, { recursive: true });
    fs.symlinkSync(os.tmpdir(), db);

    // Assert
    expect(sameKey).toBe(true);
    expect(res.status === 200 && 'state' in res && res.state.tamperLockdown).toBeFalsy();
    await expect(startDaemon({ rootDir: root, isRoot: false, blockServerPort: null })).rejects.toThrow(/simbólico/);
  });
});
