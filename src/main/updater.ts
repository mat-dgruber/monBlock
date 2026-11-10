/**
 * Módulo de Atualização In-App do monBlock no macOS (`src/main/updater.ts`).
 *
 * Responsável por:
 * - Consultar a API de Releases do GitHub via HTTPS
 * - Comparar versões SemVer
 * - Baixar o instalador `.pkg` para a pasta temporária de forma atômica
 * - Validar a integridade criptográfica SHA-256 antes da disponibilização
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  pkgUrl?: string;
  sha256?: string;
  error?: string;
}

export interface CheckForUpdatesOptions {
  currentVersion: string;
  repo?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface DownloadUpdateOptions {
  pkgUrl: string;
  expectedSha256?: string;
  allowUnverified?: boolean;
  targetDir?: string;
  fetchFn?: typeof fetch;
  onProgress?: (percent: number) => void;
}

export interface DownloadUpdateResult {
  success: boolean;
  pkgPath?: string;
  error?: string;
}

/**
 * Extrai o hash SHA-256 (64 hex) correspondente a um arquivo a partir de texto.
 * Suporta:
 * 1. Formato GNU (shasum -a 256): `<hash>  <filename>` ou `<hash> *<filename>`
 * 2. Formato BSD (openssl dgst -sha256): `SHA256 (<filename>) = <hash>`
 * 3. Arquivo contendo exclusivamente o hash: `^[a-fA-F0-9]{64}$`
 * 4. Padrões comuns em notas de release: `sha256:\s*([a-fA-F0-9]{64})` ou linha contendo o filename e hash
 */
export function extractSha256FromText(text: string, filename?: string): string | undefined {
  if (!text || typeof text !== 'string') return undefined;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const targetName = filename ? path.basename(filename).toLowerCase() : undefined;

  // 1. Procura linha a linha se temos um targetName
  if (targetName) {
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (!lowerLine.includes(targetName)) continue;

      // GNU format: <hash>  <filename>
      const gnuMatch = line.match(/^([a-fA-F0-9]{64})\s+[* ]?(?:.*\/)?([^\s/]+)/);
      if (gnuMatch && gnuMatch[2]?.toLowerCase() === targetName) {
        return gnuMatch[1]!.toLowerCase();
      }

      // BSD format: SHA256 (<filename>) = <hash>
      const bsdMatch = line.match(/SHA256\s*\((?:.*\/)?([^)]+)\)\s*=\s*([a-fA-F0-9]{64})/i);
      if (bsdMatch && bsdMatch[1]?.toLowerCase() === targetName) {
        return bsdMatch[2]!.toLowerCase();
      }

      // Linha genérica contendo o nome e 64 hex chars
      const genericHash = line.match(/\b([a-fA-F0-9]{64})\b/);
      if (genericHash) {
        return genericHash[1]!.toLowerCase();
      }
    }
  }

  // 2. Se o arquivo for apenas o hash (ou tiver 1 hash isolado)
  const singleHashMatch = text.trim().match(/^([a-fA-F0-9]{64})$/);
  if (singleHashMatch) {
    return singleHashMatch[1]!.toLowerCase();
  }

  // 3. Fallback: procurar rótulos explícitos como "sha256: <hash>" ou "SHA-256: <hash>"
  const labeledMatch = text.match(/(?:sha-?256|checksum)[\s:=]+([a-fA-F0-9]{64})/i);
  if (labeledMatch) {
    return labeledMatch[1]!.toLowerCase();
  }

  return undefined;
}

/**
 * Compara duas versões SemVer simples (com suporte a sufixo pré-release e prefixo 'v').
 * Retorna:
 * > 0 se v1 > v2
 * < 0 se v1 < v2
 * 0 se v1 == v2
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) => {
    const clean = v.trim().replace(/^v/i, '');
    const [main, pre] = clean.split('-');
    const parts = (main || '').split('.').map((n) => Number.parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return { parts, isPre: Boolean(pre) };
  };

  const p1 = parse(v1);
  const p2 = parse(v2);

  for (let i = 0; i < 3; i++) {
    const diff = (p1.parts[i] || 0) - (p2.parts[i] || 0);
    if (diff !== 0) return diff;
  }

  if (p1.isPre && !p2.isPre) return -1;
  if (!p1.isPre && p2.isPre) return 1;

  return 0;
}

/**
 * Consulta o endpoint público de releases do GitHub com timeout e proteção contra rate-limit.
 */
