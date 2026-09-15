// Volný izotermní dosah (0,2 m/s) navržených vyústek vs. katalogové rozsahy Příhoda.
// Použití: node scripts/throw-check.mjs
import { APPLICATIONS, OUTLETS } from '../src/engine/catalog.js';
import { computeDesign, defaultProject } from '../src/engine/designer.js';
import { jetTrajectory } from '../src/engine/physics.js';

function freeThrow(o) {
  const t = jetTrajectory({
    kind: o.b0 ? 'band' : 'round',
    y0: 0,
    z0: 50,
    ang: 90,
    u0: o.u0,
    A0: o.A0,
    b0: o.b0,
    fan: o.fan,
    dT0: 0,
    tRoom: 20,
    H: 200,
    maxS: 150,
    gamma: 0,
  });
  return t.info.throw02 ?? 150;
}

for (const key of Object.keys(APPLICATIONS)) {
  const d = computeDesign(defaultProject(key));
  const o = d.outlet;
  const cat = OUTLETS[o.key].throw;
  const q = d.geo.Qrun / d.geo.Ld / o.angles.length;
  const ceil = d.trajs.some((t) => t.info.ceilingAttached);
  console.log(
    `${key.padEnd(9)} ${o.key.padEnd(16)} p=${String(o.p).padStart(3)} ${o.holeSize ? 'd=' + o.holeSize + 'mm pitch=' + Math.round(o.pitch * 1000) + 'mm' : 'b0=' + (o.b0 * 1000).toFixed(1) + 'mm'} u0=${o.u0.toFixed(1)} q'=${q.toFixed(3)} | volný dosah ${freeThrow(o).toFixed(1)} m | dráha v místnosti ${(d.metrics.throw02 || 0).toFixed(1)} m${ceil ? ' (strop)' : ''} | katalog ${cat[0]}–${cat[1]} m`,
  );
}
