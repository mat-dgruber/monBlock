#!/usr/bin/env node
/**
 * Blast Radius - Engine de Proteção Pré-Execução
 * Compatível com Claude Code e OpenClaude (Protocolo Stdin/Stdout JSON)
 */

import { existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, normalize, basename } from 'node:path';
import { execSync } from 'node:child_process';

// Cores ANSI para saída no terminal
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m\x1b[37m',
  bgYellow: '\x1b[43m\x1b[30m',
};

// Comandos informativos/seguros que não devem disparar falso positivo
const SAFE_COMMANDS = [
  'echo',
  'printf',
  'cat',
  'grep',
  'rg',
  'git log',
  'git show',
  'git status',
  'git diff',
];

// Lê entrada de stdin de forma síncrona/assíncrona
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
        res(data.trim());
      }
    };
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', done);
    process.stdin.on('error', done);
    const timer = setTimeout(done, 3000);
    timer.unref?.();
  });
}

function countFilesAndSize(dirPath) {
  let count = 0;
  let totalBytes = 0;
  const sampleFiles = [];
  const maxDepth = 4;
  const maxFiles = 5000;
  const IGNORE_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '.cache', 'dist', 'build', '.next']);

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  try {
    const rootStat = statSync(dirPath);
    if (rootStat.isFile()) {
      return { count: 1, sizeStr: formatBytes(rootStat.size), sampleFiles: [basename(dirPath)] };
    }
  } catch {
    return { count: 0, sizeStr: '0 B', sampleFiles: [] };
  }

  function traverse(current, depth = 0) {
    if (depth > maxDepth || count >= maxFiles) return;
    try {
      const entries = readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (count >= maxFiles) break;
        const full = resolve(current, entry.name);
        try {
          if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) continue;
            traverse(full, depth + 1);
          } else if (entry.isFile()) {
            count++;
            const stats = statSync(full);
            totalBytes += stats.size;
            if (sampleFiles.length < 5) {
              sampleFiles.push(entry.name);
            }
          }
        } catch {
          // Permissão negada ou link quebrado
        }
      }
    } catch {
      // Ignora erro de leitura
    }
  }

  traverse(dirPath);

  return { count, sizeStr: formatBytes(totalBytes), sampleFiles };
}

