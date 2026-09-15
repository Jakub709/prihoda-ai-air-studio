// Technické výkresy (SVG): půdorys, příčný řez s trajektoriemi proudů, detail vyústky.
import { RAMP_VELOCITY, sampleRamp } from '../viz/colormaps.js';
import { n0, n1 } from './format.js';

const theme = (light) =>
  light
    ? { bg: '#ffffff', line: '#1c2328', thin: '#8a979f', grid: '#e3e8eb', text: '#1c2328', muted: '#5c6b74', oz: '#c98500', ozFill: 'rgba(250,178,25,0.10)', duct: '#dfe7ea', ductLine: '#1c2328', accent: '#00896f', floor: '#f3f5f6' }
    : { bg: 'transparent', line: 'rgba(200,225,235,0.75)', thin: 'rgba(150,200,225,0.4)', grid: 'rgba(150,200,225,0.08)', text: '#d9e4ea', muted: '#8ea2b0', oz: '#fab219', ozFill: 'rgba(250,178,25,0.07)', duct: '#e8eef1', ductLine: '#ffffff', accent: '#1ccaa9', floor: 'rgba(150,200,225,0.05)' };

function dimLine(x1, y1, x2, y2, label, t, off = 0, vertical = false) {
  const tick = (x, y) => (vertical ? `<line x1="${x - 4}" y1="${y}" x2="${x + 4}" y2="${y}" stroke="${t.thin}"/>` : `<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="${t.thin}"/>`);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const txt = vertical
    ? `<text x="${mx + off}" y="${my}" fill="${t.muted}" font-size="11" text-anchor="middle" transform="rotate(-90 ${mx + off} ${my})" dy="-4">${label}</text>`
    : `<text x="${mx}" y="${my + off}" fill="${t.muted}" font-size="11" text-anchor="middle" dy="-4">${label}</text>`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${t.thin}"/>${tick(x1, y1)}${tick(x2, y2)}${txt}`;
}

