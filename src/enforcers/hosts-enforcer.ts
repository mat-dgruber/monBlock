import crypto from 'node:crypto';
import fs from 'node:fs';

// MARK: - Constantes e Allowlist de Infraestrutura Crítica

/**
 * Domínios críticos de infraestrutura e autenticação que jamais podem ser
 * bloqueados no `/etc/hosts` para evitar perda de comunicação com o Ajudante
 * (Telegram) ou travamento de login OAuth/loopback local.
 */
export const CRITICAL_INFRA_ALLOWLIST: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  'api.telegram.org',
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
]);

const START_MARKER = '# >>> MONBLOCK START >>>';
const END_MARKER = '# <<< MONBLOCK END <<<';
const HOSTNAME_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

// MARK: - Escrita Atômica e Rollback do /etc/hosts

/**
 * Aplica de forma atômica o bloqueio de domínios no arquivo `/etc/hosts` (ou caminho equivalente).
 *
 * Preserva integralmente o conteúdo original fora dos delimitadores do monBlock,
 * cria um backup `.monblock.bak` na primeira execução (se o arquivo existir), filtra domínios
 * da allowlist crítica e rejeita entradas com quebras de linha ou sintaxe inválida,
 * grava em arquivo temporário único e executa `fs.renameSync` atômico.
 *
 * @param hostsFilePath Caminho absoluto do arquivo hosts alvo.
 * @param blockedDomains Lista de domínios a serem redirecionados para `0.0.0.0`.
 * @returns Objeto contendo o caminho do backup gerado e a quantidade de domínios aplicados.
 */
/**
 * O `/etc/hosts` precisa ser legível por todos: o mDNSResponder roda sem root e, com 0600, ignora o
 * arquivo inteiro (os sites continuam abrindo). O daemon usa umask 077, então o modo é explícito.
 */
export const HOSTS_FILE_MODE = 0o644;

export function applyAtomicHostsBlock(
  hostsFilePath: string,
  blockedDomains: string[]
): { backupPath: string; writtenCount: number; changed: boolean } {
  const backupPath = `${hostsFilePath}.monblock.bak`;
  const hostsExists = fs.existsSync(hostsFilePath);
  const current = hostsExists ? fs.readFileSync(hostsFilePath, 'utf8') : '';
  const { content: nextContent, writtenCount } = buildManagedHostsContent(current, blockedDomains);

  // Sem mudança, não reescreve: o watchdog reaplica a cada 60 s (ADR-0007).
  if (hostsExists && nextContent === current) {
    return { backupPath, writtenCount, changed: false };
  }

  if (hostsExists && !fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, current, 'utf8');
  }

  const tmpPath = `${hostsFilePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, nextContent, { encoding: 'utf8', mode: HOSTS_FILE_MODE });
    fs.chmodSync(tmpPath, HOSTS_FILE_MODE); // o umask 077 do daemon ignora o `mode` acima
    fs.renameSync(tmpPath, hostsFilePath);
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Ignora erro residual de limpeza
    }
  }

  return { backupPath, writtenCount, changed: true };
}

/**
 * Monta o conteúdo do hosts: linhas do usuário intactas + bloco gerenciado do monBlock.
 * Pura, para que `verifyApplied` compare o disco com o esperado.
 */
export function buildManagedHostsContent(
  current: string,
  blockedDomains: string[]
): { content: string; writtenCount: number } {
  const baseContent = current
    .replace(new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g'), '')
    .trimEnd();

  const safeDomains = Array.from(
    new Set(
      blockedDomains
        .filter((raw) => typeof raw === 'string' && !/[\r\n]/.test(raw))
        .map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
        .filter((d) => d.length > 0 && HOSTNAME_RE.test(d) && !CRITICAL_INFRA_ALLOWLIST.has(d))
    )
  );

  const lines: string[] = [START_MARKER];
  for (const domain of safeDomains) {
    lines.push(`0.0.0.0 ${domain}`);
    lines.push(`0.0.0.0 www.${domain}`);
  }
  lines.push(END_MARKER);

  return { content: `${baseContent}\n\n${lines.join('\n')}\n`, writtenCount: safeDomains.length };
}

/**
 * Restaura atomicamente o arquivo `/etc/hosts` a partir do backup `.monblock.bak`.
 *
 * @param hostsFilePath Caminho absoluto do arquivo hosts alvo.
 * @returns `true` se o backup existia e foi restaurado com sucesso; `false` caso contrário.
 */
export function rollbackHostsFromBackup(hostsFilePath: string): boolean {
  const backupPath = `${hostsFilePath}.monblock.bak`;
  if (!fs.existsSync(backupPath)) return false;
  const tmpPath = `${hostsFilePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.copyFileSync(backupPath, tmpPath);
    fs.chmodSync(tmpPath, HOSTS_FILE_MODE); // o backup nasce 0600 (umask 077); o hosts restaurado precisa ser legível
    fs.renameSync(tmpPath, hostsFilePath);
    return true;
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Ignora erro residual de limpeza
    }
  }
}
