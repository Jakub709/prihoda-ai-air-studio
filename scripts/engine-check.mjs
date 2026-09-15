// Kontrolní běh návrhového enginu nad všemi aplikačními šablonami.
import { APPLICATIONS } from '../src/engine/catalog.js';
import { computeDesign, defaultProject } from '../src/engine/designer.js';

const only = process.argv[2];
for (const key of Object.keys(APPLICATIONS)) {
  if (only && key !== only) continue;
  const p = defaultProject(key);
  const d = computeDesign(p);
  const m = d.metrics;
  const c = d.conventional.metrics;
  console.log(
    `\n== ${key.padEnd(9)} ${d.inp.L}×${d.inp.W}×${d.inp.H} m, ${Math.round(d.inp.flow)} m³/h (${d.inp.flowSource}), ${d.inp.mode} ts=${d.inp.ts} tr=${d.inp.tr} cat=${d.inp.cat} vAllow=${d.inp.vAllow.toFixed(2)}`,
  );
  console.log(
    `   ${d.n}× Ø${d.runs[0].D} L=${d.runs[0].len.toFixed(1)} v=${d.runs[0].vIn.toFixed(2)} [${d.vr.level}] | ${d.outlet.key} ${d.outlet.pattern} p=${d.outlet.p} hole=${d.outlet.holeSize ?? '-'} pitch=${d.outlet.pitch ? (d.outlet.pitch * 1000).toFixed(0) + 'mm' : '-'} u0=${d.outlet.u0.toFixed(1)} throw=${(m.throw02 ?? 0).toFixed(1)}`,
  );
  console.log(
    `   OZ vMax=${m.vMax.toFixed(2)} vMean=${m.vMean.toFixed(2)} DRmax=${m.drMax.toFixed(0)}% ok=${(m.drOkShare * 100).toFixed(0)}% ADPI=${m.adpi.toFixed(0)}% pen=${m.penetration.toFixed(2)} cov=${m.coverage.toFixed(2)} | mat=${d.material.code} inst=${d.install.no} | ${d.stats.evaluated} var ${d.stats.ms} ms (total ${d.stats.msTotal} ms)`,
  );
  console.log(
    `   KONV: ${d.conventional.nOut} vyústek á ${d.conventional.spacing} m, vMax=${c.vMax.toFixed(2)} DRmax=${c.drMax.toFixed(0)}% ok=${(c.drOkShare * 100).toFixed(0)}% ADPI=${c.adpi.toFixed(0)}% pen=${c.penetration.toFixed(2)} | plech ${Math.round(d.conventional.steelKg)} kg vs textil ${Math.round(d.totalWeight)} kg`,
  );
  console.log('   varianty: ' + d.variants.map((v) => `${v.n}×${v.outlet}/${v.pattern}/${v.p}${v.holeSize ? '/' + v.holeSize : ''} s=${v.score.toFixed(0)} DR=${v.drMax.toFixed(0)}`).join(' | '));
  for (const ch of d.checks) if (ch.level !== 'ok') console.log(`   [${ch.level}] ${ch.title}`);
}
