import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
const listening = (port) => new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port });
  const finish = value => { socket.destroy(); resolve(value); };
  socket.setTimeout(500);
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.once('timeout', () => finish(false));
});
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const service of [
  { name: 'Backend', port: 8001, cwd: 'backend', command: 'uv', args: ['run', '--locked', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001'] },
  { name: 'Voice', port: 8002, cwd: 'frontend', command: 'node', args: ['server/voice-gateway.mjs'] },
  { name: 'Frontend', port: 4280, cwd: 'frontend', command: 'node', args: ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4280', '--strictPort'] },
]) {
  if (await listening(service.port)) { console.log(`${service.name}: port ${service.port} already in use; leaving that process untouched.`); continue; }
  const child = spawn(service.command, service.args, { cwd: `${root}${service.cwd}`, stdio: 'inherit', env: { ...process.env, KP_FRONTEND_URL: 'http://127.0.0.1:4280' } });
  children.push(child);
  child.on('error', error => { console.error(`${service.name}: ${error.message}`); stop(1); });
  child.on('exit', code => { if (!stopping) { console.error(`${service.name} stopped (${code}).`); stop(code || 1); } });
}
console.log('\nKnowledgePulse: http://127.0.0.1:4280/');
console.log('Find contradictions: http://127.0.0.1:4280/?view=sentinel');
console.log('Shared knowledge: http://127.0.0.1:4280/?view=knowledge');
console.log('Ctrl+C stops only the processes this command started.');
