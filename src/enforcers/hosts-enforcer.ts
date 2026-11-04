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

// MARK: - Escrita Atômica e Rollback do /etc/hosts

/**
 * Aplica de forma atômica o bloqueio de domínios no arquivo `/etc/hosts` (ou caminho equivalente).
 *
 * Preserva integralmente o conteúdo original fora dos delimitadores do monBlock,
 * cria um backup `.monblock.bak` na primeira execução, filtra domínios da allowlist
 * crítica, grava em arquivo temporário `.monblock.tmp` e executa `fs.renameSync` atômico.
 *
 * @param hostsFilePath Caminho absoluto do arquivo hosts alvo.
 * @param blockedDomains Lista de domínios a serem redirecionados para `0.0.0.0`.
 * @returns Objeto contendo o caminho do backup gerado e a quantidade de domínios aplicados.
 */
export function applyAtomicHostsBlock(
  hostsFilePath: string,
  blockedDomains: string[]
): { backupPath: string; writtenCount: number } {
  const backupPath = `${hostsFilePath}.monblock.bak`;
  const tmpPath = `${hostsFilePath}.monblock.tmp`;
  const current = fs.existsSync(hostsFilePath) ? fs.readFileSync(hostsFilePath, 'utf8') : '';

  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, current, 'utf8');
  }

  const baseContent = current
    .replace(new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g'), '')
    .trimEnd();

  const safeDomains = Array.from(
    new Set(
      blockedDomains
        .map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
        .filter((d) => d && !CRITICAL_INFRA_ALLOWLIST.has(d))
    )
  );

  const lines: string[] = [START_MARKER];
  for (const domain of safeDomains) {
    lines.push(`0.0.0.0 ${domain}`);
    lines.push(`0.0.0.0 www.${domain}`);
  }
  lines.push(END_MARKER);

  const nextContent = `${baseContent}\n\n${lines.join('\n')}\n`;
  fs.writeFileSync(tmpPath, nextContent, 'utf8');
  fs.renameSync(tmpPath, hostsFilePath);

  return { backupPath, writtenCount: safeDomains.length };
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
  const tmpPath = `${hostsFilePath}.monblock.rollback.tmp`;
  fs.copyFileSync(backupPath, tmpPath);
  fs.renameSync(tmpPath, hostsFilePath);
  return true;
}
