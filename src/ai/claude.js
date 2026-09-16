// Klient Claude API (oficiální SDK) – agentní smyčka s nástroji a streamováním textu.
// Dva režimy: vlastní klíč uživatele (volání přímo na api.anthropic.com), nebo serverová proxy
// webu (/api/claude – Netlify Edge Function s klíčem provozovatele), když ji web nabízí.
import Anthropic from '@anthropic-ai/sdk';

export const MODELS = [
  { id: 'claude-opus-5', name: 'Claude Opus 5', note: 'nejvyšší kvalita (výchozí)' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', note: 'rychlejší, levnější' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', note: 'nejrychlejší' },
];

/** Serverová AI webu (zjištěno při startu z /api/claude/health). */
export const server = { checked: false, available: false, reason: null, models: [], limits: null };

export async function detectServerAI() {
  if (/^https?:$/.test(location.protocol)) {
    try {
      const r = await fetch('/api/claude/health', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        const j = await r.json();
        server.available = !!j.ai;
        server.reason = j.reason || null;
        server.models = Array.isArray(j.models) ? j.models : [];
        server.limits = j.limits || null;
      }
    } catch {
      /* web bez serverové AI (soubor, vývojový server) */
    }
  }
  server.checked = true;
  return server;
}

/** Použije se serverová proxy? (vlastní klíč má přednost) */
export function usesServer(settings) {
  return !settings.apiKey && server.available;
}

export function aiReady(settings) {
  return !!settings.apiKey || server.available;
}

/** Model, který se skutečně použije (server může povolit jen některé). */
export function effectiveModel(settings) {
  const m = settings.model || 'claude-opus-5';
  if (usesServer(settings) && server.models.length && !server.models.includes(m)) return server.models[0];
  return m;
}

let client = null;
let clientKey = null;

function getClient(settings) {
  const proxy = usesServer(settings);
  const apiKey = proxy ? 'server' : settings.apiKey;
  const baseURL = proxy ? `${location.origin}/api/claude` : settings.baseURL;
  const key = `${apiKey}|${baseURL || ''}`;
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 120_000, ...(baseURL ? { baseURL } : {}) });
    clientKey = key;
  }
  return client;
}

function params(settings, system, tools, messages) {
  const model = effectiveModel(settings);
  const p = {
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools,
    messages,
  };
  if (model === 'claude-haiku-4-5') return p;
  p.output_config = { effort: settings.effort || 'low' };
  if (model !== 'claude-opus-5') p.thinking = { type: 'adaptive' };
  // Opus 5: serverové záložní modely při odmítnutí bezpečnostním filtrem
  if (model === 'claude-opus-5') {
    p.betas = ['server-side-fallback-2026-07-01'];
    p.fallbacks = 'default';
  }
  return p;
}

/**
 * Jeden tah konverzace: volá model, vykonává nástroje, dokud model neskončí.
 * messages se průběžně doplňují (append-only historie).
 */
export async function agentTurn({ settings, system, tools, messages, onText, onBlockStart, onToolStart, onToolEnd, runTool, signal }) {
  const c = getClient(settings);
  let last = null;
  for (let iter = 0; iter < 10; iter++) {
    const p = params(settings, system, tools, messages);
    const stream = p.betas ? c.beta.messages.stream(p, { signal }) : c.messages.stream(p, { signal });
    stream.on('text', (delta) => onText?.(delta));
    stream.on('streamEvent', (ev) => {
      if (ev.type === 'content_block_start') onBlockStart?.(ev.content_block);
    });
    const msg = await stream.finalMessage();
    last = msg;
    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'refusal') {
      onText?.('\n\nTento požadavek nemohu zpracovat.');
      return msg;
    }
    if (msg.stop_reason === 'pause_turn') continue;
    if (msg.stop_reason !== 'tool_use') return msg;
    const results = [];
    for (const b of msg.content) {
      if (b.type !== 'tool_use') continue;
      onToolStart?.(b);
      let r;
      try {
        r = await runTool(b.name, b.input || {});
      } catch (e) {
        r = { content: `Chyba nástroje: ${e.message}`, summary: 'Chyba nástroje', error: true };
      }
      onToolEnd?.(b, r);
      results.push({ type: 'tool_result', tool_use_id: b.id, content: r.content, ...(r.error ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
  }
  return last;
}

/** Ověření klíče (nebo serverové AI) malým požadavkem. */
export async function testKey(settings) {
  const c = getClient(settings);
  const p = { model: effectiveModel(settings), max_tokens: 64, messages: [{ role: 'user', content: 'Odpověz jedním slovem: OK' }] };
  if (p.model !== 'claude-haiku-4-5') p.output_config = { effort: 'low' };
  const r = await c.messages.create(p);
  return r.content.find((b) => b.type === 'text')?.text ?? 'OK';
}

/** Srozumitelná chybová hláška. */
export function errorText(err) {
  // chyby serverové proxy webu mají vlastní česky formulovanou zprávu (denní limit, velikost…)
  if (err instanceof Anthropic.APIError && err.headers?.get?.('x-proxy-error') && err.error?.error?.message) return err.error.error.message;
  if (err instanceof Anthropic.AuthenticationError) return 'Neplatný API klíč – zkontrolujte ho v Nastavení.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Klíč nemá oprávnění k tomuto modelu.';
  if (err instanceof Anthropic.RateLimitError) return 'Překročen limit požadavků – zkuste to za chvíli.';
  if (err instanceof Anthropic.BadRequestError) return `Neplatný požadavek: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return 'Nelze se připojit k Claude API (offline?). Pokračuji v offline režimu.';
  if (err instanceof Anthropic.APIError) return `Chyba API ${err.status ?? ''}: ${err.message}`;
  if (err?.name === 'AbortError' || err instanceof Anthropic.APIUserAbortError) return 'Přerušeno.';
  return `Chyba: ${err?.message || err}`;
}

export function isConnectionError(err) {
  return err instanceof Anthropic.APIConnectionError;
}
