#!/usr/bin/env node
/**
 * You Should Know - Assessor de Riscos Ocultos (PreToolUse)
 * Compatível com Claude Code e OpenClaude (Protocolo Stdin/Stdout JSON)
 */

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgYellow: '\x1b[43m\x1b[30m',
};

async function readStdin() {
  if (process.stdin.isTTY) {
    return '';
  }
  return new Promise((res) => {
    let data = '';
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        res(data.trim());
      }
    };
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', done);
    process.stdin.on('error', done);
    const timer = setTimeout(done, 5000);
    timer.unref?.();
  });
}

function detectRisk(toolName, input) {
  if (toolName === 'Bash') {
    const cmd = input.command || '';
    if (cmd.includes('npm publish') || cmd.includes('yarn publish') || cmd.includes('pnpm publish')) {
      return {
        title: 'Publicação de Pacote Detectada',
        detail: 'Este comando publica código em registro público/privado. Certifique-se de que testes passaram e o versionamento semântico está correto.',
      };
    }
    if (cmd.includes('prisma migrate deploy') || cmd.includes('typeorm migration:run')) {
      return {
        title: 'Migração de Banco de Dados em Execução',
        detail: 'Alterações de schema podem causar lock de tabelas ou perda de colunas. Verifique se existe snapshot ou backup recente.',
      };
    }
  }

  if (['Write', 'Edit', 'write_to_file'].includes(toolName)) {
    const target = input.file_path || input.filePath || input.target_file || input.TargetFile || '';
    if (target.includes('.env') && !target.includes('.env.example')) {
      return {
        title: 'Modificação de Arquivo de Segredos (.env)',
        detail: 'Certifique-se de que credenciais e chaves reais não sejam commitadas acidentalmente no controle de versão.',
      };
    }
  }

  return null;
}

async function main() {
  const stdinData = await readStdin();
  if (stdinData) {
    try {
      const parsed = JSON.parse(stdinData);
      const toolName = parsed.tool_name || '';
      const input = parsed.tool_input || {};
      const risk = detectRisk(toolName, input);

      if (risk) {
        process.stderr.write(
          `\n${c.bgYellow} 🔔 YOU SHOULD KNOW: Efeito Colateral / Risco Oculto ${c.reset}\n` +
          `${c.bold}• Atenção:${c.reset} ${c.yellow}${risk.title}${c.reset}\n` +
          `${c.gray}  ${risk.detail}${c.reset}\n\n`
        );
      }
    } catch {}
  }

  // PreToolUse advisory: sai silenciosamente sem emitir stdout para preservar as decisões nativas de permissão
  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
