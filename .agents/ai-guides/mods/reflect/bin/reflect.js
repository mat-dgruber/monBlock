#!/usr/bin/env node
/**
 * Reflect - Detector de Regras e Convenções do Usuário
 * Compatível com Claude Code e OpenClaude (Protocolo Stdin/Stdout JSON)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m\x1b[37m',
  bgGreen: '\x1b[42m\x1b[30m',
};

function getStoragePath() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const localCache = resolve(projectDir, '.cache');
  try {
    mkdirSync(localCache, { recursive: true });
    return resolve(localCache, 'reflect-rules.json');
  } catch {
    const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
    return resolve(tmpdir(), `reflect-rules-${hash}.json`);
  }
}

function loadCandidateRules() {
  const filePath = getStoragePath();
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveCandidateRules(rules) {
  const filePath = getStoragePath();
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(rules, null, 2), 'utf-8');
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

const CORRECTION_PATTERNS = [
  /não use\s+(.+)/i,
  /nunca use\s+(.+)/i,
  /sempre use\s+(.+)/i,
  /aqui usamos\s+(.+)/i,
  /regra:\s*(.+)/i,
  /convenção:\s*(.+)/i,
  /don't use\s+(.+)/i,
  /never use\s+(.+)/i,
  /always use\s+(.+)/i,
  /in this project we use\s+(.+)/i,
];

function extractRule(text) {
  if (!text || typeof text !== 'string') return null;
  for (const regex of CORRECTION_PATTERNS) {
    const match = text.match(regex);
    // Pergunta ("por que você sempre use X?") não é convenção declarada
    if (match && !match[0].trim().endsWith('?')) {
      return match[0].trim();
    }
  }
  return null;
}

async function main() {
  const stdinData = await readStdin();
  let promptText = '';

  if (stdinData) {
    try {
      const parsed = JSON.parse(stdinData);
      promptText = parsed.prompt || parsed.text || parsed.user_prompt || '';
    } catch {
      promptText = stdinData;
    }
  } else if (process.argv[2]) {
    promptText = process.argv.slice(2).join(' ');
  }

  if (!promptText) {
    process.exit(0);
  }

  const detected = extractRule(promptText);

  if (detected) {
    const candidates = loadCandidateRules();
    const cleanRule = detected.charAt(0).toUpperCase() + detected.slice(1);

    if (!candidates.some((r) => r.rule.toLowerCase() === cleanRule.toLowerCase())) {
      candidates.push({
        rule: cleanRule,
        rawPrompt: promptText.slice(0, 150),
        detectedAt: new Date().toISOString(),
      });
      saveCandidateRules(candidates);

      // Notificação visual no stderr
      process.stderr.write(
        `\n${c.bgBlue} 💡 REFLECT: Nova convenção de projeto identificada ${c.reset}\n` +
        `${c.bold}• Regra sugerida:${c.reset} ${c.green}"${cleanRule}"${c.reset}\n` +
        `${c.cyan}👉 Use ${c.bold}/reflect-status${c.reset}${c.cyan} para auditar e salvar em CLAUDE.md / AGENTS.md${c.reset}\n\n`
      );

      console.log(JSON.stringify({
        systemMessage: `[Reflect Memory]: Usuário expressou preferência explícita: "${cleanRule}". Siga rigorosamente esta convenção.`,
      }));
      process.exit(0);
    }
  }

  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