export async function checkForAppUpdates(options: CheckForUpdatesOptions): Promise<UpdateCheckResult> {
  const { currentVersion, repo = 'matheus-diniz/monBlock', fetchFn = fetch, timeoutMs = 10_000 } = options;

  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': `monBlock/${currentVersion}`,
      },
    });

    if (!response.ok) {
      return {
        hasUpdate: false,
        currentVersion,
        error: `HTTP ${response.status} ao consultar releases (${response.statusText})`,
      };
    }

    const data = (await response.json()) as {
      tag_name?: string;
      body?: string;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };

    const latestTag = data.tag_name || '';
    const latestClean = latestTag.replace(/^v/i, '');
    const currentClean = currentVersion.replace(/^v/i, '');

    const hasUpdate = Boolean(latestClean) && compareSemver(latestClean, currentClean) > 0;

    let pkgUrl: string | undefined;
    let pkgFilename: string | undefined;
    let sha256: string | undefined;

    if (Array.isArray(data.assets)) {
      const pkgAsset = data.assets.find((a) => a.name.endsWith('.pkg'));
      if (pkgAsset) {
        pkgUrl = pkgAsset.browser_download_url;
        pkgFilename = pkgAsset.name;

        // Procura asset de checksum dedicado
        const checksumAsset = data.assets.find((a) => {
          const lower = a.name.toLowerCase();
          return (
            lower === `${pkgAsset.name.toLowerCase()}.sha256` ||
            lower === 'checksums.txt' ||
            lower === 'sha256sums' ||
            lower === 'sha256sums.txt' ||
            lower.endsWith('.sha256')
          );
        });

        if (checksumAsset?.browser_download_url) {
          try {
            const csRes = await fetchFn(checksumAsset.browser_download_url, {
              signal: controller.signal,
              headers: { 'User-Agent': `monBlock/${currentVersion}` },
            });
            if (csRes.ok) {
              const csText = await csRes.text();
              sha256 = extractSha256FromText(csText, pkgFilename);
            }
          } catch {
            // Falha tolerante na leitura do asset de checksum, prossegue para fallback
          }
        }
      }
    }

    // Fallback: tentar extrair do corpo da release se ainda não resolveu
    if (!sha256 && data.body) {
      sha256 = extractSha256FromText(data.body, pkgFilename);
    }

    return {
      hasUpdate,
      currentVersion,
      latestVersion: latestClean || undefined,
      releaseNotes: data.body || undefined,
      pkgUrl,
      sha256,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      hasUpdate: false,
      currentVersion,
      error: `Falha de rede ao verificar atualizações: ${msg}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Realiza o download assistido do arquivo `.pkg` oficial, validando o hash SHA-256.
 */
export async function downloadAppUpdatePkg(options: DownloadUpdateOptions): Promise<DownloadUpdateResult> {
  const {
    pkgUrl,
    expectedSha256,
    allowUnverified = false,
    targetDir = os.tmpdir(),
    fetchFn = fetch,
    onProgress,
  } = options;

  // Política estrita Fail-Closed: se não há SHA-256 e unverified não foi explicitamente consentido, recusa
  if (!expectedSha256 && !allowUnverified) {
    return {
      success: false,
      error: 'Atualização recusada (Fail-Closed Zero-Trust): a release não possui assinatura de integridade SHA-256 verificável.',
    };
  }

  const filename = path.basename(pkgUrl.split('?')[0] || 'monblock-update.pkg');
  const tempPath = path.join(targetDir, `${filename}.${Date.now()}.download`);
  const finalPath = path.join(targetDir, filename);

  try {
    const response = await fetchFn(pkgUrl, {
      headers: { 'User-Agent': 'monBlock-Updater' },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status} ao baixar pacote (${response.statusText})`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validação criptográfica do hash SHA-256
    const calculatedHash = crypto.createHash('sha256').update(buffer).digest('hex');

    if (expectedSha256) {
      const cleanExpected = expectedSha256.trim().toLowerCase();
      if (calculatedHash !== cleanExpected) {
        return {
          success: false,
          error: `Integridade comprometida: SHA-256 divergente (calculado: ${calculatedHash}, esperado: ${cleanExpected})`,
        };
      }
    }

    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, finalPath);

    if (typeof onProgress === 'function') {
      onProgress(100);
    }

    return {
      success: true,
      pkgPath: finalPath,
    };
  } catch (err: unknown) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignora falha de limpeza
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Erro ao transferir arquivo: ${msg}`,
    };
  }
}

