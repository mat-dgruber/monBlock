// Daemon descartável do spike S0 (P4, P6, P9). CommonJS porque vira SEA.
// Roda como SYSTEM sob WinSW. Registra eventos em C:\spike\events.log.
const fs = require('node:fs');
const net = require('node:net');
const { execFile, execFileSync, spawn } = require('node:child_process');

const ROOT = 'C:\\spike';
const log = (msg) => fs.appendFileSync(`${ROOT}\\events.log`, `${new Date().toISOString()} ${msg}\n`);

if (process.argv.includes('--selftest')) {
  console.log(`selftest ok node=${process.version}`);
  process.exit(0);
}

log(`start pid=${process.pid} node=${process.version}`);

// P9: identidade e nível de integridade.
try {
  fs.writeFileSync(`${ROOT}\\whoami.txt`, execFileSync(`${process.env.SystemRoot}\\System32\\whoami.exe`, ['/groups'], { encoding: 'utf8' }));
} catch (err) {
  log(`whoami error ${err.message}`);
}

// P6: filho de longa duração para ver se o WinSW mata a árvore.
const child = spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 600'], { stdio: 'ignore' });
fs.writeFileSync(`${ROOT}\\child.pid`, String(child.pid));

// P4: dois pipes — com readableAll/writableAll e com o DACL padrão.
const servers = [];
function serve(name, opts) {
  const server = net.createServer((sock) => {
    let buf = '';
    sock.on('error', () => {});
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        sock.write(`${JSON.stringify({ pipe: name, pid: process.pid, echo: line })}\n`);
      }
    });
  });
  server.on('error', (err) => log(`listen error ${name} ${err.code ?? err.message}`));
  server.listen({ path: `\\\\.\\pipe\\${name}`, ...opts }, () => {
    log(`listening ${name}`);
    // P4b: o próprio dono (SYSTEM) troca a DACL — o dono tem WRITE_DAC implícito.
    if (name === 'monblockd-spike-acl') {
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${ROOT}\\apply-dacl.ps1`, name,
        'D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)(D;;GA;;;NU)', `${ROOT}\\out\\p4-dacl.json`], { timeout: 20_000 },
        (err) => log(err ? `dacl error ${err.message}` : 'dacl applied'));
    }
  });
  servers.push(server);
}
serve('monblockd-spike', { readableAll: true, writableAll: true });
serve('monblockd-spike-default', {});
// P4b: DACL padrão (fail-closed) e substituída depois do listen por um helper com WRITE_DAC.
serve('monblockd-spike-acl', {});

// P6: no stop, dispara (a) tarefa agendada como SYSTEM e (b) spawn desacoplado — qual sobrevive?
let stopping = false;
function onStop(signal) {
  if (stopping) return;
  stopping = true;
  log(`signal ${signal}`);
  try {
    execFileSync('schtasks.exe', ['/create', '/tn', 'MonBlockSpikeTask', '/ru', 'SYSTEM', '/sc', 'once', '/st', '23:59', '/f',
      '/tr', `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${ROOT}\\task.ps1`], { stdio: 'ignore' });
    execFileSync('schtasks.exe', ['/run', '/tn', 'MonBlockSpikeTask'], { stdio: 'ignore' });
    log('schtasks triggered');
  } catch (err) {
    log(`schtasks error ${err.message}`);
  }
  try {
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${ROOT}\\detached.ps1`], { detached: true, stdio: 'ignore' })
      .on('error', (err) => log(`detached error ${err.message}`))
      .unref();
    log('detached spawned');
  } catch (err) {
    log(`detached error ${err.message}`);
  }
  for (const s of servers) s.close();
  setTimeout(() => {
    log('clean exit');
    process.exit(0);
  }, 500);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => onStop(sig));
setInterval(() => {}, 60_000);
