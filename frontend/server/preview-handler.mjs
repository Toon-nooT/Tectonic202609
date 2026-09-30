import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url));
const script = fileURLToPath(new URL('./document-preview.py', import.meta.url));
const allowedOrigins = new Set(['http://localhost:4280', 'http://127.0.0.1:4280', 'http://localhost:4282', 'http://127.0.0.1:4282']);
const recent = [];
let active = 0;
const MAX_BODY = 16 * 1024;
const MAX_OUTPUT = 256 * 1024;

const problem = (message, status, code) => Object.assign(new Error(message), { status, code });
function reply(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

async function bodyJSON(req) {
  if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw problem('Use application/json.', 415, 'INVALID_CONTENT_TYPE');
  if (Number(req.headers['content-length']) > MAX_BODY) throw problem('Preview request is too large.', 413, 'BODY_TOO_LARGE');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw problem('Preview request is too large.', 413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw problem('Invalid JSON request.', 400, 'INVALID_JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw problem('Expected a JSON object.', 400, 'INVALID_INPUT');
  for (const key of ['conflict_id', 'source_id']) {
    if (typeof body[key] !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(body[key])) throw problem('Select a known conflict and source.', 400, 'INVALID_INPUT');
  }
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 5000) throw problem('Preview text must contain 1–5,000 characters.', 400, 'INVALID_INPUT');
  if (!['llm', 'regex'].includes(body.extractor)) throw problem('Choose the llm or regex extractor.', 400, 'INVALID_INPUT');
  // Forward only the fixed supported schema, never paths, commands or options.
  return { conflict_id: body.conflict_id, source_id: body.source_id, text: body.text, extractor: body.extractor };
}

async function runPreview(body, req, res) {
  // Parent-owned directory guarantees cleanup even when Python is SIGKILLed.
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'knowledgepulse-preview-run-'));
  try {
    return await new Promise((resolve, reject) => {
    const child = spawn('uv', ['run', '--project', backendDir, '--locked', '--no-sync', 'python', script], {
      cwd: backendDir, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TMPDIR: temporaryRoot },
    });
    const stdout = [];
    let outputBytes = 0;
    let failure;
    let hardKill;
    let finished = false;
    const kill = (signal) => {
      if (!child.pid) return;
      try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); }
      catch { /* Process already exited. */ }
    };
    const stop = (error) => {
      if (failure || finished) return;
      failure = error;
      kill('SIGTERM');
      hardKill = setTimeout(() => kill('SIGKILL'), 1000);
      hardKill.unref();
    };
    const timeout = setTimeout(() => stop(problem('Preview timed out. Try a shorter document or the regex extractor.', 504, 'PREVIEW_TIMEOUT')), 60000);
    const abort = () => stop(problem('Preview request was cancelled.', 499, 'CANCELLED'));
    req.once('aborted', abort);
    res.once('close', abort);
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT) return stop(problem('The preview result exceeded the supported size.', 502, 'OUTPUT_TOO_LARGE'));
      stdout.push(chunk);
    });
    // Drain stderr without returning potentially sensitive process diagnostics.
    child.stderr.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT) stop(problem('The preview output exceeded the supported size.', 502, 'OUTPUT_TOO_LARGE'));
    });
    const cleanup = () => {
      finished = true;
      clearTimeout(timeout);
      clearTimeout(hardKill);
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
    };
    child.once('error', () => { cleanup(); reject(problem('The preview runtime could not start. Check the managed backend environment.', 503, 'RUNTIME_UNAVAILABLE')); });
    child.once('close', (exitCode) => {
      cleanup();
      if (failure) return reject(failure);
      let result;
      try { result = JSON.parse(Buffer.concat(stdout).toString('utf8')); }
      catch { return reject(problem('The preview runtime did not return a valid result.', 502, 'INVALID_PREVIEW_RESPONSE')); }
      if (result.error || exitCode !== 0) return reject(problem(result.error || 'The preview failed.', [400, 413, 422, 502, 503].includes(result.status) ? result.status : 502, result.code || 'PREVIEW_FAILED'));
      if (result.preview !== true || !result.report || !result.changed_source) return reject(problem('The preview response was incomplete.', 502, 'INVALID_PREVIEW_RESPONSE'));
      resolve(result);
    });
    child.stdin.on('error', () => { /* Spawn/close reports the actual error. */ });
    child.stdin.end(JSON.stringify(body));
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function handleDocumentPreview(req, res) {
  // Read at request time: the enclosing gateway loads .env after static imports.
  const permitted = new Set(allowedOrigins);
  for (const origin of (process.env.KP_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)) {
    try { const parsed = new URL(origin); if (parsed.origin === origin && ['http:', 'https:'].includes(parsed.protocol)) permitted.add(origin); } catch { /* Ignore malformed configured origins. */ }
  }
  const pathname = (req.url || '').split('?')[0];
  if (!['/lab/preview', '/lab/status'].includes(pathname)) return false;
  const origin = req.headers.origin;
  if ((origin && !permitted.has(origin)) || req.headers['sec-fetch-site'] === 'cross-site') {
    reply(res, 403, { error: 'Origin not allowed.', code: 'ORIGIN_REJECTED' });
    return true;
  }
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return true;
  }
  if (pathname === '/lab/status' && req.method === 'GET') {
    reply(res, 200, { available: true, llmConfigured: Boolean(process.env.OPENROUTER_API_KEY?.trim()), previewOnly: true });
    return true;
  }
  if (pathname !== '/lab/preview' || req.method !== 'POST') {
    reply(res, 405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
    return true;
  }
  if (!origin || !permitted.has(origin)) {
    reply(res, 403, { error: 'A permitted browser origin is required.', code: 'ORIGIN_REJECTED' });
    return true;
  }
  req.setTimeout(65000);
  res.setTimeout(65000);
  try {
    const body = await bodyJSON(req);
    const now = Date.now();
    while (recent.length && recent[0] < now - 60000) recent.shift();
    if (active || recent.length >= 4) throw problem('Preview is busy or its request limit was reached. Try again shortly.', 429, 'PREVIEW_RATE_LIMIT');
    recent.push(now);
    active += 1;
    try { reply(res, 200, await runPreview(body, req, res)); }
    finally { active -= 1; }
  } catch (error) {
    reply(res, error.status || 502, { error: error.status ? error.message : 'The preview could not be completed.', code: error.code || 'PREVIEW_FAILED' });
  }
  return true;
}
