#!/usr/bin/env node
/**
 * Replay Theater - Visualizador de Diffs e Auditoria no Terminal
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgMagenta: '\x1b[45m\x1b[37m',
};

function getHistoryPath() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const localCache = resolve(projectDir, '.cache', 'replay-history.json');
  if (existsSync(localCache)) return localCache;
  const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
  const fallback = resolve(tmpdir(), `replay-history-${hash}.json`);
  return fallback;
}

function getRecentFiles() {
  const p = getHistoryPath();
  try {
    if (existsSync(p)) {
      const list = JSON.parse(readFileSync(p, 'utf-8'));
      // Remove duplicatas preservando os mais recentes
      const unique = [...new Set(list.map((item) => item.file))];
      return unique;
    }
  } catch {}
  return [];
}

function showDiffs() {
  const files = getRecentFiles();

  console.log(`\n${c.bgMagenta} 🎬 REPLAY THEATER - AUDITOR DE DIFFS DE SESSÃO ${c.reset}\n`);

  if (files.length === 0) {
    console.log(`${c.gray}Nenhum arquivo modificado recentemente registrado nesta sessão.${c.reset}`);
    try {
      const gitStatus = execSync('git status --short', { encoding: 'utf-8' }).trim();
      if (gitStatus) {
        console.log(`\n${c.bold}Alterações pendentes no Git:${c.reset}`);
        console.log(gitStatus);
      }
    } catch {}
    return;
  }

  console.log(`${c.bold}Arquivos modificados registrados (${files.length}):${c.reset}`);
  files.forEach((f, idx) => {
    console.log(`  ${c.cyan}[${idx + 1}]${c.reset} ${f}`);
  });

  console.log('\n' + '─'.repeat(60) + '\n');

  try {
    const diffOutput = execSync('git diff --color=always', { encoding: 'utf-8' });
    if (diffOutput.trim()) {
      console.log(diffOutput);
    } else {
      console.log(`${c.yellow}Nenhum diff não-commitado pendente no Git para esses arquivos.${c.reset}`);
    }
  } catch (err) {
    console.log(`${c.red}Não foi possível obter git diff: ${err.message}${c.reset}`);
  }
}

showDiffs();
