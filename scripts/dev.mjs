// Starts Vite, then Electron pointed at it. Edits in src/ reload the window instantly.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('Vite running at', url);

const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_URL: url } });
child.on('close', async () => { await server.close(); process.exit(0); });
