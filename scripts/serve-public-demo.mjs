// Public demo edge: static build + a narrow proxy. Backend services stay loopback.
import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(repo, 'frontend/dist');
const port = Number(process.env.KP_PUBLIC_PORT || 4283);
const publicOrigin = process.env.KP_PUBLIC_ORIGIN || 'https://noticeboard.tail49fdd1.ts.net:8443';
const publicHost = new URL(publicOrigin).host;
const allowedHosts = new Set([publicHost, `127.0.0.1:${port}`, `localhost:${port}`]);
const allowedOrigins = new Set([publicOrigin]);
const embedOrigins = (process.env.KP_EMBED_ORIGINS || 'https://robinwydaeghe.com https://www.robinwydaeghe.com https://toon-noot.github.io https://rwydaegh.github.io').split(/\s+/).filter(Boolean);
const stateDir = process.env.KP_PUBLIC_STATE_DIR || join(homedir(), '.local/state/knowledgepulse-public-demo');
mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const budgetFile = join(stateDir, 'usage.json');
const totals = existsSync(budgetFile) ? JSON.parse(readFileSync(budgetFile, 'utf8')) : { voice: 0, preview: 0 };
for (const kind of ['voice', 'preview']) if (!Number.isSafeInteger(totals[kind]) || totals[kind] < 0) throw new Error('Invalid persisted public demo usage state.');
const active = { voice: 0, preview: 0, scan: 0 };
const recent = { scan: [], resolve: [] };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8' };
const error = (message, status, code) => Object.assign(new Error(message), { status, code });
function json(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function reserve(kind) {
  if (totals[kind] >= 12) throw error('This public demonstration has reached its usage allowance. The local demo remains available to its operator.', 429, 'PUBLIC_DEMO_LIMIT');
  totals[kind] += 1;
  const temporary = `${budgetFile}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(totals), { mode: 0o600 });
  renameSync(temporary, budgetFile);
}
function throttle(kind, limit) {
  const now = Date.now();
  while (recent[kind].length && recent[kind][0] < now - 60000) recent[kind].shift();
  if (recent[kind].length >= limit) throw error('This demo is busy. Please try again in a minute.', 429, 'PUBLIC_RATE_LIMIT');
  recent[kind].push(now);
}
async function body(req, limit = 16384) {
  if (Number(req.headers['content-length']) > limit) throw error('Request is too large.', 413, 'BODY_TOO_LARGE');
  const chunks = [];
  let count = 0;
  for await (const chunk of req) {
    count += chunk.length;
    if (count > limit) throw error('Request is too large.', 413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function upstreamFor(pathname) {
  return pathname.startsWith('/api/') ? 8001 : 8002;
}
async function proxy(req, res, pathname, query) {
  const isRead = req.method === 'GET' && (/^\/api\/(health|conflicts\/pending|conflicts\/[A-Za-z0-9_-]+|knowledge|search|sentinel\/last-scan)$/.test(pathname) || ['/voice/status', '/lab/status'].includes(pathname));
  const isWrite = req.method === 'POST' && ['/api/conflicts/resolve', '/api/sentinel/scan', '/voice/session', '/lab/preview'].includes(pathname);
  if (!isRead && !isWrite) throw error('This operation is not available on the public demo.', 403, 'PUBLIC_ROUTE_BLOCKED');
  let payload;
  let kind;
  if (isWrite) {
    if (!allowedOrigins.has(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') throw error('Use the public demo page to perform this action.', 403, 'ORIGIN_REJECTED');
    if (pathname === '/api/sentinel/scan') {
      if (query.get('extractor') !== 'regex' || [...query.keys()].some(key => key !== 'extractor') || query.getAll('extractor').length !== 1) throw error('The public full-corpus scan uses rules. Use the bounded document preview to try AI extraction.', 403, 'PUBLIC_SCAN_LIMIT');
      kind = 'scan';
      if (active.scan) throw error('A scan is already running.', 429, 'PUBLIC_BUSY');
      throttle('scan', 4);
      payload = await body(req, 1024);
    } else {
      if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw error('Use application/json.', 415, 'INVALID_CONTENT_TYPE');
      payload = await body(req, pathname === '/voice/session' ? 1024 : 16384);
      let parsed;
      try { parsed = JSON.parse(payload.toString('utf8')); } catch { throw error('Invalid JSON.', 400, 'INVALID_JSON'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw error('Expected a JSON object.', 400, 'INVALID_JSON');
      if (pathname === '/voice/session') {
        kind = 'voice';
        if (active.voice >= 2) throw error('Voice is busy. Try again shortly.', 429, 'PUBLIC_BUSY');
        reserve('voice');
      } else if (pathname === '/lab/preview') {
        kind = 'preview';
        if (active.preview) throw error('A document preview is already running.', 429, 'PUBLIC_BUSY');
        if (!['llm', 'regex'].includes(parsed.extractor) || typeof parsed.text !== 'string' || !parsed.text.trim() || parsed.text.length > 5000) throw error('Supply a supported extractor and 1–5,000 characters of preview text.', 400, 'INVALID_PREVIEW');
        reserve('preview');
      } else throttle('resolve', 30);
    }
  }
  if (kind) active[kind] += 1;
  try {
    await new Promise((resolvePromise, reject) => {
      const headers = { Accept: 'application/json', ...(req.headers.origin ? { Origin: req.headers.origin } : {}), ...(isWrite && pathname !== '/api/sentinel/scan' ? { 'Content-Type': 'application/json' } : {}), ...(payload ? { 'Content-Length': payload.length } : {}) };
      const upstream = http.request({ hostname: '127.0.0.1', port: upstreamFor(pathname), path: `${pathname}${query.size ? `?${query}` : ''}`, method: req.method, headers, timeout: pathname === '/lab/preview' ? 65000 : 30000 }, response => {
        res.writeHead(response.statusCode || 502, { 'Content-Type': response.headers['content-type'] || 'application/json', 'Cache-Control': 'no-store' });
        response.pipe(res);
        response.once('end', resolvePromise);
        response.once('error', reject);
      });
      upstream.once('timeout', () => upstream.destroy(error('The demo service timed out.', 504, 'UPSTREAM_TIMEOUT')));
      upstream.once('error', reject);
      res.once('close', () => { if (!res.writableEnded) upstream.destroy(); });
      upstream.end(payload);
    });
  } finally { if (kind) active[kind] -= 1; }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  try {
    if (!allowedHosts.has(req.headers.host)) throw error('Host not permitted.', 403, 'HOST_REJECTED');
    let pathname;
    try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); } catch { throw error('Invalid path.', 400, 'INVALID_PATH'); }
    if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part === '..' || part === '.')) throw error('Invalid path.', 400, 'INVALID_PATH');
    const query = new URLSearchParams((req.url || '').split('?').slice(1).join('?'));
    if (/^\/(api|voice|lab)\//.test(pathname)) return await proxy(req, res, pathname, query);
    if (!['GET', 'HEAD'].includes(req.method)) throw error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    let file = resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(`${dist}${sep}`)) throw error('Invalid path.', 400, 'INVALID_PATH');
    let info;
    try { info = await stat(file); } catch { /* SPA fallback follows. */ }
    if (!info?.isFile()) {
      if (extname(pathname)) throw error('Asset not found.', 404, 'NOT_FOUND');
      file = join(dist, 'index.html');
    }
    const actual = await realpath(file);
    if (!actual.startsWith(`${await realpath(dist)}${sep}`)) throw error('Invalid asset path.', 403, 'INVALID_PATH');
    const content = await readFile(actual);
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://*.elevenlabs.io wss://*.elevenlabs.io https://*.livekit.cloud wss://*.livekit.cloud; media-src 'self' blob: data:; worker-src 'self' blob:; frame-ancestors 'self' ${embedOrigins.join(' ')}; object-src 'none'; base-uri 'self'`);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (failure) {
    if (res.headersSent) res.destroy();
    else json(res, failure.status || 502, { error: failure.status ? failure.message : 'The demo service is temporarily unavailable.', code: failure.code || 'DEMO_UNAVAILABLE' });
  }
});
server.requestTimeout = 70000;
server.headersTimeout = 10000;
server.timeout = 70000;
server.listen(port, '127.0.0.1', () => console.log(`KnowledgePulse public edge: http://127.0.0.1:${port} → ${publicOrigin}`));
