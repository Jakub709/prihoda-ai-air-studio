// Nastavení AI (API klíč, model, hloubka uvažování).
import { MODELS, aiReady, effectiveModel, errorText, server, testKey, usesServer } from '../ai/claude.js';
import { emit, saveSettings, state } from '../state.js';
import { esc } from './format.js';
import { toast } from './toast.js';

export function updateAiPill() {
  const pill = document.getElementById('aiStatus');
  const on = aiReady(state.settings);
  pill.classList.toggle('on', on);
  const id = effectiveModel(state.settings);
  const m = MODELS.find((x) => x.id === id);
  pill.querySelector('.label').textContent = on ? (m ? m.name : id) : 'Offline režim';
  pill.title = on ? (usesServer(state.settings) ? 'AI konzultant – přes server webu' : 'AI konzultant – vlastní API klíč') : 'Nastavení AI';
}

export function openSettings() {
  const modal = document.getElementById('modal');
  const s = state.settings;
  const srv = server.available;
  const models = srv && !s.apiKey && server.models.length ? MODELS.filter((m) => server.models.includes(m.id)) : MODELS;
  const current = effectiveModel(s);
  const lim = server.limits;
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-label="Nastavení AI">
      <div class="modal-head"><h3>Nastavení AI konzultanta</h3><button class="btn ghost icon-only" data-close title="Zavřít">✕</button></div>
      <div class="modal-body">
        <p>Aplikace používá <b>Claude</b> (Anthropic) jako AI aplikačního inženýra: rozumí zadání (text, hlas, fotografie půdorysu), ovládá návrhový engine a 3D model, vysvětluje a píše nabídky. Bez AI funguje <b>offline režim</b> s pravidlovým parserem češtiny.</p>
        ${srv ? `<div class="note-box" style="margin-bottom:10px"><b>Na tomto webu je AI zapnutá</b> – klíč nepotřebujete.${lim ? ` Denní limit ${lim.perIpDay} dotazů na připojení.` : ''} Pokud vložíte vlastní klíč, použije se místo serveru.</div>` : ''}
        <div class="field"><label>Anthropic API klíč${srv ? ' (nepovinné)' : ''}</label>
          <div class="inp"><input id="setKey" type="password" autocomplete="off" spellcheck="false" placeholder="${srv ? 'nechte prázdné – AI běží přes server webu' : 'sk-ant-…'}" value="${esc(s.apiKey)}" /><button class="btn ghost sm" id="setShow" type="button">Zobrazit</button></div>
        </div>
        <div class="field"><label>Model</label>
          <div class="inp"><select id="setModel">${models.map((m) => `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${m.name} – ${m.note}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Hloubka uvažování (effort)</label>
          <div class="seg" id="setEffort">${['low', 'medium', 'high'].map((e) => `<button type="button" data-v="${e}" class="${s.effort === e ? 'active' : ''}">${{ low: 'Rychlá (demo)', medium: 'Vyvážená', high: 'Důkladná' }[e]}</button>`).join('')}</div>
        </div>
        <div class="toggle-row"><span>Po nadiktování zadání rovnou odeslat</span><label class="switch"><input type="checkbox" id="setAuto" ${s.autoSend ? 'checked' : ''}/><span></span></label></div>
        <div class="note-box">Vlastní klíč se ukládá pouze v tomto prohlížeči (localStorage) a posílá se výhradně na <code>api.anthropic.com</code>.${srv ? ' Bez vlastního klíče jdou dotazy přes server tohoto webu, který klíč provozovatele nikdy neposílá do prohlížeče.' : ''} U modelu Opus 5 je zapnutý serverový záložní model pro případ odmítnutí bezpečnostním filtrem.</div>
        <div id="setMsg" class="note"></div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="setClear">Odebrat klíč</button>
        <span style="flex:1"></span>
        <button class="btn" id="setTest">Ověřit připojení</button>
        <button class="btn primary" id="setSave">Uložit</button>
      </div>
    </div>`;
  modal.hidden = false;
  const close = () => {
    modal.hidden = true;
    modal.innerHTML = '';
  };
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };
  let effort = s.effort;
  modal.querySelectorAll('#setEffort button').forEach((b) =>
    b.addEventListener('click', () => {
      effort = b.dataset.v;
      modal.querySelectorAll('#setEffort button').forEach((x) => x.classList.toggle('active', x === b));
    }),
  );
  modal.querySelector('#setShow').addEventListener('click', (e) => {
    const k = modal.querySelector('#setKey');
    k.type = k.type === 'password' ? 'text' : 'password';
    e.currentTarget.textContent = k.type === 'password' ? 'Zobrazit' : 'Skrýt';
  });
  const collect = () => ({
    ...state.settings,
    apiKey: modal.querySelector('#setKey').value.trim(),
    model: modal.querySelector('#setModel').value,
    effort,
    autoSend: modal.querySelector('#setAuto').checked,
  });
  modal.querySelector('#setTest').addEventListener('click', async () => {
    const msg = modal.querySelector('#setMsg');
    const cfg = collect();
    if (!cfg.apiKey && !server.available) {
      msg.textContent = 'Nejdřív vložte API klíč.';
      return;
    }
    msg.textContent = 'Ověřuji…';
    try {
      const r = await testKey(cfg);
      msg.innerHTML = `<span style="color:var(--good-ink)">✓ Připojeno – model odpověděl: „${esc(r.slice(0, 40))}“</span>`;
    } catch (e) {
      msg.innerHTML = `<span style="color:var(--crit-ink)">${esc(errorText(e))}</span>`;
    }
  });
  modal.querySelector('#setSave').addEventListener('click', () => {
    Object.assign(state.settings, collect());
    saveSettings();
    updateAiPill();
    emit('settings');
    toast(state.settings.apiKey ? 'AI konzultant je připojen (vlastní klíč)' : server.available ? 'Uloženo – AI běží přes server webu' : 'Uloženo – offline režim');
    close();
  });
  modal.querySelector('#setClear').addEventListener('click', () => {
    state.settings.apiKey = '';
    saveSettings();
    updateAiPill();
    emit('settings');
    close();
    if (server.available) toast('Klíč odebrán – AI běží přes server webu');
    else toast('Klíč odebrán – offline režim', 'warn');
  });
}
