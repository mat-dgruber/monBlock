import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compareSemver,
  checkForAppUpdates,
  downloadAppUpdatePkg,
  extractSha256FromText,
} from '../../src/main/updater.js';

describe('AppUpdater (src/main/updater.ts)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-updater-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('compareSemver', () => {
    it('deve comparar corretamente versões SemVer com e sem prefixo "v"', () => {
      expect(compareSemver('v0.8.2', 'v0.8.1')).toBeGreaterThan(0);
      expect(compareSemver('0.8.1', '0.8.2')).toBeLessThan(0);
      expect(compareSemver('v0.8.1', '0.8.1')).toBe(0);
      expect(compareSemver('1.0.0', '0.9.9')).toBeGreaterThan(0);
      expect(compareSemver('0.9.0', '0.8.10')).toBeGreaterThan(0);
      expect(compareSemver('0.8.1', '0.8.1-beta')).toBeGreaterThan(0);
    });
  });

  describe('extractSha256FromText', () => {
    const HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    it('extrai hash em formato GNU (shasum -a 256)', () => {
      const text = `${HASH}  monblock.pkg\n1111111111111111111111111111111111111111111111111111111111111111  outro.pkg`;
      expect(extractSha256FromText(text, 'monblock.pkg')).toBe(HASH);
      expect(extractSha256FromText(text, 'outro.pkg')).toBe('1111111111111111111111111111111111111111111111111111111111111111');
      expect(extractSha256FromText(text, 'inexistente.pkg')).toBeUndefined();
    });

    it('extrai hash em formato BSD (openssl dgst)', () => {
      const text = `SHA256 (monblock.pkg) = ${HASH}`;
      expect(extractSha256FromText(text, 'monblock.pkg')).toBe(HASH);
    });

    it('extrai hash único isolado em arquivo .sha256', () => {
      expect(extractSha256FromText(`  ${HASH}  \n`)).toBe(HASH);
    });

    it('extrai hash com label em markdown/body', () => {
      const text = `### Release v0.9.0\nSHA256: ${HASH}\nDownload below`;
      expect(extractSha256FromText(text, 'monblock.pkg')).toBe(HASH);
    });
  });

  describe('checkForAppUpdates', () => {
    it('deve identificar nova versão disponível e resolver SHA-256 via checksums.txt', async () => {
      const HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      // Arrange
      const mockFetch = vi.fn(async (url: string) => {
        if (url.endsWith('/checksums.txt')) {
          return {
            ok: true,
            status: 200,
            text: async () => `${HASH}  monblockd.pkg\n`,
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tag_name: 'v0.9.0',
            body: 'Novidades da versão 0.9.0',
            assets: [
              {
                name: 'monblockd.pkg',
                browser_download_url: 'https://github.com/org/repo/releases/download/v0.9.0/monblockd.pkg',
              },
              {
                name: 'checksums.txt',
                browser_download_url: 'https://github.com/org/repo/releases/download/v0.9.0/checksums.txt',
              },
            ],
          }),
        } as any;
      });

      // Act
      const result = await checkForAppUpdates({
        currentVersion: '0.8.1',
        repo: 'test/repo',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // Assert
      expect(result.hasUpdate).toBe(true);
      expect(result.latestVersion).toBe('0.9.0');
      expect(result.pkgUrl).toBe('https://github.com/org/repo/releases/download/v0.9.0/monblockd.pkg');
      expect(result.sha256).toBe(HASH);
      expect(result.releaseNotes).toBe('Novidades da versão 0.9.0');
    });

    it('não deve apontar update se a versão remota for menor ou igual à atual', async () => {
      // Arrange
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v0.8.1',
          assets: [],
        }),
      });

      // Act
      const result = await checkForAppUpdates({
        currentVersion: '0.8.1',
        repo: 'test/repo',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // Assert
      expect(result.hasUpdate).toBe(false);
      expect(result.latestVersion).toBe('0.8.1');
    });

    it('deve extrair SHA-256 a partir do corpo da release (fallback)', async () => {
      const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v0.9.5',
          body: `Instalação do monBlock.\nSHA256: ${HASH}`,
          assets: [
            {
              name: 'monblockd.pkg',
              browser_download_url: 'https://github.com/org/repo/releases/download/v0.9.5/monblockd.pkg',
            },
          ],
        }),
      });

      const result = await checkForAppUpdates({
        currentVersion: '0.8.1',
        repo: 'test/repo',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.hasUpdate).toBe(true);
      expect(result.sha256).toBe(HASH);
    });

    it('deve degradar graciosamente se houver falha de rede ou HTTP 403 rate-limit', async () => {
      // Arrange
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'rate limit exceeded',
      });

      // Act
      const result = await checkForAppUpdates({
        currentVersion: '0.8.1',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // Assert
      expect(result.hasUpdate).toBe(false);
      expect(result.error).toContain('403');
    });
  });

  describe('downloadAppUpdatePkg', () => {
    it('deve baixar o pacote, validar hash SHA-256 e salvar no arquivo final', async () => {
      // Arrange
      const payloadContent = Buffer.from('conteudo-do-pacote-pkg-monblock');
      const expectedSha256 = crypto.createHash('sha256').update(payloadContent).digest('hex');
      const exactArrayBuffer = payloadContent.buffer.slice(
        payloadContent.byteOffset,
        payloadContent.byteOffset + payloadContent.byteLength
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': String(payloadContent.length) }),
        arrayBuffer: async () => exactArrayBuffer,
      });

      const progressSpy = vi.fn();

      // Act
      const result = await downloadAppUpdatePkg({
        pkgUrl: 'https://example.com/monblockd.pkg',
        expectedSha256,
        targetDir: tempDir,
        fetchFn: mockFetch as unknown as typeof fetch,
        onProgress: progressSpy,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.pkgPath).toBeDefined();
      expect(fs.existsSync(result.pkgPath!)).toBe(true);
      expect(fs.readFileSync(result.pkgPath!)).toEqual(payloadContent);
      expect(progressSpy).toHaveBeenCalledWith(100);
    });

    it('deve abortar e apagar arquivo temporário se o hash SHA-256 for divergente', async () => {
      // Arrange
      const payloadContent = Buffer.from('conteudo-adulterado');
      const fakeExpectedSha256 = '0000000000000000000000000000000000000000000000000000000000000000';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': String(payloadContent.length) }),
        arrayBuffer: async () => payloadContent.buffer,
      });

      // Act
      const result = await downloadAppUpdatePkg({
        pkgUrl: 'https://example.com/monblockd.pkg',
        expectedSha256: fakeExpectedSha256,
        targetDir: tempDir,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('SHA-256 divergente');
      const filesInDir = fs.readdirSync(tempDir);
      expect(filesInDir.filter((f) => f.endsWith('.pkg') || f.endsWith('.download'))).toHaveLength(0);
    });

    it('deve recusar download de pacote sem expectedSha256 por padrão (Fail-Closed Zero-Trust)', async () => {
      const result = await downloadAppUpdatePkg({
        pkgUrl: 'https://example.com/monblockd.pkg',
        targetDir: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Fail-Closed');
    });

    it('permite download sem hash apenas quando allowUnverified for explicitamente true', async () => {
      const payloadContent = Buffer.from('conteudo-sem-hash');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': String(payloadContent.length) }),
        arrayBuffer: async () => payloadContent.buffer,
      });

      const result = await downloadAppUpdatePkg({
        pkgUrl: 'https://example.com/monblockd.pkg',
        allowUnverified: true,
        targetDir: tempDir,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(true);
      expect(result.pkgPath).toBeDefined();
    });
  });
});
