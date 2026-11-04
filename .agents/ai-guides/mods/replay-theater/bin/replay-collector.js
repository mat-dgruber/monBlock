#!/usr/bin/env node
/**
 * Replay Theater - Coletor de Modificações de Arquivo (PostToolUse)
 * Compatível com Claude Code e OpenClaude (Protocolo Stdin/Stdout JSON)
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
    return resolve(localCache, 'replay-history.json');
  } catch {
    const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
    return resolve(tmpdir(), `replay-history-${hash}.json`);
  }
}

function loadHistory() {
  const filePath = getStoragePath();
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveHistory(history) {
  const filePath = getStoragePath();
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
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
  if (stdinData) {
    try {
      const parsed = JSON.parse(stdinData);
      const toolName = parsed.tool_name || '';
      const input = parsed.tool_input || {};
      const targetFile = input.file_path || input.filePath || input.target_file || input.TargetFile || '';

      if (targetFile) {
        const history = loadHistory();
        history.push({
          tool: toolName,
          file: targetFile,
          timestamp: Date.now(),
        });
        // Mantém apenas os últimos 50 eventos
        if (history.length > 50) history.shift();
        saveHistory(history);
      }
    } catch {}
  }

  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