/** Příčný řez halou s trajektoriemi proudů (barva = rychlost). */
export function sectionSVG(d, { width = 760, light = false, runsAll = true } = {}) {
  const t = theme(light);
  const inp = d.inp;
  const pad = { l: 46, r: 20, t: 18, b: 40 };
  const s = Math.min((width - pad.l - pad.r) / inp.W, 420 / inp.H);
  const w = inp.W * s;
  const h = inp.H * s;
  const H = h + pad.t + pad.b;
  const X = (y) => pad.l + y * s;
  const Y = (z) => pad.t + h - z * s;
  let g = `<svg viewBox="0 0 ${w + pad.l + pad.r} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="InterVar, Segoe UI, sans-serif">`;
  if (light) g += `<rect width="100%" height="100%" fill="${t.bg}"/>`;
  // pobytová zóna
  g += `<rect x="${X(0)}" y="${Y(inp.oz)}" width="${w}" height="${inp.oz * s}" fill="${t.ozFill}"/>`;
  g += `<line x1="${X(0)}" y1="${Y(inp.oz)}" x2="${X(inp.W)}" y2="${Y(inp.oz)}" stroke="${t.oz}" stroke-dasharray="6 4" stroke-width="1.2"/>`;
  g += `<text x="${X(0) + 6}" y="${Y(inp.oz) - 5}" fill="${t.oz}" font-size="11" font-weight="600">pobytová zóna ${n1(inp.oz)} m</text>`;
  // trajektorie
  const pal = (u) => {
    const c = sampleRamp(RAMP_VELOCITY, Math.min(1, 0.18 + u / 1.2));
    return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  };
  const runs = runsAll ? d.runs : [d.runs[Math.floor(d.runs.length / 2)]];
  for (const run of runs) {
    for (const tr of d.trajs) {
      for (const br of tr.branches) {
        const step = Math.max(1, Math.floor(br.n / 90));
        for (let i = step; i < br.n; i += step) {
          const y0 = run.y + br.y[i - step];
          const y1 = run.y + br.y[i];
          if (y1 < -0.2 || y1 > inp.W + 0.2) continue;
          const u = br.uc[i];
          if (u < 0.06) break;
          const wdt = Math.max(0.8, Math.min(5, u * 2.4));
          g += `<line x1="${X(Math.max(0, Math.min(inp.W, y0))).toFixed(1)}" y1="${Y(br.z[i - step]).toFixed(1)}" x2="${X(Math.max(0, Math.min(inp.W, y1))).toFixed(1)}" y2="${Y(br.z[i]).toFixed(1)}" stroke="${pal(u)}" stroke-width="${wdt.toFixed(2)}" stroke-linecap="round" opacity="0.9"/>`;
        }
      }
    }
  }
  // stěny, podlaha, strop
  g += `<rect x="${X(0)}" y="${Y(inp.H)}" width="${w}" height="${h}" fill="none" stroke="${t.line}" stroke-width="1.6"/>`;
  g += `<line x1="${X(0) - 8}" y1="${Y(0)}" x2="${X(inp.W) + 8}" y2="${Y(0)}" stroke="${t.line}" stroke-width="2.4"/>`;
  // vyústky
  for (const run of d.runs) {
    const cx = X(run.y);
    const cy = Y(d.geo.zc);
    const r = d.geo.r * s;
    if (d.shape === 'H') g += `<path d="M${cx - r},${cy} A${r},${r} 0 0 0 ${cx + r},${cy} Z" fill="${light ? '#cfdde2' : d.color.hex}" stroke="${t.ductLine}" stroke-width="1"/>`;
    else g += `<circle cx="${cx}" cy="${cy}" r="${Math.max(2, r)}" fill="${light ? '#cfdde2' : d.color.hex}" stroke="${t.ductLine}" stroke-width="1"/>`;
    if (d.shape === 'C' && d.install.no >= 3) g += `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${Y(inp.H)}" stroke="${t.thin}" stroke-width="1"/>`;
  }
  // kóty
  g += dimLine(X(0), Y(0) + 24, X(inp.W), Y(0) + 24, `${n1(inp.W)} m`, t);
  g += dimLine(X(0) - 26, Y(0), X(0) - 26, Y(inp.H), `${n1(inp.H)} m`, t, 0, true);
  const r0 = d.runs[0];
  g += dimLine(X(inp.W) + 10, Y(0), X(inp.W) + 10, Y(d.geo.zc), `osa ${n1(d.geo.zc)} m`, t, 12, true);
  if (d.runs.length > 1) g += dimLine(X(d.runs[0].y), Y(d.geo.zc) - d.geo.r * s - 12, X(d.runs[1].y), Y(d.geo.zc) - d.geo.r * s - 12, `${n1(d.runs[1].y - d.runs[0].y)} m`, t);
  else g += dimLine(X(0), Y(d.geo.zc) - d.geo.r * s - 12, X(r0.y), Y(d.geo.zc) - d.geo.r * s - 12, `${n1(r0.y)} m`, t);
  // legenda rychlostí
  const lx = X(inp.W) - 150;
  const ly = Y(inp.H) + 10;
  g += `<defs><linearGradient id="vg${light ? 'l' : 'd'}" x1="0" x2="1">${[0, 0.25, 0.5, 0.75, 1].map((f) => `<stop offset="${f}" stop-color="${pal(f * 1.0)}"/>`).join('')}</linearGradient></defs>`;
  g += `<rect x="${lx}" y="${ly}" width="120" height="6" rx="2" fill="url(#vg${light ? 'l' : 'd'})"/><text x="${lx}" y="${ly + 17}" fill="${t.muted}" font-size="9.5">0</text><text x="${lx + 120}" y="${ly + 17}" fill="${t.muted}" font-size="9.5" text-anchor="end">≥ 1 m/s</text>`;
  g += '</svg>';
  return g;
}

