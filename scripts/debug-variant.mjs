// Ladění: vyhodnocení konkrétních variant pro danou šablonu.
// node scripts/debug-variant.mjs food "2,microDirectional,4-8,70" "3,microUniform,6,70"
import { defaultProject, evaluateVariant, resolveInputs } from '../src/engine/designer.js';

const [app, ...vars] = process.argv.slice(2);
const inp = resolveInputs(defaultProject(app));
console.log(`vAllow=${inp.vAllow.toFixed(3)} drLimit=${inp.drLimit} ach=${inp.ach.toFixed(1)}`);
for (const v of vars) {
  const [n, o, pat, p, hs] = v.split(',');
  const t0 = performance.now();
  const r = evaluateVariant(inp, +n, o, pat, +p, hs ? +hs : null, false);
  const ms = performance.now() - t0;
  const m = r.m;
  console.log(
    `${v.padEnd(34)} score=${r.score.toFixed(1)} vBg=${r.vBg.toFixed(3)} vMax=${m.vMax.toFixed(3)} DRmax=${m.drMax.toFixed(1)} ok=${(m.drOkShare * 100).toFixed(0)} ADPI=${m.adpi.toFixed(0)} throw=${r.throw02.toFixed(2)} reach=${r.reachY.toFixed(2)} pen=${r.penetration.toFixed(2)} feas=${r.os.feasible} u0=${r.os.u0.toFixed(1)} ${ms.toFixed(1)}ms`,
  );
  for (const tr of r.trajs) {
    const i = tr.info;
    console.log(`    traj: branches=${tr.branches.map((b) => b.phase + ':' + b.n).join(',')} minZ=${i.minZ.toFixed(2)} hitFloor=${i.hitFloor} uHit=${i.hitFloorU.toFixed(2)} ceil=${i.ceilingAttached} detach=${i.detachY?.toFixed(2)}`);
  }
}
