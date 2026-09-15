// Autopilot prezentace – projde celý příběh aplikace s titulky.
import { APPLICATIONS } from '../engine/catalog.js';
import { app } from '../app.js';
import { emit, state } from '../state.js';
import { aiAvailable, sendMessage } from './chat.js';

let running = false;
let cancelled = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function captionBar() {
  let el = document.getElementById('demoCaption');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demoCaption';
    el.style.cssText =
      'position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:70;max-width:min(880px,90vw);background:rgba(8,15,21,.94);border:1px solid rgba(0,169,142,.55);border-radius:14px;padding:12px 16px 10px;box-shadow:0 12px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px;font-size:15px;backdrop-filter:blur(8px)';
    el.innerHTML = '<div style="display:flex;gap:14px;align-items:center"><span id="dcStep" style="color:#62e3c9;font-weight:700;font-size:12px;letter-spacing:.1em;white-space:nowrap"></span><span id="dcText" style="flex:1"></span><button class="btn sm" id="dcStop">Ukončit</button></div><div style="height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden"><i id="dcBar" style="display:block;height:100%;width:0;background:#00a98e;transition:width .6s"></i></div>';
    document.body.appendChild(el);
    el.querySelector('#dcStop').addEventListener('click', () => {
      cancelled = true;
    });
  }
  return {
    show(i, n, text) {
      el.hidden = false;
      el.querySelector('#dcStep').textContent = `${i} / ${n}`;
      el.querySelector('#dcText').textContent = text;
      el.querySelector('#dcBar').style.width = `${(100 * i) / n}%`;
    },
    hide() {
      el.remove();
    },
  };
}

async function typewriter(el, text) {
  el.value = '';
  el.focus();
  for (let i = 0; i < text.length; i++) {
    if (cancelled) return;
    el.value += text[i];
    el.scrollTop = el.scrollHeight;
    await sleep(text[i] === ' ' ? 18 : 24);
  }
}

export async function runDemo() {
  if (running) return;
  running = true;
  cancelled = false;
  const cap = captionBar();
  const N = 8;
  const esc = (e) => {
    if (e.key === 'Escape') cancelled = true;
  };
  window.addEventListener('keydown', esc);
  const stop = () => cancelled;
  try {
    const a = APPLICATIONS.food;
    app.setView('design');
    cap.show(1, N, 'Zákazník popíše provoz vlastními slovy – napsat, nadiktovat nebo nafotit půdorys.');
    await typewriter(document.getElementById('briefInput'), a.brief);
    if (stop()) return;
    await sleep(500);

    cap.show(2, N, aiAvailable() ? 'Claude rozebere zadání, nastaví projekt a fyzikální engine vyhodnotí stovky variant.' : 'AI parser rozebere zadání a fyzikální engine vyhodnotí stovky variant.');
    const wait = app.awaitDesign(20000);
    if (aiAvailable()) sendMessage(a.brief, { brief: true });
    else document.getElementById('btnDesign').click();
    await wait;
    if (stop()) return;
    await sleep(2600);

    cap.show(3, N, 'Ventilátor běží: vyústky se postupně nafouknou a vzduch proudí otvory přesně podle návrhu.');
    app.viz.setCamera('overview', 1.6);
    await sleep(3200);
    if (stop()) return;
    app.viz.setCamera('eye', 2.2);
    await sleep(4200);
    if (stop()) return;

    cap.show(4, N, 'Mapa průvanu dle ISO 7730 v pobytové zóně – postavy ukazují komfort přesně v jejich místě.');
    Object.assign(state.layers, { heat: 'dr', people: true, particles: true });
    app.viz.setLayers(state.layers);
    emit('design', state.design);
    app.viz.setCamera('overview', 1.8);
    await sleep(5200);
    if (stop()) return;

    cap.show(5, N, 'Stejná hala s plechovým potrubím a mřížkami: bodové proudy znamenají průvan, jinde mrtvé zóny.');
    app.setView('compare');
    await sleep(6500);
    if (stop()) return;

    cap.show(6, N, 'Živá CFD simulace řezu halou – Navierovy–Stokesovy rovnice se vztlakem běží přímo v prohlížeči.');
    app.setView('cfd');
    await sleep(7500);
    if (stop()) return;

    cap.show(7, N, 'Analýza: trajektorie proudů, porovnání komfortu, varianty optimalizátoru a kusovník.');
    app.setView('analysis');
    await sleep(2500);
    document.getElementById('viewAnalysis')?.scrollTo({ top: 520, behavior: 'smooth' });
    await sleep(3500);
    if (stop()) return;

    cap.show(8, N, 'Nabídka pro zákazníka s výkresy, srovnáním a kusovníkem – připravená do PDF. Celé za minutu.');
    app.openReport();
    await sleep(3000);
    document.getElementById('report')?.scrollTo({ top: 1150, behavior: 'smooth' });
    await sleep(3500);
    document.getElementById('report').hidden = true;
    app.setView('design');
    state.layers.heat = 'velocity';
    app.viz.setLayers(state.layers);
    emit('design', state.design);
    app.viz.setCamera('fly');
    await sleep(2500);
  } finally {
    window.removeEventListener('keydown', esc);
    cap.hide();
    running = false;
  }
}
