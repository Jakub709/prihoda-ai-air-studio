// 2D CFD řešič příčného řezu halou: nestlačitelné Navierovy–Stokesovy rovnice
// s Boussinesqovou aproximací vztlaku, semi-Lagrangeovská advekce, projekce tlaku (red-black SOR),
// turbulentní viskozita (zero-equation model pro vnitřní prostředí, Chen & Xu 1998:
// νt = 0,03874 · |V| · l, l = vzdálenost od nejbližší stěny) řešená implicitně.
// Výtok z vyústek je modelován zdroji hybnosti a tepla (shoda toku hybnosti a vztlaku s návrhem).

const G = 9.81;
const C_NUT = 0.03874; // konstanta modelu Chen & Xu
const NU_AIR = 1.5e-5;
const PR_T = 0.9; // turbulentní Prandtlovo číslo

export class CfdSolver {
  /**
   * @param {object} cfg
   *  W, H – rozměry řezu (m); nx – počet buněk po šířce
   *  tr – teplota prostoru; ducts: [{y, z, r, shape}]; jets: [{duct, ang, fan, u, dT}]
   *  returns: 'walls-top' | 'ceiling'; oz; mode
   */
  constructor(cfg) {
    this.cfg = cfg;
    const aspect = cfg.H / cfg.W;
    let nx = cfg.nx ?? 200;
    let ny = Math.round(nx * aspect);
    if (ny < 48) {
      ny = 48;
      nx = Math.round(ny / aspect);
    }
    if (ny > 120) {
      ny = 120;
      nx = Math.round(ny / aspect);
    }
    nx = Math.max(48, Math.min(260, nx));
    this.nx = nx;
    this.ny = ny;
    this.h = cfg.W / nx;
    const n = nx * ny;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.T = new Float32Array(n).fill(0); // teplota relativně k tr
    this.p = new Float32Array(n);
    this.div = new Float32Array(n);
    this.u0 = new Float32Array(n);
    this.v0 = new Float32Array(n);
    this.T0 = new Float32Array(n);
    this.curl = new Float32Array(n);
    this.solid = new Uint8Array(n);
    this.outflow = new Uint8Array(n);
    this.src = new Float32Array(n); // zdroj tepla K/s
    this.wd = new Float32Array(n); // vzdálenost od nejbližší stěny (m)
    this.nut = new Float32Array(n); // turbulentní viskozita (m²/s)
    this.cL = new Float32Array(n); // implicitní difuze: koeficienty stěn buňky (dt·ν/h²)
    this.cR = new Float32Array(n);
    this.cB = new Float32Array(n);
    this.cT = new Float32Array(n);
    this.cW = new Float32Array(n); // tření o pevné stěny (jen rychlost)
    this.avgSpeed = new Float32Array(n);
    this.avgT = new Float32Array(n);
    this.time = 0;
    this.steps = 0;
    this.inflow = [];
    this.build();
  }

  idx(i, j) {
    return j * this.nx + i;
  }

