import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIpcServer, type IpcServer } from '../../src/daemon/ipc-server.js';
import { pipeAclHook } from '../../src/daemon/pipe-acl.js';

const socketPath = () =>
  process.platform === 'win32'
    ? `\\\\.\\pipe\\mb-dacl-${crypto.randomBytes(4).toString('hex')}`
    : path.join(fs.mkdtempSync(path.join(os.tmpdir().length > 40 ? '/tmp' : os.tmpdir(), 'mbd-')), 'd.sock');

let server: IpcServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const handle = async () => ({ status: 200 as const, state: {} as never });

describe('ipc-server: DACL aplicada depois do listen (W4)', () => {
  it('chama o secureListen com o caminho já escutando e marca ok', async () => {
    // Arrange
    const p = socketPath();
    const secureListen = vi.fn(async () => true);

    // Act
    server = await createIpcServer({ socketPath: p, handle, secureListen });

    // Assert
    expect(secureListen).toHaveBeenCalledWith(p);
    expect(server.aclStatus()).toBe('ok');
  });

  it('falha do helper deixa o pipe no padrão (fail-closed) e marca failed, sem derrubar o servidor', async () => {
    // Arrange / Act
    server = await createIpcServer({ socketPath: socketPath(), handle, secureListen: async () => false });

    // Assert
    expect(server.aclStatus()).toBe('failed');
    expect(server.connections()).toBe(0);
  });

  it('exceção no helper também vira failed', async () => {
    // Act
    server = await createIpcServer({
      socketPath: socketPath(),
      handle,
      secureListen: async () => {
        throw new Error('spawn');
      },
    });

    // Assert
    expect(server.aclStatus()).toBe('failed');
  });

  it('sem secureListen (macOS/Linux) o status é not-applicable', async () => {
    // Act
    server = await createIpcServer({ socketPath: socketPath(), handle });

    // Assert
    expect(server.aclStatus()).toBe('not-applicable');
  });
});

describe('pipeAclHook', () => {
  it('passa só o nome do pipe ao helper e exige {"ok":true}', async () => {
    // Arrange
    const run = vi.fn(async () => ({ ok: true }));

    // Act
    const ok = await pipeAclHook('C:\\Program Files\\monBlock\\pipe-acl.ps1', run)('\\\\.\\pipe\\monblockd');

    // Assert
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledWith('C:\\Program Files\\monBlock\\pipe-acl.ps1', ['-PipeName', 'monblockd']);
  });

  it('saída vazia, ok:false ou ok não booleano não contam como sucesso', async () => {
    for (const out of [null, { ok: false }, { ok: 'true' }]) {
      expect(await pipeAclHook('x.ps1', async () => out)('\\\\.\\pipe\\monblockd')).toBe(false);
    }
  });

  it('recusa caminho que não é named pipe', async () => {
    // Arrange
    const run = vi.fn(async () => ({ ok: true }));

    // Act / Assert
    expect(await pipeAclHook('x.ps1', run)('/var/run/monblock/monblockd.sock')).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
