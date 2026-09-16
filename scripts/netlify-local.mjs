// Lokální emulace nasazení na Netlify: statický web z dist/ + Edge Function /api/claude/*
// (stejný kód jako na Netlify, globální Netlify.env a context.ip se emulují, denní limity v paměti).
//
//   npm run build:web
//   ANTHROPIC_API_KEY=… npm run serve:local            → http://127.0.0.1:8888
//   (pro test bez klíče: npm run mock a CLAUDE_PROXY_UPSTREAM=http://127.0.0.1:8787 ANTHROPIC_API_KEY=sk-ant-test)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT || 8888);

globalThis.Netlify = { env: { get: (k) => process.env[k], has: (k) => k in process.env } };

// úložiště limitů v paměti se stejným API jako Netlify Blobs (getWithMetadata / setJSON s ETagem / list / delete)
const mem = new Map();
let etagSeq = 0;
globalThis.__aiQuotaStore = {
  async getWithMetadata(key) {
    const e = mem.get(key);
    return e ? { data: JSON.parse(e.value), etag: e.etag, metadata: {} } : null;
  },
  async setJSON(key, data, opts = {}) {
    const e = mem.get(key);
    if (opts.onlyIfNew && e) return { modified: false };
    if (opts.onlyIfMatch && (!e || e.etag !== opts.onlyIfMatch)) return { modified: false };
    const etag = `"${++etagSeq}"`;
    mem.set(key, { value: JSON.stringify(data), etag });
    return { modified: true, etag };
  },
  async list({ prefix = '' } = {}) {
    return { blobs: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: mem.get(key).etag })), directories: [] };
  },
  async delete(key) {
    mem.delete(key);
  },
};

const { default: edge, config } = await import('../netlify/edge-functions/claude.js');
const prefix = config.path.replace(/\*$/, '');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/') || p.endsWith('\\')) p = join(p, 'index.html');
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not file');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

http
  .createServer(async (req, res) => {
    if (!req.url.startsWith(prefix)) return serveStatic(req, res);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      signal: ac.signal,
    });
    const context = { ip: req.socket.remoteAddress, site: { id: 'local' }, waitUntil: (p) => p?.catch?.(() => {}) };
    try {
      const response = await edge(request, context);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (!response.body) return res.end();
      for await (const chunk of response.body) res.write(chunk);
      res.end();
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Netlify emulace: http://127.0.0.1:${PORT} (API ${prefix}*)`));
