#!/usr/bin/env node
/**
 * Cache Tax - Monitor de Expiração de Cache de Prompt
 * Compatível com Claude Code e OpenClaude (Protocolo Stdin/Stdout JSON)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  bgYellow: '\x1b[43m\x1b[30m',
  bgGreen: '\x1b[42m\x1b[30m',
  bgRed: '\x1b[41m\x1b[37m',
};

// Preços por milhão de tokens (Anthropic 2026):
// Sonnet 3.5 / 3.7: Base Input $3.00/M, Cache Write $3.75/M, Cache Read $0.30/M (90% desconto!)
const PRICE_INPUT_RAW = 3.00;
const PRICE_CACHE_READ = 0.30;

function getStateFilePath() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const localCache = resolve(projectDir, '.cache');
  try {
    mkdirSync(localCache, { recursive: true });
    return resolve(localCache, 'cache-tax-state.json');
  } catch {
    const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
    return resolve(tmpdir(), `cache-tax-${hash}.json`);
  }
}

function loadState() {
  const filePath = getStateFilePath();
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return { lastTimestamp: Date.now(), keepWarmUntil: 0, turns: 0 };
}

function saveState(state) {
  const filePath = getStateFilePath();
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
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
  const isInit = process.argv.includes('--init');
  const now = Date.now();
  const state = loadState();

  if (isInit) {
    state.lastTimestamp = now;
    state.turns = 0;
    saveState(state);
    process.exit(0);
  }

  const stdinData = await readStdin();
  const rawArg = process.argv[2]?.trim().toLowerCase();

  // O cache de prompt da Anthropic expira em:
  // - 5 minutos para API direta (TTL padrão)
  // - ~60 minutos para sessões de assinatura Claude Pro / Team
  const isApiKey = Boolean(process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_SUBSCRIPTION_ACTIVE);
  const ttlMinutes = isApiKey ? 5 : 60;

  // Invocação interativa direta no terminal (via $keepwarm, $cache-tax ou CLI)
  if (process.stdin.isTTY || rawArg) {
    if (rawArg === 'off') {
      state.keepWarmUntil = 0;
      saveState(state);
      console.log(`\n${c.bgYellow} 🔥 CACHE TAX: Keep-Warm Desativado ${c.reset}`);
      console.log(`${c.gray}O cache voltará a respeitar o TTL padrão de ${ttlMinutes} minutos.${c.reset}\n`);
      process.exit(0);
    }

    if (rawArg && (rawArg.endsWith('m') || !isNaN(Number(rawArg)))) {
      const min = parseInt(rawArg, 10) || 60;
      state.keepWarmUntil = now + min * 60 * 1000;
      saveState(state);
      console.log(`\n${c.bgGreen} 🔥 CACHE TAX: Keep-Warm Ativado por ${min} minutos ${c.reset}`);
      console.log(`${c.bold}• Expiração:${c.reset} ${c.cyan}${new Date(state.keepWarmUntil).toLocaleTimeString()}${c.reset}`);
      console.log(`${c.green}Alertas de cache frio silenciados (o keep-warm não envia requisições: o cache expira no TTL normal).${c.reset}\n`);
      process.exit(0);
    }

    // Painel TUI de telemetria
    const isWarm = Boolean(state.keepWarmUntil && now < state.keepWarmUntil);
    const remainingKeepWarm = isWarm ? Math.ceil((state.keepWarmUntil - now) / 60000) : 0;
    const minutesSinceLast = Math.floor((now - (state.lastTimestamp || now)) / 60000);
    const estimatedSavings = ((state.turns || 1) * 0.175).toFixed(2);

    console.log(`\n${c.bgYellow} ⚡ CACHE TAX - TELEMETRIA DE CACHE DE PROMPT ${c.reset}\n`);
    console.log(`┌────────────────────────────────────────────────────────┐`);
    console.log(`│ ${c.bold}Métrica${c.reset}                    │ ${c.bold}Estado Atual${c.reset}                   │`);
    console.log(`├────────────────────────────────────────────────────────┤`);
    console.log(`│ Status do Cache            │ ${minutesSinceLast < ttlMinutes ? `${c.green}🔥 AQUECIDO (Fresco)${c.reset}     ` : `${c.red}❄️  FRIO (Expirado)   ${c.reset}     `}│`);
    console.log(`│ Modo Keep-Warm             │ ${isWarm ? `${c.green}Ativo (${remainingKeepWarm}m restantes)${c.reset}  ` : `${c.gray}Inativo ($keepwarm 60m)${c.reset} `}│`);
    console.log(`│ Última Interação           │ ${c.cyan}Há ${minutesSinceLast} minuto(s)${c.reset}            │`);
    console.log(`│ TTL Máximo do Provedor     │ ${c.yellow}${ttlMinutes} minutos${c.reset}                  │`);
    console.log(`│ Turnos Registrados         │ ${c.bold}${state.turns || 1}${c.reset} turno(s)                 │`);
    console.log(`│ Economia Estimada          │ ${c.green}~$${estimatedSavings} USD${c.reset}                 │`);
    console.log(`└────────────────────────────────────────────────────────┘`);
    console.log(`\n${c.gray}Comandos rápidos: $keepwarm 60m | $keepwarm off | $cache-tax status${c.reset}\n`);
    process.exit(0);
  }

  const elapsedMs = now - (state.lastTimestamp || now);
  const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

  state.turns = (state.turns || 0) + 1;
  state.lastTimestamp = now;
  saveState(state);

  // Se o keep-warm estiver ativo no momento
  if (state.keepWarmUntil && now < state.keepWarmUntil) {
    const remainingMin = Math.ceil((state.keepWarmUntil - now) / 60000);
    process.stderr.write(`\n${c.bgGreen} 🔥 CACHE TAX: Keep-Warm Ativo (${remainingMin}m restantes) ${c.reset} ${c.gray}alerta de cache frio silenciado${c.reset}\n`);
    process.exit(0);
  }

  // Se excedeu o TTL de expiração
  if (elapsedMinutes >= ttlMinutes && state.turns > 1) {
    const estimatedContextTokens = 65000; // Média estimada de uma conversa ativa
    const coldCost = ((estimatedContextTokens / 1000000) * PRICE_INPUT_RAW).toFixed(3);
    const warmCost = ((estimatedContextTokens / 1000000) * PRICE_CACHE_READ).toFixed(3);
    const diff = (coldCost - warmCost).toFixed(3);

    const alertMessage = [
      `\n${c.bgRed} ❄️ CACHE TAX: O CACHE DE PROMPT ESFRIOU (${elapsedMinutes}m de inatividade) ${c.reset}`,
      `${c.bold}• Tempo inativo:${c.reset} ${c.yellow}${elapsedMinutes} minutos${c.reset} (Limite do TTL: ${ttlMinutes}m)`,
      `${c.bold}• Estimativa de Custo:${c.reset}`,
      `   - Cache Aquecido: ${c.green}~$${warmCost}${c.reset} (90% de desconto via cache read)`,
      `   - Cache Frio (Agora): ${c.red}~$${coldCost}${c.reset} (Re-leitura total do contexto)`,
      `   - Diferença aproximada: ${c.yellow}+$${diff}${c.reset}`,
      `${c.cyan}💡 Dica: Se quiser manter o cache aquecido em pausas futuras, use ${c.bold}/keepwarm 90m${c.reset}\n`,
    ].join('\n');

    process.stderr.write(alertMessage);

    // Retorna mensagem contextual de aviso
    console.log(JSON.stringify({
      systemMessage: `[Cache Tax Alert]: Cache expirou após ${elapsedMinutes}m. Este turno reprocessará contexto frio (~$${coldCost}).`,
    }));
    process.exit(0);
  }

  // Cache aquecido normal
  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
