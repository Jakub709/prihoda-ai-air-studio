// AI konzultant – chat s agentem, který ovládá aplikaci nástroji.
import { agentTurn, aiReady, effectiveModel, errorText, isConnectionError } from '../ai/claude.js';
import { systemPrompt } from '../ai/prompts.js';
import { TOOLS, designSummary, describeToolInput, runTool } from '../ai/tools.js';
import { parseBrief, parseCommand } from '../ai/offline.js';
import { APPLICATIONS } from '../engine/catalog.js';
import { app } from '../app.js';
import { emit, on, patchProject, resetProject, state } from '../state.js';
import { esc, n0, n1, n2 } from './format.js';

let history = []; // zprávy pro API (append-only)
let busy = false;
let abort = null;
let SYSTEM = null;

const $ = (s) => document.querySelector(s);

export function aiAvailable() {
  return aiReady(state.settings);
}

function md(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^[-•*]\s+/.test(line)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inline(line.replace(/^[-•*]\s+/, ''))}</li>`;
      continue;
    }
    if (inList) {
      html += '</ul>';
      inList = false;
    }
    if (!line) continue;
    html += `<p>${inline(line.replace(/^#+\s*/, ''))}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
function inline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

function scroll() {
  const log = $('#chatLog');
  log.scrollTop = log.scrollHeight;
}

function addUser(text, images = []) {
  const log = $('#chatLog');
  log.querySelector('.chat-empty')?.remove();
  const el = document.createElement('div');
  el.className = 'msg user';
  el.innerHTML = `<div class="bubble">${images.map((im) => `<img src="${im.url}" alt="příloha">`).join('')}${esc(text).replace(/\n/g, '<br>')}</div>`;
  log.appendChild(el);
  scroll();
}

function addAI() {
  const log = $('#chatLog');
  log.querySelector('.chat-empty')?.remove();
  const el = document.createElement('div');
  el.className = 'msg ai';
  el.innerHTML = `<div class="who"><span class="av">AI</span>${aiAvailable() ? esc(modelName()) : 'Offline asistent'}</div>`;
  log.appendChild(el);
  let bubble = null;
  let text = '';
  let typing = document.createElement('div');
  typing.className = 'bubble typing';
  typing.innerHTML = '<i></i><i></i><i></i>';
  el.appendChild(typing);
  scroll();
  const api = {
    el,
    append(delta) {
      if (typing) {
        typing.remove();
        typing = null;
      }
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'bubble';
        el.appendChild(bubble);
      }
      text += delta;
      bubble.innerHTML = md(text);
      scroll();
    },
    newBubble() {
      bubble = null;
      text = '';
    },
    chip(label) {
      if (typing) {
        typing.remove();
        typing = null;
      }
      const c = document.createElement('div');
      c.className = 'tool-chip run';
      c.innerHTML = `<span class="ti"></span><span>${esc(label)}</span>`;
      el.appendChild(c);
      scroll();
      bubble = null;
      text = '';
      return {
        done(summary, error, undo) {
          c.classList.remove('run');
          c.querySelector('.ti').outerHTML = error ? '<span class="ti" style="color:var(--crit-ink)">✕</span>' : '<svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
          c.querySelector('span:last-child').textContent = summary;
          if (undo && !error) {
            const b = document.createElement('button');
            b.className = 'btn ghost sm';
            b.style.cssText = 'height:20px;padding:0 6px;margin-left:4px;color:var(--text-2)';
            b.title = 'Vrátit tuto změnu';
            b.textContent = '↶ vrátit';
            b.addEventListener('click', () => {
              undo();
              b.remove();
              c.style.opacity = '0.55';
            });
            c.appendChild(b);
          }
        },
      };
    },
    thinking() {
      if (!typing) {
        typing = document.createElement('div');
        typing.className = 'bubble typing';
        typing.innerHTML = '<i></i><i></i><i></i>';
        el.appendChild(typing);
        scroll();
      }
    },
    end() {
      if (typing) {
        typing.remove();
        typing = null;
      }
      if (!el.querySelector('.bubble') && !el.querySelector('.tool-chip')) el.remove();
    },
  };
  return api;
}

function modelName() {
  const m = effectiveModel(state.settings);
  return { 'claude-opus-5': 'Claude Opus 5', 'claude-sonnet-5': 'Claude Sonnet 5', 'claude-haiku-4-5': 'Claude Haiku 4.5' }[m] || m;
}

function stateBlock() {
  return `<stav_navrhu>${JSON.stringify(designSummary())}</stav_navrhu>`;
}

function setBusy(b) {
  busy = b;
  $('#aiStatus').classList.toggle('busy', b);
  const send = $('#chatForm button[type=submit]');
  send.innerHTML = b
    ? '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>';
  send.title = b ? 'Zastavit' : 'Odeslat';
}

/**
 * Odeslání zprávy AI (nebo offline asistentovi).
 * images: [{url, media_type, data}]
 */
export async function sendMessage(text, { images = [], brief = false } = {}) {
  if (busy) {
    emit('toast', 'AI právě pracuje – počkejte na dokončení nebo ji zastavte (■).');
    return;
  }
  app.setTab('chat');
  const shown = brief ? `Nové zadání: ${text}` : text;
  addUser(shown, images);
  state.chat.push({ role: 'user', text: shown });
  if (!aiAvailable()) {
    await offlineReply(text, { brief });
    return;
  }
  if (!SYSTEM) SYSTEM = systemPrompt();
  const content = [];
  for (const im of images) content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } });
  const instr = brief
    ? `Nové zadání projektu od zákazníka (zpracuj ho: nastav nový projekt nástrojem upravit_projekt s novy_projekt=true, pak stručně shrň návrh a klíčové předpoklady):\n\n${text}`
    : text;
  content.push({ type: 'text', text: `${instr}\n\n${stateBlock()}` });
  history.push({ role: 'user', content });
  const ui = addAI();
  setBusy(true);
  abort = new AbortController();
  const before = history.length;
  try {
    await agentTurn({
      settings: state.settings,
      system: SYSTEM,
      tools: TOOLS,
      messages: history,
      signal: abort.signal,
      onText: (d) => ui.append(d),
      onBlockStart: (b) => {
        if (b.type === 'thinking') ui.thinking();
      },
      onToolStart: (b) => {
        ui._chip = ui.chip(describeToolInput(b.name, b.input || {}));
        ui._snap = ['upravit_projekt', 'pouzit_variantu'].includes(b.name) ? JSON.parse(JSON.stringify(state.project)) : null;
      },
      onToolEnd: (b, r) => {
        const snap = ui._snap;
        ui._chip?.done(r.summary, r.error, snap && !r.noChange ? () => undoTo(snap) : null);
        ui.thinking();
      },
      runTool,
    });
  } catch (err) {
    console.error(err);
    // historie musí zůstat konzistentní (odebrat nedokončený tah)
    history.length = before - 1;
    ui.append(`\n\n${errorText(err)}`);
    if (isConnectionError(err)) await offlineReply(text, { brief, silentHeader: true });
  } finally {
    ui.end();
    setBusy(false);
    abort = null;
    renderSuggestions();
    if (state.view !== 'report' && document.querySelector('.tab.active')?.dataset.tab !== 'chat') {
      const b = $('#chatBadge');
      b.hidden = false;
      b.textContent = '•';
    }
  }
}

