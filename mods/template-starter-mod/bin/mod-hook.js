#!/usr/bin/env node
/**
 * Template Starter Mod - Hook Handler Canônico
 * Demonstração de interceptação de ferramentas, validação e persistência de estado.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

function getStoragePath() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const localCache = resolve(projectDir, '.cache');
  try {
    mkdirSync(localCache, { recursive: true });
    return resolve(localCache, 'mod-starter-state.json');
  } catch {
    const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
    return resolve(tmpdir(), `mod-starter-state-${hash}.json`);
  }
}

function loadState() {
  const p = getStoragePath();
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {}
  return { calls: 0, blocks: 0, lastEvent: 'Init' };
}

function saveState(s) {
  const p = getStoragePath();
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(s, null, 2), 'utf-8');
  } catch {}
}

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

async function main() {
  const stdinData = await readStdin();
  const state = loadState();
  state.calls++;

  if (stdinData) {
    try {
      const parsed = JSON.parse(stdinData);
      const toolName = parsed.tool_name || '';
      const input = parsed.tool_input || {};

      // Exemplo de regra de segurança personalizada:
      if (toolName === 'Bash' && input.command && input.command.includes(':(){ :|:& };:')) {
        state.blocks++;
        state.lastEvent = 'Bloqueado Fork Bomb';
        saveState(state);

        console.log(JSON.stringify({
          decision: 'block',
          reason: 'Fork bomb interceptado preventivamente pelo Template Starter Mod.',
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
          },
        }));
        process.exit(0);
      }

      state.lastEvent = `${toolName} (${new Date().toLocaleTimeString()})`;
    } catch {}
  }

  saveState(state);
  // Sai silenciosamente sem stdout para não interferir nas permissões do harness
  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
