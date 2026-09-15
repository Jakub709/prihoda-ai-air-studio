// Částicová vizualizace proudění: každá částice = stopa natažená ve směru rychlosti
// (instancovaný quad, šířka v pixelech, délka podle rychlosti). Barva = teplota nebo rychlost.
import * as THREE from 'three';
import { RAMP_TEAL, RAMP_TEMP_PARTICLES as RAMP_TEMP, sampleRamp } from '../viz/colormaps.js';

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iCol;
  uniform vec2 uRes;
  uniform float uTrail;
  uniform float uMaxLen;
  uniform float uWidth;
  varying vec4 vCol;
  varying vec2 vQ;
  void main() {
    float sp = length(iVel);
    vec3 dir = sp > 1e-4 ? iVel / sp : vec3(1.0, 0.0, 0.0);
    float len = min(sp * uTrail, uMaxLen);
    vec3 tail = iPos - dir * len;
    vec4 h = projectionMatrix * modelViewMatrix * vec4(iPos, 1.0);
    vec4 t = projectionMatrix * modelViewMatrix * vec4(tail, 1.0);
    vec2 hp = (h.xy / h.w) * uRes * 0.5;
    vec2 tp = (t.xy / t.w) * uRes * 0.5;
    vec2 d = hp - tp;
    float dl = length(d);
    vec2 dn = dl > 1e-3 ? d / dl : vec2(1.0, 0.0);
    // minimální délka = kulatá tečka
    float w = uWidth * clamp(2.2 / max(h.w, 0.1) * 6.0, 0.55, 1.6);
    if (dl < w) { tp = hp - dn * w; }
    vec2 nrm = vec2(-dn.y, dn.x);
    float along = position.x; // 0 = konec stopy, 1 = hlava
    vec2 sp2 = mix(tp, hp + dn * w * 0.5, along) + nrm * position.y * w * 0.5;
    float ww = mix(t.w, h.w, along);
    float zz = mix(t.z / t.w, h.z / h.w, along);
    gl_Position = vec4(sp2 / (uRes * 0.5) * ww, zz * ww, ww);
    vCol = iCol;
    vQ = position.xy;
  }
`;

const FRAG = /* glsl */ `
  varying vec4 vCol;
  varying vec2 vQ;
  void main() {
    float across = 1.0 - vQ.y * vQ.y;
    float a = vCol.a * across * smoothstep(0.0, 0.45, vQ.x);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vCol.rgb * a, a);
  }