/** Půdorys s větvemi, rozvodnou větví, VZT jednotkou a kótami. */
export function planSVG(d, { width = 760, light = false } = {}) {
  const t = theme(light);
  const inp = d.inp;
  const pad = { l: 64, r: 40, t: 26, b: 44 };
  const s = Math.min((width - pad.l - pad.r) / inp.L, 360 / inp.W);
  const w = inp.L * s;
  const h = inp.W * s;
  const X = (x) => pad.l + x * s;
  const Y = (y) => pad.t + y * s;
  let g = `<svg viewBox="0 0 ${w + pad.l + pad.r} ${h + pad.t + pad.b}" xmlns="http://www.w3.org/2000/svg" font-family="InterVar, Segoe UI, sans-serif">`;
  if (light) g += `<rect width="100%" height="100%" fill="${t.bg}"/>`;
  g += `<rect x="${X(0)}" y="${Y(0)}" width="${w}" height="${h}" fill="${t.floor}" stroke="${t.line}" stroke-width="1.6"/>`;
  // rastr sloupů
  const nT = Math.max(2, Math.round(inp.L / 6));
  for (let i = 0; i <= nT && inp.H >= 4.5; i++) {
    const x = (i * inp.L) / nT;
    g += `<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(inp.W)}" stroke="${t.grid}"/>`;
  }
  // větve
  for (const run of d.runs) {
    const r = Math.max(1.5, d.geo.r * s);
    g += `<rect x="${X(run.x0)}" y="${Y(run.y) - r}" width="${run.len * s}" height="${2 * r}" rx="${r}" fill="${light ? '#cfdde2' : d.color.hex}" stroke="${t.ductLine}" stroke-width="0.8"/>`;
    // zipy
    const parts = run.parts;
    const pl = (run.len - 0.15) / parts;
    for (let k = 0; k <= parts; k++) {
      const xz = run.x0 + 0.15 + k * pl;
      if (k < parts) g += `<line x1="${X(xz)}" y1="${Y(run.y) - r}" x2="${X(xz)}" y2="${Y(run.y) + r}" stroke="${t.thin}" stroke-width="0.8"/>`;
    }
    g += `<text x="${X(run.x0 + run.len / 2)}" y="${Y(run.y) - r - 4}" fill="${t.text}" font-size="10.5" text-anchor="middle" font-weight="600">V${run.id} · ${d.shape === 'C' ? 'Ø' : 'H'}${run.D} · ${n0(run.flowM3h)} m³/h</text>`;
  }
  // rozvodná větev + VZT
  if (d.header) {
    const hd = d.header;
    const r = Math.max(1.5, (hd.Dm / 2) * s);
    g += `<rect x="${X(hd.x) - r * 2}" y="${Y(hd.y0 - 0.3)}" width="${2 * r}" height="${hd.len * s}" rx="${r}" fill="${light ? '#e4eaec' : '#9fb1bb'}" stroke="${t.ductLine}" stroke-width="0.8"/>`;
  }
  const aw = d.ahu.w * s;
  g += `<rect x="${X(0) - aw * 1.6 - 6}" y="${Y(d.ahu.y) - aw * 0.6}" width="${aw * 1.6}" height="${aw * 1.2}" fill="${light ? '#6f7f88' : '#46535b'}" stroke="${t.accent}"/>`;
  g += `<text x="${X(0) - aw * 0.8 - 6}" y="${Y(d.ahu.y) + aw * 0.6 + 12}" fill="${t.accent}" font-size="10" text-anchor="middle" font-weight="700">VZT</text>`;
  // kóty
  g += dimLine(X(0), Y(inp.W) + 24, X(inp.L), Y(inp.W) + 24, `${n1(inp.L)} m`, t);
  g += dimLine(X(inp.L) + 18, Y(0), X(inp.L) + 18, Y(inp.W), `${n1(inp.W)} m`, t, 14, true);
  g += dimLine(X(d.runs[0].x0), Y(0) - 10, X(d.runs[0].x1), Y(0) - 10, `vyústka ${n1(d.runs[0].len)} m`, t);
  g += '</svg>';
  return g;
}

/** Detail průřezu vyústky s hodinovými polohami výstupů. */
export function clockSVG(d, { size = 190, light = false } = {}) {
  const t = theme(light);
  const c = size / 2;
  const r = size * 0.28;
  let g = `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" font-family="InterVar, Segoe UI, sans-serif">`;
  if (light) g += `<rect width="100%" height="100%" fill="${t.bg}"/>`;
  if (d.shape === 'H') g += `<path d="M${c - r},${c} A${r},${r} 0 0 0 ${c + r},${c} Z" fill="${light ? '#dfe7ea' : d.color.hex}" stroke="${t.ductLine}" stroke-width="1.5"/>`;
  else g += `<circle cx="${c}" cy="${c}" r="${r}" fill="${light ? '#dfe7ea' : d.color.hex}" stroke="${t.ductLine}" stroke-width="1.5"/>`;
  for (let hh = 1; hh <= 12; hh++) {
    const a = (hh * 30 * Math.PI) / 180;
    const x = c + Math.sin(a) * (r + 22);
    const y = c - Math.cos(a) * (r + 22);
    if (hh % 3 === 0) g += `<text x="${x}" y="${y + 3.5}" fill="${t.muted}" font-size="10" text-anchor="middle">${hh}</text>`;
    else g += `<circle cx="${x}" cy="${y}" r="1.4" fill="${t.thin}"/>`;
  }
  const o = d.outlet;
  for (const a of o.angles) {
    const ar = (a * Math.PI) / 180;
    const half = o.kind === 'band' ? o.fan / 2 : 0.05;
    const x1 = c + Math.sin(ar - half) * r;
    const y1 = c - Math.cos(ar - half) * r;
    const x2 = c + Math.sin(ar + half) * r;
    const y2 = c - Math.cos(ar + half) * r;
    g += `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" stroke="${t.accent}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    const xa = c + Math.sin(ar) * (r + 4);
    const ya = c - Math.cos(ar) * (r + 4);
    const xb = c + Math.sin(ar) * (r + 17);
    const yb = c - Math.cos(ar) * (r + 17);
    g += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="${t.accent}" stroke-width="2" marker-end="url(#ar${light ? 'l' : 'd'})"/>`;
  }
  g += `<defs><marker id="ar${light ? 'l' : 'd'}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${t.accent}"/></marker></defs>`;
  g += `<text x="${c}" y="${c + 4}" fill="${light ? '#1c2328' : '#1c2328'}" font-size="11" text-anchor="middle" font-weight="700">${d.shape === 'C' ? 'Ø' : ''}${d.runs[0].D}</text>`;
  g += '</svg>';
  return g;
}
