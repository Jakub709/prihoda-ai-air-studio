// Návrhový engine: z parametrů projektu vytvoří kompletní návrh tkaninového rozvodu.
// 1) vyhodnotí stovky variant (počet větví × typ výustě × poloha otvorů × tlak × velikost otvorů)
// 2) vybere nejlepší podle komfortu (ISO 7730, ADPI), dosahu, hluku, energie a nákladů
// 3) dopočítá geometrii, kusovník, kontroly a srovnání s plechovým rozvodem

import {
  APPLICATIONS, COLORS, COMFORT_CATEGORIES, INSTALLATIONS, MATERIALS, MATERIAL_FAMILY_CZ,
  NOISE_CLASSES, OUTLETS, SHAPES, STANDARD_DIAMETERS,
} from './catalog.js';
import {
  CP, adpiOk, decimate, dewPoint, draughtRate, exitVelocity, jetTrajectory, rho, sampleJet, velocityForDR,
} from './physics.js';

export const PATTERNS = {
  '2-10': { key: '2-10', angles: [60, 300], name: '2 a 10 h', desc: 'šikmo vzhůru – využití stropu' },
  '3-9': { key: '3-9', angles: [90, 270], name: '3 a 9 h', desc: 'vodorovně do stran' },
  '4-8': { key: '4-8', angles: [120, 240], name: '4 a 8 h', desc: 'šikmo dolů (30° pod vodorovnou)' },
  '5-7': { key: '5-7', angles: [150, 210], name: '5 a 7 h', desc: 'strmě dolů (60° pod vodorovnou)' },
  '6': { key: '6', angles: [180], name: '6 h', desc: 'svisle dolů' },
};

const PRESSURES = {
  microUniform: [50, 70, 100, 130],
  microDirectional: [50, 70, 100, 130],
  perforation: [80, 120, 160, 220, 300],
  smallNozzle: [70, 100, 150, 200, 280],
  bigNozzle: [80, 120, 180, 250, 350],
};
const HOLE_SIZES = {
  perforation: [6, 8, 10, 12, 16, 20],
  smallNozzle: [20, 30, 40, 60],
  bigNozzle: [50, 60, 80, 100],
};

const TU = 40; // intenzita turbulence pro DR (%), výchozí hodnota ISO 7730

export function defaultProject(appKey = 'food') {
  const a = APPLICATIONS[appKey] ?? APPLICATIONS.food;
  return {
    name: a.name,
    customer: '',
    location: '',
    app: a.key,
    L: a.dims[0],
    W: a.dims[1],
    H: a.dims[2],
    mode: a.mode,
    flow: a.flow ?? null,
    ach: a.ach,
    loadKW: null,
    ts: a.ts,
    tr: a.tr,
    rh: a.rh,
    oz: a.oz,
    cat: a.cat,
    noise: a.noise,
    hygiene: a.hygiene,
    eco: false,
    fireA: false,
    shape: 'C',
    runs: 'auto',
    outlet: 'auto',
    pattern: 'auto',
    pressure: 'auto',
    holeSize: 'auto',
    material: 'auto',
    color: 'WH',
    customColor: null,
    install: 'auto',
    mountHeight: 'auto',
  };
}

// ---------------------------------------------------------------------------

export function resolveInputs(p) {
  const app = APPLICATIONS[p.app] ?? APPLICATIONS.food;
  const L = clamp(num(p.L, app.dims[0]), 4, 300);
  const W = clamp(num(p.W, app.dims[1]), 3, 150);
  const H = clamp(num(p.H, app.dims[2]), 2.4, 30);
  const V = L * W * H;
  let mode = ['cooling', 'heating', 'ventilation'].includes(p.mode) ? p.mode : app.mode;
  const tr = num(p.tr, app.tr);
  let ts = num(p.ts, app.ts);
  if (mode === 'ventilation') ts = num(p.ts, tr);
  const dT0 = ts - tr;
  let flow = num(p.flow, 0);
  let flowSource = 'zadáno';
  if (!(flow > 0)) {
    if (num(p.loadKW, 0) > 0 && Math.abs(dT0) >= 1) {
      flow = ((num(p.loadKW, 0) * 1000) / (rho(ts) * CP * Math.abs(dT0))) * 3600;
      flowSource = 'z tepelné zátěže';
    } else {
      flow = num(p.ach, app.ach) * V;
      flowSource = 'z intenzity výměny';
    }
  }
  flow = clamp(flow, 200, 400000);
  const Q = flow / 3600;
  const ach = flow / V;
  const rh = clamp(num(p.rh, app.rh), 5, 98);
  const Td = dewPoint(tr, rh);
  const condensation = mode === 'cooling' && ts < Td + 0.5;
  const cat = COMFORT_CATEGORIES[p.cat] ? p.cat : app.cat;
  // ISO 7730 platí pro běžná prostředí; pro chladná pracoviště (< 12 °C) se hodnotí rychlost ≤ 0,20 m/s
  const coldWork = tr < 12;
  const drLimit = coldWork ? Math.round(draughtRate(tr, 0.2, TU)) : COMFORT_CATEGORIES[cat].maxDR;
  // vytápění: teplý proud hodnotíme rychlostí v zóně a vertikálním gradientem (DR je kritérium chladného průvanu)
  const heatVLimit = { A: 0.25, B: 0.3, C: 0.4 }[cat];
  const catLabel = coldWork
    ? 'chladné pracoviště (v ≤ 0,20 m/s)'
    : mode === 'heating'
      ? `vytápění kat. ${cat}: v ≤ ${String(heatVLimit).replace('.', ',')} m/s, gradient ≤ ${{ A: 2, B: 3, C: 4 }[cat]} K`
      : COMFORT_CATEGORIES[cat].label;
  const vAllow = velocityForDR(tr, drLimit, TU);
  const noise = NOISE_CLASSES[p.noise] ? p.noise : app.noise;
  const oz = clamp(num(p.oz, app.oz), 0.6, Math.max(0.8, H - 1.2));
  const heatKW = (rho(ts) * CP * Q * dT0) / 1000;
  // vertikální teplotní gradient (stabilní stratifikace), K/m – modelový odhad pro směšovací větrání
  const gamma = mode === 'cooling' ? clamp(0.09 * Math.abs(dT0), 0.2, 1.0) : mode === 'heating' ? clamp(0.03 * dT0, 0.15, 0.8) : 0.15;
  const zRef = Math.min(1.1, clamp(num(p.oz, app.oz), 0.6, 1.8));
  const vBg = clamp(0.03 + 0.0045 * ach, 0.03, 0.12);
  return {
    app, appKey: app.key, L, W, H, V, mode, tr, ts, dT0, flow, Q, ach, flowSource, rh, Td, condensation, cat, drLimit, catLabel, coldWork,
    vAllow: mode === 'heating' ? heatVLimit : vAllow, heatVLimit, gradLimit: { A: 2, B: 3, C: 4 }[cat],
    noise, noiseClass: NOISE_CLASSES[noise], oz, heatKW, vBg, gamma, zRef,
    vLimit: num(p.vLimit, app.vLimit ?? 0) || null,
    shape: SHAPES[p.shape] ? p.shape : 'C',
    locks: {
      runs: isNum(p.runs) ? Math.round(p.runs) : null,
      outlet: OUTLETS[p.outlet] ? p.outlet : null,
      pattern: PATTERNS[p.pattern] ? p.pattern : null,
      pressure: isNum(p.pressure) ? clamp(+p.pressure, 20, 450) : null,
      holeSize: isNum(p.holeSize) ? +p.holeSize : null,
      mountHeight: isNum(p.mountHeight) ? +p.mountHeight : null,
    },
    hygiene: !!p.hygiene,
    eco: !!p.eco,
    fireA: !!p.fireA,
    material: MATERIALS[p.material] ? p.material : null,
    color: COLORS[p.color] ? p.color : 'WH',
    customColor: typeof p.customColor === 'string' && /^#[0-9a-f]{6}$/i.test(p.customColor) ? p.customColor : null,
    install: INSTALLATIONS[p.install] ? +p.install : null,
    name: p.name || app.name,
    customer: p.customer || '',
    location: p.location || '',
  };
}

// ---------------------------------------------------------------------------
// Geometrie větví

export function pickDiameter(Qrun, shape, vTarget) {
  const areaFn = SHAPES[shape].area;
  for (const D of STANDARD_DIAMETERS) {
    if (D < 160) continue;
    const A = areaFn(D / 1000);
    if (Qrun / A <= vTarget) return D;
  }
  return STANDARD_DIAMETERS[STANDARD_DIAMETERS.length - 1];
}

export function velocityRating(v, noiseKey) {
  const nc = NOISE_CLASSES[noiseKey];
  if (v > 12 || v > nc.vOrange + 1.5) return { level: 'red', label: 'nepřijatelná', penalty: 90 };
  if (v > nc.vGreen) return { level: 'orange', label: 'riziková', penalty: 16 };
  if (v < 2) return { level: 'blue', label: 'předimenzováno', penalty: 8 };
  return { level: 'green', label: 'vhodná', penalty: 0 };
}

