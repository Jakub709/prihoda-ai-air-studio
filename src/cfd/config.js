// Převod návrhu na zadání CFD řezu (zdroje hybnosti a vztlaku odpovídají návrhu).

export function cfdConfig(design, system = 'prihoda', quality = 1) {
  const inp = design.inp;
  const g = design.geo;
  const o = design.outlet;
  const ducts = design.runs.map((run) => ({ y: run.y, z: g.zc, r: g.r, shape: design.shape }));
  const jets = [];
  if (system === 'prihoda') {
    const rows = o.angles.length;
    const qRow = g.Qrun / g.Ld / rows; // m²/s na 1 m délky a řadu
    const mRow = o.u0 * qRow; // kinematický tok hybnosti na 1 m
    const fan = o.kind === 'band' ? o.fan : 0;
    ducts.forEach((_, di) => {
      for (const a of o.angles) jets.push({ duct: di, ang: a, fan, m: mRow, q: qRow, dT0: inp.dT0, uMax: 5 });
    });
  } else {
    // řez vedený vyústkou klasického rozvodu (nejhorší místo)
    const c = design.conventional;
    const wg = Math.max(0.15, c.grilleSize / 1000);
    const Qg = g.Qrun / (c.perRun * 2);
    const mG = (c.u0 * Qg) / wg;
    const qG = Qg / wg;
    ducts.forEach((_, di) => {
      for (const a of [c.ang, 360 - c.ang]) jets.push({ duct: di, ang: a, fan: 0.3, m: mG, q: qG, dT0: inp.dT0, uMax: 6 });
    });
  }
  const aspect = inp.W / inp.H;
  const nx = Math.round((aspect > 3 ? 230 : aspect > 1.8 ? 200 : 150) * quality);
  return { W: inp.W, H: inp.H, nx, tr: inp.tr, ducts, jets, oz: inp.oz, gamma: inp.gamma, zRef: inp.zRef, mode: inp.mode };
}
