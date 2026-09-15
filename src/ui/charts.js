// Lehké SVG grafy (čárový, sloupcový) s křížovým kurzorem a tooltipem.
import { n0, n1, n2 } from './format.js';

export const SERIES = {
  prihoda: '#00a98e',
  conventional: '#d95926',
  model: '#3987e5',
  neutral: '#8a9aa6',
};

function niceTicks(lo, hi, count = 5) {
  const span = hi - lo || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

const fmtTick = (v) => (Math.abs(v) >= 10 ? n0(v) : Math.abs(v) >= 1 ? n1(v).replace(',0', '') : n2(v).replace(/0$/, ''));

/**
 * @param {HTMLElement} el
 * @param {object} o { series:[{name,color,x:[],y:[],dash?,width?}], xLabel, yLabel, yMin?, yMax?, refLines:[{y,label,color}], xMarks:[{x,label}], height, yFmt }
 */
export function lineChart(el, o) {
  const W = Math.max(280, el.clientWidth || 600);
  const H = o.height ?? 220;
  const m = { l: 44, r: 16, t: o.yLabel ? 24 : 14, b: 32 };
  const xs = o.series.flatMap((s) => s.x);
  const ys = o.series.flatMap((s) => s.y);
  const xMin = o.xMin ?? Math.min(...xs);
  const xMax = o.xMax ?? Math.max(...xs);
  let yMin = o.yMin ?? Math.min(0, ...ys);
  let yMax = o.yMax ?? Math.max(...ys, ...(o.refLines || []).map((r) => r.y)) * 1.12;
  if (yMax <= yMin) yMax = yMin + 1;
  const sx = (v) => m.l + ((v - xMin) / (xMax - xMin || 1)) * (W - m.l - m.r);
  const sy = (v) => H - m.b - ((v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const yt = niceTicks(yMin, yMax, 4);
  const xt = niceTicks(xMin, xMax, 7);
  const yFmt = o.yFmt || fmtTick;
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${o.title || ''}">`;
  svg += '<g class="grid">' + yt.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}"/>`).join('') + '</g>';
  svg += '<g class="axis">';
  svg += yt.map((v) => `<text x="${m.l - 7}" y="${sy(v) + 3.5}" text-anchor="end">${yFmt(v)}</text>`).join('');
  svg += xt.map((v) => `<text x="${sx(v)}" y="${H - m.b + 15}" text-anchor="middle">${fmtTick(v)}</text>`).join('');
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
  if (o.xLabel) svg += `<text x="${W - m.r}" y="${H - 3}" text-anchor="end">${o.xLabel}</text>`;
  if (o.yLabel) svg += `<text x="${m.l - 38}" y="${m.t - 11}" text-anchor="start">${o.yLabel}</text>`;
  svg += '</g>';
  for (const xm of o.xMarks || []) {
    svg += `<line x1="${sx(xm.x)}" x2="${sx(xm.x)}" y1="${m.t}" y2="${H - m.b}" stroke="rgba(150,200,225,.22)" stroke-dasharray="2 3"/>`;
    if (xm.label) svg += `<text class="lbl" x="${sx(xm.x)}" y="${m.t + 9}" text-anchor="middle" style="font-size:10px;fill:var(--text-3)">${xm.label}</text>`;
  }
  for (const r of o.refLines || []) {
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(r.y)}" y2="${sy(r.y)}" stroke="${r.color || '#fab219'}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    svg += `<text class="lbl" x="${W - m.r - 2}" y="${sy(r.y) - 5}" text-anchor="end" style="fill:${r.color || '#fab219'}">${r.label}</text>`;
  }
  // řady ořezané na plochu grafu (hodnoty mimo osu y nepřetečou do okolí)
  const clipId = `cc${Math.random().toString(36).slice(2, 9)}`;
  svg += `<defs><clipPath id="${clipId}"><rect x="${m.l}" y="${m.t - 3}" width="${W - m.l - m.r}" height="${H - m.t - m.b + 6}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
  for (const s of o.series) {
    if (s.band) {
      const top = s.x.map((x, i) => `${sx(x)},${sy(s.band[1][i])}`).join(' ');
      const bot = s.x.map((x, i) => `${sx(x)},${sy(s.band[0][i])}`).reverse().join(' ');
      svg += `<polygon points="${top} ${bot}" fill="${s.color}" opacity=".12"/>`;
    }
    const pts = s.x.map((x, i) => `${sx(x).toFixed(1)},${sy(s.y[i]).toFixed(1)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="6 4"' : ''}/>`;
  }
  svg += '</g>';
  // přímé popisky na konci čar (≤ 4 řady)
  const yIn = (v) => Math.max(m.t + 10, Math.min(H - m.b - 4, v));
  if (o.series.length <= 4 && o.directLabels !== false) {
    for (const s of o.series) {
      if (!s.label) continue;
      let i = Math.floor(s.x.length * (s.labelAt ?? 0.82));
      // popisek jen na viditelné části čáry
      while (i < s.x.length - 1 && (s.y[i] > yMax || s.y[i] < yMin)) i++;
      svg += `<text class="lbl" x="${sx(s.x[i])}" y="${yIn(sy(s.y[i]) - 8)}" text-anchor="middle">${s.label}</text>`;
    }
  }
  svg += `<g class="hover" style="display:none"><line class="hx" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.35)"/>${o.series.map((s) => `<circle r="4" fill="${s.color}" stroke="#0e171f" stroke-width="2"/>`).join('')}</g>`;
  svg += `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" class="hit"/>`;
  svg += '</svg>';
  const legend = o.series.length > 1 ? `<div class="chart-legend">${o.series.map((s) => `<span><i style="background:${s.color};color:${s.color}" class="${s.dash ? 'dash' : ''}"></i>${s.name}</span>`).join('')}</div>` : '';
  el.innerHTML = `${legend}<div class="chart">${svg}<div class="tip" hidden></div></div>`;
  const chart = el.querySelector('.chart');
  const svgEl = chart.querySelector('svg');
  const tip = chart.querySelector('.tip');
  const hov = svgEl.querySelector('.hover');
  const circles = [...hov.querySelectorAll('circle')];
  const hx = hov.querySelector('.hx');
  svgEl.querySelector('.hit').addEventListener('pointermove', (e) => {
    const r = svgEl.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const xv = xMin + ((px - m.l) / (W - m.l - m.r)) * (xMax - xMin);
    hov.style.display = '';
    hx.setAttribute('x1', px);
    hx.setAttribute('x2', px);
    const rows = [];
    o.series.forEach((s, si) => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < s.x.length; i++) {
        const d = Math.abs(s.x[i] - xv);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      circles[si].setAttribute('cx', sx(s.x[best]));
      circles[si].setAttribute('cy', Math.max(m.t, Math.min(H - m.b, sy(s.y[best]))));
      rows.push(`<div class="r"><i style="background:${s.color}"></i>${s.name}<b>${(o.tipFmt || yFmt)(s.y[best])}${o.unit ? ' ' + o.unit : ''}</b></div>`);
    });
    tip.hidden = false;
    tip.innerHTML = `<div style="color:var(--text-3);margin-bottom:3px">${o.xName || 'x'} = ${n1(xv)} ${o.xUnit || ''}</div>${rows.join('')}`;
    tip.style.left = `${(px / W) * r.width}px`;
    tip.style.top = `${((m.t + 10) / H) * r.height}px`;
  });
  svgEl.querySelector('.hit').addEventListener('pointerleave', () => {
    hov.style.display = 'none';
    tip.hidden = true;
  });
}

