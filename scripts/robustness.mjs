// Robustnost enginu na okrajových vstupech.
import { computeDesign, defaultProject } from '../src/engine/designer.js';

const cases = [
  ['malá místnost', { ...defaultProject('office'), L: 4, W: 3, H: 2.4, flow: 300 }],
  ['obří hala', { ...defaultProject('warehouse'), L: 200, W: 80, H: 16, flow: 250000 }],
  ['izotermní větrání', { ...defaultProject('industry'), mode: 'ventilation', ts: 18, tr: 18 }],
  ['půlkruh v kanceláři', { ...defaultProject('office'), shape: 'H' }],
  ['zamčené 3 větve + perforace', { ...defaultProject('food'), runs: 3, outlet: 'perforation' }],
  ['zamčený tlak a otvor', { ...defaultProject('store'), pressure: 150, holeSize: 12, outlet: 'perforation', pattern: '4-8' }],
  ['bez průtoku, z výměny', { ...defaultProject('food'), flow: null, ach: 6 }],
  ['z tepelné zátěže', { ...defaultProject('food'), flow: null, loadKW: 40 }],
  ['nesmyslné hodnoty', { ...defaultProject('food'), L: 'abc', W: -5, H: 1000, flow: 'x', ts: null, tr: undefined }],
  ['požár A + chlazení', { ...defaultProject('cold'), fireA: true }],
  ['eko', { ...defaultProject('store'), eco: true, hygiene: false }],
  ['vlastní barva', { ...defaultProject('store'), customColor: '#ff6600' }],
  ['velký rozdíl teplot', { ...defaultProject('office'), ts: 12 }],
  ['vytápění kanceláře', { ...defaultProject('office'), mode: 'heating', ts: 32, tr: 21 }],
];
let fail = 0;
for (const [name, p] of cases) {
  try {
    const t0 = performance.now();
    const d = computeDesign(p);
    const ms = Math.round(performance.now() - t0);
    const bad = [d.metrics.vMax, d.metrics.drMax, d.runs[0].D, d.outlet.u0, d.totalWeight, d.conventional.steelKg].some((v) => !Number.isFinite(v));
    if (bad) fail++;
    console.log(`${bad ? 'NaN!' : 'ok  '} ${name.padEnd(28)} ${d.n}× ${d.shape}${d.runs[0].D} ${d.outlet.key}/${d.outlet.pattern}/${d.outlet.p}Pa  vMax=${d.metrics.vMax.toFixed(2)} DR=${d.metrics.drMax.toFixed(0)}% mat=${d.material.code} col=${d.color.code} ${ms}ms  checks: ${d.checks.filter((c) => c.level !== 'ok').map((c) => c.level + ':' + c.title).join(' | ')}`);
  } catch (e) {
    fail++;
    console.log(`ERR  ${name}: ${e.stack}`);
  }
}
console.log(fail ? `\n${fail} problém(ů)` : '\nvše v pořádku');