/** Vrácení změny AI – obnoví projekt ze snímku a přepočítá návrh. */
function undoTo(snap) {
  resetProject(snap.app, snap, { source: 'ai' });
  app.requestDesign({ immediate: true });
  const note = document.createElement('div');
  note.className = 'tool-chip';
  note.style.cssText = 'color:var(--text-2);background:var(--bg2);border-color:var(--line-2)';
  note.textContent = '↶ Změna vrácena – návrh obnoven';
  $('#chatLog').appendChild(note);
  scroll();
  // model se o vrácení dozví s další zprávou (aktuální stav je v bloku <stav_navrhu>)
}

// ----------------------------------------------------------------- offline
async function offlineReply(text, { brief = false, silentHeader = false } = {}) {
  const ui = silentHeader ? null : addAI();
  const out = ui || addAI();
  setBusy(true);
  await new Promise((r) => setTimeout(r, 350));
  try {
    const cmd = parseCommand(text);
    const parsed = parseBrief(text, brief ? null : state.project);
    const isBrief = brief || (parsed.app && (parsed.patch.L || parsed.patch.flow));
    if (isBrief) {
      const chip = out.chip('Rozbor zadání (offline parser) a nový návrh');
      const snap = JSON.parse(JSON.stringify(state.project));
      const key = parsed.app || state.project.app;
      state.assumptions = parsed.assumptions;
      emit('assumptions');
      resetProject(key, { ...parsed.patch, name: parsed.patch.customer ? `${APPLICATIONS[key].name} – ${parsed.patch.customer}` : APPLICATIONS[key].name }, { source: 'ai' });
      const d = await app.requestDesign({ immediate: true, progress: true });
      chip.done(`Návrh: ${d.n}× Ø${d.runs[0].D} · ${d.outlet.short} · ${d.inp.mode === 'heating' ? `v ${n2(d.metrics.vMax)} m/s` : `DR ${n0(d.metrics.drMax)} %`}`, false, () => undoTo(snap));
      out.append(designText(d, parsed.assumptions));
    } else if (Object.keys(parsed.patch).length) {
      const chip = out.chip(`Úprava parametrů: ${Object.keys(parsed.patch).join(', ')}`);
      const snap = JSON.parse(JSON.stringify(state.project));
      patchProject(parsed.patch, { source: 'ai' });
      const d = await app.requestDesign({ immediate: true });
      chip.done(`Přepočteno: ${d.n}× Ø${d.runs[0].D} · ${d.inp.mode === 'heating' ? `v ${n2(d.metrics.vMax)} m/s` : `DR ${n0(d.metrics.drMax)} %`}`, false, () => undoTo(snap));
      out.append(`Upraveno. ${shortText(d)}`);
    } else if (cmd.actions.length) {
      for (const a of cmd.actions) {
        if (a.view === 'report') app.openReport();
        else if (a.view) app.setView(a.view);
        if (a.camera) app.viz.setCamera(a.camera);
        if (a.heat) {
          state.layers.heat = a.heat;
          app.viz.setLayers(state.layers);
          emit('design', state.design);
        }
      }
      out.append('Hotovo – přepnul jsem zobrazení.');
    } else if (cmd.explain) {
      out.append(state.design ? `**Proč tento návrh:**\n${state.design.rationale.map((r) => `- ${r}`).join('\n')}` : 'Návrh se ještě počítá.');
    } else {
      out.append(
        'V offline režimu rozumím zadání projektu (rozměry, průtok, teploty, typ provozu), změnám parametrů („zvyš průtok na 15 000 m³/h“, „barva červená“, „půlkruhové potrubí“) a příkazům („ukaž CFD“, „porovnej s plechem“, „připrav nabídku“). Pro plnohodnotného AI konzultanta vložte API klíč v Nastavení (na webu s nastavenou serverovou AI není klíč potřeba).',
      );
    }
  } finally {
    out.end();
    setBusy(false);
    renderSuggestions();
  }
}

