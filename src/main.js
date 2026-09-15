// Příhoda AI Air Studio – vstupní bod aplikace.
import './styles/app.css';
import latinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import latinExtUrl from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url';
import { APPLICATIONS } from './engine/catalog.js';
import { computeDesignAsync } from './engine/client.js';
import { app } from './app.js';
import { emit, on, patchProject, resetProject, saveProject, state } from './state.js';
import { Viz3D } from './viz3d/scene.js';
import { mountInputs } from './ui/inputs.js';
import { mountResults } from './ui/results.js';
import { mountViewportUI } from './ui/viewport.js';
import { mountCfdView } from './ui/cfdView.js';
import { mountAnalysis } from './ui/analysis.js';
import { mountCompare } from './ui/compare.js';
import { mountReport } from './ui/report.js';
import { aiAvailable, mountChat, sendMessage } from './ui/chat.js';
import { openSettings, updateAiPill } from './ui/settings.js';
import { showSplash } from './ui/splash.js';
import { runDemo } from './ui/demo.js';
import { openMethodology } from './ui/methodology.js';
import { toast } from './ui/toast.js';
import { n0, n1, n2 } from './ui/format.js';
import { parseBrief } from './ai/offline.js';
import { detectServerAI } from './ai/claude.js';
import { listen, speechSupported } from './ai/speech.js';

// ---------- písmo (vložené do buildu, funguje offline) ----------
const fontCss = document.createElement('style');
fontCss.textContent = `
@font-face{font-family:'InterVar';font-style:normal;font-display:swap;font-weight:100 900;src:url(${latinUrl}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}
@font-face{font-family:'InterVar';font-style:normal;font-display:swap;font-weight:100 900;src:url(${latinExtUrl}) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;}`;
document.head.appendChild(fontCss);

const $ = (s) => document.querySelector(s);

// ---------- 3D (s bezpečným fallbackem, kdyby WebGL nebylo k dispozici) ----------
function createViz() {
  try {
    return new Viz3D($('#viewport'), $('#labels3d'));
  } catch (e) {
    console.error('WebGL nedostupné', e);
    $('#viewport').insertAdjacentHTML('beforeend', '<div class="chat-empty" style="position:absolute;inset:auto 20% 40%;z-index:9"><b>3D zobrazení vyžaduje WebGL</b>Zapněte hardwarovou akceleraci v prohlížeči (Chrome / Edge). Výpočty, CFD, analýza i nabídka fungují dál.</div>');
    const noop = () => {};
    return { on: noop, setLayers: noop, setDesign: noop, setMode: noop, setActive: noop, setCamera: noop, replayInflation: noop, setArt: noop, resize: noop, snapshot: () => '', w: 0, flow: null, design: null };
  }
}
const viz = createViz();
viz.setLayers(state.layers);
app.viz = viz;
window.__viz = viz; // ladění

// ---------- výpočet návrhu ----------
let designTimer = null;
let designToken = 0;
let progressShown = false;

const STEPS = [
  ['cat', 'Katalog Příhoda: průměry, materiály, typy výustí'],
  ['var', 'Optimalizace variant (větve × výstup × tlak × otvory)'],
  ['jet', 'Integrální model proudů se vztlakem a stratifikací'],
  ['oz', 'Komfort pobytové zóny – ISO 7730, ADPI'],
  ['bom', 'Kusovník, montáž, kontroly'],
  ['cmp', 'Srovnání s plechovým rozvodem'],
];

function showProgress() {
  const box = $('#designProgress');
  $('#progressSteps').innerHTML = STEPS.map(([k, t]) => `<div class="pstep" data-k="${k}"><span class="pi"></span>${t}<span class="pv"></span></div>`).join('');
  box.hidden = false;
  progressShown = true;
  let i = 0;
  const tick = () => {
    if (!progressShown) return;
    const els = [...document.querySelectorAll('.pstep')];
    els.forEach((el, k) => {
      el.classList.toggle('done', k < i);
      el.classList.toggle('run', k === i);
      if (k < i) el.querySelector('.pi').textContent = '✓';
    });
    if (i < els.length - 1) {
      i++;
      setTimeout(tick, 230);
    }
  };
  tick();
}
function finishProgress(d) {
  if (!progressShown) return;
  const vals = {
    cat: `${d.n}× Ø${d.runs[0].D}`,
    var: `${n0(d.stats.evaluated)} variant`,
    jet: `dosah ${n1(d.metrics.throw02 || 0)} m`,
    oz: `DR ${n0(d.metrics.drMax)} %`,
    bom: `${d.bom.length} položek`,
    cmp: `−${n0(100 * (1 - d.totalWeight / d.conventional.steelKg))} % hmotnosti`,
  };
  document.querySelectorAll('.pstep').forEach((el) => {
    el.classList.remove('run');
    el.classList.add('done');
    el.querySelector('.pi').textContent = '✓';
    el.querySelector('.pv').textContent = vals[el.dataset.k] || '';
  });
  setTimeout(() => {
    $('#designProgress').hidden = true;
    progressShown = false;
  }, 900);
}