function runGeometry(inp, n, lockMount) {
  const Qrun = inp.Q / n;
  const D = pickDiameter(Qrun, inp.shape, inp.noiseClass.vTarget);
  const Dm = D / 1000;
  const r = Dm / 2;
  const A = SHAPES[inp.shape].area(Dm);
  const vIn = Qrun / A;
  const x0 = Math.min(1.2, inp.L * 0.06);
  const x1 = inp.L - Math.min(1.0, inp.L * 0.05);
  const Ld = x1 - x0;
  let zc;
  let gap;
  if (inp.shape === 'H') {
    zc = inp.H - 0.02;
    gap = 0;
  } else {
    gap = inp.H > 7 ? 0.7 : inp.H > 4.5 ? 0.45 : 0.22;
    zc = inp.H - gap - r;
    if (lockMount) zc = clamp(lockMount, inp.oz + r + 0.3, inp.H - r - 0.02);
    if (zc - r < inp.oz + 0.35) {
      gap = 0.05;
      zc = Math.max(inp.H - gap - r, inp.oz + r + 0.2);
    }
  }
  const ys = [];
  for (let j = 0; j < n; j++) ys.push((inp.W * (j + 0.5)) / n);
  return { n, Qrun, D, Dm, r, A, vIn, x0, x1, Ld, zc, gap, ys, bottom: inp.shape === 'H' ? zc - r : zc - r };
}

// ---------------------------------------------------------------------------
// Dimenzování výstupních otvorů

