// Ovládací prvky 3D pohledu: vrstvy, kamera, legenda, sonda.
import { HEAT_KINDS, RAMP_TEAL, RAMP_TEMP, rampCss } from '../viz/colormaps.js';
import { on, state } from '../state.js';
import { n0, n1, n2 } from './format.js';

const I = {
  flow: '<svg viewBox="0 0 24 24"><path d="M3 8c3-3 6 3 9 0s6-3 9 0M3 13c3-3 6 3 9 0s6-3 9 0M3 18c3-3 6 3 9 0s6-3 9 0"/></svg>',
  map: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 12h18M12 5v14"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="2.6"/><path d="M4.5 20v-4.5a4.5 4.5 0 0 1 9 0V20"/><circle cx="17" cy="8.5" r="2"/><path d="M15 20v-3.5a3 3 0 0 1 6 0V20"/></svg>',
  section: '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 7l7-4 7 4v10l-7 4-7-4z"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M3 7h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  fan: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7s2 5-2 7M14 12c4 0 7 1 7 4s-5 2-7-2M12 14c0 4-1 7-4 7s-2-5 2-7M10 12c-4 0-7-1-7-4s5-2 7 2"/></svg>',
};

export function mountViewportUI(viz) {
  const layerBar = document.getElementById('layerBar');
  const cameraBar = document.getElementById('cameraBar');
  const legend = document.getElementById('legend3d');
  const probe = document.getElementById('probe');
  const status = document.getElementById('vpStatus');

  layerBar.innerHTML = `
    <div class="chipbar">
      <button class="chip" data-l="particles">${I.flow}Proudění</button>
      <button class="chip" data-l="people">${I.people}Lidé</button>
      <button class="chip" data-l="section">${I.section}Svislý řez</button>
    </div>
    <div class="chipbar" id="heatChips">
      <button class="chip" data-h="velocity">${I.map}Rychlost</button>
      <button class="chip" data-h="dr">Průvan DR</button>
      <button class="chip" data-h="temp">Teplota</button>
      <button class="chip" data-h="none">Bez mapy</button>
    </div>`;
  cameraBar.innerHTML = `
    <div class="chipbar">
      <button class="chip" data-c="overview">Přehled</button>
      <button class="chip" data-c="top">Půdorys</button>
      <button class="chip" data-c="section">Řez</button>
      <button class="chip" data-c="eye">Očima pracovníka</button>
      <button class="chip" data-c="fly">${I.cam}Průlet</button>
    </div>
    <div class="chipbar"><button class="chip" id="btnFan" title="Znovu spustit ventilátor – animace nafouknutí">${I.fan}Ventilátor</button></div>`;

  const sync = () => {
    const L = state.layers;
    layerBar.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('active', !!L[b.dataset.l]));
    layerBar.querySelectorAll('[data-h]').forEach((b) => b.classList.toggle('active', L.heat === b.dataset.h));
    renderLegend();
  };
  layerBar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.l) state.layers[b.dataset.l] = !state.layers[b.dataset.l];
    if (b.dataset.h) state.layers.heat = b.dataset.h;
    viz.setLayers(state.layers);
    sync();
  });
  cameraBar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'btnFan') {
      viz.replayInflation();
      return;
    }
    cameraBar.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('active', x === b));
    viz.setCamera(b.dataset.c);
  });
  viz.on('usercamera', () => cameraBar.querySelectorAll('[data-c]').forEach((x) => x.classList.remove('active')));

  function renderLegend() {
    const d = state.design;
    if (!d) {
      legend.innerHTML = '';
      return;
    }
    const L = state.layers;
    const inp = d.inp;
    let html = '';
    if (L.heat !== 'none') {
      const K = HEAT_KINDS[L.heat];
      const lo = K.relative ? inp.tr + K.min : K.min;
      const hi = K.relative ? inp.tr + K.max : K.max;
      let mark = '';
      const lim = L.heat === 'velocity' ? inp.vAllow : L.heat === 'dr' ? inp.drLimit : null;
      if (lim !== null && lim > lo && lim < hi) {
        const pos = ((lim - lo) / (hi - lo)) * 100;
        mark = `<span class="legend-mark" style="left:${pos}%" data-l="limit ${L.heat === 'velocity' ? n2(lim) : n0(lim)}"></span>`;
      }
      const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
      html += `<div class="legend-card"><h4>${K.label} <span>výška ${n1(inp.oz)} m</span></h4>
        <div class="legend-bar" style="background:${rampCss(K.ramp)}">${mark}</div>
        <div class="legend-ticks">${ticks.map((t) => `<span>${K.fmt(t)}</span>`).join('')}</div>
        <div class="legend-ticks" style="margin-top:1px"><span>${K.unit}</span><span>${L.heat === 'temp' ? `žádaná ${n1(inp.tr)} °C` : 'bílá izolinie = limit'}</span></div></div>`;
    }
    if (L.particles) {
      if (L.color === 'temp' && inp.dT0 !== 0) {
        const cold = inp.dT0 < 0;
        html += `<div class="legend-card"><h4>Proudění – teplota vzduchu <span>částice</span></h4>
          <div class="legend-bar" style="background:${rampCss(cold ? RAMP_TEMP.slice(0, 7) : RAMP_TEMP.slice(5))}"></div>
          <div class="legend-ticks"><span>${cold ? `přívod ${n1(inp.ts)} °C` : `prostor ${n1(inp.tr)} °C`}</span><span>${cold ? `prostor ${n1(inp.tr)} °C` : `přívod ${n1(inp.ts)} °C`}</span></div></div>`;
      } else {
        html += `<div class="legend-card"><h4>Proudění – rychlost <span>částice</span></h4>
          <div class="legend-bar" style="background:${rampCss(RAMP_TEAL)}"></div>
          <div class="legend-ticks"><span>0</span><span>0,5</span><span>≥ 1 m/s</span></div></div>`;
      }
    }
    if (L.people) {
      html += `<div class="legend-card" style="min-width:0"><h4>Postavy – komfort v jejich místě</h4>
        <div class="legend-ticks" style="font-size:11px;color:var(--text-2);gap:10px;justify-content:flex-start">
        <span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2fbf8f"></i> v limitu</span>
        <span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f2b134"></i> hraniční</span>
        <span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e0514f"></i> průvan</span></div></div>`;
    }
    legend.innerHTML = html;
  }

  viz.on('probe', (p) => {
    if (!p || !state.design) {
      probe.hidden = true;
      return;
    }
    const inp = state.design.inp;
    const ok = p.dr <= inp.drLimit;
    probe.hidden = false;
    probe.style.left = `${p.clientX + (p.side === 'C' ? viz.w / 2 : 0)}px`;
    probe.style.top = `${p.clientY}px`;
    probe.innerHTML = `<b>${p.side === 'C' ? 'Klasický rozvod' : 'Příhoda'}</b> · x ${n1(p.x)} m, y ${n1(p.y)} m
      <div class="row"><span>Rychlost (výška ${n1(inp.oz)} m)</span><span>${n2(p.v)} m/s</span></div>
      <div class="row"><span>Teplota</span><span>${n1(p.t)} °C</span></div>
      <div class="row"><span>Průvan DR</span><span style="color:${ok ? 'var(--good-ink)' : 'var(--crit-ink)'}">${n0(p.dr)} %</span></div>`;
  });
  viz.on('fps', (fps) => {
    status.innerHTML = `<span class="legend-card" style="min-width:0;padding:4px 9px;font-size:11px;color:var(--text-3)">${fps} fps · ${n0(viz.flow ? viz.flow.count : 0)} částic</span>`;
  });

  on('design', sync);
  sync();
  return { sync };
}
