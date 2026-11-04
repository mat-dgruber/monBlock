#!/usr/bin/env node
/**
 * Next Steps - Sugestor Preditivo de Próximos Prompts
 * Compatível com Claude Code e OpenClaude (Protocolo Stdin/Stdout JSON)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
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

function getRecentGitContext() {
  try {
    const gitHead = resolve(process.cwd(), '.git/HEAD');
    if (existsSync(gitHead)) {
      return 'git-repo';
    }
  } catch {}
  return 'workspace';
}

function generateDefaultSuggestions() {
  return [
    { label: 'rodar testes automatizados', prompt: 'executar a suíte de testes e validar alterações' },
    { label: 'revisar diff com code-review', prompt: '/code-review' },
    { label: 'commitar e documentar', prompt: '/commit-e-documentar' },
  ];
}

async function main() {
  const stdinData = await readStdin();
  let eventPayload = null;

  if (stdinData) {
    try {
      eventPayload = JSON.parse(stdinData);
    } catch {
      // payload em texto livre
    }
  }

  const suggestions = generateDefaultSuggestions();

  if (process.argv.includes('--status') || process.argv.includes('--json')) {
    console.log(JSON.stringify({ status: 'active', suggestions }, null, 2));
    process.exit(0);
  }

  // Renderização visual no terminal
  process.stderr.write(`\n${c.cyan}${c.bold}⚡ Next Steps Suggester${c.reset} ${c.gray}(Pressione o número ou clique)${c.reset}\n`);
  suggestions.forEach((item, idx) => {
    process.stderr.write(`  ${c.yellow}${idx + 1}:${c.reset} ${c.bold}${item.label}${c.reset} ${c.gray}→ ${item.prompt}${c.reset}\n`);
  });
  process.stderr.write(`  ${c.gray}0: dispensar sugestões${c.reset}\n\n`);

  console.log(JSON.stringify({ suggestions }));
  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