  build() {
    const { nx, ny, h, cfg } = this;
    const beta = 1 / (cfg.tr + 273.15);
    this.gb = G * beta;
    // stěny domény: okrajové buňky pevné
    for (let i = 0; i < nx; i++) {
      this.solid[this.idx(i, 0)] = 1;
      this.solid[this.idx(i, ny - 1)] = 1;
    }
    for (let j = 0; j < ny; j++) {
      this.solid[this.idx(0, j)] = 1;
      this.solid[this.idx(nx - 1, j)] = 1;
    }
    // vyústky (plné kruhy / půlkruhy)
    for (const d of cfg.ducts) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const y = (i + 0.5) * h;
          const z = (j + 0.5) * h;
          const dy = y - d.y;
          const dz = z - d.z;
          const inside = dy * dy + dz * dz <= d.r * d.r;
          if (inside && (d.shape !== 'H' || dz <= 0.02)) this.solid[this.idx(i, j)] = 1;
        }
      }
    }
    // výtoky
    let heatIn = 0;
    for (const jet of cfg.jets) {
      const d = cfg.ducts[jet.duct];
      // vtok rozložený alespoň přes ~3 buňky (rozlišitelný proud), tok hybnosti zachován
      const half = Math.max(jet.fan / 2, (1.6 * h) / Math.max(d.r, h));
      const wEff = Math.max(2.5 * h, d.r * half * 2);
      const uInj = Math.min(jet.uMax ?? 6, Math.max(0.25, Math.sqrt(jet.m / wEff)));
      const dT = Math.max(-Math.abs(jet.dT0), Math.min(Math.abs(jet.dT0), (jet.dT0 * jet.q) / (uInj * wEff)));
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const k = this.idx(i, j);
          if (this.solid[k]) continue;
          const y = (i + 0.5) * h;
          const z = (j + 0.5) * h;
          const dy = y - d.y;
          const dz = z - d.z;
          const dist = Math.hypot(dy, dz);
          if (dist <= d.r || dist > d.r + 1.6 * h) continue;
          let ang = Math.atan2(dy, dz); // 0 = nahoru, kladně po směru hodin (k +y)
          let diff = ang - (jet.ang * Math.PI) / 180;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          if (Math.abs(diff) > half) continue;
          const ux = dy / dist;
          const uz = dz / dist;
          this.inflow.push({ k, u: ux * uInj, v: uz * uInj, T: dT });
          heatIn += (uInj * h * dT) / 1.6;
        }
      }
    }
    // odtah vzduchu: horní část bočních stěn (vratné mřížky)
    const top = Math.max(2, Math.round(ny * 0.14));
    for (let j = ny - 1 - top; j < ny - 1; j++) {
      this.outflow[this.idx(0, j)] = 1;
      this.outflow[this.idx(nx - 1, j)] = 1;
      this.solid[this.idx(0, j)] = 0;
      this.solid[this.idx(nx - 1, j)] = 0;
    }
    // tepelná bilance: chlazení → zisky v pobytové zóně (lidé, stroje) a pod střechou (střecha, osvětlení);
    // vytápění → ztráty stropem a stěnami
    const spread = (cells, share) => {
      if (!cells.length) return;
      const rate = (-heatIn * share) / (cells.length * h * h);
      for (const k of cells) this.src[k] += rate;
    };
    if (heatIn < 0) {
      const low = [];
      const high = [];
      const zMax = Math.min(cfg.oz ?? 1.8, cfg.H * 0.4);
      const zTop = cfg.H - Math.max(2 * h, 0.6);
      for (let j = 1; j < ny - 1; j++) {
        const z = (j + 0.5) * h;
        for (let i = 2; i < nx - 2; i++) {
          if (this.solid[this.idx(i, j)]) continue;
          if (z <= zMax) low.push(this.idx(i, j));
          else if (z >= zTop) high.push(this.idx(i, j));
        }
      }
      const upper = cfg.heatUpper ?? 0.35;
      spread(low, 1 - upper);
      spread(high, upper);
    } else if (heatIn > 0) {
      const cells = [];
      for (let j = ny - 2; j > ny - 2 - Math.max(2, Math.round(0.5 / h)); j--) for (let i = 1; i < nx - 1; i++) cells.push(this.idx(i, j));
      for (let j = 1; j < ny - 1; j++) {
        cells.push(this.idx(1, j));
        cells.push(this.idx(nx - 2, j));
      }
      spread(cells, 1);
    }
    this.heatIn = heatIn;
    // počáteční stratifikace
    const gamma = cfg.gamma ?? 0;
    for (let j = 0; j < ny; j++) {
      const z = (j + 0.5) * h;
      const t = gamma * (z - (cfg.zRef ?? 1.1));
      for (let i = 0; i < nx; i++) this.T[this.idx(i, j)] = t;
    }
    let umax = 0.3;
    for (const f of this.inflow) umax = Math.max(umax, Math.hypot(f.u, f.v));
    this.dt = Math.min(0.1, (1.4 * h) / umax);
    // vzdálenost od stěn (podlaha, strop, boční stěny, povrch potrubí) pro model turbulence
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const y = (i + 0.5) * h;
        const z = (j + 0.5) * h;
        let l = Math.min(y, cfg.W - y, z, cfg.H - z);
        for (const d of cfg.ducts) l = Math.min(l, Math.hypot(y - d.y, z - d.z) - d.r);
        this.wd[this.idx(i, j)] = Math.max(0.5 * h, l);
      }
    }
    this.cNut = cfg.cNut ?? C_NUT;
    this.confineEps = cfg.confine ?? 0;
    this.nutMax = 0.25;
  }

  /** Turbulentní viskozita (Chen & Xu) a koeficienty implicitní difuze pro aktuální krok. */
  updateViscosity(dt) {
    const { nx, ny, h, u, v, solid, wd, nut, cL, cR, cB, cT, cW } = this;
    const n = nx * ny;
    const cN = this.cNut;
    const nMax = this.nutMax;
    let sum = 0;
    let cnt = 0;
    for (let k = 0; k < n; k++) {
      if (solid[k]) {
        nut[k] = 0;
        continue;
      }
      const sp = Math.sqrt(u[k] * u[k] + v[k] * v[k]);
      let nt = NU_AIR + cN * sp * wd[k];
      if (nt > nMax) nt = nMax;
      nut[k] = nt;
      sum += nt;
      cnt++;
    }
    this.nutMean = sum / Math.max(1, cnt);
    const s = dt / (h * h);
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (solid[k]) continue;
        const nk = nut[k];
        let w = 0;
        // soused tekutina → koeficient z průměru viskozit na stěně buňky; pevná stěna → tření (bez skluzu)
        if (solid[k - 1]) { cL[k] = 0; w += nk; } else cL[k] = 0.5 * (nk + nut[k - 1]) * s;
        if (solid[k + 1]) { cR[k] = 0; w += nk; } else cR[k] = 0.5 * (nk + nut[k + 1]) * s;
        if (solid[k - nx]) { cB[k] = 0; w += nk; } else cB[k] = 0.5 * (nk + nut[k - nx]) * s;
        if (solid[k + nx]) { cT[k] = 0; w += nk; } else cT[k] = 0.5 * (nk + nut[k + nx]) * s;
        cW[k] = w * s * 2; // stěna ve vzdálenosti h/2
      }
    }
  }

  /**
   * Implicitní difuze s proměnnou viskozitou: (1 + Σc)·f − Σc·f_soused = f*.
   * Red-black Gauss–Seidel; wall = true → tření o pevné stěny (rychlost), jinak adiabatické stěny (teplota).
   */
  diffuseImplicit(f, scale, wall, iters = 4) {
    if (!this.rb) this.buildPressureMasks();
    const { nx, cL, cR, cB, cT, cW, rb } = this;
    const rhs = this.div;
    rhs.set(f);
    for (let it = 0; it < iters; it++) {
      for (let par = 0; par < 2; par++) {
        const list = rb[par];
        for (let q = 0; q < list.length; q++) {
          const k = list[q];
          const l = cL[k] * scale;
          const r = cR[k] * scale;
          const b = cB[k] * scale;
          const t = cT[k] * scale;
          const diag = 1 + l + r + b + t + (wall ? cW[k] * scale : 0);
          f[k] = (rhs[k] + l * f[k - 1] + r * f[k + 1] + b * f[k - nx] + t * f[k + nx]) / diag;
        }
      }
    }
  }

  applyInflow() {
    const { u, v, T } = this;
    for (const f of this.inflow) {
      u[f.k] = f.u;
      v[f.k] = f.v;
      T[f.k] = f.T;
    }
  }

  step() {
    const { nx, ny, h, solid, outflow } = this;
    const n = nx * ny;
    const dt = this.dt;
    this.applyInflow();
    // advekce rychlosti: nové pole = staré pole přenesené podél starých rychlostí
    const uOld = this.u;
    const vOld = this.v;
    const uNew = this.u0;
    const vNew = this.v0;
    this.advectMC(uNew, uOld, uOld, vOld, dt);
    this.advectMC(vNew, vOld, uOld, vOld, dt);
    this.u = uNew;
    this.v = vNew;
    this.u0 = uOld;
    this.v0 = vOld;
    // vztlak + zdroje tepla + difuze
    const { u, v, T } = this;
    const gb = this.gb;
    for (let k = 0; k < n; k++) {
      if (solid[k]) continue;
      v[k] += dt * gb * T[k];
    }
    this.updateViscosity(dt);
    this.diffuseImplicit(u, 1, true);
    this.diffuseImplicit(v, 1, true);
    if (this.confineEps > 0) this.confine(dt, this.confineEps);
    this.applyInflow();
    this.bound();
    this.project();
    this.applyInflow();
    // teplota
    this.T0.set(T);
    this.advectMC(T, this.T0, u, v, dt);
    let mean = 0;
    let cnt = 0;
    for (let k = 0; k < n; k++) {
      if (solid[k] && !outflow[k]) continue;
      T[k] += dt * this.src[k];
      mean += T[k];
      cnt++;
    }
    this.diffuseImplicit(T, 1 / PR_T, false, 3);
    // držení střední teploty (tepelná bilance prostoru)
    mean /= Math.max(1, cnt);
    const target = 0;
    const corr = (target - mean) * Math.min(1, dt * 0.05);
    for (let k = 0; k < n; k++) if (!solid[k]) T[k] += corr;
    // časové průměry (každý 3. krok)
    if (this.steps % 3 === 0) {
      const a = Math.min(1, (3 * dt) / 12);
      const as = this.avgSpeed;
      const at = this.avgT;
      for (let k = 0; k < n; k++) {
        const sp = Math.sqrt(u[k] * u[k] + v[k] * v[k]);
        as[k] += (sp - as[k]) * a;
        at[k] += (T[k] - at[k]) * a;
      }
    }
    this.time += dt;
    this.steps++;
  }

  /**
   * MacCormack (BFECC-lite): dopředná + zpětná advekce, korekce chyby s omezovačem
   * → výrazně nižší numerická difuze, proudy vydrží na hrubé síti.
   */
  advectMC(dst, src, u, v, dt) {
    const n = this.nx * this.ny;
    if (!this.mcA || this.mcA.length !== n) {
      this.mcA = new Float32Array(n);
      this.mcB = new Float32Array(n);
    }
    const fwd = this.mcA;
    const back = this.mcB;
    this.advectWith(fwd, src, u, v, dt);
    this.advectWith(back, fwd, u, v, -dt);
    const { nx, ny, solid, h } = this;
    const s = dt / h;
    const xMax = nx - 1.001;
    const yMax = ny - 1.001;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (solid[k]) {
          dst[k] = src[k];
          continue;
        }
        let val = fwd[k] + 0.5 * (src[k] - back[k]);
        // omezovač: hodnota v mezích sousedů použitých při dopředné interpolaci
        let fx = i - u[k] * s;
        let fy = j - v[k] * s;
        if (fx < 0) fx = 0;
        else if (fx > xMax) fx = xMax;
        if (fy < 0) fy = 0;
        else if (fy > yMax) fy = yMax;
        const q = (fy | 0) * nx + (fx | 0);
        const a = src[q];
        const b = src[q + 1];
        const c = src[q + nx];
        const d = src[q + nx + 1];
        const lo = Math.min(a, b, c, d);
        const hi = Math.max(a, b, c, d);
        if (val < lo) val = lo;
        else if (val > hi) val = hi;
        dst[k] = val;
      }
    }
  }

  advectWith(dst, src, u, v, dt) {
    const { nx, ny, solid, h } = this;
    const s = dt / h;
    const xMax = nx - 1.001;
    const yMax = ny - 1.001;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (solid[k]) {
          dst[k] = src[k];
          continue;
        }
        let fx = i - u[k] * s;
        let fy = j - v[k] * s;
        if (fx < 0) fx = 0;
        else if (fx > xMax) fx = xMax;
        if (fy < 0) fy = 0;
        else if (fy > yMax) fy = yMax;
        const ii = fx | 0;
        const jj = fy | 0;
        const a = fx - ii;
        const b = fy - jj;
        const q = jj * nx + ii;
        dst[k] = (src[q] * (1 - a) + src[q + 1] * a) * (1 - b) + (src[q + nx] * (1 - a) + src[q + nx + 1] * a) * b;
      }
    }
  }

  confine(dt, eps) {
    const { nx, ny, u, v, solid, curl, h } = this;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        curl[k] = solid[k] ? 0 : (v[k + 1] - v[k - 1] - u[k + nx] + u[k - nx]) * 0.5;
      }
    }
    const e = eps * h * dt / h;
    for (let j = 2; j < ny - 2; j++) {
      for (let i = 2; i < nx - 2; i++) {
        const k = j * nx + i;
        if (solid[k]) continue;
        const gx = (Math.abs(curl[k + 1]) - Math.abs(curl[k - 1])) * 0.5;
        const gy = (Math.abs(curl[k + nx]) - Math.abs(curl[k - nx])) * 0.5;
        const len = Math.sqrt(gx * gx + gy * gy) + 1e-6;
        const w = curl[k];
        u[k] += e * (gy / len) * w;
        v[k] -= e * (gx / len) * w;
      }
    }
  }

  bound() {
    const { u, v, solid, outflow, nx, ny } = this;
    for (let k = 0; k < nx * ny; k++) {
      if (solid[k]) {
        u[k] = 0;
        v[k] = 0;
      }
    }
    // výtok: nulový gradient
    for (let j = 1; j < ny - 1; j++) {
      const kl = j * nx;
      const kr = j * nx + nx - 1;
      if (outflow[kl]) {
        u[kl] = Math.min(0, u[kl + 1]);
        v[kl] = 0;
      }
      if (outflow[kr]) {
        u[kr] = Math.max(0, u[kr - 1]);
        v[kr] = 0;
      }
    }
  }

  /** Masky pro tlakovou rovnici: soused tekutina = 1 (přispívá p), stěna = 0 (Neumann), výtok = 0 ale počítá se (Dirichlet p = 0). */
  buildPressureMasks() {
    const { nx, ny, solid, outflow } = this;
    const n = nx * ny;
    this.mL = new Float32Array(n);
    this.mR = new Float32Array(n);
    this.mB = new Float32Array(n);
    this.mT = new Float32Array(n);
    this.inv = new Float32Array(n);
    const red = [];
    const black = [];
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (solid[k]) continue;
        let cnt = 0;
        const fl = (m) => !solid[m] && !outflow[m];
        if (outflow[k - 1]) cnt++;
        else if (fl(k - 1)) {
          this.mL[k] = 1;
          cnt++;
        }
        if (outflow[k + 1]) cnt++;
        else if (fl(k + 1)) {
          this.mR[k] = 1;
          cnt++;
        }
        if (fl(k - nx)) {
          this.mB[k] = 1;
          cnt++;
        }
        if (fl(k + nx)) {
          this.mT[k] = 1;
          cnt++;
        }
        if (!cnt) continue;
        this.inv[k] = 1 / cnt;
        ((i + j) & 1 ? black : red).push(k);
      }
    }
    this.rb = [Int32Array.from(red), Int32Array.from(black)];
  }

  project() {
    const { nx, ny, u, v, p, div, solid, outflow } = this;
    // divergence
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (solid[k]) {
          div[k] = 0;
          continue;
        }
        const ur = solid[k + 1] && !outflow[k + 1] ? 0 : u[k + 1];
        const ul = solid[k - 1] && !outflow[k - 1] ? 0 : u[k - 1];
        const vt = solid[k + nx] ? 0 : v[k + nx];
        const vb = solid[k - nx] ? 0 : v[k - nx];
        div[k] = 0.5 * (ur - ul + vt - vb);
      }
    }
    // tlak (red-black SOR, teplý start) – bez větvení: předpočítané masky sousedů
    if (!this.rb) this.buildPressureMasks();
    const { rb, mL, mR, mB, mT, inv } = this;
    const omega = 1.75;
    const iters = this.iters ?? 16;
    for (let it = 0; it < iters; it++) {
      for (let par = 0; par < 2; par++) {
        const list = rb[par];
        for (let q = 0; q < list.length; q++) {
          const k = list[q];
          const nv = (mL[k] * p[k - 1] + mR[k] * p[k + 1] + mB[k] * p[k - nx] + mT[k] * p[k + nx] - div[k]) * inv[k];
          p[k] += omega * (nv - p[k]);
        }
      }
    }
    // odečtení gradientu tlaku
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (solid[k]) continue;
        const pc = p[k];
        const pr = outflow[k + 1] ? 0 : solid[k + 1] ? pc : p[k + 1];
        const pl = outflow[k - 1] ? 0 : solid[k - 1] ? pc : p[k - 1];
        const pt = solid[k + nx] ? pc : p[k + nx];
        const pb = solid[k - nx] ? pc : p[k - nx];
        u[k] -= 0.5 * (pr - pl);
        v[k] -= 0.5 * (pt - pb);
      }
    }
  }

  /** Snímek pro vykreslení. */
  frame(avg = false) {
    const n = this.nx * this.ny;
    const speed = new Float32Array(n);
    const T = new Float32Array(n);
    if (avg) {
      speed.set(this.avgSpeed);
      T.set(this.avgT);
    } else {
      const u = this.u;
      const v = this.v;
      for (let k = 0; k < n; k++) speed[k] = Math.sqrt(u[k] * u[k] + v[k] * v[k]);
      T.set(this.T);
    }
    return { nx: this.nx, ny: this.ny, h: this.h, speed, T, u: this.u.slice(), v: this.v.slice(), time: this.time, steps: this.steps };
  }

  /** Profil v dané výšce (časový průměr). */
  profile(z) {
    const j = Math.max(1, Math.min(this.ny - 2, Math.round(z / this.h - 0.5)));
    const out = new Float32Array(this.nx);
    const tt = new Float32Array(this.nx);
    for (let i = 0; i < this.nx; i++) {
      out[i] = this.avgSpeed[this.idx(i, j)];
      tt[i] = this.avgT[this.idx(i, j)];
    }
    return { speed: out, T: tt };
  }
}