// Divide comando em pipelines e encadeamentos respeitando aspas
function splitCommands(command) {
  const parts = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const next = command[i + 1];

    if (char === '\\' && inDouble) {
      current += char + (next || '');
      i++;
    } else if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
    } else if (!inSingle && !inDouble && ((char === '&' && next === '&') || (char === '|' && next === '|'))) {
      parts.push(current);
      current = '';
      i++;
    } else if (!inSingle && !inDouble && (char === ';' || char === '|')) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function analyzeCommand(command) {
  if (!command || typeof command !== 'string') return null;

  const patterns = [
    {
      type: 'Deleção Recursiva Forçada (rm -rf)',
      check: /\brm\b.*(?:-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR]|-(?:r|R)\b.*-f\b|-f\b.*-(?:r|R)\b|--recursive|--force)/,
      extractTarget: (subcmd) => {
        const tokens = subcmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        const rmIdx = tokens.findIndex((t) => t === 'rm' || t.endsWith('/rm'));
        if (rmIdx === -1) return null;
        for (let i = rmIdx + 1; i < tokens.length; i++) {
          const raw = tokens[i];
          const unquoted = raw.replace(/^["']|["']$/g, '');
          if (!unquoted.startsWith('-')) {
            return unquoted;
          }
        }
        return null;
      },
      critical: true,
    },
    {
      type: 'Git Push Forçado (risco de sobrescrita remota)',
      check: /git\s+push\s+.*(--force|-f\b)/,
      critical: true,
    },
    {
      type: 'Git Hard Reset (perda de alterações não commitadas)',
      check: /git\s+reset\s+--hard/,
      critical: true,
    },
    {
      type: 'Git Clean Forçado (remoção de arquivos não rastreados)',
      check: /git\s+clean\s+-[a-zA-Z]*f[a-zA-Z]*/,
      critical: true,
    },
    {
      type: 'Deleção de Banco de Dados SQL',
      check: /drop\s+(database|schema)\s+/i,
      critical: true,
    },
  ];

  // ponytail: divide encadeamentos/pipes respeitando aspas para isolar comandos seguros
  const subcmds = splitCommands(command);

  for (const rawSubcmd of subcmds) {
    const subcmd = rawSubcmd.trim();
    if (!subcmd) continue;

    // Remove strings entre aspas duplas ou simples para não analisar texto literal
    const cleanSubcmd = subcmd.replace(/'[^']*'|"[^"]*"/g, ' ').trim();
    const unquotedSubcmd = subcmd.replace(/["']/g, '').trim();

    // Se o sub-comando sem aspas iniciar com comandos informativos/seguros, ignora
    const isSafe = SAFE_COMMANDS.some(
      (safe) => cleanSubcmd === safe || cleanSubcmd.startsWith(safe + ' ') || cleanSubcmd.startsWith(safe + '\t')
    );
    if (isSafe) continue;

    // Se contiver o comando crítico após a limpeza de aspas, aplica as regras de análise
    for (const p of patterns) {
      const isMatch = p.check.test(subcmd) || p.check.test(cleanSubcmd) || p.check.test(unquotedSubcmd);
      if (!isMatch) continue;

      let targetPath = null;
      let targetStats = null;

      if (p.extractTarget) {
        targetPath = p.extractTarget(subcmd) || p.extractTarget(unquotedSubcmd);
        if (targetPath) {
          let normalizedTarget = targetPath.replace(/^["']|["']$/g, '');
          const homeDir = process.env.HOME ? resolve(process.env.HOME) : null;
          if (homeDir) {
            if (normalizedTarget === '~' || normalizedTarget.startsWith('~/')) {
              normalizedTarget = normalizedTarget.replace(/^~/, homeDir);
            } else if (normalizedTarget === '$HOME' || normalizedTarget.startsWith('$HOME/')) {
              normalizedTarget = normalizedTarget.replace(/^\$HOME/, homeDir);
            }
          }
          const resolved = resolve(process.cwd(), normalizedTarget);
          const isSystemRoot =
            resolved === '/' ||
            resolved === '/root' ||
            /^[a-zA-Z]:[\\/]?$/.test(resolved) ||
            (homeDir && resolved === homeDir);
          if (isSystemRoot) {
            targetStats = {
              count: '>10000',
              sizeStr: 'Sistema Crítico',
              sampleFiles: [basename(resolved) || '/'],
              resolved,
              isSystemRoot: true,
            };
          } else if (existsSync(resolved)) {
            const stats = countFilesAndSize(resolved);
            targetStats = { ...stats, resolved, isSystemRoot: false };
          }
        }
      }

      return {
        matchedPattern: p.type,
        command,
        targetPath,
        targetStats,
      };
    }
  }

  return null;
}

async function main() {
  const stdinData = await readStdin();
  let commandToInspect = '';
  const isDirectCli = !stdinData;

  if (stdinData) {
    try {
      const parsed = JSON.parse(stdinData);
      commandToInspect = parsed.tool_input?.command || parsed.command || '';
    } catch {
      commandToInspect = stdinData;
    }
  } else if (process.argv[2]) {
    commandToInspect = process.argv.slice(2).join(' ');
  }

  // Se executado diretamente como comando do CLI sem argumentos
  if (!commandToInspect) {
    if (isDirectCli) {
      console.log(`\n${c.bgYellow} 🛡️ BLAST RADIUS - GUARDIÃO DE COMANDOS CRÍTICOS ${c.reset}\n`);
      console.log(`┌────────────────────────────────────────────────────────┐`);
      console.log(`│ ${c.bold}Padrão Monitorado${c.reset}           │ ${c.bold}Nível de Risco${c.reset}                 │`);
      console.log(`├────────────────────────────────────────────────────────┤`);
      console.log(`│ rm -rf                       │ ${c.red}Destruição Recursiva Forçada${c.reset}   │`);
      console.log(`│ git reset --hard             │ ${c.red}Perda de Código Não Salvo${c.reset}      │`);
      console.log(`│ git clean -f                 │ ${c.yellow}Exclusão de Não Rastreados${c.reset}     │`);
      console.log(`│ drop database / drop schema  │ ${c.red}Exclusão Estrutural de BD${c.reset}      │`);
      console.log(`│ git push --force             │ ${c.red}Sobrescrita do Remoto${c.reset}          │`);
      console.log(`└────────────────────────────────────────────────────────┘`);
      console.log(`${c.bold}• Status:${c.reset} ${c.green}Ativo em PreToolUse Hook (Bash)${c.reset}`);
      console.log(`${c.gray}Simulação de risco: $blast-radius <comando> (ex: $blast-radius rm -rf temp/)${c.reset}\n`);
      process.exit(0);
    }

    // Em hooks sem comando explícito, sai silenciosamente sem alterar decisões de permissão
    process.exit(0);
  }

  const analysis = analyzeCommand(commandToInspect);

  if (!analysis) {
    if (isDirectCli) {
      console.log(`\n${c.green}✓ BLAST RADIUS - COMANDO SEGURO${c.reset}`);
      console.log(`${c.bold}• Comando:${c.reset} ${commandToInspect}`);
      console.log(`${c.gray}Nenhum padrão crítico ou risco de destruição em massa detectado.${c.reset}\n`);
      process.exit(0);
    }
    // Em hooks sem risco, sai silenciosamente com exit 0 sem stdout para preservar o prompt nativo de permissão
    process.exit(0);
  }

  // Gera relatório visual e motivo do bloqueio
  const lines = [
    `\n${c.bgRed} 🛑 BLAST RADIUS - COMANDO CRÍTICO INTERCEPTADO ${c.reset}`,
    `${c.bold}• Padrão Detectado:${c.reset} ${c.yellow}${analysis.matchedPattern}${c.reset}`,
    `${c.bold}• Comando:${c.reset} ${c.red}${analysis.command}${c.reset}`,
  ];

  if (analysis.targetStats) {
    const { count, sizeStr, sampleFiles, isSystemRoot, resolved } = analysis.targetStats;
    lines.push(`${c.bold}• Alvo Resolvido:${c.reset} ${resolved}`);
    lines.push(`${c.bold}• Arquivos no Raio de Destruição:${c.reset} ${c.red}${count} arquivos${c.reset} (${sizeStr})`);
    if (sampleFiles.length > 0) {
      lines.push(`${c.gray}  Amostra afetada: ${sampleFiles.join(', ')}...${c.reset}`);
    }
    if (isSystemRoot) {
      lines.push(`${c.bgYellow} ⚠️ ATENÇÃO MÁXIMA: O caminho aponta para a RAIZ DO SISTEMA ou diretório HOME! ${c.reset}`);
    }
  }

  lines.push(`${c.cyan}➡️ Ação recomendada: Avalie o impacto antes de confirmar.${c.reset}\n`);

  const reason = lines.join('\n');

  if (isDirectCli) {
    console.log(reason);
    process.exit(0);
  }

  // Retorna JSON canônico para OpenClaude e Claude Code solicitando consentimento interativo do usuário
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `Blast Radius interceptou comando potencialmente destrutivo (${analysis.matchedPattern}):\n${analysis.command}`,
    },
  };

  // Exibe o relatório de alerta no stderr para visualização humana imediata no terminal
  process.stderr.write(reason + '\n');
  console.log(JSON.stringify(output));
  process.exit(0);
}

main().catch((err) => {
  // Em caso de erro inesperado no hook, sai silenciosamente sem forçar aprovação
  process.exit(0);
});