// Každé volání vrací Promise s návrhem, jehož výpočet začal až po tomto volání
// (tj. návrh už obsahuje změny projektu provedené před voláním).
let callSeq = 0;
const waiters = [];
function requestDesign({ immediate = false, progress = false, animate = true } = {}) {
  const mySeq = ++callSeq;
  const promise = new Promise((resolve) => waiters.push({ seq: mySeq, resolve }));
  clearTimeout(designTimer);
  const run = () => {
    const token = ++designToken;
    const startSeq = callSeq;
    if (progress && state.view !== 'cfd' && state.view !== 'analysis') showProgress();
    const t0 = performance.now();
    computeDesignAsync(state.project)
      .then((d) => {
        if (token !== designToken) return;
        const wait = progress ? Math.max(0, 1250 - (performance.now() - t0)) : 0;
        setTimeout(() => {
          if (token !== designToken) return;
          d.at = Date.now();
          const prev = state.design;
          // animace „zapnutí ventilátoru“ jen při změně geometrie rozvodu nebo novém projektu
          const geomChanged = !prev || prev.n !== d.n || prev.runs[0].D !== d.runs[0].D || prev.shape !== d.shape || prev.inp.L !== d.inp.L || prev.inp.W !== d.inp.W || prev.inp.H !== d.inp.H;
          state.design = d;
          viz.setDesign(d, { animate: animate && (geomChanged || progress), keepCamera: !progress });
          emit('design', d);
          if (progress) finishProgress(d);
          syncPresets();
          updateStatus();
          for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].seq <= startSeq) {
              waiters[i].resolve(d);
              waiters.splice(i, 1);
            }
          }
        }, wait);
      })
      .catch((err) => {
        console.error(err);
        toast(`Výpočet selhal: ${err.message}`, 'err');
        $('#designProgress').hidden = true;
        progressShown = false;
        for (const w of waiters.splice(0)) w.resolve(state.design);
      });
  };
  if (immediate) run();
  else designTimer = setTimeout(run, 380);
  return promise;
}
app.requestDesign = requestDesign;
app.awaitDesign = (timeout = 15000) =>
  new Promise((resolve) => {
    let done = false;
    const off = on('design', (d) => {
      if (done) return;
      done = true;
      off();
      resolve(d);
    });
    setTimeout(() => {
      if (done) return;
      done = true;
      off();
      resolve(state.design);
    }, timeout);
  });

on('project', ({ source, reset }) => {
  $('#projectName').value = state.project.name || '';
  if (source === 'ai') return; // AI si výpočet vyžádá sama (immediate)
  const big = reset || source === 'preset' || source === 'brief';
  requestDesign({ immediate: big, progress: big, animate: true });
});
on('applyVariant', (i) => {
  const v = state.design?.variants?.[i];
  if (!v) return;
  patchProject({ runs: v.n, outlet: v.outlet, pattern: v.pattern, pressure: v.p, holeSize: v.holeSize ?? 'auto' }, { source: 'variant' });
  toast(`Použita varianta: ${v.n}× Ø${v.D} · ${v.outletName} · ${v.patternName}`);
});
on('toast', (msg) => toast(msg));
on('art', (img) => {
  state.artImage = img;
  viz.setArt(img);
  toast('Prihoda ART: motiv aplikován na vyústky');
});

// ---------- panely ----------
mountInputs($('#params'));
mountResults($('#tabResults'));
mountViewportUI(viz);
mountCfdView($('#viewCfd'));
mountAnalysis($('#viewAnalysis'));
mountCompare($('#compareStrip'));
mountReport($('#report'));
mountChat();
updateAiPill();
// web s AI na serveru (Netlify) – AI funguje bez klíče
detectServerAI().then((s) => {
  if (!s.available) return;
  updateAiPill();
  emit('settings');
});

// ---------- šablony ----------
const presets = $('#presets');
const SHORT = { food: 'Potraviny', cold: 'Chladírna', sports: 'Sport', pool: 'Bazén', industry: 'Výroba', store: 'Obchod', office: 'Kancelář', kitchen: 'Kuchyně', warehouse: 'Sklad', lab: 'Laboratoř' };
presets.innerHTML = Object.values(APPLICATIONS)
  .map((a) => `<button class="preset" data-app="${a.key}" title="${a.name}"><span class="ico">${a.icon}</span>${SHORT[a.key] || a.name}</button>`)
  .join('');