function sizeOutlets(inp, geo, outletKey, patternKey, p, holeSize) {
  const out = OUTLETS[outletKey];
  let angles = PATTERNS[patternKey].angles.slice();
  if (inp.shape === 'H') angles = angles.map((a) => (a < 90 ? 90 + (a / 90) * 20 : a > 270 ? 270 - ((360 - a) / 90) * 20 : a));
  const rows = angles.length;
  const u0 = exitVelocity(p, inp.ts, out.Cv);
  const Ageom = geo.Qrun / (out.Cc * u0); // geometrická otevřená plocha jedné větve
  const res = { outletKey, patternKey, p, holeSize: null, u0, Ageom, angles, rows, feasible: true, issues: [] };
  if (out.kind === 'holes') {
    const d = holeSize / 1000;
    const ah = (Math.PI * d * d) / 4;
    const N = Ageom / ah;
    const perRow = N / rows;
    const pitch = geo.Ld / perRow;
    res.holeSize = holeSize;
    res.count = Math.round(N);
    res.perRow = Math.round(perRow);
    res.pitch = pitch;
    res.A0 = out.Cc * ah;
    const minPitch = outletKey === 'perforation' ? Math.max(2.2 * d, d + 0.008) : 2.6 * d;
    const maxPitch = outletKey === 'bigNozzle' ? 4.0 : outletKey === 'smallNozzle' ? 1.6 : 1.0;
    if (pitch < minPitch) {
      res.feasible = false;
      res.issues.push('otvory příliš husté');
    }
    if (pitch > maxPitch) {
      res.feasible = false;
      res.issues.push('otvory příliš řídké');
    }
  } else {
    const band = (out.bandWidth * Math.PI) / 180;
    const bandPerRow = outletKey === 'microUniform' ? band / rows : band;
    const qRow = geo.Qrun / geo.Ld / rows;
    res.b0 = qRow / u0;
    res.fan = bandPerRow;
    res.microHoles = Math.round(Ageom / ((Math.PI * 0.0003 * 0.0003) / 4));
    const bandArea = geo.r * bandPerRow * rows * geo.Ld;
    res.openRatio = Ageom / bandArea;
    res.pitch = 0;
    if (res.openRatio > 0.12) {
      res.feasible = false;
      res.issues.push('nedostatečná plocha pro mikroperforaci');
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Trajektorie a vyhodnocení pobytové zóny

function outletOrigin(inp, geo, ang, yRun = 0) {
  const a = (ang * Math.PI) / 180;
  return { y: yRun + geo.r * Math.sin(a), z: geo.zc + geo.r * Math.cos(a) };
}

function runTrajectories(inp, geo, os, full = false) {
  const trajs = [];
  for (const ang of os.angles) {
    const o = outletOrigin(inp, geo, ang, 0);
    const t = jetTrajectory({
      kind: os.b0 ? 'band' : 'round',
      y0: o.y,
      z0: o.z,
      ang,
      u0: os.u0,
      A0: os.A0,
      b0: os.b0,
      fan: os.fan,
      dT0: inp.dT0,
      tRoom: inp.tr,
      H: inp.H,
      maxS: Math.max(20, inp.W * 1.6),
      gamma: inp.gamma,
    });
    trajs.push(full ? t : decimate(t, 32));
  }
  return trajs;
}

/**
 * Profil vlivu jedné větve v závislosti na příčné vzdálenosti (Δy) ve výšce z.
 * „Splatting“: každý vzorek trajektorie rozprostře gaussovský příspěvek do okolních bodů;
 * v rámci jedné větve proudu se bere maximum, mezi proudy součet kvadrátů (energie).
 */
// rychlá exp(−x) pro x ∈ [0, 8) – tabulka s lineární interpolací
const EXP_N = 1024;
const EXP_TAB = new Float32Array(EXP_N + 2);
for (let i = 0; i <= EXP_N + 1; i++) EXP_TAB[i] = Math.exp(-(i * 8) / EXP_N);
function fexp(x) {
  if (x >= 8) return 0;
  const f = x * (EXP_N / 8);
  const i = f | 0;
  const w = f - i;
  return EXP_TAB[i] + (EXP_TAB[i + 1] - EXP_TAB[i]) * w;
}

const _buf = { n: 0 };
function scratch(n) {
  if (_buf.n < n) {
    _buf.n = n;
    _buf.u = new Float32Array(n);
    _buf.um = new Float32Array(n);
    _buf.t = new Float32Array(n);
    _buf.tm = new Float32Array(n);
    _buf.gen = new Int32Array(n);
    _buf.g = 0;
  }
  return _buf;
}
function influenceProfile(trajs, os, span, step, z) {
  const n = Math.round((2 * span) / step) + 1;
  const u2 = new Float32Array(n);
  const um2 = new Float32Array(n);
  const dT = new Float32Array(n);
  const dTm = new Float32Array(n);
  const S = scratch(n);
  const pitch = os.pitch > 0 ? os.pitch : 0;
  for (const tr of trajs) {
    for (const br of tr.branches) {
      const bx = br.box;
      if (z < bx[2] || z > bx[3]) continue;
      const g = ++S.g; // generace – levné „vynulování“ bufferu pro každou větev
      let kMin = n;
      let kMax = -1;
      let lastY = Infinity;
      let lastZ = Infinity;
      for (let i = 0; i < br.n; i++) {
        const bg = br.bg[i];
        const dz = z - br.z[i];
        if (dz > 2.6 * bg || dz < -2.6 * bg) continue;
        const yi = br.y[i];
        // vzorky hustší než ~0,35 šířky proudu nic nepřidají – přeskočit
        if (i < br.n - 1 && Math.abs(yi - lastY) + Math.abs(br.z[i] - lastZ) < 0.35 * bg) continue;
        lastY = yi;
        lastZ = br.z[i];
        const wz = (dz * dz) / (bg * bg);
        const k0 = Math.max(0, Math.ceil((yi - 2.6 * bg + span) / step));
        const k1 = Math.min(n - 1, Math.floor((yi + 2.6 * bg + span) / step));
        if (k0 > k1) continue;
        if (k0 < kMin) kMin = k0;
        if (k1 > kMax) kMax = k1;
        const rowF = pitch > 0 ? Math.min(1, (1.7725 * bg) / pitch) : 1;
        const uc = br.uc[i];
        const dTi = br.dT[i];
        const ib2 = 1 / (bg * bg);
        for (let k = k0; k <= k1; k++) {
          if (S.gen[k] !== g) {
            S.gen[k] = g;
            S.u[k] = 0;
          }
          const dy = -span + k * step - yi;
          const nd = wz + dy * dy * ib2;
          if (nd >= 6.75) continue;
          const val = uc * fexp(nd);
          if (val > S.u[k]) {
            S.u[k] = val;
            S.um[k] = val * rowF;
            const wt = fexp(nd * 0.694);
            S.t[k] = dTi * wt;
            S.tm[k] = dTi * wt * rowF;
          }
        }
      }
      for (let k = kMin; k <= kMax; k++) {
        if (S.gen[k] !== g) continue;
        const v = S.u[k];
        if (v <= 0) continue;
        u2[k] += v * v;
        um2[k] += S.um[k] * S.um[k];
        dT[k] += S.t[k];
        dTm[k] += S.tm[k];
      }
    }
  }
  const u = new Float32Array(n);
  const um = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    u[k] = Math.sqrt(u2[k]);
    um[k] = Math.sqrt(um2[k]);
  }
  return { u, um, dT, dTm, span, step, n };
}

const ACC = new Float64Array(8);
/** Přičte (bez alokací) interpolovaný příspěvek profilu v bodě dy do akumulátoru. */
function accum(pr, dy, acc, o) {
  const f = (dy + pr.span) / pr.step;
  if (f < 0 || f > pr.n - 1) return;
  const i = f | 0;
  const w = f - i;
  const j = i + 1 < pr.n ? i + 1 : i;
  const u = pr.u[i] + (pr.u[j] - pr.u[i]) * w;
  const um = pr.um[i] + (pr.um[j] - pr.um[i]) * w;
  acc[o] += u * u;
  acc[o + 1] += um * um;
  acc[o + 2] += pr.dT[i] + (pr.dT[j] - pr.dT[i]) * w;
  acc[o + 3] += pr.dTm[i] + (pr.dTm[j] - pr.dTm[i]) * w;
}

function profAt(pr, dy) {
  const f = (dy + pr.span) / pr.step;
  if (f < 0 || f > pr.n - 1) return [0, 0, 0, 0];
  const i = Math.floor(f);
  const w = f - i;
  const j = Math.min(pr.n - 1, i + 1);
  return [
    pr.u[i] * (1 - w) + pr.u[j] * w,
    pr.um[i] * (1 - w) + pr.um[j] * w,
    pr.dT[i] * (1 - w) + pr.dT[j] * w,
    pr.dTm[i] * (1 - w) + pr.dTm[j] * w,
  ];
}

/**
 * Rychlost v pobytové zóně mimo přímé proudy:
 *  – základní turbulence dle intenzity výměny,
 *  – recirkulace indukovaná hybností přívodu (škálování dle Nielsena: u ~ √(M / ρ·A_podlahy)),
 *  – gravitační proud chladného vzduchu při chlazení (u ~ (g′·q′)^⅓).
 */
export function backgroundVelocity(inp, Qrun, Ld, u0) {
  const base = clamp(0.03 + 0.004 * inp.ach, 0.03, 0.09);
  const vMom = 0.45 * Math.sqrt((inp.Q * u0) / (inp.L * inp.W));
  let vBuoy = 0;
  if (inp.dT0 < 0) {
    const gp = (9.81 * Math.abs(inp.dT0)) / (inp.tr + 273.15);
    vBuoy = 0.25 * Math.cbrt(gp * (Qrun / Ld));
  }
  return Math.hypot(base, vMom, vBuoy);
}

/** Profil pobytové zóny napříč místností (součet větví + zrcadlení u stěn). */
function ozProfile(inp, geo, prOz, prAnk, step = 0.2, vBg = inp.vBg) {
  const ny = Math.max(2, Math.round(inp.W / step) + 1);
  const ys = new Float32Array(ny);
  const uPk = new Float32Array(ny);
  const uMean = new Float32Array(ny);
  const t = new Float32Array(ny);
  const uOz = new Float32Array(ny);
  const uAnk = new Float32Array(ny);
  const dTj = new Float32Array(ny);
  const tLo = Math.min(inp.ts, inp.tr) - 2;
  const tHi = Math.max(inp.ts, inp.tr) + 2;
  const tAmbOz = inp.tr + inp.gamma * (inp.oz - inp.zRef);
  const tAmbAnk = inp.tr + inp.gamma * (0.1 - inp.zRef);
  for (let k = 0; k < ny; k++) {
    const y = (k / (ny - 1)) * inp.W;
    ys[k] = y;
    ACC.fill(0);
    for (const yj of geo.ys) {
      accum(prOz, y - yj, ACC, 0);
      accum(prOz, y + yj, ACC, 0);
      accum(prOz, y - 2 * inp.W + yj, ACC, 0);
      accum(prAnk, y - yj, ACC, 4);
      accum(prAnk, y + yj, ACC, 4);
      accum(prAnk, y - 2 * inp.W + yj, ACC, 4);
    }
    const a2 = ACC[0];
    const am2 = ACC[1];
    const at = ACC[2];
    const atm = ACC[3];
    const b2 = ACC[4];
    const bm2 = ACC[5];
    const bt = ACC[6];
    const btm = ACC[7];
    const vb2 = vBg * vBg;
    const uo = Math.sqrt(a2 + vb2);
    const ua = Math.sqrt(b2 + vb2);
    uOz[k] = uo;
    uAnk[k] = ua;
    const pick = ua > uo;
    uPk[k] = pick ? ua : uo;
    uMean[k] = Math.sqrt((pick ? bm2 : am2) + vb2);
    t[k] = clamp(pick ? tAmbAnk + bt : tAmbOz + at, tLo, tHi);
    dTj[k] = pick ? btm : atm;
  }
  return { ys, uPk, uMean, uOz, uAnk, t, dTj, ny };
}

function ozMetrics(inp, prof) {
  let vMax = 0;
  let vSum = 0;
  let vmSum = 0;
  let drMax = 0;
  let drSum = 0;
  let okDR = 0;
  let adpi = 0;
  let cnt = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  let vOk = 0;
  const vLim = inp.mode === 'heating' ? inp.heatVLimit : inp.vAllow;
  const dr = new Float32Array(prof.ny);
  for (let k = 0; k < prof.ny; k++) {
    const y = prof.ys[k];
    const d = draughtRate(prof.t[k], prof.uPk[k], TU);
    dr[k] = d;
    if (y < 0.5 || y > inp.W - 0.5) continue;
    const v = prof.uPk[k];
    cnt++;
    vMax = Math.max(vMax, v);
    vSum += v;
    vmSum += prof.uMean[k];
    drMax = Math.max(drMax, d);
    drSum += d;
    if (d <= inp.drLimit) okDR++;
    if (v <= vLim) vOk++;
    if (adpiOk(inp.tr + prof.dTj[k], inp.tr, prof.uMean[k])) adpi++;
    tMin = Math.min(tMin, prof.t[k]);
    tMax = Math.max(tMax, prof.t[k]);
  }
  cnt = Math.max(1, cnt);
  return {
    vMax, vMean: vSum / cnt, vAvgMean: vmSum / cnt, drMax, drMean: drSum / cnt,
    drOkShare: okDR / cnt, vOkShare: vOk / cnt, adpi: (100 * adpi) / cnt, tMin, tMax, dr,
  };
}

// ---------------------------------------------------------------------------
// Hodnocení varianty

export function evaluateVariant(inp, n, outletKey, patternKey, p, holeSize, full = false) {
  const geo = runGeometry(inp, n, inp.locks.mountHeight);
  const os = sizeOutlets(inp, geo, outletKey, patternKey, p, holeSize);
  const trajs = runTrajectories(inp, geo, os, full);
  const vBg = backgroundVelocity(inp, geo.Qrun, geo.Ld, os.u0);
  const span = inp.W;
  const step = full ? 0.1 : Math.max(0.2, inp.W / 90);
  const prOz = influenceProfile(trajs, os, span, step, inp.oz);
  const prAnk = influenceProfile(trajs, os, span, step, 0.1);
  const prof = ozProfile(inp, geo, prOz, prAnk, full ? 0.1 : 0.3, vBg);
  const m = ozMetrics(inp, prof);

  // průnik teplého vzduchu do pobytové zóny a pokrytí šířky
  let minZ = Infinity;
  let reachY = 0;
  let throw02 = 0;
  for (const tr of trajs) {
    minZ = Math.min(minZ, tr.info.minZ);
    reachY = Math.max(reachY, tr.info.reach25);
    throw02 = Math.max(throw02, tr.info.throw02 ?? 0);
  }
  const penetration = geo.zc - geo.r - inp.oz > 0.05 ? (geo.zc - minZ) / (geo.zc - inp.oz) : 1;
  const strip = inp.W / n;
  const coverage = clamp((2 * reachY) / strip, 0, 1.5);

  const vr = velocityRating(geo.vIn, inp.noise);
  const mat = selectMaterial(inp);
  const minP = MATERIALS[mat.code].minPressure ?? 50;
  const perim = SHAPES[inp.shape].perimeter(geo.Dm);
  const fabricArea = n * (perim * geo.Ld * 1.08 + SHAPES[inp.shape].area(geo.Dm));

  // skóre (nižší = lepší)
  let score = 0;
  const reasons = [];
  if (!os.feasible) {
    score += 400;
    reasons.push(...os.issues);
  }
  if (inp.mode === 'heating') {
    // teplý vzduch: rychlost v zóně (DR je kritérium chladného průvanu – jen slabá váha)
    if (m.vMax > inp.heatVLimit) score += 150 * (m.vMax - inp.heatVLimit);
    score += 40 * (1 - m.vOkShare);
    score += 0.08 * m.drMean;
  } else {
    if (m.drMax > inp.drLimit) score += 3.2 * (m.drMax - inp.drLimit);
    score += 0.35 * m.drMean;
    score += 26 * (1 - m.drOkShare);
  }
  // vertikální rozdíl teplot hlava–kotníky (ISO 7730: A < 2 K, B < 3 K, C < 4 K)
  const gradient = inp.gamma * (1 + 2 * Math.max(0, 1 - Math.min(1, penetration))) * (Math.min(inp.oz, 1.7) - 0.1);
  if (inp.mode === 'heating') score += 8 * Math.max(0, gradient - 2);
  else score += 0.22 * (100 - m.adpi);
  if (inp.mode === 'heating' && penetration < 1) score += 160 * (1 - penetration);
  if (inp.vLimit && m.vMax > inp.vLimit) score += 90 * (m.vMax - inp.vLimit);
  // šířka pásu obsluhovaného jednou větví vs. katalogový dosah daného typu výstupu
  const stripLimit = 2.2 * OUTLETS[outletKey].throw[1] + 2;
  if (strip > stripLimit) score += 4 * (strip - stripLimit);
  // nízké stropy: rovnoměrnost a vzhled – jedna větev by neměla obsluhovat příliš široký pás
  if (inp.H < 4.5 && strip > 2.2 * inp.H) score += 1.5 * (strip - 2.2 * inp.H);
  // vytápění: proudy mířené dolů pokryjí pás zhruba 2× výšky pádu (+ rozběh po podlaze)
  if (inp.mode === 'heating') {
    const heatStrip = 2.2 * Math.max(1, geo.zc - inp.oz) + 4;
    if (strip > heatStrip) score += 4 * (strip - heatStrip);
  }
  // tichý provoz: hluk z výtoku roste s rychlostí výtoku
  if (inp.noise === 'quiet' && os.u0 > 9) score += 1.8 * (os.u0 - 9);
  score += vr.penalty;
  if (geo.D > 1250) score += 25;
  if (geo.D > 1600) score += 90;
  if (p < minP) score += 60;
  score += p / 45;
  score += 5.5 * (n - 1) + fabricArea / 55;
  if (outletKey === 'bigNozzle' || outletKey === 'smallNozzle') score += (os.count * n) / 250;
  if (inp.hygiene && outletKey.startsWith('micro')) score -= 2;
  if (inp.noise === 'quiet' && (outletKey === 'bigNozzle' || p > 180)) score += 12;

  m.gradient = gradient;
  return { n, outletKey, patternKey, p, holeSize, geo, os, trajs, prOz, prAnk, prof, m, penetration, coverage, reachY, throw02, vr, fabricArea, score, reasons, vBg };
}

const COARSE_SIZES = { perforation: [8, 12, 20], smallNozzle: [20, 40, 60], bigNozzle: [50, 80] };
const coarsePick = (arr) => (arr.length <= 3 ? arr : [arr[0], arr[Math.floor(arr.length / 2)], arr[arr.length - 1]]);

function enumerate(inp, coarse = false) {
  const L = inp.locks;
  const vT = inp.noiseClass.vTarget;
  let nMin = 1;
  while (nMin < 12 && pickDiameter(inp.Q / nMin, inp.shape, vT) > 1250) nMin++;
  const nMaxGeom = Math.max(1, Math.floor(inp.W / 2.4));
  let ns = [];
  if (L.runs) ns = [clamp(L.runs, 1, 20)];
  else for (let n = nMin; n <= Math.min(nMin + 4, Math.max(nMin, nMaxGeom)); n++) ns.push(n);

  let outlets = L.outlet ? [L.outlet] : Object.keys(OUTLETS);
  if (!L.outlet) {
    if (inp.H < 5) outlets = outlets.filter((o) => o !== 'bigNozzle');
    if (inp.H > 12) outlets = outlets.filter((o) => o !== 'microUniform');
  }
  const list = [];
  for (const n of ns) {
    for (const ok of outlets) {
      let pats = L.pattern ? [L.pattern] : Object.keys(PATTERNS);
      if (ok === 'microUniform' && !L.pattern) pats = ['6', '3-9', '4-8'];
      // při vytápění musí teplý vzduch dolů – proudy vzhůru nemají smysl
      if (inp.mode === 'heating' && !L.pattern) pats = pats.filter((k) => k !== '2-10');
      const ps = L.pressure ? [L.pressure] : coarse ? coarsePick(PRESSURES[ok]) : PRESSURES[ok];
      const sizes = OUTLETS[ok].kind === 'holes' ? (L.holeSize ? [L.holeSize] : coarse ? COARSE_SIZES[ok] : HOLE_SIZES[ok]) : [null];
      for (const pk of pats) for (const p of ps) for (const hs of sizes) list.push([n, ok, pk, p, hs]);
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Materiál, montáž

export function selectMaterial(inp) {
  if (inp.material) {
    return { code: inp.material, reason: 'zvoleno uživatelem' };
  }
  const perm = inp.condensation;
  let fam = 'Classic';
  let why = 'standardní polyesterová tkanina s nekonečnými vlákny, třída reakce na oheň B-s1,d0';
  if (inp.fireA) {
    return {
      code: 'NHE',
      reason: 'požadavek na nehořlavost – skelná tkanina třídy A',
      warn: perm ? 'Skelná tkanina je neprodyšná – při chlazení pod rosný bod zvolte izolované nebo dvouplášťové potrubí.' : null,
    };
  }
  if (inp.hygiene) {
    fam = 'Premium';
    why = 'antibakteriální a antistatická úprava (uhlíkové vlákno), účinnost i po 10 praních, vhodné i pro čisté prostory';
  } else if (inp.eco) {
    fam = 'Recycled';
    why = 'z recyklovaných PET lahví (13 lahví na 1 m²), technicky rovnocenné řadě Classic';
  } else if (inp.appKey === 'industry' || inp.appKey === 'warehouse') {
    fam = 'Classic';
    why = 'odolná standardní tkanina Classic, nejlepší poměr cena/výkon pro průmysl';
  }
  const map = { Premium: ['PMI', 'NMI'], Classic: ['PMS', 'NMS'], Recycled: ['PMSre', 'NMSre'] };
  const code = map[fam][perm ? 0 : 1];
  return {
    code,
    reason: why + (perm ? '; prodyšné provedení brání kondenzaci (přívod pod rosným bodem)' : '; neprodyšné provedení (bez rizika kondenzace)'),
  };
}

function selectInstallation(inp, geo) {
  if (inp.install && INSTALLATIONS[inp.install] && INSTALLATIONS[inp.install].shapes.includes(inp.shape)) return inp.install;
  if (inp.shape === 'H') return 8;
  if (geo.gap < 0.12) return 3;
  if (geo.D >= 1000) return 6;
  return 5;
}

// ---------------------------------------------------------------------------
// Veřejné API

export function computeDesign(project) {
  const t0 = performance.now();
  const inp = resolveInputs(project);
  // 1. hrubé prohledání celého prostoru variant
  const results = [];
  const seen = new Set();
  for (const c of enumerate(inp, true)) {
    seen.add(c.join('|'));
    results.push(evaluateVariant(inp, ...c, false));
  }
  results.sort((a, b) => a.score - b.score);
  // 2. zjemnění (plná mřížka tlaků a velikostí otvorů) kolem nejlepších kombinací
  const fine = enumerate(inp, false);
  for (const top of pickVariants(results, 8)) {
    for (const c of fine) {
      if (c[0] !== top.n || c[1] !== top.outletKey || c[2] !== top.patternKey) continue;
      const key = c.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(evaluateVariant(inp, ...c, false));
    }
  }
  results.sort((a, b) => a.score - b.score);
  // 3. přesné přehodnocení nejlepších kandidátů v plném rozlišení (špičky úzkých proudů)
  const finals = [];
  const fseen = new Set();
  for (const r of results) {
    const key = `${r.n}|${r.outletKey}|${r.patternKey}|${r.p}|${r.holeSize}`;
    if (fseen.has(key)) continue;
    fseen.add(key);
    finals.push(evaluateVariant(inp, r.n, r.outletKey, r.patternKey, r.p, r.holeSize, true));
    if (finals.length >= 10) break;
  }
  finals.sort((a, b) => a.score - b.score);
  const full = finals[0];
  const design = buildDesign(inp, full);
  const merged = [...finals, ...results.filter((r) => !fseen.has(`${r.n}|${r.outletKey}|${r.patternKey}|${r.p}|${r.holeSize}`))];
  design.variants = pickVariants(merged, 6).map((r) => variantSummary(inp, r));
  design.stats = { evaluated: results.length, ms: Math.round(performance.now() - t0) };
  design.rationale = design.rationale.map((s) => s.replace('{EVAL}', results.length.toLocaleString('cs-CZ')));
  design.conventional = conventionalDesign(inp, design);
  design.stats.msTotal = Math.round(performance.now() - t0);
  return design;
}

function pickVariants(results, k) {
  const out = [];
  const seen = new Set();
  for (const r of results) {
    const key = `${r.n}|${r.outletKey}|${r.patternKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
}

function variantSummary(inp, r) {
  return {
    n: r.n,
    outlet: r.outletKey,
    outletName: OUTLETS[r.outletKey].name,
    pattern: r.patternKey,
    patternName: PATTERNS[r.patternKey].name,
    p: r.p,
    holeSize: r.holeSize,
    D: r.geo.D,
    vIn: r.geo.vIn,
    drMax: r.m.drMax,
    adpi: r.m.adpi,
    vMax: r.m.vMax,
    fabricArea: r.fabricArea,
    score: r.score,
    feasible: r.os.feasible,
    penetration: r.penetration,
  };
}

function buildDesign(inp, v) {
  const geo = v.geo;
  const os = v.os;
  const out = OUTLETS[v.outletKey];
  const mat = selectMaterial(inp);
  const material = MATERIALS[mat.code];
  const install = selectInstallation(inp, geo);
  const color = inp.customColor ? { code: 'ART', name: 'Prihoda ART (vlastní barva)', hex: inp.customColor } : COLORS[inp.color];

  const perim = SHAPES[inp.shape].perimeter(geo.Dm);
  const areaPerRun = perim * geo.Ld * 1.08 + SHAPES[inp.shape].area(geo.Dm);
  const parts = Math.max(1, Math.ceil((geo.Ld - 0.15) / 5.5));
  const zippers = parts;
  const weightPerRun = (areaPerRun * material.gsm) / 1000;

  const runs = geo.ys.map((y, j) => ({
    id: j + 1,
    y,
    zc: geo.zc,
    x0: geo.x0,
    x1: geo.x1,
    len: geo.Ld,
    D: geo.D,
    Dm: geo.Dm,
    r: geo.r,
    Q: geo.Qrun,
    flowM3h: geo.Qrun * 3600,
    vIn: geo.vIn,
    parts,
    zippers,
    fabricArea: areaPerRun,
    weight: weightPerRun,
  }));

  // rozvodná (sběrná) větev pro více větví
  let header = null;
  if (geo.n > 1) {
    const Dh = pickDiameter(inp.Q, 'C', 8);
    const x = geo.x0 - 0.05;
    header = {
      D: Dh,
      Dm: Dh / 1000,
      x,
      y0: geo.ys[0],
      y1: geo.ys[geo.n - 1],
      z: Math.min(geo.zc, inp.H - Dh / 2000 - 0.1),
      len: geo.ys[geo.n - 1] - geo.ys[0] + 0.6,
      vIn: inp.Q / ((Math.PI * (Dh / 1000) ** 2) / 4),
    };
  }
  const ahu = {
    x: -0.9,
    y: inp.W / 2,
    z: header ? header.z : geo.zc,
    w: clamp(Math.sqrt(inp.Q) * 0.9, 0.9, 2.6),
  };

  // pole v řezu (pro vizualizaci a 3D částice)
  const section = sectionField(inp, geo, os, v.trajs.map((t) => decimate(t, 120)), v.vBg);
  const ozMap = ozMap2D(inp, geo, os, v.prof, v.vBg);

  const extPressure = v.p + (geo.n > 1 ? 25 : 10) + (geo.vIn > 6 ? 10 : 0);
  const fanPowerW = (inp.Q * extPressure) / 0.6;

  const design = {
    inp,
    project: {
      name: inp.name,
      customer: inp.customer,
      location: inp.location,
      app: inp.appKey,
      appName: inp.app.name,
    },
    shape: inp.shape,
    shapeName: SHAPES[inp.shape].name,
    n: geo.n,
    geo,
    runs,
    header,
    ahu,
    outlet: {
      key: v.outletKey,
      name: out.name,
      short: out.short,
      kind: out.kind,
      pattern: v.patternKey,
      patternName: PATTERNS[v.patternKey].name,
      patternDesc: PATTERNS[v.patternKey].desc,
      angles: os.angles,
      p: v.p,
      u0: os.u0,
      holeSize: os.holeSize,
      pitch: os.pitch,
      count: os.count,
      perRow: os.perRow,
      microHoles: os.microHoles,
      openRatio: os.openRatio,
      fan: os.fan,
      b0: os.b0,
      A0: os.A0,
      Ageom: os.Ageom,
      throwRange: out.throw,
      desc: out.desc,
      feasible: os.feasible,
    },
    trajs: v.trajs,
    prof: v.prof,
    metrics: {
      ...v.m,
      penetration: v.penetration,
      coverage: v.coverage,
      throw02: v.throw02,
      reachY: v.reachY,
    },
    vr: v.vr,
    material: { ...material, name: MATERIAL_FAMILY_CZ[material.family], reason: mat.reason, warn: mat.warn },
    color,
    install: { ...INSTALLATIONS[install] },
    extPressure,
    fanPowerW,
    fabricArea: areaPerRun * geo.n,
    weight: weightPerRun * geo.n,
    section,
    ozMap,
    score: v.score,
  };
  design.bom = buildBOM(inp, design);
  design.suspensionWeight = design.bom.reduce((s, b) => s + (b.kg || 0), 0);
  design.totalWeight = design.weight + design.suspensionWeight;
  design.checks = buildChecks(inp, design);
  design.rationale = buildRationale(inp, design);
  return design;
}

// ---------------------------------------------------------------------------
// Pole rychlostí v příčném řezu (pro řez, 3D částice) + nevírová složka

/**
 * Klouzání proudu podél stěny: n = složka rychlosti směrem do stěny, t = tečná složka, dist = vzdálenost od stěny.
 * V pásmu dN u stěny se normálová složka utlumí a její „energie“ přejde do tečného směru
 * (znaménko podle tečné složky, u kolmého dopadu fallbackSign).
 */
function slideAlong(n, t, dist, dN, fallbackSign) {
  if (n <= 0 || dist >= dN) return [n, t];
  const q = Math.max(0, dist / dN);
  const f = q * q * (3 - 2 * q);
  const nn = n * f;
  const sign = Math.abs(t) > 0.25 * n ? Math.sign(t) : fallbackSign;
  return [nn, sign * Math.sqrt(t * t + n * n - nn * nn)];
}

function sectionField(inp, geo, os, trajs, vBg) {
  const step = clamp(Math.max(inp.W, inp.H * 2) / 110, 0.1, 0.4);
  const ny = Math.round(inp.W / step) + 1;
  const nz = Math.round(inp.H / step) + 1;
  const uy = new Float32Array(ny * nz);
  const uz = new Float32Array(ny * nz);
  const mag = new Float32Array(ny * nz);
  const dT = new Float32Array(ny * nz);
  const solid = new Uint8Array(ny * nz);
  const tLo = Math.min(inp.ts, inp.tr) - inp.tr;
  const tHi = Math.max(inp.ts, inp.tr) - inp.tr;
  for (let j = 0; j < nz; j++) {
    const z = (j / (nz - 1)) * inp.H;
    for (let i = 0; i < ny; i++) {
      const y = (i / (ny - 1)) * inp.W;
      let vy = 0;
      let vz = 0;
      let s2 = 0;
      let t = 0;
      for (const yj of geo.ys) {
        const inDuct = inp.shape === 'H'
          ? (y - yj) ** 2 + (z - geo.zc) ** 2 < geo.r * geo.r && z <= geo.zc
          : (y - yj) ** 2 + (z - geo.zc) ** 2 < geo.r * geo.r;
        if (inDuct) solid[j * ny + i] = 1;
        for (const [src, mir] of [[yj, 1], [-yj, -1], [2 * inp.W - yj, -1]]) {
          const ly = (y - src) * mir;
          if (Math.abs(ly) > inp.W * 1.2) continue;
          for (const tr of trajs) {
            const smp = sampleJet(tr, ly, z, os.pitch > 0 ? os.pitch : 0, 0.75 * step);
            if (!smp) continue;
            const um = smp.u; // částice startují v jádrech proudů → vrcholová rychlost
            vy += um * smp.dy * mir;
            vz += um * smp.dz;
            s2 += smp.u * smp.u;
            t += smp.dT;
          }
        }
      }
      const k = j * ny + i;
      // stěny: normálová složka proudu se u stropu, podlahy a stěn stáčí do tečného směru (přilnutý proud)
      const dN = Math.max(0.35, 2 * step);
      const nearY = geo.ys.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a), geo.ys[0]);
      [vz, vy] = slideAlong(vz, vy, inp.H - z, dN, y >= nearY ? 1 : -1);
      [vz, vy] = slideAlong(-vz, vy, z, dN, y >= nearY ? 1 : -1).map((v, q) => (q === 0 ? -v : v));
      [vy, vz] = slideAlong(-vy, vz, y, dN, z > inp.H / 2 ? -1 : 1).map((v, q) => (q === 0 ? -v : v));
      [vy, vz] = slideAlong(vy, vz, inp.W - y, dN, z > inp.H / 2 ? -1 : 1);
      uy[k] = vy;
      uz[k] = vz;
      mag[k] = Math.sqrt(s2 + vBg * vBg);
      dT[k] = clamp(t, tLo, tHi);
    }
  }
  // nevírová (divergence-free) projekce: ψ z rotace pole proudů → recirkulace v místnosti
  const psi = new Float32Array(ny * nz);
  const w = new Float32Array(ny * nz);
  for (let j = 1; j < nz - 1; j++) {
    for (let i = 1; i < ny - 1; i++) {
      const k = j * ny + i;
      w[k] = (uz[k + 1] - uz[k - 1]) / (2 * step) - (uy[k + ny] - uy[k - ny]) / (2 * step);
    }
  }
  const h2 = step * step;
  for (let it = 0; it < 260; it++) {
    for (let parity = 0; parity < 2; parity++) {
      for (let j = 1; j < nz - 1; j++) {
        for (let i = 1 + ((j + parity) & 1); i < ny - 1; i += 2) {
          const k = j * ny + i;
          const nv = (psi[k - 1] + psi[k + 1] + psi[k - ny] + psi[k + ny] + h2 * w[k]) * 0.25;
          psi[k] += 1.75 * (nv - psi[k]);
        }
      }
    }
  }
  const vy2 = new Float32Array(ny * nz);
  const vz2 = new Float32Array(ny * nz);
  for (let j = 1; j < nz - 1; j++) {
    for (let i = 1; i < ny - 1; i++) {
      const k = j * ny + i;
      // u_y = ∂ψ/∂z, u_z = −∂ψ/∂y
      vy2[k] = (psi[k + ny] - psi[k - ny]) / (2 * step);
      vz2[k] = -(psi[k + 1] - psi[k - 1]) / (2 * step);
    }
  }
  // okraje: volný skluz – tečná složka z vnitřku, normálová nulová (vzduch klouže podél stropu a stěn)
  for (let i = 0; i < ny; i++) {
    vy2[i] = vy2[i + ny];
    vy2[(nz - 1) * ny + i] = vy2[(nz - 2) * ny + i];
  }
  for (let j = 0; j < nz; j++) {
    vz2[j * ny] = vz2[j * ny + 1];
    vz2[j * ny + ny - 1] = vz2[j * ny + ny - 2];
  }
  // blend: v blízkosti proudů zachovat proud, jinde recirkulace
  const fy = new Float32Array(ny * nz);
  const fz = new Float32Array(ny * nz);
  for (let k = 0; k < ny * nz; k++) {
    const jm = Math.hypot(uy[k], uz[k]);
    const wgt = clamp(jm / 0.3, 0, 1);
    fy[k] = uy[k] * wgt + vy2[k] * (1 - wgt) * 1.4;
    fz[k] = uz[k] * wgt + vz2[k] * (1 - wgt) * 1.4;
    if (solid[k]) {
      fy[k] = 0;
      fz[k] = 0;
    }
  }
  return { ny, nz, step, W: inp.W, H: inp.H, uy: fy, uz: fz, mag, dT, solid };
}

// ---------------------------------------------------------------------------
// Mapa pobytové zóny (x × y) pro 3D heatmapu

function ozMap2D(inp, geo, os, prof, vBg) {
  const nx = clamp(Math.round(inp.L / 0.35), 48, 180);
  const ny = clamp(Math.round(inp.W / 0.3), 32, 140);
  const u = new Float32Array(nx * ny);
  const t = new Float32Array(nx * ny);
  const dr = new Float32Array(nx * ny);
  const pitch = os.pitch || 0;
  const modulate = pitch > 0.45;
  for (let j = 0; j < ny; j++) {
    const y = (j / (ny - 1)) * inp.W;
    const f = (y / inp.W) * (prof.ny - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(prof.ny - 1, i0 + 1);
    const w = f - i0;
    const up = prof.uPk[i0] * (1 - w) + prof.uPk[i1] * w;
    const um = prof.uMean[i0] * (1 - w) + prof.uMean[i1] * w;
    const tt = prof.t[i0] * (1 - w) + prof.t[i1] * w;
    for (let i = 0; i < nx; i++) {
      const x = (i / (nx - 1)) * inp.L;
      const taper = smoothstep(geo.x0 - 0.8, geo.x0 + 1.2, x) * (1 - smoothstep(geo.x1 - 1.0, geo.x1 + 1.2, x));
      let uu = modulate ? um + (up - um) * Math.pow(0.5 + 0.5 * Math.cos((2 * Math.PI * (x - geo.x0)) / pitch), 2) : up;
      const vb = vBg;
      uu = Math.sqrt(vb * vb + Math.max(0, uu * uu - vb * vb) * taper);
      const temp = inp.tr + (tt - inp.tr) * taper;
      const k = j * nx + i;
      u[k] = uu;
      t[k] = temp;
      dr[k] = draughtRate(temp, uu, TU);
    }
  }
  return { nx, ny, L: inp.L, W: inp.W, z: inp.oz, u, t, dr };
}

// ---------------------------------------------------------------------------
// Kusovník

function buildBOM(inp, d) {
  const items = [];
  const colorTxt = d.color.code === 'ART' ? `Prihoda ART ${d.color.hex}` : `${d.color.code} (${d.color.ral})`;
  const outTxt = d.outlet.kind === 'holes'
    ? `${d.outlet.name} Ø ${d.outlet.holeSize} mm, ${d.outlet.count?.toLocaleString('cs-CZ')} ks/větev, rozteč ${fmtMM(d.outlet.pitch)}, poloha ${d.outlet.patternName}`
    : `${d.outlet.name}, poloha ${d.outlet.patternName}, ≈ ${(d.outlet.microHoles / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. otvorů/větev`;
  const r = d.runs[0];
  items.push({
    group: 'Tkaninové vyústky',
    item: `Tkaninová vyústka ${d.shape} ${d.shape === 'C' ? 'Ø' : ''}${r.D} mm, délka ${fmtM(r.len)}`,
    detail: `${d.material.code} (${d.material.name}), barva ${colorTxt}; ${outTxt}`,
    qty: d.n,
    unit: 'ks',
    kg: 0,
  });
  items.push({ group: 'Tkaninové vyústky', item: 'Počáteční díl se zipem (100–200 mm)', detail: 'připojení na hrdlo, vyroben o 10–15 mm větší pro snadné nasazení', qty: d.n, unit: 'ks' });
  items.push({ group: 'Tkaninové vyústky', item: `Průběžné díly (zip/zip, max. 5 500 mm)`, detail: 'dělení pro praní a montáž', qty: d.n * Math.max(0, r.parts - 1), unit: 'ks' });
  items.push({ group: 'Tkaninové vyústky', item: 'Koncový díl se záslepkou', detail: 'zip/konec', qty: d.n, unit: 'ks' });
  items.push({ group: 'Tkaninové vyústky', item: 'Spojovací zipy', detail: 'každý díl má vlastní prací štítek s pozicí', qty: d.n * r.zippers, unit: 'ks' });
  if (d.header) {
    items.push({
      group: 'Rozvod',
      item: `Transportní potrubí Ø${d.header.D} mm (neprodyšné, bez distribuce)`,
      detail: `${inp.condensation ? 'izolované 20 mm (U = 1,7 W/m²K) – přívod pod rosným bodem' : d.material.code.replace('P', 'N')} , délka ${fmtM(d.header.len)}`,
      qty: 1,
      unit: 'ks',
    });
    items.push({ group: 'Rozvod', item: 'Tkaninové odbočky (T-kusy)', detail: `napojení ${d.n} větví`, qty: d.n, unit: 'ks' });
    items.push({ group: 'Rozvod', item: 'Regulační klapka (damper) v odbočce', detail: 'vyvážení průtoku mezi větvemi, nastavitelná přes zip', qty: d.n, unit: 'ks' });
  }
  if (r.vIn > 5.5 || d.n > 1) {
    items.push({ group: 'Příslušenství', item: 'Vyrovnávač proudění EQ', detail: 'zklidnění proudu za odbočkou / ventilátorem, eliminace vibrací tkaniny', qty: d.n, unit: 'ks' });
  }
  if (r.len > 30 || r.vIn > 7) {
    items.push({ group: 'Příslušenství', item: 'Tlumič rázu Beat Absorber', detail: 'eliminuje ráz vzduchu na čelo vyústky při náběhu ventilátoru', qty: d.n, unit: 'ks' });
  }
  if (['office', 'store', 'pool'].includes(inp.appKey)) {
    items.push({ group: 'Příslušenství', item: 'Obruče (tvarová výztuž)', detail: 'vyústka drží tvar i při vypnutém ventilátoru', qty: d.n * Math.ceil(r.len / 1.5), unit: 'ks' });
  }
  const inst = d.install;
  const L = r.len;
  if ([3, 5, 6, 8].includes(inst.no)) {
    const profiles = inst.no === 6 || inst.no === 8 ? 2 : 1;
    items.push({ group: `Montáž č. ${inst.no}`, item: inp.hygiene ? 'Nerezový / hliníkový profil' : 'Hliníkový profil', detail: inst.name, qty: +(d.n * profiles * (L + 0.3)).toFixed(1), unit: 'm', kg: d.n * profiles * (L + 0.3) * 0.35 });
    items.push({ group: `Montáž č. ${inst.no}`, item: 'Spojky profilů', detail: 'profil v délkách 3 m (orientačně)', qty: d.n * profiles * Math.max(0, Math.ceil(L / 3) - 1), unit: 'ks' });
    if (inst.no === 5 || inst.no === 6) {
      items.push({ group: `Montáž č. ${inst.no}`, item: 'Závěsy Gripple (horní + spodní díl)', detail: 'rozteč cca 2 m (orientačně)', qty: d.n * profiles * (Math.ceil(L / 2) + 1), unit: 'ks', kg: d.n * profiles * (Math.ceil(L / 2) + 1) * 0.08 });
    }
    items.push({ group: `Montáž č. ${inst.no}`, item: 'Napínák v profilu', detail: 'odstraní zvlnění tkaniny – doporučeno u všech hliníkových profilů', qty: d.n * profiles, unit: 'ks' });
  } else {
    items.push({ group: `Montáž č. ${inst.no}`, item: 'Poplastované ocelové lanko', detail: inst.name, qty: +(d.n * (inst.no === 2 ? 2 : 1) * (L + 1)).toFixed(1), unit: 'm', kg: d.n * (L + 1) * 0.03 });
    items.push({ group: `Montáž č. ${inst.no}`, item: 'Háčky', detail: 'rozteč cca 0,5 m (orientačně)', qty: d.n * Math.ceil(L / 0.5), unit: 'ks' });
    items.push({ group: `Montáž č. ${inst.no}`, item: 'Napínací šrouby + Gripple', detail: 'kotvení lanka na koncích', qty: d.n * 2, unit: 'ks' });
  }
  items.push({ group: `Montáž č. ${inst.no}`, item: 'Napínák v záslepce', detail: 'vypnutí vyústky po délce', qty: d.n, unit: 'ks' });
  return items;
}

// ---------------------------------------------------------------------------
// Kontroly a zdůvodnění

function buildChecks(inp, d) {
  const c = [];
  const m = d.metrics;
  const vr = d.vr;
  c.push({
    level: vr.level === 'green' ? 'ok' : vr.level === 'blue' ? 'info' : vr.level === 'orange' ? 'warn' : 'err',
    title: `Rychlost v potrubí ${f1(d.runs[0].vIn)} m/s – ${vr.label}`,
    text: `${inp.noiseClass.name}: doporučeno ${inp.noiseClass.note}.`,
  });
  const minP = d.material.minPressure ?? 50;
  c.push({
    level: d.outlet.p >= minP && d.outlet.p <= 400 ? 'ok' : 'warn',
    title: `Statický tlak ${d.outlet.p} Pa`,
    text: `Běžný rozsah 40–400 Pa (typicky 120 Pa); minimum pro udržení tvaru ${minP} Pa (${d.material.weight === 'light' ? 'lehké' : 'střední/těžké'} tkaniny).`,
  });
  if (inp.mode === 'heating') {
    c.push({
      level: m.vMax <= inp.heatVLimit ? 'ok' : m.vMax <= inp.heatVLimit + 0.1 && m.vOkShare >= 0.8 ? 'warn' : 'err',
      title: `Rychlost teplého vzduchu v zóně max. ${f2(m.vMax)} m/s`,
      text: `Požadavek: ${inp.catLabel}; ${Math.round(m.vOkShare * 100)} % pobytové zóny vyhovuje. Pro informaci DR ${Math.round(m.drMax)} % (ISO 7730 hodnotí chladný průvan).`,
    });
  } else {
    c.push({
      level: m.drMax <= inp.drLimit ? 'ok' : m.drMax <= inp.drLimit + 15 && m.drOkShare >= 0.8 ? 'warn' : 'err',
      title: `Průvan (ISO 7730): DR max ${Math.round(m.drMax)} %`,
      text: `Požadavek: ${inp.catLabel}; ${Math.round(m.drOkShare * 100)} % pobytové zóny vyhovuje. Max. rychlost v pobytové zóně ${f2(m.vMax)} m/s.`,
    });
  }
  if (inp.mode !== 'heating') {
    c.push({
      level: m.adpi >= 80 ? 'ok' : m.adpi >= 65 ? 'warn' : 'err',
      title: `ADPI ${Math.round(m.adpi)} %`,
      text: 'Index kvality distribuce vzduchu (ASHRAE 113) – nad 80 % výborné.',
    });
  } else {
    c.push({
      level: m.gradient <= inp.gradLimit ? 'ok' : m.gradient <= inp.gradLimit + 1 ? 'warn' : 'err',
      title: `Rozdíl teplot hlava–kotníky ${f1(m.gradient)} K`,
      text: 'ISO 7730: kategorie A < 2 K, B < 3 K, C < 4 K. Teplý vzduch u stropu = ztráty střechou.',
    });
  }
  if (inp.mode === 'heating') {
    c.push({
      level: m.penetration >= 0.9 ? 'ok' : m.penetration >= 0.7 ? 'warn' : 'err',
      title: m.penetration >= 0.9 ? 'Teplý vzduch pronikne do pobytové zóny' : 'Teplý vzduch nedosáhne pobytové zóny',
      text: m.penetration >= 0.9
        ? 'Proudy překonají vztlak a dopraví teplo k lidem – bez rozvrstvení pod střechou.'
        : 'Hrozí rozvrstvení teplého vzduchu pod střechou – zvyšte tlak, zvolte trysky nebo strmější polohu otvorů.',
    });
  }
  if (inp.vLimit) {
    c.push({
      level: m.vMax <= inp.vLimit ? 'ok' : 'warn',
      title: `Rychlost nad pobytovou zónou ≤ ${f2(inp.vLimit)} m/s`,
      text: `Zvláštní požadavek provozu (mokrá kůže) – maximum ${f2(m.vMax)} m/s.`,
    });
  }
  if (inp.condensation) {
    c.push({
      level: d.material.permeable ? 'ok' : 'warn',
      title: `Přívod ${f1(inp.ts)} °C je pod rosným bodem (${f1(inp.Td)} °C)`,
      text: d.material.permeable
        ? `Zvolena prodyšná tkanina ${d.material.code} – mikroproud vzduchu tkaninou zabrání kondenzaci na povrchu.`
        : 'Neprodyšná tkanina by se chovala jako plech – zvolte prodyšnou tkaninu nebo izolované potrubí.',
    });
  }
  if (!d.outlet.feasible) {
    c.push({ level: 'warn', title: 'Rozmístění otvorů na hraně výrobních možností', text: 'Upravte tlak, velikost otvorů nebo počet větví.' });
  }
  if (Math.abs(inp.dT0) > 10 && inp.mode === 'cooling') {
    c.push({ level: 'warn', title: `Velký rozdíl teplot ${f1(Math.abs(inp.dT0))} K při chlazení`, text: 'Chladný vzduch rychle klesá – hlídejte průvan v pobytové zóně.' });
  }
  if (d.geo.zc - d.geo.r < inp.oz + 0.35) {
    c.push({ level: 'warn', title: 'Malá výška pod vyústkou', text: 'Spodní hrana vyústky je blízko pobytové zóny – zvažte půlkruhový tvar pod strop.' });
  }
  if (inp.appKey === 'industry' && d.outlet.key.startsWith('micro')) {
    c.push({ level: 'info', title: 'Prašné prostředí', text: 'Perforace (otvory ≥ 4 mm) se nikdy zcela neucpe – u prašných provozů zvažte perforaci.' });
  }
  return c;
}

function buildRationale(inp, d) {
  const o = d.outlet;
  const m = d.metrics;
  const r = [];
  r.push(`${o.name} v poloze ${o.patternName} (${o.patternDesc}) – vybráno z ${'{EVAL}'} vyhodnocených variant jako nejlepší kompromis komfortu, dosahu, hluku a nákladů.`);
  r.push(`${d.n} ${d.n === 1 ? 'větev' : d.n < 5 ? 'větve' : 'větví'} ${d.shape === 'C' ? 'Ø' : ''}${d.runs[0].D} mm po ${fmtM(d.runs[0].len)}: rychlost ${f1(d.runs[0].vIn)} m/s odpovídá pásmu „${inp.noiseClass.name.toLowerCase()}“.`);
  r.push(`Statický tlak ${o.p} Pa → výtoková rychlost ${f1(o.u0)} m/s${o.kind === 'holes' ? `, ${o.count.toLocaleString('cs-CZ')} otvorů Ø ${o.holeSize} mm na větev` : ''}; dosah proudu (0,2 m/s) ≈ ${f1(m.throw02 || 0)} m.`);
  if (inp.mode === 'heating') {
    r.push(
      m.penetration >= 0.9
        ? `Při vytápění proudy dopraví teplý vzduch až do pobytové zóny (max. ${f2(m.vMax)} m/s) – nevznikne tepelný polštář pod střechou, rozdíl teplot hlava–kotníky ${f1(m.gradient)} K.`
        : 'Pozor: teplý vzduch se zčásti drží pod střechou – zvažte vyšší tlak nebo trysky.',
    );
  }
  else r.push(`V pobytové zóně max. ${f2(m.vMax)} m/s, DR ${Math.round(m.drMax)} % – ${m.drMax <= inp.drLimit ? 'splňuje' : 'nesplňuje'} požadavek (${inp.catLabel}).`);
  r.push(`Materiál ${d.material.code} (${d.material.name}): ${d.material.reason}.`);
  return r;
}

// ---------------------------------------------------------------------------
// Srovnání s plechovým rozvodem a klasickými vyústkami

function sheetThickness(D) {
  if (D <= 200) return 0.5;
  if (D <= 400) return 0.6;
  if (D <= 800) return 0.8;
  if (D <= 1250) return 1.0;
  return 1.25;
}

export function conventionalDesign(inp, d) {
  const geo = d.geo;
  const hFall = geo.zc - inp.oz;
  const spacing = clamp(Math.round(1.1 * hFall + 2), 3, 8);
  const perRun = Math.max(1, Math.floor(geo.Ld / spacing));
  const nOut = perRun * 2;
  const Qg = geo.Qrun / nOut;
  const vFace = 3.2;
  const u0 = vFace / 0.72;
  const A0 = Qg / u0;
  const side = Math.sqrt(Qg / vFace);
  const ang = inp.H <= 4.2 || inp.mode === 'cooling' ? 90 : 130;
  const grilles = [];
  for (let j = 0; j < geo.n; j++) {
    for (let k = 0; k < perRun; k++) {
      const x = geo.x0 + (k + 0.5) * (geo.Ld / perRun);
      grilles.push({ run: j, x, y: geo.ys[j], side: 1, ang });
      grilles.push({ run: j, x, y: geo.ys[j], side: -1, ang: 360 - ang });
    }
  }
  const tr = jetTrajectory({
    kind: 'round',
    y0: geo.r + 0.02,
    z0: geo.zc,
    ang,
    u0,
    A0,
    dT0: inp.dT0,
    tRoom: inp.tr,
    H: inp.H,
    maxS: Math.max(20, inp.W * 1.6),
    gamma: inp.gamma,
  });
  const trD = decimate(tr, 60);
  const vBgC = backgroundVelocity(inp, geo.Qrun, geo.Ld, u0);
  const penetration = geo.zc - inp.oz > 0.05 ? (geo.zc - tr.info.minZ) / (geo.zc - inp.oz) : 1;

  // mapa pobytové zóny: diskrétní proudy z vyústek. Otisk jedné vyústky (šablona) se spočítá
  // jednou a „razítkuje“ se na pozice všech vyústek (součet kvadrátů rychlostí).
  const nx = d.ozMap.nx;
  const ny = d.ozMap.ny;
  const cx = inp.L / (nx - 1);
  const cy = inp.W / (ny - 1);
  const rx = Math.ceil(8 / cx);
  const sw = 2 * rx + 1;
  const lyMin = -1;
  const sh = Math.ceil((inp.W + 1) / cy) + 1;
  const stU = new Float32Array(sw * sh);
  const stT = new Float32Array(sw * sh);
  const tAmb = [inp.tr + inp.gamma * (inp.oz - inp.zRef), inp.tr + inp.gamma * (0.1 - inp.zRef)];
  const stA = new Float32Array(sw * sh); // okolní teplota vybrané výšky
  stA.fill(tAmb[0]);
  [inp.oz, 0.1].forEach((zz, hi) => {
    for (const br of trD.branches) {
      for (let i = 0; i < br.n; i++) {
        const bg = br.bg[i];
        const dz = zz - br.z[i];
        if (Math.abs(dz) > 2.6 * bg) continue;
        const sx = br.phase === 'floor' ? bg * 2.5 : bg;
        const wz = (dz * dz) / (bg * bg);
        const j0 = Math.max(0, Math.ceil((br.y[i] - 2.6 * bg - lyMin) / cy));
        const j1 = Math.min(sh - 1, Math.floor((br.y[i] + 2.6 * bg - lyMin) / cy));
        const i0 = Math.max(0, rx - Math.ceil((2.6 * sx) / cx));
        const i1 = Math.min(sw - 1, rx + Math.ceil((2.6 * sx) / cx));
        for (let jj = j0; jj <= j1; jj++) {
          const dly = lyMin + jj * cy - br.y[i];
          const wy = wz + (dly * dly) / (bg * bg);
          if (wy >= 6.75) continue;
          for (let ii = i0; ii <= i1; ii++) {
            const dx = (ii - rx) * cx;
            const nd = wy + (dx * dx) / (sx * sx);
            if (nd >= 6.75) continue;
            const val = br.uc[i] * fexp(nd);
            const k = jj * sw + ii;
            if (val > stU[k]) {
              stU[k] = val;
              stT[k] = br.dT[i] * fexp(nd * 0.694);
              stA[k] = tAmb[hi];
            }
          }
        }
      }
    }
  });
  const u2 = new Float32Array(nx * ny);
  const tj = new Float32Array(nx * ny);
  const ta = new Float32Array(nx * ny).fill(tAmb[0]);
  const best = new Float32Array(nx * ny);
  for (const g of grilles) {
    const gi = Math.round(g.x / cx);
    for (let jj = 0; jj < sh; jj++) {
      const y = g.y + g.side * (lyMin + jj * cy);
      const jy = Math.round(y / cy);
      if (jy < 0 || jy >= ny) continue;
      for (let ii = 0; ii < sw; ii++) {
        const v = stU[jj * sw + ii];
        if (v <= 0) continue;
        const ix = gi + ii - rx;
        if (ix < 0 || ix >= nx) continue;
        const k = jy * nx + ix;
        u2[k] += v * v;
        tj[k] += stT[jj * sw + ii];
        if (v > best[k]) {
          best[k] = v;
          ta[k] = stA[jj * sw + ii];
        }
      }
    }
  }
  const u = new Float32Array(nx * ny);
  const t = new Float32Array(nx * ny);
  const dr = new Float32Array(nx * ny);
  let vMax = 0;
  let drMax = 0;
  let drOk = 0;
  let vOk = 0;
  let adpi = 0;
  let cnt = 0;
  let vSum = 0;
  const vLim = inp.mode === 'heating' ? inp.heatVLimit : inp.vAllow;
  const tLo = Math.min(inp.ts, inp.tr) - 2;
  const tHi = Math.max(inp.ts, inp.tr) + 2;
  for (let jy = 0; jy < ny; jy++) {
    const y = jy * cy;
    for (let ix = 0; ix < nx; ix++) {
      const x = ix * cx;
      const k = jy * nx + ix;
      const vv = Math.sqrt(u2[k] + vBgC * vBgC);
      const temp = clamp(ta[k] + tj[k], tLo, tHi);
      u[k] = vv;
      t[k] = temp;
      dr[k] = draughtRate(temp, vv, TU);
      if (y > 0.5 && y < inp.W - 0.5 && x > 0.5 && x < inp.L - 0.5) {
        cnt++;
        vMax = Math.max(vMax, vv);
        vSum += vv;
        drMax = Math.max(drMax, dr[k]);
        if (dr[k] <= inp.drLimit) drOk++;
        if (vv <= vLim) vOk++;
        if (adpiOk(inp.tr + tj[k], inp.tr, vv)) adpi++;
      }
    }
  }  cnt = Math.max(1, cnt);

  // hmotnosti, montáž, emise
  const t_mm = sheetThickness(geo.D);
  const steelPerM = Math.PI * geo.Dm * (t_mm / 1000) * 7850 * 1.12 + 1.6;
  const runsLen = geo.n * geo.Ld;
  const headerLen = d.header ? d.header.len : 0;
  const steelKg = steelPerM * runsLen + (d.header ? Math.PI * d.header.Dm * (sheetThickness(d.header.D) / 1000) * 7850 * 1.12 * headerLen : 0) + nOut * geo.n * 2.4;
  const insul = inp.condensation;
  const insulKg = insul ? Math.PI * (geo.Dm + 0.04) * runsLen * 0.9 : 0;
  const steelHours = runsLen * (geo.D <= 630 ? 1.3 : 1.9) + nOut * geo.n * 0.45 + (insul ? runsLen * 0.6 : 0);
  const fabricHours = steelHours * 0.2;
  const fabricKg = d.totalWeight;
  const co2Steel = steelKg * 2.3 + insulKg * 3.5;
  const pesFactor = d.material.recycled ? 3.0 : 6.0;
  const co2Fabric = d.weight * pesFactor + (d.suspensionWeight || 0) * 8.2;
  const volSteel = runsLen * ((Math.PI * geo.Dm * geo.Dm) / 4) * 1.2;
  const volFabric = Math.max(0.05, (d.fabricArea * 0.004) * 1.5);

  return {
    name: 'Plechové spiro potrubí + vyústky',
    spacing,
    perRun,
    nOut: nOut * geo.n,
    grilleSize: Math.round(side * 1000 / 25) * 25,
    grilles,
    u0,
    A0,
    ang,
    traj: tr,
    ozMap: { nx, ny, L: inp.L, W: inp.W, z: inp.oz, u, t, dr },
    metrics: {
      vMax,
      vMean: vSum / cnt,
      drMax,
      drOkShare: drOk / cnt,
      vOkShare: vOk / cnt,
      adpi: (100 * adpi) / cnt,
      penetration,
      gradient: inp.gamma * (1 + 2 * Math.max(0, 1 - Math.min(1, penetration))) * (Math.min(inp.oz, 1.7) - 0.1),
    },
    sheet: t_mm,
    steelKg,
    insulKg,
    fabricKg,
    steelHours,
    fabricHours,
    co2Steel,
    co2Fabric,
    volSteel,
    volFabric,
    condensation: insul,
    pesFactor,
  };
}

// ---------------------------------------------------------------------------
// pomocné

function num(v, dflt) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return Number.isFinite(n) ? n : dflt;
}
function isNum(v) {
  return v !== null && v !== '' && v !== 'auto' && Number.isFinite(+v);
}
export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
const f1 = (v) => (+v).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v) => (+v).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtM = (v) => `${f1(v)} m`;
const fmtMM = (v) => (v >= 1 ? `${f1(v)} m` : `${Math.round(v * 1000)} mm`);
