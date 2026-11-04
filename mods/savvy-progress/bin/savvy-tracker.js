#!/usr/bin/env node
/**
 * Savvy Progress - Rastreador de Telemetria de Subagentes
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
    return resolve(localCache, 'savvy-telemetry.json');
  } catch {
    const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
    return resolve(tmpdir(), `savvy-telemetry-${hash}.json`);
  }
}

function loadTelemetry() {
  const p = getStoragePath();
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {}
  return {
    agents: {},
    totalToolCalls: 0,
    startedAt: Date.now(),
  };
}

function saveTelemetry(data) {
  const p = getStoragePath();
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
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
  const eventArg = process.argv.find((a, i) => process.argv[i - 1] === '--event') || 'ToolUse';

  const telemetry = loadTelemetry();

  if (stdinData) {
    try {
      const parsed = JSON.parse(stdinData);
      const agentType = parsed.agent_type || parsed.agentId || 'general-helper';
      const toolName = parsed.tool_name || '';

      if (eventArg === 'SubagentStart') {
        telemetry.agents[agentType] = {
          status: 'running',
          startedAt: Date.now(),
          toolCalls: 0,
          model: 'Claude 3.5 Sonnet',
          progress: 10,
        };
      } else if (eventArg === 'SubagentStop') {
        if (telemetry.agents[agentType]) {
          telemetry.agents[agentType].status = 'completed';
          telemetry.agents[agentType].progress = 100;
          telemetry.agents[agentType].completedAt = Date.now();
        }
      } else {
        // ToolUse
        telemetry.totalToolCalls = (telemetry.totalToolCalls || 0) + 1;
        if (telemetry.agents[agentType]) {
          telemetry.agents[agentType].toolCalls = (telemetry.agents[agentType].toolCalls || 0) + 1;
          telemetry.agents[agentType].progress = Math.min(95, telemetry.agents[agentType].progress + 15);
        }
      }
      saveTelemetry(telemetry);
    } catch {}
  }

  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