presets.addEventListener('click', (e) => {
  const b = e.target.closest('.preset');
  if (!b) return;
  const a = APPLICATIONS[b.dataset.app];
  $('#briefInput').value = a.brief;
  state.assumptions = [];
  emit('assumptions');
  resetProject(a.key, { name: a.name }, { source: 'preset' });
});
function syncPresets() {
  presets.querySelectorAll('.preset').forEach((b) => b.classList.toggle('active', b.dataset.app === state.project.app));
}

// ---------- zadání (brief): text, hlas, obrázky ----------
let briefImages = [];
function renderAttach() {
  const box = $('#briefAttach');
  box.hidden = !briefImages.length;
  box.innerHTML = briefImages.map((im, i) => `<div class="attach-chip"><img src="${im.url}" alt=""><button data-i="${i}" title="Odebrat">✕</button></div>`).join('');
  box.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      briefImages.splice(+b.dataset.i, 1);
      renderAttach();
    }),
  );
}
async function addImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const max = 1568;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', 0.88);
  briefImages.push({ url: dataUrl, media_type: 'image/jpeg', data: dataUrl.split(',')[1] });
  renderAttach();
  if (!aiAvailable()) toast('Analýza fotografie vyžaduje připojení AI (Nastavení → API klíč).', 'warn');
}
$('#btnAttach').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (e) => {
  for (const f of e.target.files) addImage(f);
  e.target.value = '';
});
const drop = $('#briefDrop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('drag');
});
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('drag');
  for (const f of e.dataTransfer.files) addImage(f);
});
$('#briefInput').addEventListener('paste', (e) => {
  for (const it of e.clipboardData?.items || []) if (it.type.startsWith('image/')) addImage(it.getAsFile());
});

async function submitBrief() {
  const text = $('#briefInput').value.trim();
  if (!text && !briefImages.length) {
    toast('Napište zadání, nadiktujte ho nebo vyberte šablonu níže.', 'warn');
    return;
  }
  if (aiAvailable()) {
    const imgs = briefImages;
    briefImages = [];
    renderAttach();
    sendMessage(text || 'Navrhni rozvod podle přiloženého obrázku.', { images: imgs, brief: true });
    return;
  }
  const r = parseBrief(text, null);
  state.assumptions = r.assumptions;
  emit('assumptions');
  const key = r.app || state.project.app;
  resetProject(key, { ...r.patch, name: r.patch.customer ? `${APPLICATIONS[key].name} – ${r.patch.customer}` : APPLICATIONS[key].name }, { source: 'brief' });
  toast(`Offline parser rozpoznal ${r.understood} údajů ze zadání${r.assumptions.length ? ` · ${r.assumptions.length} předpokladů` : ''}`);
}
$('#btnDesign').addEventListener('click', submitBrief);
$('#briefInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitBrief();
});

// diktování
function micButton(btn, target, onFinal) {
  if (!speechSupported()) {
    btn.title = 'Diktování vyžaduje Chrome nebo Edge';
    btn.style.opacity = '0.45';
  }
  let stop = null;
  btn.addEventListener('click', () => {
    if (stop) {
      stop();
      return;
    }
    const base = target.value.trim();
    btn.classList.add('recording');
    stop = listen({
      onText: (t) => {
        target.value = (base ? `${base} ` : '') + t;
      },
      onEnd: (t) => {
        btn.classList.remove('recording');
        stop = null;
        if (t && state.settings.autoSend) onFinal?.();
      },
      onError: (msg) => toast(msg, 'warn'),
    });
  });
}
micButton($('#btnMic'), $('#briefInput'), submitBrief);
micButton($('#chatMic'), $('#chatInput'), () => $('#chatForm').requestSubmit());

// ---------- přepínání pohledů ----------
function setView(v) {
  state.view = v;
  document.querySelectorAll('#viewSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  $('#viewDesign').classList.toggle('active', v === 'design' || v === 'compare');
  $('#viewDesign').classList.toggle('compare', v === 'compare');
  $('#viewCfd').classList.toggle('active', v === 'cfd');
  $('#viewAnalysis').classList.toggle('active', v === 'analysis');
  $('#splitBadges').hidden = v !== 'compare';
  $('#compareStrip').hidden = v !== 'compare';
  viz.setActive(v === 'design' || v === 'compare');
  viz.setMode(v === 'compare' ? 'compare' : 'design');
  emit('view', v);
}
app.setView = setView;
$('#viewSwitch').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setView(b.dataset.view);
});
on('setView', setView);

