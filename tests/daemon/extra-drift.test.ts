import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MonBlockDaemon } from '../../src/daemon/monblockd.js';
import type { PlatformEnforcer } from '../../src/enforcers/platform-enforcer.js';
import { TripleStateStore } from '../../src/storage/state-store.js';

let dir = '';
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function build(extraDrift?: () => string[]) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-xdrift-'));
  const store = new TripleStateStore({
    primaryPath: path.join(dir, 'a'),
    keychainPath: path.join(dir, 'b'),
    sealPath: path.join(dir, 'c'),
    integrityKey: 'k',
  });
  const enforcer = {
    applyWebRules: async () => ({}),
    verifyApplied: () => ['hosts'],
    protectCriticalPaths: async (p: string[]) => p,
    restoreSystemCleanState: async () => undefined,
  } as unknown as PlatformEnforcer;
  return new MonBlockDaemon({ store, enforcer, nowFn: () => 1_700_000_000_000, extraDrift });
}

describe('MonBlockDaemon: drift fora do enforcer (W4, ipc:dacl)', () => {
  it('soma o drift extra ao do enforcer no watchdog', async () => {
    // Arrange
    const d = build(() => ['ipc:dacl']);

    // Act
    const { drift } = await d.tick();

    // Assert
    expect(drift).toEqual(['hosts', 'ipc:dacl']);
  });

  it('sem fonte extra o drift é só o do enforcer', async () => {
    // Act
    const { drift } = await build().tick();

    // Assert
    expect(drift).toEqual(['hosts']);
  });
});
