// Netlify Edge Function: proxy na Claude API. Klíč zůstává na serveru (proměnná ANTHROPIC_API_KEY).
//
// Prohlížeč dál řídí agentní smyčku a spouští nástroje (sahají do 3D scény a stavu aplikace);
// sem posílá jen samotné požadavky na Messages API a odpověď se streamuje zpět beze změny.
//
// Ochrana proti zneužití klíče:
//  – systémový prompt vkládá server (proxy nejde použít jako obecné Claude API),
//  – povolené jen modely, nástroje, parametry a beta funkce, které aplikace používá,
//  – strop velikosti požadavku a max_tokens,
//  – limit požadavků za minutu na IP (Netlify rate limiting, viz config níže),
//  – denní limit na IP a denní limit celého webu (Netlify Blobs).
//
// Volitelné proměnné prostředí: AI_LIMIT_PER_IP_DAY (výchozí 150), AI_LIMIT_PER_DAY (600),
// AI_ALLOWED_MODELS (čárkami oddělený seznam), ANTHROPIC_BASE_URL (jen pro lokální testy).
import { getStore } from '@netlify/blobs';
import { systemPrompt } from '../../src/ai/prompts.js';

const SYSTEM = systemPrompt();
const ALL_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];
const TOOL_NAMES = new Set(['upravit_projekt', 'ovladat_zobrazeni', 'pouzit_variantu', 'pripravit_nabidku']);
const BODY_FIELDS = ['model', 'max_tokens', 'messages', 'system', 'tools', 'tool_choice', 'stream', 'output_config', 'thinking', 'fallbacks'];
const ALLOWED_BETAS = new Set(['server-side-fallback-2026-07-01']);
const PASS_HEADERS = ['content-type', 'request-id', 'retry-after', 'x-should-retry'];
const MAX_BODY = 6 * 1024 * 1024;
const MAX_TOKENS = 16000;
const MAX_MESSAGES = 240;

