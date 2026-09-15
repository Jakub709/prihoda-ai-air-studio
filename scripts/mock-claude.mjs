// Lokální mock Claude Messages API (SSE streaming) pro test agentní smyčky bez API klíče.
// node scripts/mock-claude.mjs  → http://127.0.0.1:8787
import http from 'node:http';

const PORT = 8787;
let n = 0;

function sse(res, events) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
  });
  let i = 0;
  const next = () => {
    if (i >= events.length) return res.end();
    const [ev, data] = events[i++];
    res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
    setTimeout(next, ev === 'content_block_delta' ? 25 : 5);
  };
  next();
}

function textBlocks(index, text) {
  const out = [['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]];
  for (const chunk of text.match(/.{1,12}/gs)) out.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: chunk } }]);
  out.push(['content_block_stop', { type: 'content_block_stop', index }]);
  return out;
}

function toolBlock(index, id, name, input) {
  const json = JSON.stringify(input);
  const out = [['content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } }]];
  for (const chunk of json.match(/.{1,20}/gs)) out.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: chunk } }]);
  out.push(['content_block_stop', { type: 'content_block_stop', index }]);
  return out;
}

function message(blocks, stop) {
  return [
    ['message_start', { type: 'message_start', message: { id: `msg_${++n}`, type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } }],
    ...blocks,
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 50 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
}

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'POST, GET, OPTIONS',
      });
      return res.end();
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = body ? JSON.parse(body) : {};
      const msgs = j.messages || [];
      const last = msgs[msgs.length - 1];
      const beta = req.headers['anthropic-beta'];
      const sys = Array.isArray(j.system) ? j.system.map((b) => b.text).join('') : j.system || '';
      console.log(`${req.method} ${req.url} key=${req.headers['x-api-key']} model=${j.model} beta=${beta} fallbacks=${JSON.stringify(j.fallbacks)} effort=${j.output_config?.effort} msgs=${msgs.length} tools=${(j.tools || []).length} stream=${j.stream} system=${sys.length}zn. max_tokens=${j.max_tokens}`);
      if (!j.stream) {
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        return res.end(JSON.stringify({ id: 'msg_t', type: 'message', role: 'assistant', model: j.model, content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 1 } }));
      }
      const isToolResult = Array.isArray(last?.content) && last.content.some((b) => b.type === 'tool_result');
      if (isToolResult) {
        const tr = last.content.find((b) => b.type === 'tool_result');
        let summary = '';
        try {
          const s = JSON.parse(tr.content);
          summary = `${s.navrh.vetve}× Ø${s.navrh.prumer_mm} mm, ${s.navrh.vystup}, DR ${s.komfort.DR_max_pct} %`;
        } catch {
          summary = String(tr.content).slice(0, 60);
        }
        return sse(res, message(textBlocks(0, `Hotovo. Nový návrh: **${summary}**.\n- Vyústky jsou teď červené (RE, RAL 3001).\n- Průtok jsem zvýšil podle zadání.`), 'end_turn'));
      }
      const userText = (Array.isArray(last?.content) ? last.content.find((b) => b.type === 'text')?.text : last?.content) || '';
      if (/nabídk/i.test(userText)) {
        return sse(res, message([...textBlocks(0, 'Připravuji nabídku.'), ...toolBlock(1, 'toolu_n', 'pripravit_nabidku', { jazyk: 'en', osloveni: 'Thank you for your inquiry.', popis_reseni: 'Two fabric ducts Ø630 mm with directional microperforation.', prinosy: ['Draft-free air', '95 % lighter than steel'], doporuceni: ['Confirm dimensions'] })], 'tool_use'));
      }
      return sse(res, message([...textBlocks(0, 'Rozumím, upravím návrh.'), ...toolBlock(1, `toolu_${n}`, 'upravit_projekt', { prutok_m3h: 15000, barva: 'RE', predpoklady: ['Mock: test agentní smyčky'] })], 'tool_use'));
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`mock Claude API na http://127.0.0.1:${PORT}`));
