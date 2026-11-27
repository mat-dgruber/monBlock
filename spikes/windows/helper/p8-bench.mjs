// P8 (E2, sessão gráfica): mede latência do helper persistente e CPU em repouso.
// Uso: node p8-bench.mjs [probes=1000] [intervalMs=1500]   (deixe um navegador em primeiro plano)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [probes = 1000, intervalMs = 1500] = process.argv.slice(2).map(Number);
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'probe-loop.ps1');
const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script]);
let buf = '';
const waiters = [];
ps.stdout.on('data', (c) => {
  buf += c.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    waiters.shift()?.(line);
  }
});
const probe = () =>
  new Promise((resolve) => {
    const t0 = performance.now();
    const timer = setTimeout(() => resolve({ ms: null, line: 'timeout' }), 2000);
    waiters.push((line) => {
      clearTimeout(timer);
      resolve({ ms: performance.now() - t0, line });
    });
    ps.stdin.write('probe\n');
  });

const lat = [];
const seen = new Set();
for (let i = 0; i < probes; i++) {
  const r = await probe();
  if (r.ms !== null) lat.push(r.ms);
  seen.add(r.line);
  await new Promise((res) => setTimeout(res, intervalMs));
}
lat.sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]?.toFixed(1);
console.log(JSON.stringify({ probes, ok: lat.length, p50: pct(0.5), p95: pct(0.95), max: pct(1), helperPid: ps.pid, sampleLines: [...seen].slice(0, 5) }, null, 2));
console.log(`CPU do helper: rode em outro terminal  Get-Counter "\\Process(powershell*)\\% Processor Time" -SampleInterval 5 -MaxSamples 6`);
ps.kill();