const env = (name, fallback) => globalThis.Netlify?.env.get(name) ?? fallback;
const intEnv = (name, fallback) => {
  const v = parseInt(env(name, ''), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

function allowedModels() {
  const list = (env('AI_ALLOWED_MODELS', '') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((m) => ALL_MODELS.includes(m));
  return list.length ? list : ALL_MODELS;
}

function limits() {
  return { perIpDay: intEnv('AI_LIMIT_PER_IP_DAY', 150), perDay: intEnv('AI_LIMIT_PER_DAY', 600) };
}

/** Chyba ve formátu Claude API – SDK v prohlížeči ji zobrazí a podle x-should-retry neopakuje. */
function apiError(status, type, message) {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-should-retry': 'false', 'x-proxy-error': '1' },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

// ---------------------------------------------------------------- denní limity (Netlify Blobs)

async function hashIp(ip, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}`));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function quotaStore() {
  return globalThis.__aiQuotaStore ?? getStore({ name: 'ai-quota', consistency: 'strong' });
}

/**
 * Započítá požadavek do denních limitů. Jeden záznam na den: { total, ips: { hash: počet } }.
 * Souběžné zápisy řeší podmíněný zápis přes ETag. Při výpadku úložiště propustí (limit za minutu platí dál).
 */
async function takeQuota(ip, context) {
  const { perIpDay, perDay } = limits();
  const day = new Date().toISOString().slice(0, 10);
  const key = `day-${day}`;
  try {
    const store = quotaStore();
    const who = await hashIp(ip || 'unknown', `${context?.site?.id ?? 'site'}|${day}`);
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await store.getWithMetadata(key, { type: 'json' });
      const data = cur?.data ?? { total: 0, ips: {} };
      if (data.total >= perDay) return { ok: false, reason: 'day' };
      const used = data.ips[who] ?? 0;
      if (used >= perIpDay) return { ok: false, reason: 'ip' };
      data.total += 1;
      data.ips[who] = used + 1;
      const res = cur ? await store.setJSON(key, data, { onlyIfMatch: cur.etag }) : await store.setJSON(key, data, { onlyIfNew: true });
      if (res.modified) {
        // první zápis dne → úklid starých dní (na pozadí)
        if (!cur) context?.waitUntil?.(cleanup(store, day));
        return { ok: true, remaining: perIpDay - used - 1 };
      }
    }
    return { ok: true };
  } catch (err) {
    console.error('ai-quota', err);
    return { ok: true };
  }
}

async function cleanup(store, today) {
  try {
    const { blobs } = await store.list({ prefix: 'day-' });
    const keep = new Set([`day-${today}`, `day-${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}`]);
    await Promise.all(blobs.filter((b) => !keep.has(b.key)).map((b) => store.delete(b.key)));
  } catch (err) {
    console.error('ai-quota cleanup', err);
  }
}

// ---------------------------------------------------------------- kontrola požadavku

function sanitize(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Neplatné tělo požadavku.' };
  if (!allowedModels().includes(body.model)) return { error: `Model ${String(body.model)} není na tomto webu povolen.` };
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > MAX_MESSAGES) {
    return { error: 'Konverzace je příliš dlouhá – začněte novou.' };
  }
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.some((t) => !t || t.type || !TOOL_NAMES.has(t.name))) {
      return { error: 'Nepovolené nástroje.' };
    }
  }
  const out = {};
  for (const k of BODY_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  out.max_tokens = Math.min(MAX_TOKENS, Math.max(1, Number(body.max_tokens) || 1024));
  out.system = [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }];
  return { body: out };
}

// ---------------------------------------------------------------- handler

export default async (request, context) => {
  const url = new URL(request.url);
  const apiKey = env('ANTHROPIC_API_KEY', '');

  if (url.pathname.endsWith('/health')) {
    return json({ ai: !!apiKey, models: allowedModels(), limits: limits() });
  }
  if (request.method !== 'POST' || !url.pathname.endsWith('/v1/messages')) {
    return apiError(404, 'not_found_error', 'Neznámý požadavek.');
  }
  if (!apiKey) return apiError(503, 'api_error', 'AI na tomto webu není nastavena (chybí ANTHROPIC_API_KEY).');

  // jiné weby nesmí proxy volat z prohlížeče
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== url.host) return apiError(403, 'permission_error', 'Požadavek z jiného webu není povolen.');

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY) return apiError(413, 'request_too_large', 'Požadavek je příliš velký (obrázky zmenšete nebo začněte novou konverzaci).');
  const raw = await request.text();
  if (raw.length > MAX_BODY) return apiError(413, 'request_too_large', 'Požadavek je příliš velký (obrázky zmenšete nebo začněte novou konverzaci).');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return apiError(400, 'invalid_request_error', 'Neplatný JSON.');
  }
  const { body, error } = sanitize(parsed);
  if (error) return apiError(400, 'invalid_request_error', error);

  const quota = await takeQuota(context?.ip, context);
  if (!quota.ok) {
    return apiError(
      429,
      'rate_limit_error',
      quota.reason === 'ip'
        ? 'Dnešní limit dotazů na AI pro vaše připojení je vyčerpán. Návrh a výpočty fungují dál, AI bude opět k dispozici zítra.'
        : 'Dnešní limit dotazů na AI pro tento web je vyčerpán. Návrh a výpočty fungují dál, AI bude opět k dispozici zítra.',
    );
  }

  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
  };
  const betas = (request.headers.get('anthropic-beta') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((b) => ALLOWED_BETAS.has(b));
  if (betas.length) headers['anthropic-beta'] = betas.join(',');

  const base = env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com').replace(/\/+$/, '');
  const beta = url.searchParams.get('beta') === 'true' ? '?beta=true' : '';
  let upstream;
  try {
    upstream = await fetch(`${base}/v1/messages${beta}`, { method: 'POST', headers, body: JSON.stringify(body), signal: request.signal });
  } catch (err) {
    console.error('claude upstream', err);
    return apiError(502, 'api_error', 'Claude API je dočasně nedostupné.');
  }
  const out = new Headers({ 'cache-control': 'no-store' });
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (quota.remaining !== undefined) out.set('x-ai-quota-remaining', String(quota.remaining));
  // odpověď (i SSE stream) se předává beze změny
  return new Response(upstream.body, { status: upstream.status, headers: out });
};

export const config = {
  path: '/api/claude/*',
  // limit za minutu na IP adresu (Netlify vrátí 429); denní limity řeší takeQuota()
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
