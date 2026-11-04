#!/usr/bin/env node
/**
 * Savvy Progress - Painel de Telemetria de Subagentes
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
  bgCyan: '\x1b[46m\x1b[30m',
};

function getStoragePath() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const localCache = resolve(projectDir, '.cache', 'savvy-telemetry.json');
  if (existsSync(localCache)) return localCache;
  const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
  const fallback = resolve(tmpdir(), `savvy-telemetry-${hash}.json`);
  return fallback;
}

function renderBar(percent) {
  const total = 12;
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.min(total, Math.max(0, Math.round((clamped / 100) * total)));
  return '█'.repeat(filled) + '░'.repeat(total - filled);
}

function showPanel() {
  const p = getStoragePath();
  let data = null;

  try {
    if (existsSync(p)) {
      data = JSON.parse(readFileSync(p, 'utf-8'));
    }
  } catch {}

  console.log(`\n${c.bgCyan} 🦀 SAVVY PROGRESS - TELEMETRIA DE SUBAGENTES ${c.reset}\n`);

  if (!data || !data.agents || Object.keys(data.agents).length === 0) {
    console.log(`${c.gray}Nenhum subagente ativo registrado nesta sessão.${c.reset}`);
    console.log(`${c.gray}As estatísticas serão atualizadas automaticamente quando tarefas paralelas forem iniciadas.${c.reset}\n`);
    return;
  }

  const entries = Object.entries(data.agents);
  console.log('┌' + '─'.repeat(70) + '┐');
  console.log(`│ ${c.bold}Agente${c.reset}`.padEnd(30) + `│ ${c.bold}Status${c.reset}`.padEnd(16) + `│ ${c.bold}Progresso${c.reset}`.padEnd(20) + `│ ${c.bold}Calls${c.reset} │`);
  console.log('├' + '─'.repeat(70) + '┤');

  entries.forEach(([name, info]) => {
    const statusCol = info.status === 'completed' ? `${c.green}Concluído${c.reset}` : `${c.yellow}Executando${c.reset}`;
    const bar = `[${renderBar(info.progress)}] ${info.progress}%`;
    const calls = (info.toolCalls || 0).toString().padStart(4);
    console.log(`│ ${c.cyan}${name.slice(0, 20).padEnd(20)}${c.reset} │ ${statusCol.padEnd(20)} │ ${bar.padEnd(17)} │ ${calls} │`);
  });

  console.log('└' + '─'.repeat(70) + '┘');
  console.log(`${c.gray}Total de chamadas de ferramentas registradas: ${data.totalToolCalls || 0}${c.reset}\n`);
}

showPanel();