/**
 * Seskupený sloupcový graf (kategorie × řady).
 * o = { cats:[..], series:[{name,color,values:[]}], unit, height, yMax }
 */
export function barChart(el, o) {
  const W = Math.max(280, el.clientWidth || 600);
  const H = o.height ?? 200;
  const m = { l: 40, r: 10, t: 16, b: 34 };
  const vals = o.series.flatMap((s) => s.values);
  const yMax = o.yMax ?? Math.max(...vals, 1e-6) * 1.15;
  const yt = niceTicks(0, yMax, 4);
  const sy = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
  const bandW = (W - m.l - m.r) / o.cats.length;
  const gap = 2;
  const bw = Math.min(26, (bandW * 0.7) / o.series.length);
  let svg = `<svg viewBox="0 0 ${W} ${H}">`;
  svg += '<g class="grid">' + yt.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}"/>`).join('') + '</g>';
  svg += '<g class="axis">' + yt.map((v) => `<text x="${m.l - 6}" y="${sy(v) + 3.5}" text-anchor="end">${fmtTick(v)}</text>`).join('');
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
  o.cats.forEach((c, i) => {
    svg += `<text x="${m.l + bandW * (i + 0.5)}" y="${H - m.b + 15}" text-anchor="middle">${c}</text>`;
  });
  svg += '</g>';
  o.cats.forEach((c, i) => {
    const x0 = m.l + bandW * (i + 0.5) - (o.series.length * (bw + gap)) / 2;
    o.series.forEach((s, si) => {
      const v = s.values[i];
      const x = x0 + si * (bw + gap);
      const y = sy(v);
      const h = Math.max(0, H - m.b - y);
      const r = Math.min(4, bw / 2, h);
      svg += `<path d="M${x},${H - m.b} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H - m.b} Z" fill="${s.color}"><title>${s.name}: ${n1(v)} ${o.unit || ''}</title></path>`;
      if (o.valueLabels) svg += `<text class="lbl" x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" style="font-size:10px">${n0(v)}</text>`;
    });
  });
  svg += '</svg>';
  const legend = `<div class="chart-legend">${o.series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
  el.innerHTML = `${legend}<div class="chart">${svg}</div>`;
}
