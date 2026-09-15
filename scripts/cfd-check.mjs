// Kontrola stability, výkonu a shody CFD řešiče s návrhovým modelem pro šablony.
// Použití: node scripts/cfd-check.mjs [aplikace…]   (SIM=60 node … – delší simulace)
import { computeDesign, defaultProject } from '../src/engine/designer.js';
import { cfdConfig } from '../src/cfd/config.js';
import { CfdSolver } from '../src/cfd/solver.js';

const APPS = ['food', 'cold', 'sports', 'pool', 'industry', 'store', 'office', 'kitchen', 'warehouse', 'lab'];
const apps = process.argv.slice(2);
const simT = Number(process.env.SIM || 60);
for (const app of apps.length ? apps : APPS) {
  const d = computeDesign(defaultProject(app));
  const s = new CfdSolver(cfdConfig(d, 'prihoda'));
  if (process.env.ITERS) s.iters = Number(process.env.ITERS);
  const t0 = performance.now();
  let steps = 0;
  while (s.time < simT && steps < 6000) {
    s.step();
    steps++;
  }
  const ms = (performance.now() - t0) / steps;
  let bad = false;
  let vmax = 0;
  for (let k = 0; k < s.u.length; k++) {
    const v = Math.hypot(s.u[k], s.v[k]);
    if (!Number.isFinite(v)) bad = true;
    vmax = Math.max(vmax, v);
  }
  const prof = s.profile(d.inp.oz);
  let ozMax = 0;
  let ozMean = 0;
  for (let i = 3; i < s.nx - 3; i++) {
    ozMax = Math.max(ozMax, prof.speed[i]);
    ozMean += prof.speed[i];
  }
  ozMean /= s.nx - 6;
  let tmin = Infinity;
  let tmax = -Infinity;
  for (let i = 3; i < s.nx - 3; i++) {
    tmin = Math.min(tmin, prof.T[i]);
    tmax = Math.max(tmax, prof.T[i]);
  }
  const nut = s.nutMean ? ` νt=${s.nutMean.toFixed(3)}` : '';
  console.log(
    `${app.padEnd(9)} ${d.inp.mode.padEnd(8)} grid ${s.nx}×${s.ny} dt=${s.dt.toFixed(3)} ${ms.toFixed(2)} ms/step${nut} | vmax=${vmax.toFixed(2)} OZ max=${ozMax.toFixed(2)} mean=${ozMean.toFixed(2)} | model max ${d.metrics.vMax.toFixed(2)} | T[${tmin.toFixed(1)},${tmax.toFixed(1)}] ${bad ? 'NaN!!' : ''}`,
  );
}
