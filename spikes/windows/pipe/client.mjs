// P4: roda como o usuário comum `spike`. Abre N conexões simultâneas a cada pipe e grava o resultado.
import fs from 'node:fs';
import net from 'node:net';

const [outFile, nArg = '10'] = process.argv.slice(2);
const N = Number(nArg);

function roundTrip(path, i) {
  return new Promise((resolve) => {
    const sock = net.connect(path);
    const done = (r) => {
      sock.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done({ i, ok: false, error: 'timeout' }), 5000);
    let buf = '';
    sock.on('connect', () => sock.write(`${JSON.stringify({ i })}\n`, (err) => err && done({ i, ok: false, error: `write ${err.code}` })));
    sock.on('data', (c) => {
      buf += c.toString('utf8');
      if (buf.includes('\n')) {
        clearTimeout(timer);
        done({ i, ok: true, reply: JSON.parse(buf.split('\n')[0]) });
      }
    });
    sock.on('error', (err) => {
      clearTimeout(timer);
      done({ i, ok: false, error: err.code ?? err.message });
    });
  });
}

async function batch(path, n) {
  const results = await Promise.all(Array.from({ length: n }, (_, i) => roundTrip(path, i)));
  return { path, okCount: results.filter((r) => r.ok).length, n, errors: [...new Set(results.filter((r) => !r.ok).map((r) => r.error))], sample: results[0] };
}

const report = {
  user: process.env.USERNAME,
  readableWritableAll: await batch('\\\\.\\pipe\\monblockd-spike', N),
  defaultDacl: await batch('\\\\.\\pipe\\monblockd-spike-default', N),
  remoteLocalhost: await batch('\\\\localhost\\pipe\\monblockd-spike', 1),
  remoteComputerName: await batch(`\\\\${process.env.COMPUTERNAME}\\pipe\\monblockd-spike`, 1),
};
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
