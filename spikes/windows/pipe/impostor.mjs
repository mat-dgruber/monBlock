// Pipe impostor criado por usuário comum (P5, P6). Responde qualquer linha e grava o que recebeu.
import fs from 'node:fs';
import net from 'node:net';

const name = process.argv[2] ?? 'monblockd-impostor';
const server = net.createServer((sock) => {
  sock.on('error', () => {});
  sock.on('data', (c) => {
    fs.appendFileSync(`C:\\spike\\out\\impostor-${name}.log`, c.toString('utf8'));
    sock.write(`${JSON.stringify({ impostor: true })}\n`);
  });
});
server.on('error', (err) => {
  fs.appendFileSync(`C:\\spike\\out\\impostor-${name}.log`, `listen error ${err.code}\n`);
  process.exit(1);
});
server.listen({ path: `\\\\.\\pipe\\${name}`, readableAll: true, writableAll: true });
setTimeout(() => process.exit(0), 120_000);
