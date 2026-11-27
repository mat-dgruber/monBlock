import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lookupMonblockGid, resolveLayout, startDaemon, type RunningDaemon } from '../../src/daemon/entry.js';
import { DaemonClient } from '../../src/main/daemon-client.js';

const base = os.tmpdir().length > 40 ? '/tmp' : os.tmpdir(); // sun_path ≤ 104 bytes

let running: RunningDaemon | null = null;
let client: DaemonClient | null = null;
let root = '';
const isWin = process.platform === 'win32';

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
    // Modo POSIX não existe no Windows: lá o DATA_DIR é protegido por ACL (W20).
    if (!isWin) {
      expect(fs.statSync(running.layout.appSupportDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(running.layout.dbDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(running.layout.runDir).mode & 0o777).toBe(0o750);
      expect(fs.statSync(path.join(running.layout.appSupportDir, 'vault.key')).mode & 0o777).toBe(0o600);
    }
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
    const db = running.layout.dbDir;
    await running.close();
    running = null;
    fs.rmSync(db, { recursive: true });
    // No Windows, junction não exige o privilégio de criar link simbólico e o lstat a vê como link.
    fs.symlinkSync(os.tmpdir(), db, isWin ? 'junction' : 'dir');

    // Assert
    expect(sameKey).toBe(true);
    expect(res.status === 200 && 'state' in res && res.state.tamperLockdown).toBeFalsy();
    await expect(startDaemon({ rootDir: root, isRoot: false, blockServerPort: null })).rejects.toThrow(/simbólico/);
  });
});

describe('resolveLayout por plataforma (ADR-0013)', () => {
  it('retorna layout macOS com caminhos padrão darwin', () => {
    const layout = resolveLayout('/', 'darwin');
    expect(layout.appSupportDir).toBe('/Library/Application Support/monBlock');
    expect(layout.dbDir).toBe('/var/db/monblock');
    expect(layout.runDir).toBe('/var/run/monblock');
    expect(layout.socketPath).toBe('/var/run/monblock/monblockd.sock');
    expect(layout.hostsPath).toBe('/etc/hosts');
    expect(layout.chromiumPlistPaths.length).toBeGreaterThan(0);
  });

  it('retorna layout Linux com FHS padrão', () => {
    const layout = resolveLayout('/', 'linux');
    expect(layout.appSupportDir).toBe('/etc/monblock');
    expect(layout.dbDir).toBe('/var/lib/monblock');
    expect(layout.runDir).toBe('/run/monblock');
    expect(layout.socketPath).toBe('/run/monblock/monblockd.sock');
    expect(layout.hostsPath).toBe('/etc/hosts');
    expect(layout.chromiumPlistPaths.length).toBe(5);
    expect(layout.firefoxPlistPath).toBe('/etc/firefox/policies/policies.json');
  });

  it('Windows sem rootDir usa %ProgramData% e %SystemRoot% absolutos (W15)', () => {
    // Act
    const layout = resolveLayout(undefined, 'win32', { ProgramData: 'D:\\PD', SystemRoot: 'E:\\Win' });

    // Assert
    expect(layout.appSupportDir).toBe('D:\\PD\\monBlock');
    expect(layout.dbDir).toBe('D:\\PD\\monBlock\\db');
    expect(layout.runDir).toBe('D:\\PD\\monBlock\\run');
    expect(layout.socketPath).toBe('\\\\.\\pipe\\monblockd');
    expect(layout.hostsPath).toBe('E:\\Win\\System32\\drivers\\etc\\hosts');
  });

  it('Windows sem rootDir e sem variáveis cai nos padrões de C:\\', () => {
    // Act
    const layout = resolveLayout(undefined, 'win32', {});

    // Assert
    expect(layout.appSupportDir).toBe('C:\\ProgramData\\monBlock');
    expect(layout.hostsPath).toBe('C:\\Windows\\System32\\drivers\\etc\\hosts');
  });

  it('Windows com rootDir (dev/CI) monta tudo sob a raiz de teste', () => {
    // Act
    const layout = resolveLayout('C:\\tmp\\root', 'win32', { ProgramData: 'D:\\PD' });

    // Assert
    expect(layout.appSupportDir).toBe('C:\\tmp\\root\\ProgramData\\monBlock');
    expect(layout.hostsPath).toBe('C:\\tmp\\root\\Windows\\System32\\drivers\\etc\\hosts');
  });
});

describe('lookupMonblockGid (Multiplataforma)', () => {
  it('retorna GID no macOS a partir do dscl', () => {
    const mockExec = () => 'PrimaryGroupID: 501\n';
    const gid = lookupMonblockGid('darwin', mockExec);
    expect(gid).toBe(501);
  });

  it('retorna GID no Linux a partir de getent group', () => {
    const mockExec = () => 'monblock:x:1002:user1\n';
    const gid = lookupMonblockGid('linux', mockExec);
    expect(gid).toBe(1002);
  });

  it('retorna undefined em caso de falha ou plataforma win32', () => {
    const mockExecFail = () => {
      throw new Error('Command failed');
    };
    expect(lookupMonblockGid('darwin', mockExecFail)).toBeUndefined();
    expect(lookupMonblockGid('linux', mockExecFail)).toBeUndefined();
    expect(lookupMonblockGid('win32')).toBeUndefined();
  });
});
