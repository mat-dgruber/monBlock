// Uso: node tests/e2e/root/ipc.mjs '<comando JSON>' [socket]  → imprime a resposta JSON (exit 2 se offline).
import { DaemonClient } from '../../../dist/main/daemon-client.js';

const [cmdJson, socketPath = '/var/run/monblock/monblockd.sock'] = process.argv.slice(2);
const client = new DaemonClient({ socketPath, timeoutMs: 10_000 });
const timer = setTimeout(() => {
  console.error('offline');
  process.exit(2);
}, 10_000);
client.once('status', async () => {
  try {
    console.log(JSON.stringify(await client.call(JSON.parse(cmdJson))));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  } finally {
    clearTimeout(timer);
    client.close();
  }
});