// ---------- pravý panel: záložky ----------
function setTab(tab) {
  document.querySelectorAll('.tabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
  $('#tabResults').classList.toggle('active', tab === 'results');
  $('#tabChat').classList.toggle('active', tab === 'chat');
  if (tab === 'chat') $('#chatBadge').hidden = true;
}
app.setTab = setTab;
document.querySelectorAll('.tabs .tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

// ---------- horní lišta ----------
$('#projectName').addEventListener('change', (e) => patchProject({ name: e.target.value }));
$('#btnSettings').addEventListener('click', openSettings);
$('#aiStatus').addEventListener('click', openSettings);
$('#btnReport').addEventListener('click', () => app.openReport());
$('#btnDemo').addEventListener('click', () => runDemo());

// prezentační režim
function togglePresent() {
  const on_ = !document.getElementById('app').classList.contains('present');
  document.getElementById('app').classList.toggle('present', on_);
  if (on_ && state.view !== 'design' && state.view !== 'compare') setView('design');
  let hud = document.getElementById('presentHud');
  if (on_) {
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'presentHud';
      hud.className = 'present-hud';
      $('#viewDesign').appendChild(hud);
    }
    renderHud();
    toast('Prezentační režim – klávesa P nebo Esc pro návrat');
  } else hud?.remove();
  setTimeout(() => viz.resize(), 50);
}
function renderHud() {
  const hud = document.getElementById('presentHud');
  const d = state.design;
  if (!hud || !d) return;
  hud.innerHTML = `
    <div class="h"><div class="k">Rozvod</div><div class="v">${d.n}× Ø${d.runs[0].D}<small> mm</small></div></div>
    <div class="h"><div class="k">${d.outlet.short}</div><div class="v">${d.outlet.p}<small> Pa</small></div></div>
    <div class="h"><div class="k">Rychlost v zóně</div><div class="v">${n2(d.metrics.vMax)}<small> m/s</small></div></div>
    <div class="h"><div class="k">Průvan DR</div><div class="v">${n0(d.metrics.drMax)}<small> %</small></div></div>
    <div class="h"><div class="k">Hmotnost vs. plech</div><div class="v">−${n0(100 * (1 - d.totalWeight / d.conventional.steelKg))}<small> %</small></div></div>`;
}
on('design', renderHud);
$('#btnPresent').addEventListener('click', togglePresent);

// ---------- stavový řádek ----------
function updateStatus() {
  const d = state.design;
  const sb = $('#statusbar');
  if (!d) return;
  $('#projectMeta').textContent = `${d.inp.app.name} · ${n1(d.inp.L)} × ${n1(d.inp.W)} × ${n1(d.inp.H)} m · ${n0(d.inp.flow)} m³/h`;
  sb.innerHTML = `<span>Model: <b>integrální model proudů (MTT) · vztlak · stratifikace</b></span>
    <span>Komfort: <b>ISO 7730 · ASHRAE 113</b></span>
    <span>Data: <b>katalog Příhoda 1/2024</b></span>
    <span class="sp">Výpočet ${n0(d.stats.msTotal)} ms · ${n0(d.stats.evaluated)} variant</span>
    <span><a href="#" id="lnkMethod" style="color:var(--teal-ink)">Metodika výpočtu</a></span>
    <span>Klávesy: 1–4 pohledy · P prezentace · Ctrl+Enter navrhnout</span>
    <span>Koncept pro výuku AI · není oficiální produkt Příhoda s.r.o.</span>`;
}

// ---------- klávesy ----------
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#report').hidden) $('#report').hidden = true;
    else if (document.getElementById('app').classList.contains('present')) togglePresent();
    else if (!$('#modal').hidden) {
      $('#modal').hidden = true;
      $('#modal').innerHTML = '';
    }
    return;
  }
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'p' || e.key === 'P') togglePresent();
  if (e.key === '1') setView('design');
  if (e.key === '2') setView('cfd');
  if (e.key === '3') setView('compare');
  if (e.key === '4') setView('analysis');
});

$('#statusbar').addEventListener('click', (e) => {
  if (e.target.id === 'lnkMethod') {
    e.preventDefault();
    openMethodology();
  }
});

// ---------- start ----------
// sdílený odkaz na projekt (#p=…)
if (location.hash.startsWith('#p=')) {
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(3)))));
    if (p && APPLICATIONS[p.app]) state.project = { ...state.project, ...p };
    history.replaceState(null, '', location.href.split('#')[0]);
  } catch (e) {
    console.warn('Neplatný odkaz na projekt', e);
  }
}
$('#projectName').value = state.project.name || '';
$('#briefInput').value = APPLICATIONS[state.project.app]?.brief || '';
syncPresets();
saveProject();
requestDesign({ immediate: true, progress: false, animate: true });
if (new URLSearchParams(location.search).has('nosplash')) document.getElementById('splash').remove();
else
  showSplash({
    onStart: () => viz.replayInflation(),
    onDemo: () => setTimeout(() => runDemo(), 400),
  });
