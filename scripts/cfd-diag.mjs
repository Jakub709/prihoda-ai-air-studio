// Diagnostika CFD: střední pole vs. fluktuace v pobytové zóně, textová mapa rychlosti.
// Použití: node scripts/cfd-diag.mjs food [simT] [avgT]
import { computeDesign, defaultProject } from '../src/engine/designer.js';
import { cfdConfig } from '../src/cfd/config.js';
import { CfdSolver } from '../src/cfd/solver.js';

const app = process.argv[2] || 'food';
const simT = Number(process.argv[3] || 200);
const avgT = Number(process.argv[4] || 80);
const extra = process.env.CFG ? JSON.parse(process.env.CFG) : {};
const d = computeDesign(defaultProject(app));
const s = new CfdSolver({ ...cfdConfig(d, 'prihoda'), ...extra });
const n = s.nx * s.ny;
const mu = new Float64Array(n);
const mv = new Float64Array(n);
const ms = new Float64Array(n);
const mT = new Float64Array(n);
let cnt = 0;
while (s.time < simT) {
  s.step();
  if (s.time > simT - avgT) {
    for (let k = 0; k < n; k++) {
      mu[k] += s.u[k];
      mv[k] += s.v[k];
      ms[k] += Math.hypot(s.u[k], s.v[k]);
      mT[k] += s.T[k];
    }
    cnt++;
  }
}
for (let k = 0; k < n; k++) {
  mu[k] /= cnt;
  mv[k] /= cnt;
  ms[k] /= cnt;
  mT[k] /= cnt;
}
const j = Math.round(d.inp.oz / s.h - 0.5);
let line1 = '';
let line2 = '';
let mx1 = 0;
let mx2 = 0;
let av1 = 0;
let av2 = 0;
let c = 0;
for (let i = 3; i < s.nx - 3; i++) {
  const k = j * s.nx + i;
  const a = Math.hypot(mu[k], mv[k]);
  mx1 = Math.max(mx1, a);
  mx2 = Math.max(mx2, ms[k]);
  av1 += a;
  av2 += ms[k];
  c++;
}
console.log(`${app}: t=${simT}s avg ${avgT}s | OZ |<V>| max ${mx1.toFixed(2)} mean ${(av1 / c).toFixed(2)} | <|V|> max ${mx2.toFixed(2)} mean ${(av2 / c).toFixed(2)} | model max ${d.metrics.vMax.toFixed(2)} | νt mean ${s.nutMean.toFixed(4)}`);
// textová mapa střední rychlosti (hrubě)
const chars = ' .:-=+*#%@';
const stepI = Math.ceil(s.nx / 110);
const stepJ = Math.ceil(s.ny / 24);
for (let jj = s.ny - 1; jj >= 0; jj -= stepJ) {
  let row = '';
  for (let ii = 0; ii < s.nx; ii += stepI) {
    const k = jj * s.nx + ii;
    if (s.solid[k]) {
      row += 'O';
      continue;
    }
    const a = Math.hypot(mu[k], mv[k]);
    row += chars[Math.min(9, Math.floor(a / 0.06))];
  }
  const z = ((jj + 0.5) * s.h).toFixed(1).padStart(4);
  console.log(z + ' |' + row + '|' + (Math.abs(jj - j) < stepJ / 2 ? ' ← OZ' : ''));
}
// teplotní profil po výšce ve středu
let tp = '';
for (let jj = 1; jj < s.ny - 1; jj += Math.ceil(s.ny / 10)) {
  let t = 0;
  for (let i = 3; i < s.nx - 3; i++) t += mT[jj * s.nx + i];
  tp += `${((jj + 0.5) * s.h).toFixed(1)}m:${(t / (s.nx - 6)).toFixed(2)} `;
}
console.log('T(z) rel.:', tp);