`;

export class Streaks {
  constructor(max, { width = 2.2, trail = 0.12, maxLen = 0.9, additive = true } = {}) {
    this.max = max;
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    quad.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    quad.setAttribute('iVel', new THREE.InstancedBufferAttribute(this.vel, 3).setUsage(THREE.DynamicDrawUsage));
    quad.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    quad.instanceCount = 0;
    this.geo = quad;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uTrail: { value: trail },
        uMaxLen: { value: maxLen },
        uWidth: { value: width },
      },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(quad, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    // stav částic (souřadnice haly: x délka, y šířka, z výška)
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.T = new Float32Array(max);
    this.tag = new Int32Array(max);
    this.aux = new Float32Array(max * 2);
    this.n = 0;
  }

  setResolution(w, h) {
    this.mat.uniforms.uRes.value.set(w, h);
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

const tmp = [0, 0, 0, 0];
function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
}

/**
 * Simulace částic v poli tkaninového rozvodu.
 * Pole = příčný řez (uy, uz, dT) protažený podél vyústek; emise z otvorů v nafouknutých úsecích.
 */
export class FabricFlow {
  constructor(design, ducts, count = 16000) {
    this.d = design;
    this.ducts = ducts;
    this.s = new Streaks(count, { width: 3.4, trail: 0.18, maxLen: 0.9, additive: false });
    this.count = count;
    this.colorMode = 'temp';
    this.speed = 1;
    this.emitAcc = 0;
    const o = design.outlet;
    this.band = o.kind === 'band';
    this.fan = o.fan || 0;
    this.u0vis = this.band ? Math.min(o.u0 * 0.35, 1.6) : Math.min(o.u0, 7);
    this.pitch = o.kind === 'holes' && o.pitch > 0.07 ? o.pitch : 0;
    this.dTspan = Math.max(1, Math.abs(design.inp.dT0));
    for (let i = 0; i < count; i++) {
      this.s.life[i] = 0;
      this.s.age[i] = 1;
    }
    this.s.n = 0;
  }

  sampleField(x, y, z, out) {
    const f = this.d.section;
    const gx = (y / f.W) * (f.ny - 1);
    const gz = (z / f.H) * (f.nz - 1);
    if (gx < 0 || gz < 0 || gx > f.ny - 1 || gz > f.nz - 1) {
      out[0] = out[1] = out[2] = 0;
      return;
    }
    const i = Math.min(f.ny - 2, gx | 0);
    const j = Math.min(f.nz - 2, gz | 0);
    const fx = gx - i;
    const fz = gz - j;
    const k = j * f.ny + i;
    const w00 = (1 - fx) * (1 - fz);
    const w10 = fx * (1 - fz);
    const w01 = (1 - fx) * fz;
    const w11 = fx * fz;
    const g = this.d.geo;
    const taper = smooth(g.x0 - 0.6, g.x0 + 0.6, x) * (1 - smooth(g.x1 - 0.6, g.x1 + 0.6, x));
    const tt = 0.25 + 0.75 * taper;
    out[0] = (f.uy[k] * w00 + f.uy[k + 1] * w10 + f.uy[k + f.ny] * w01 + f.uy[k + f.ny + 1] * w11) * tt;
    out[1] = (f.uz[k] * w00 + f.uz[k + 1] * w10 + f.uz[k + f.ny] * w01 + f.uz[k + f.ny + 1] * w11) * tt;
    out[2] = (f.dT[k] * w00 + f.dT[k + 1] * w10 + f.dT[k + f.ny] * w01 + f.dT[k + f.ny + 1] * w11) * taper;
  }

  /** Vypustí částici z otvoru v nafouknuté části vyústky (maxX = nafouknutá délka od začátku, m). */
  emit(i, maxX = Infinity) {
    const d = this.d;
    const g = d.geo;
    const s = this.s;
    const run = d.runs[(Math.random() * d.runs.length) | 0];
    const span = Math.max(0.2, Math.min(run.len - 0.2, maxX - 0.15));
    let x = run.x0 + 0.15 + Math.random() * span;
    if (this.pitch) x = run.x0 + (Math.floor(Math.random() * Math.max(1, Math.floor((span + 0.15) / this.pitch))) + 0.5) * this.pitch;
    const inflated = this.ducts ? this.ducts.inflationAt(x - run.x0) : 1;
    if (inflated < 0.9) {
      s.life[i] = 0;
      return false;
    }
    const o = d.outlet;
    let a = o.angles[(Math.random() * o.angles.length) | 0];
    if (this.band) a += ((Math.random() - 0.5) * this.fan * 180) / Math.PI;
    else a += gauss() * 2;
    const ar = (a * Math.PI) / 180;
    const dy = Math.sin(ar);
    const dz = Math.cos(ar);
    const r = g.r + 0.03;
    s.p[i * 3] = x + (this.pitch ? gauss() * 0.01 : 0);
    s.p[i * 3 + 1] = run.y + dy * r;
    s.p[i * 3 + 2] = g.zc + dz * r;
    const u = this.u0vis * (0.75 + Math.random() * 0.5);
    s.v[i * 3] = gauss() * 0.02;
    s.v[i * 3 + 1] = dy * u;
    s.v[i * 3 + 2] = dz * u;
    s.T[i] = d.inp.dT0;
    s.age[i] = 0;
    s.aux[i * 2] = 0; // doba stagnace
    // během nafukování krátký život – po nafouknutí se částice rychle rozprostřou po celé délce
    const early = this.ducts && this.ducts.anim && this.ducts.anim.running;
    s.life[i] = early ? 1.5 + Math.random() * 2.5 : this.band ? 8 + Math.random() * 8 : 7 + Math.random() * 8;
    return true;
  }

  update(dt, active = true) {
    const s = this.s;
    const d = this.d;
    const inp = d.inp;
    const L = inp.L;
    const W = inp.W;
    const H = inp.H;
    const step = Math.min(dt, 1 / 30) * this.speed;
    const relax = 1 - Math.exp(-step / 0.12);
    const relaxT = 1 - Math.exp(-step / 0.7);
    // vztlak zpomaleného přiváděného vzduchu: chladný klesá, teplý stoupá
    const buoy = inp.dT0 < -0.5 ? -0.07 : inp.dT0 > 0.5 ? 0.05 : 0;
    const g = d.geo;
    const rr = g.r * g.r;
    // plynulá emise jen z nafouknuté části (hustota částic podél vyústky zůstane rovnoměrná)
    const len = d.runs[0].len;
    const infl = this.ducts ? this.ducts.inflatedLength() : len;
    const target = infl < 0.3 ? 0 : Math.round(this.count * Math.min(1, infl / len));
    let budget = Math.ceil((this.count * step) / 1.2);
    let alive = this.lastLive ?? 0;
    let live = 0;
    for (let i = 0; i < this.count; i++) {
      if (s.age[i] >= s.life[i]) {
        if (!active || alive >= target || budget <= 0 || !this.emit(i, infl)) {
          s.col[i * 4 + 3] = 0;
          continue;
        }
        budget--;
        alive++;
      }
      const pi = i * 3;
      let x = s.p[pi];
      let y = s.p[pi + 1];
      let z = s.p[pi + 2];
      this.sampleField(x, y, z, tmp);
      let vx = s.v[pi];
      let vy = s.v[pi + 1];
      let vz = s.v[pi + 2];
      const sp = Math.hypot(tmp[0], tmp[1]);
      const sig = (0.05 + 0.22 * sp) * Math.sqrt(step);
      const wb = buoy * Math.max(0, 1 - sp / 0.18);
      vx += (0 - vx) * relax + gauss() * sig * 0.8;
      vy += (tmp[0] - vy) * relax + gauss() * sig;
      vz += (tmp[1] + wb - vz) * relax + gauss() * sig;
      x += vx * step;
      y += vy * step;
      z += vz * step;
      if (z < 0.03) {
        z = 0.03;
        vz = Math.abs(vz) * 0.2;
      } else if (z > H - 0.03) {
        z = H - 0.03;
        vz = -Math.abs(vz) * 0.2;
      }
      if (y < 0.03) {
        y = 0.03;
        vy = Math.abs(vy) * 0.3;
      } else if (y > W - 0.03) {
        y = W - 0.03;
        vy = -Math.abs(vy) * 0.3;
      }
      if (x < 0.05 || x > L - 0.05) s.age[i] = s.life[i];
      // uvnitř vyústky → recyklace
      for (const run of d.runs) {
        const dy = y - run.y;
        const dz = z - g.zc;
        if (dy * dy + dz * dz < rr * 0.8 && x > run.x0 && x < run.x1) {
          s.age[i] = s.life[i];
          break;
        }
      }
      s.p[pi] = x;
      s.p[pi + 1] = y;
      s.p[pi + 2] = z;
      s.v[pi] = vx;
      s.v[pi + 1] = vy;
      s.v[pi + 2] = vz;
      s.T[i] += (tmp[2] - s.T[i]) * relaxT;
      s.age[i] += step;
      // zastavená částice (stagnace u stěny, v rohu) plynule vybledne a vypustí se znovu z otvoru
      if (Math.hypot(vx, vy, vz) < 0.07) {
        s.aux[i * 2] += step;
        if (s.aux[i * 2] > 0.8 && s.life[i] - s.age[i] > 0.9) s.life[i] = s.age[i] + 0.9;
      } else s.aux[i * 2] = 0;
      // GPU buffery (svět: X = x − L/2, Y = z, Z = y − W/2)
      s.pos[pi] = x - L / 2;
      s.pos[pi + 1] = z;
      s.pos[pi + 2] = y - W / 2;
      s.vel[pi] = vx;
      s.vel[pi + 1] = vz;
      s.vel[pi + 2] = vy;
      const a = s.age[i];
      const fade = Math.min(1, a / 0.35) * Math.min(1, (s.life[i] - a) / 1.2);
      const spd = Math.hypot(vx, vy, vz);
      let c;
      let emph = 1;
      if (this.colorMode === 'temp' && inp.dT0 !== 0) {
        const rel = s.T[i] / this.dTspan;
        c = sampleRamp(RAMP_TEMP, 0.5 + 0.5 * Math.max(-1, Math.min(1, rel * 1.6)));
        emph = 0.45 + 0.55 * Math.min(1, Math.abs(rel) * 2.2);
      } else c = sampleRamp(RAMP_TEAL, Math.min(1, 0.25 + spd / 1.0));
      const alpha = fade * emph * (0.42 + Math.min(0.5, spd * 0.6));
      s.col[i * 4] = c[0] / 255;
      s.col[i * 4 + 1] = c[1] / 255;
      s.col[i * 4 + 2] = c[2] / 255;
      s.col[i * 4 + 3] = alpha;
      live++;
    }
    this.lastLive = live;
    this.s.geo.instanceCount = this.count;
    for (const k of ['iPos', 'iVel', 'iCol']) this.s.geo.attributes[k].needsUpdate = true;
    return live;
  }
}

/**
 * Částice klasického rozvodu – sledují trajektorii proudu z každé vyústky (výsledek modelu),
 * s rozptylem podle šířky proudu.
 */
export class GrilleFlow {
  constructor(design, conv, count = 12000) {
    this.d = design;
    this.c = conv;
    this.s = new Streaks(count, { width: 3.4, trail: 0.18, maxLen: 0.9, additive: false });
    this.count = count;
    this.colorMode = 'temp';
    this.speed = 1;
    this.dTspan = Math.max(1, Math.abs(design.inp.dT0));
    // lineární řetězec vzorků trajektorie (volný proud + navazující větve)
    const chain = [];
    const tr = conv.traj;
    for (const br of tr.branches) {
      if (br.phase === 'floor' && br.dy[0] < 0) continue; // jen jedna větev podél podlahy
      for (let k = 0; k < br.n; k++) chain.push([br.y[k], br.z[k], br.uc[k], br.bg[k], br.dT[k], br.s[k]]);
    }
    chain.sort((a, b) => a[5] - b[5]);
    this.chain = chain;
    for (let i = 0; i < count; i++) this.s.life[i] = 0;
  }

  emit(i) {
    const s = this.s;
    s.tag[i] = (Math.random() * this.c.grilles.length) | 0;
    s.aux[i * 2] = gauss(); // příčný rozptyl (podél haly)
    s.aux[i * 2 + 1] = gauss(); // rozptyl v rovině proudu
    s.p[i * 3] = 0; // parametr s podél trajektorie
    s.v[i * 3] = 0; // index posledního vzorku (cache)
    s.age[i] = 0;
    s.life[i] = 4 + Math.random() * 4;
    return true;
  }

  update(dt, active = true) {
    const s = this.s;
    const d = this.d;
    const inp = d.inp;
    const step = Math.min(dt, 1 / 30) * this.speed;
    const ch = this.chain;
    const n = ch.length;
    for (let i = 0; i < this.count; i++) {
      if (s.age[i] >= s.life[i]) {
        if (!active) {
          s.col[i * 4 + 3] = 0;
          continue;
        }
        this.emit(i);
      }
      // najdi vzorek podle parametru s
      let sPar = s.p[i * 3];
      let k = Math.min(n - 2, s.v[i * 3] | 0);
      while (k < n - 2 && ch[k + 1][5] < sPar) k++;
      s.v[i * 3] = k;
      const A = ch[k];
      const B = ch[Math.min(n - 1, k + 1)];
      const span = Math.max(1e-4, B[5] - A[5]);
      const w = Math.min(1, Math.max(0, (sPar - A[5]) / span));
      const ly = A[0] + (B[0] - A[0]) * w;
      const lz = A[1] + (B[1] - A[1]) * w;
      const uc = A[2] + (B[2] - A[2]) * w;
      const bg = A[3] + (B[3] - A[3]) * w;
      const dT = A[4] + (B[4] - A[4]) * w;
      const spd = Math.max(0.05, uc * (0.8 + 0.25 * Math.abs(s.aux[i * 2 + 1])));
      sPar += spd * step;
      if (k >= n - 2 && w >= 1) s.age[i] = s.life[i];
      s.p[i * 3] = sPar;
      s.age[i] += step;
      const gr = this.c.grilles[s.tag[i]];
      if (!gr) continue;
      // směr v rovině proudu
      const tx = B[0] - A[0];
      const tz = B[1] - A[1];
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl;
      const nz = tx / tl;
      const off = s.aux[i * 2 + 1] * bg * 0.45;
      const X = gr.x + s.aux[i * 2] * bg * 0.5;
      const Y = gr.y + gr.side * (ly + nx * off);
      const Zh = lz + nz * off;
      const pi = i * 3;
      const oldX = s.pos[pi];
      const oldY = s.pos[pi + 1];
      const oldZ = s.pos[pi + 2];
      s.pos[pi] = X - inp.L / 2;
      s.pos[pi + 1] = Math.max(0.03, Math.min(inp.H - 0.03, Zh));
      s.pos[pi + 2] = Y - inp.W / 2;
      const vx = (s.pos[pi] - oldX) / Math.max(1e-4, step);
      const vy = (s.pos[pi + 1] - oldY) / Math.max(1e-4, step);
      const vz = (s.pos[pi + 2] - oldZ) / Math.max(1e-4, step);
      const fresh = s.age[i] < step * 1.5;
      s.vel[pi] = fresh ? 0 : clampV(vx);
      s.vel[pi + 1] = fresh ? 0 : clampV(vy);
      s.vel[pi + 2] = fresh ? 0 : clampV(vz);
      const a = s.age[i];
      const fade = Math.min(1, a / 0.25) * Math.min(1, (s.life[i] - a) / 1.0) * Math.min(1, uc / 0.12);
      let c;
      let emph = 1;
      if (this.colorMode === 'temp' && inp.dT0 !== 0) {
        const rel = dT / this.dTspan;
        c = sampleRamp(RAMP_TEMP, 0.5 + 0.5 * Math.max(-1, Math.min(1, rel * 1.6)));
        emph = 0.45 + 0.55 * Math.min(1, Math.abs(rel) * 2.2);
      } else c = sampleRamp(RAMP_TEAL, Math.min(1, 0.25 + uc / 1.0));
      s.col[i * 4] = c[0] / 255;
      s.col[i * 4 + 1] = c[1] / 255;
      s.col[i * 4 + 2] = c[2] / 255;
      s.col[i * 4 + 3] = fade * emph * (0.42 + Math.min(0.5, uc * 0.45));
    }
    s.geo.instanceCount = this.count;
    for (const k of ['iPos', 'iVel', 'iCol']) s.geo.attributes[k].needsUpdate = true;
  }
}

function clampV(v) {
  return Math.max(-8, Math.min(8, v));
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
