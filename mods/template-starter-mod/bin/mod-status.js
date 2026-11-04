#!/usr/bin/env node
/**
 * Template Starter Mod - Handler do comando /mod-status
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
  bgCyan: '\x1b[46m\x1b[30m',
};

function getStoragePath() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const localCache = resolve(projectDir, '.cache', 'mod-starter-state.json');
  if (existsSync(localCache)) return localCache;
  const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
  const fallback = resolve(tmpdir(), `mod-starter-state-${hash}.json`);
  return fallback;
}

function showStatus() {
  const p = getStoragePath();
  let state = { calls: 0, blocks: 0, lastEvent: 'Nenhum' };

  try {
    if (existsSync(p)) {
      state = JSON.parse(readFileSync(p, 'utf-8'));
    }
  } catch {}

  console.log(`\n${c.bgCyan} ⚡ TEMPLATE STARTER MOD - STATUS ${c.reset}\n`);
  console.log('┌' + '─'.repeat(50) + '┐');
  console.log(`│ ${c.bold}Métrica${c.reset}`.padEnd(28) + `│ ${c.bold}Valor${c.reset}`.padEnd(30) + '│');
  console.log('├' + '─'.repeat(50) + '┤');
  console.log(`│ Total de Invocação de Tools`.padEnd(30) + `│ ${c.green}${state.calls.toString().padEnd(17)}${c.reset}│`);
  console.log(`│ Bloqueios Preventivos`.padEnd(30) + `│ ${c.yellow}${state.blocks.toString().padEnd(17)}${c.reset}│`);
  console.log(`│ Último Evento`.padEnd(30) + `│ ${c.cyan}${state.lastEvent.slice(0, 16).padEnd(17)}${c.reset}│`);
  console.log('└' + '─'.repeat(50) + '┘\n');
}

showStatus();
