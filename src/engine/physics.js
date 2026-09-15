// Fyzikální model distribuce vzduchu.
//
// Proudy z otvorů a trysek se počítají integrálním modelem volného proudu
// (Morton–Taylor–Turner, profil „top-hat“) s vlivem vztlaku (Boussinesq):
//   – kruhový proud (perforace, trysky): Q, M, F; strhávání dQ/ds = 2π·b·α·u
//   – plošný/vějířový proud (mikroperforace): q, m, f na metr délky vyústky
// Trajektorie řeší dopad na podlahu (přechod na stěnový proud při podlaze),
// přilnutí ke stropu (Coandův jev) a odtržení chladného proudu od stropu.
// Komfort: ISO 7730 (Draught Rate), ASHRAE 113 (ADPI).

export const G = 9.81;
export const CP = 1005;

export const rho = (t) => 353.05 / (t + 273.15);

/** Rosný bod (Magnus–Tetens), °C */
export function dewPoint(t, rh) {
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(Math.max(1, rh) / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

/** ISO 7730 – Draught Rate (%) */
export function draughtRate(t, v, Tu = 40) {
  const vv = Math.max(0.05, v);
  if (t >= 34) return 0;
  const dr = (34 - t) * Math.pow(vv - 0.05, 0.62) * (0.37 * vv * Tu + 3.14);
  return Math.min(100, Math.max(0, dr));
}

/** Nejvyšší rychlost (m/s), při které DR nepřekročí limit při dané teplotě. */
export function velocityForDR(t, drLimit, Tu = 40) {
  let lo = 0.05;
  let hi = 2.0;
  if (draughtRate(t, hi, Tu) <= drLimit) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (draughtRate(t, mid, Tu) > drLimit) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** ASHRAE 113 – efektivní teplota průvanu (K) a kritérium ADPI */
export function edt(tx, tRoom, v) {
  return tx - tRoom - 7.66 * (v - 0.152);
}
export function adpiOk(tx, tRoom, v) {
  const th = edt(tx, tRoom, v);
  return th > -1.7 && th < 1.1 && v < 0.35;
}

// ---------------------------------------------------------------------------
// Integrální model proudu
// ---------------------------------------------------------------------------

const ALPHA_ROUND = 0.082; // strhávání (top-hat) → Vx = 6,9·V0·√A0 / x
const BETA_PLANE = 0.164; // růst pološířky plošného proudu → Vx = 2,47·V0·√(b0/x)
const U_MIN = 0.035;

/**
 * Trajektorie proudu v rovině příčného řezu (y vodorovně, z svisle).
 * @param {object} o
 * @param {'round'|'band'} o.kind
 * @param {number} o.y0 @param {number} o.z0 počátek (m)
 * @param {number} o.ang úhel výstupu – hodinová poloha ve stupních (0 = 12 h nahoru, 90 = 3 h, 180 = 6 h dolů)
 * @param {number} o.u0 výtoková rychlost (m/s)
 * @param {number} [o.A0] účinná plocha proudu (m²) – kruhový proud
 * @param {number} [o.b0] ekvivalentní šířka štěrbiny (m) – vějířový proud na 1 m délky
 * @param {number} [o.fan] úhlová šířka vějíře (rad) – mikroperforace
 * @param {number} o.dT0 rozdíl teplot přívod − místnost (K)
 * @param {number} o.tRoom teplota místnosti (°C)
 * @param {number} o.H výška stropu (m)
 * @param {number} [o.maxS] maximální délka trajektorie (m)
 * @param {number} [o.gamma] vertikální teplotní gradient místnosti (K/m, stabilní = kladný)
 * @returns {{branches: Array<Branch>, info: object}}
 */
export function jetTrajectory(o) {
  const beta = 1 / (o.tRoom + 273.15);
  const maxS = o.maxS ?? 60;
  const H = o.H;
  const gb = G * beta * (o.gamma ?? 0); // N² – Brunt–Väisälä
  const a = (o.ang * Math.PI) / 180;
  let dy = Math.sin(a);
  let dz = Math.cos(a);

  const main = newBranch('free');
  const branches = [main];
  const info = {
    throw02: null, // délka trajektorie, kde centrální rychlost klesne na 0,2 m/s
    minZ: o.z0,
    hitFloor: false,
    hitFloorU: 0,
    hitFloorY: null,
    ceilingAttached: false,
    detachY: null,
    maxY: o.y0,
    minY: o.y0,
    reach25: 0, // nejvzdálenější příčná poloha (od osy větve), kde má proud ještě ≥ 0,25 m/s
  };

  let y = o.y0;
  let z = o.z0;
  let s = 0;
  let dT = o.dT0;
  // teplý proud mířený dolů = „fontána“: v bodě obratu končí – teplý vzduch pak stoupá kolem proudu
  // a rozlévá se pod stropem (integrální model za bodem obratu nedává smysl – proud by „kmital“ po ose)
  const fountain = dz < -0.3 && o.dT0 > 0;
  info.fountainZ = null;

  if (o.kind === 'round') {
    let Q = o.u0 * o.A0;
    const Q0 = Q;
    let My = o.u0 * o.u0 * o.A0 * dy;
    let Mz = o.u0 * o.u0 * o.A0 * dz;
    let F = G * beta * o.dT0 * Q0;
    const d0 = Math.sqrt((4 * o.A0) / Math.PI);
    while (s < maxS) {
      const Mm = Math.hypot(My, Mz);
      const uth = Mm / Q;
      const uc = Math.min(o.u0, 2 * uth);
      const bth = Q / Math.sqrt(Math.PI * Mm);
      const bg = Math.max(d0 * 0.5, bth / Math.SQRT2);
      dT = clampAbs((1.69 * F) / (G * beta * Q), Math.abs(o.dT0));
      push(main, y, z, s, uc, bg, dT, dy, dz);
      track(info, y, z, s, uc);
      if (uc < U_MIN) break;
      const ds = Math.min(0.25, 0.012 + 0.04 * s);
      Q += 2 * Math.PI * bth * ALPHA_ROUND * uth * ds;
      Mz += (F / uth) * ds;
      F -= gb * Q * dz * ds;
      const nm = Math.hypot(My, Mz);
      dy = My / nm;
      dz = Mz / nm;
      if (fountain && dz > 0.1) {
        info.fountainZ = z;
        break;
      }
      y += dy * ds;
      z += dz * ds;
      s += ds;
      if (z <= Math.min(0.6, 0.25 * bg) + 0.08 && dz < 0) {
        info.hitFloor = true;
        info.hitFloorU = uc;
        info.hitFloorY = y;
        floorWallJet(branches, info, { y, s, uc, bg, dT, dy, round: true, maxX: maxS });
        break;
      }
      if (z >= H - 0.05 && dz > 0) {
        ceilingJet(branches, info, o, { y, s, uc, bg, dT, dy, beta, round: true });
        break;
      }
    }
  } else {
    // vějířový / plošný proud na 1 m délky vyústky
    const fan = o.fan ?? 0;
    const fanFactor = fan > 0 ? Math.sin(fan / 2) / (fan / 2) : 1;
    const grow = BETA_PLANE + fan / 2; // růst pološířky vějířového proudu
    const q0 = o.u0 * o.b0;
    let b = o.b0 / 2;
    let my = o.u0 * o.u0 * o.b0 * fanFactor * dy;
    let mz = o.u0 * o.u0 * o.b0 * fanFactor * dz;
    let f = G * beta * o.dT0 * q0;
    while (s < maxS) {
      const mm = Math.hypot(my, mz);
      const uth = Math.sqrt(mm / (2 * b));
      const uc = Math.min(o.u0, Math.SQRT2 * uth);
      const q = 2 * b * uth;
      const bg = Math.max(0.01, b * 0.85);
      dT = clampAbs((1.3 * f) / (G * beta * Math.max(q, q0)), Math.abs(o.dT0));
      push(main, y, z, s, uc, bg, dT, dy, dz);
      track(info, y, z, s, uc);
      if (uc < U_MIN) break;
      const ds = Math.min(0.2, 0.01 + 0.04 * s);
      b += grow * ds;
      mz += (f / uth) * ds;
      f -= gb * q * dz * ds;
      const nm = Math.hypot(my, mz);
      dy = my / nm;
      dz = mz / nm;
      if (fountain && dz > 0.1) {
        info.fountainZ = z;
        break;
      }
      y += dy * ds;
      z += dz * ds;
      s += ds;
      if (z <= Math.min(0.6, 0.25 * bg) + 0.08 && dz < 0) {
        info.hitFloor = true;
        info.hitFloorU = uc;
        info.hitFloorY = y;
        floorWallJet(branches, info, { y, s, uc, bg, dT, dy, round: false, maxX: maxS });
        break;
      }
      if (z >= H - 0.05 && dz > 0) {
        ceilingJet(branches, info, o, { y, s, uc, bg, dT, dy, beta });
        break;
      }
    }
  }
  for (const br of branches) finalize(br);
  return { branches, info };
}

function clampAbs(v, lim) {
  return Math.max(-lim, Math.min(lim, v));
}

function newBranch(phase) {
  return { phase, y: [], z: [], s: [], uc: [], bg: [], dT: [], dy: [], dz: [] };
}
function push(br, y, z, s, uc, bg, dT, dy, dz) {
  br.y.push(y);
  br.z.push(z);
  br.s.push(s);
  br.uc.push(uc);
  br.bg.push(bg);
  br.dT.push(dT);
  br.dy.push(dy);
  br.dz.push(dz);
}
function track(info, y, z, s, uc) {
  // průnik počítáme jen tam, kde proud ještě nese vzduch (≥ 0,1 m/s)
  if (uc >= 0.1 && z < info.minZ) info.minZ = z;
  if (y > info.maxY) info.maxY = y;
  if (y < info.minY) info.minY = y;
  if (uc >= 0.25 && Math.abs(y) > info.reach25) info.reach25 = Math.abs(y);
  if (info.throw02 === null && uc < 0.2) info.throw02 = s;
}
function finalize(br) {
  br.n = br.y.length;
  // obálka větve pro rychlé vyřazení vzdálených bodů
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let bm = 0;
  for (let i = 0; i < br.n; i++) {
    if (br.y[i] < y0) y0 = br.y[i];
    if (br.y[i] > y1) y1 = br.y[i];
    if (br.z[i] < z0) z0 = br.z[i];
    if (br.z[i] > z1) z1 = br.z[i];
    if (br.bg[i] > bm) bm = br.bg[i];
  }
  const pad = 3 * bm;
  br.box = [y0 - pad, y1 + pad, z0 - pad, z1 + pad];
}

/** Přechod na stěnový proud podél podlahy. */
function floorWallJet(branches, info, h) {
  const dirs = Math.abs(h.dy) < 0.3 ? [-1, 1] : [Math.sign(h.dy)];
  const split = dirs.length === 2 ? Math.SQRT1_2 : 1;
  for (const sgn of dirs) {
    const br = newBranch('floor');
    const r0 = Math.max(0.25, h.bg);
    let x = 0;
    for (let i = 0; i < 400; i++) {
      const u = h.round
        ? h.uc * split * (r0 / (r0 + x))
        : h.uc * split * Math.sqrt(r0 / (r0 + 0.6 * x));
      const delta = Math.max(0.12, 0.5 * h.bg + 0.075 * x);
      const dT = h.dT * Math.pow(r0 / (r0 + x), 0.7);
      const zc = Math.min(0.35, delta * 0.5);
      push(br, h.y + sgn * x, zc, h.s + x, u, delta, dT, sgn, 0);
      track(info, h.y + sgn * x, zc, h.s + x, u);
      if (u < U_MIN || x > h.maxX) break;
      x += Math.min(0.25, 0.03 + 0.05 * x);
    }
    branches.push(br);
  }
}

/** Přilnutí ke stropu (Coandův jev), u chladného proudu možné odtržení. */
function ceilingJet(branches, info, o, h) {
  info.ceilingAttached = true;
  const dirs = Math.abs(h.dy) < 0.25 ? [-1, 1] : [Math.sign(h.dy)];
  const split = dirs.length === 2 ? Math.SQRT1_2 : 1;
  for (const sgn of dirs) {
    const br = newBranch('ceiling');
    const r0 = Math.max(0.25, h.bg);
    let x = 0;
    let detached = false;
    let u = h.uc * split;
    let delta = Math.max(0.1, h.bg);
    let dT = h.dT;
    for (let i = 0; i < 400; i++) {
      u = h.round ? h.uc * split * (r0 / (r0 + 0.7 * x)) : h.uc * split * Math.sqrt(r0 / (r0 + 0.6 * x));
      delta = Math.max(0.1, 0.5 * h.bg + 0.075 * x);
      dT = h.dT * Math.pow(r0 / (r0 + x), 0.55);
      const zz = o.H - delta * 0.5;
      push(br, h.y + sgn * x, zz, h.s + x, u, delta, dT, sgn, 0);
      track(info, h.y + sgn * x, zz, h.s + x, u);
      if (u < U_MIN || x > (o.maxS ?? 40)) break;
      // odtržení chladného proudu od stropu (lokální Archimedovo číslo)
      // odtrhne se jen původně chladný proud (teplý vzduch u stropu zůstává – rozvrstvení)
      if (dT < 0 && o.dT0 < 0) {
        const Ar = (G * (1 / (o.tRoom + 273.15)) * Math.abs(dT) * delta) / (u * u);
        if (Ar > 0.12) {
          detached = true;
          break;
        }
      }
      x += Math.min(0.25, 0.03 + 0.05 * x);
    }
    branches.push(br);
    if (detached && u > U_MIN * 1.5 && (o.depth ?? 0) < 2) {
      info.detachY = h.y + sgn * x;
      const sub = jetTrajectory({
        kind: 'band',
        y0: h.y + sgn * x,
        z0: o.H - delta * 0.6,
        ang: sgn > 0 ? 115 : 245,
        u0: u,
        b0: delta,
        fan: 0.2,
        dT0: dT,
        tRoom: o.tRoom,
        H: o.H,
        maxS: 30,
        gamma: o.gamma,
        depth: (o.depth ?? 0) + 1,
      });
      const sOff = h.s + x;
      for (const b of sub.branches) {
        for (let i = 0; i < b.n; i++) b.s[i] += sOff;
        branches.push(b);
      }
      if (sub.info.hitFloor) {
        info.hitFloor = true;
        info.hitFloorU = Math.max(info.hitFloorU, sub.info.hitFloorU);
      }
      if (info.throw02 === null && sub.info.throw02 !== null) info.throw02 = sOff + sub.info.throw02;
      info.minZ = Math.min(info.minZ, sub.info.minZ);
      info.maxY = Math.max(info.maxY, sub.info.maxY);
      info.minY = Math.min(info.minY, sub.info.minY);
      info.reach25 = Math.max(info.reach25, sub.info.reach25);
    }
  }
}

/**
 * Decimace větví pro rychlé vyhodnocování (optimalizátor).
 */
export function decimate(traj, maxPts = 48) {
  return {
    info: traj.info,
    branches: traj.branches.map((br) => {
      if (br.n <= maxPts) return br;
      const step = br.n / maxPts;
      const out = newBranch(br.phase);
      for (let i = 0; i < maxPts; i++) {
        const k = Math.min(br.n - 1, Math.round(i * step));
        push(out, br.y[k], br.z[k], br.s[k], br.uc[k], br.bg[k], br.dT[k], br.dy[k], br.dz[k]);
      }
      const k = br.n - 1;
      push(out, br.y[k], br.z[k], br.s[k], br.uc[k], br.bg[k], br.dT[k], br.dy[k], br.dz[k]);
      finalize(out);
      return out;
    }),
  };
}

/**
 * Příspěvek jedné trajektorie v bodě (py, pz): rychlost, směr a teplotní odchylka.
 * rowPitch > 0 → řada samostatných proudů s roztečí (m) podél vyústky; vrací i průměr podél řady.
 * minBg > 0 → minimální šířka proudu (m) – vzorkování do mřížky, aby úzké jádro u výtoku nepropadlo mezi uzly.
 */
export function sampleJet(traj, py, pz, rowPitch = 0, minBg = 0) {
  let best = null;
  let bestD2 = Infinity;
  let bestBr = null;
  let bestI = 0;
  const pad = 3 * minBg;
  for (const br of traj.branches) {
    const bx = br.box;
    if (bx && (py < bx[0] - pad || py > bx[1] + pad || pz < bx[2] - pad || pz > bx[3] + pad)) continue;
    const Y = br.y;
    const Z = br.z;
    for (let i = 0; i < br.n; i++) {
      const ddy = py - Y[i];
      const ddz = pz - Z[i];
      const d2 = ddy * ddy + ddz * ddz;
      // normalizovaná vzdálenost vůči šířce proudu
      const bg = Math.max(br.bg[i], minBg);
      const nd = d2 / (bg * bg);
      if (nd < bestD2) {
        bestD2 = nd;
        bestBr = br;
        bestI = i;
      }
    }
  }
  if (!bestBr || bestD2 > 9) return null;
  const w = Math.exp(-bestD2);
  const bg = Math.max(bestBr.bg[bestI], minBg);
  const uc = bestBr.uc[bestI];
  let mean = uc * w;
  if (rowPitch > 0) mean *= Math.min(1, (Math.sqrt(Math.PI) * bg) / rowPitch);
  best = {
    u: uc * w,
    uMean: mean,
    dy: bestBr.dy[bestI],
    dz: bestBr.dz[bestI],
    dT: bestBr.dT[bestI] * Math.exp(-bestD2 / 1.44),
    phase: bestBr.phase,
  };
  return best;
}

/** Výtoková rychlost z otvoru při statickém tlaku p (Pa). */
export function exitVelocity(p, t, Cv) {
  return Cv * Math.sqrt((2 * p) / rho(t));
}
