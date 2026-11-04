#!/usr/bin/env node
/**
 * Terminal Browser - Launcher Inteligente com Fallbacks
 */

import { execFileSync, spawn } from 'node:child_process';
import { platform } from 'node:os';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m\x1b[37m',
};

function hasCommand(cmd) {
  try {
    const whichCmd = platform() === 'win32' ? 'where' : 'which';
    execFileSync(whichCmd, [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function sanitizeUrl(raw) {
  let url = raw || 'http://localhost:3000';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Protocolo inválido. Apenas http e https são permitidos.');
    }
    return parsed.href;
  } catch {
    return 'http://localhost:3000';
  }
}

function launch() {
  const targetUrl = sanitizeUrl(process.argv[2]);

  console.log(`\n${c.bgBlue} 🌐 TERMINAL BROWSER - VISUALIZAÇÃO WEB ${c.reset}`);
  console.log(`${c.bold}• URL de destino:${c.reset} ${c.cyan}${targetUrl}${c.reset}`);

  // 1. Tenta binário nativo terminal-browser
  if (hasCommand('terminal-browser')) {
    console.log(`${c.green}✓ Iniciando terminal-browser integrado...${c.reset}`);
    spawn('terminal-browser', ['--url', targetUrl], { stdio: 'inherit', detached: true });
    return;
  }

  // 2. Tenta navegador de texto no terminal (Lynx ou w3m)
  if (hasCommand('w3m')) {
    console.log(`${c.yellow}→ 'terminal-browser' não encontrado. Abrindo com w3m no terminal...${c.reset}`);
    spawn('w3m', [targetUrl], { stdio: 'inherit' });
    return;
  }

  if (hasCommand('lynx')) {
    console.log(`${c.yellow}→ 'terminal-browser' não encontrado. Abrindo com lynx no terminal...${c.reset}`);
    spawn('lynx', [targetUrl], { stdio: 'inherit' });
    return;
  }

  // 3. Fallback inteligente: navegador do sistema operacional
  const os = platform();
  console.log(`${c.yellow}→ Abrindo no navegador padrão do sistema operacional (${os})...${c.reset}`);

  try {
    if (os === 'darwin') {
      execFileSync('open', [targetUrl], { stdio: 'ignore' });
    } else if (os === 'win32') {
      // Escapa metacaracteres especiais do cmd.exe (&, ^, %) para prevenir injeção e truncamento
      const escapedUrl = targetUrl.replace(/[&^%]/g, '^$&');
      spawn('cmd.exe', ['/c', 'start', '""', escapedUrl], { stdio: 'ignore', detached: true });
    } else {
      execFileSync('xdg-open', [targetUrl], { stdio: 'ignore' });
    }
    console.log(`${c.green}✓ Página aberta com sucesso.${c.reset}\n`);
  } catch (err) {
    console.log(`${c.yellow}Aviso: Não foi possível acionar o navegador gráfico automaticamente: ${err.message}${c.reset}`);
    console.log(`${c.cyan}Acesse manualmente no navegador:${c.reset} ${targetUrl}\n`);
  }
}

launch();
