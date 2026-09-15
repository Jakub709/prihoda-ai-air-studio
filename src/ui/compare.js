// Pruh srovnání Příhoda × plech (zobrazený pod rozděleným 3D pohledem).
import { on, state } from '../state.js';
import { n0, n1, n2 } from './format.js';

export function mountCompare(el) {
  const render = () => {
    const d = state.design;
    if (!d) return;
    const c = d.conventional;
    const inp = d.inp;
    const heating = inp.mode === 'heating';
    const card = (title, a, b, fmt, unit, better = 'low', note = '') => {
      const mx = Math.max(a, b, 1e-6);
      const gain = better === 'low' ? (b > 0 ? 100 * (1 - a / b) : 0) : a - b;
      const gainTxt = better === 'low' ? `−${n0(gain)} %` : `+${n0(gain)} ${unit === '%' ? 'p. b.' : unit}`;
      return `<div class="cmp-card"><div class="t">${title}</div>
        <div class="cmp-row"><span class="n">Příhoda</span><span class="b"><i style="width:${(100 * a) / mx}%;background:#00a98e"></i></span><span class="v">${fmt(a)} ${unit}</span></div>
        <div class="cmp-row"><span class="n">Plech</span><span class="b"><i style="width:${(100 * b) / mx}%;background:#d95926"></i></span><span class="v">${fmt(b)} ${unit}</span></div>
        <div class="gain">${note || gainTxt}</div></div>`;
    };
    el.innerHTML = `<div class="cmp">
      ${heating
        ? card('Průnik teplého vzduchu k lidem', Math.min(100, d.metrics.penetration * 100), Math.min(100, c.metrics.penetration * 100), n0, '%', 'high')
        : card('Pobytová zóna bez průvanu', d.metrics.drOkShare * 100, c.metrics.drOkShare * 100, n0, '%', 'high')}
      ${heating
        ? card('Rozdíl teplot hlava–kotníky', d.metrics.gradient, c.metrics.gradient, n1, 'K', 'low')
        : card('Max. rychlost v pobytové zóně', d.metrics.vMax, c.metrics.vMax, n2, 'm/s', 'low')}
      ${card('Hmotnost rozvodu', d.totalWeight, c.steelKg + c.insulKg, n0, 'kg')}
      ${card('Montáž', c.fabricHours, c.steelHours, n0, 'h')}
      ${card('Uhlíková stopa materiálu', c.co2Fabric, c.co2Steel, n0, 'kg CO₂e')}
      ${card('Objem při dopravě', c.volFabric, c.volSteel, n1, 'm³')}
    </div>`;
  };
  on('design', render);
  on('view', (v) => {
    if (v === 'compare') render();
  });
}