function designText(d, assumptions = []) {
  const m = d.metrics;
  const i = d.inp;
  let t = `Navrhuji **${d.n}× ${d.shape === 'C' ? 'Ø' : 'půlkruh '}${d.runs[0].D} mm** po ${n1(d.runs[0].len)} m, ${d.outlet.name.toLowerCase()} v poloze ${d.outlet.patternName}, statický tlak ${d.outlet.p} Pa (z ${n0(d.stats.evaluated)} vyhodnocených variant).\n`;
  t += `- V pobytové zóně max. **${n2(m.vMax)} m/s**, průvan DR ${n0(m.drMax)} % (${i.catLabel}).\n`;
  if (i.mode === 'heating') t += `- Teplý vzduch pronikne do pobytové zóny (${n0(Math.min(100, m.penetration * 100))} %), rozdíl teplot hlava–kotníky ${n1(m.gradient)} K.\n`;
  t += `- Materiál ${d.material.code} (${d.material.name}), rychlost v potrubí ${n1(d.runs[0].vIn)} m/s.\n`;
  t += `- Oproti plechu o ${n0(100 * (1 - d.totalWeight / d.conventional.steelKg))} % nižší hmotnost a cca ${n0(d.conventional.steelHours - d.conventional.fabricHours)} montážních hodin méně.`;
  if (assumptions.length) t += `\n\nPředpoklady: ${assumptions.join('; ')}.`;
  return t;
}
function shortText(d) {
  const tail = d.inp.mode === 'heating' ? `průnik teplého vzduchu ${n0(Math.min(100, d.metrics.penetration * 100))} %` : `DR ${n0(d.metrics.drMax)} %`;
  return `Nyní ${d.n}× Ø${d.runs[0].D} mm, ${d.outlet.short}, max. ${n2(d.metrics.vMax)} m/s v pobytové zóně, ${tail}.`;
}

// ----------------------------------------------------------------- návrhy dotazů
function renderSuggestions() {
  const box = $('#chatSuggest');
  const d = state.design;
  if (!d) return;
  const s = [];
  s.push(`Proč ${d.outlet.name.toLowerCase()}?`);
  if (d.inp.mode === 'cooling') s.push('Co když bude přívod o 3 °C chladnější?');
  else s.push('Dostane se teplo až k lidem?');
  s.push('Ukaž mi v hale, kde by táhlo');
  s.push('Porovnej to s plechovým potrubím');
  s.push('Zákazník chce tišší provoz');
  s.push('Změň barvu na firemní modrou');
  s.push('Připrav nabídku v angličtině');
  box.innerHTML = s.slice(0, 6).map((x) => `<button class="suggest">${esc(x)}</button>`).join('');
}

export function mountChat() {
  const log = $('#chatLog');
  log.innerHTML = `<div class="chat-empty"><b>AI aplikační inženýr Příhoda</b>Zadejte projekt vlastními slovy, zeptejte se na návrh, nebo chtějte změnu – AI sama upraví parametry, přepočítá fyzikální model a ukáže výsledek ve 3D.</div>`;
  const form = $('#chatForm');
  const input = $('#chatInput');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) {
      abort?.abort();
      return;
    }
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    input.style.height = '';
    sendMessage(t);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  });
  $('#chatSuggest').addEventListener('click', (e) => {
    const b = e.target.closest('.suggest');
    if (b) sendMessage(b.textContent);
  });
  on('design', renderSuggestions);
  on('settings', () => {
    SYSTEM = null;
  });
}

export function resetChat() {
  history = [];
  state.chat = [];
  $('#chatLog').innerHTML = `<div class="chat-empty"><b>Nová konverzace</b>Historie byla vymazána.</div>`;
}
