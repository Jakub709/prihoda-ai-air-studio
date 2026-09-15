// 3D model tkaninového rozvodu Příhoda: vyústky (s animací nafouknutí), perforace, trysky,
// zipy mezi díly, závěsný systém, rozvodná větev a VZT jednotka.
import * as THREE from 'three';
import { artTexture, fabricTexture } from './textures.js';

const easeOutBack = (t) => {
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Trubicová geometrie vyústky podél lokální osy +X s předpočítanými polohami
 * nafouknuto/vyfouknuto pro plynulou animaci.
 */
function tubeGeometry(shape, r, len, opts = {}) {
  const step = opts.ringStep ?? Math.max(0.1, Math.min(0.25, len / 260));
  const rings = Math.max(2, Math.ceil(len / step) + 1);
  const radial = opts.radial ?? 48;
  const a0 = shape === 'H' ? Math.PI / 2 : 0;
  const a1 = shape === 'H' ? (3 * Math.PI) / 2 : Math.PI * 2;
  const cols = radial + 1;
  const n = rings * cols;
  const pos = new Float32Array(n * 3);
  const inf = new Float32Array(n * 3);
  const def = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const along = new Float32Array(n);
  const vScale = opts.vScale ?? 1;
  const seed = opts.seed ?? 0;
  for (let i = 0; i < rings; i++) {
    const x = (i / (rings - 1)) * len;
    for (let j = 0; j < cols; j++) {
      const f = j / radial;
      const phi = a0 + f * (a1 - a0);
      const k = i * cols + j;
      const iy = r * Math.cos(phi);
      const iz = r * Math.sin(phi);
      inf[k * 3] = x;
      inf[k * 3 + 1] = iy;
      inf[k * 3 + 2] = iz;
      // vyfouknutý stav – tkanina visí ze závěsu (C) nebo je prověšená pod stropem (H)
      const wr = 0.022 * Math.sin(x * 4.3 + phi * 3 + seed) + 0.015 * Math.sin(x * 1.7 + seed * 2);
      if (shape === 'H') {
        def[k * 3] = x;
        def[k * 3 + 1] = iy * 0.24 - Math.abs(Math.sin(phi)) * 0 + wr;
        def[k * 3 + 2] = iz * 0.98;
      } else {
        const ts = (phi <= Math.PI ? phi : 2 * Math.PI - phi) / Math.PI;
        const sgn = phi <= Math.PI ? 1 : -1;
        const sag = (0.06 + 0.05 * Math.sin(x * 0.9 + seed)) * ts;
        def[k * 3] = x;
        def[k * 3 + 1] = r - Math.PI * r * 0.9 * ts - sag;
        def[k * 3 + 2] = sgn * r * 0.13 * Math.sin(Math.PI * ts) + wr * ts;
      }
      pos[k * 3] = def[k * 3];
      pos[k * 3 + 1] = def[k * 3 + 1];
      pos[k * 3 + 2] = def[k * 3 + 2];
      uv[k * 2] = f;
      uv[k * 2 + 1] = x / vScale;
      along[k] = x;
    }
  }
  const idx = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = a + cols;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData = { inf, def, along, len, rings, cols };
  return g;
}

function capGeometry(shape, r) {
  if (shape === 'H') {
    const g = new THREE.CircleGeometry(r, 32, Math.PI, Math.PI);
    return g;
  }
  return new THREE.CircleGeometry(r, 40);
}

export class DuctSystem {
  constructor(design, opts = {}) {
    this.design = design;
    this.group = new THREE.Group();
    this.group.name = 'prihoda';
    this.runs = [];
    this.anim = { t: 1, running: false, dur: 1 };
    this.artImage = opts.artImage || null;
    this.build();
  }

  build() {
    const d = this.design;
    const inp = d.inp;
    const X = (x) => x - inp.L / 2;
    const Z = (y) => y - inp.W / 2;
    const color = new THREE.Color(d.color.hex);
    let map;
    let vScale = 1;
    if (this.artImage) {
      map = artTexture(this.artImage, d.color.hex, d);
      vScale = map.userData.metersPerRepeat;
    } else {
      map = fabricTexture(d);
    }
    this.fabricMat = new THREE.MeshPhysicalMaterial({
      color: this.artImage ? 0xffffff : color,
      map,
      roughness: 0.78,
      metalness: 0,
      sheen: 0.55,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(0xffffff),
      side: THREE.DoubleSide,
    });
    const hdrMat = new THREE.MeshPhysicalMaterial({ color: color.clone().multiplyScalar(0.92), roughness: 0.8, sheen: 0.5, sheenRoughness: 0.8, side: THREE.DoubleSide });
    const zipMat = new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.5, metalness: 0.2 });
    const alu = new THREE.MeshStandardMaterial({ color: 0xc3cbd0, roughness: 0.35, metalness: 0.8 });
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.4, metalness: 0.6 });

    const r = d.runs[0].r;
    d.runs.forEach((run, idx) => {
      const g = tubeGeometry(d.shape, r, run.len, { vScale, seed: idx * 1.7 });
      const mesh = new THREE.Mesh(g, this.fabricMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const holder = new THREE.Group();
      holder.position.set(X(run.x0), run.zc, Z(run.y));
      holder.add(mesh);
      // koncová záslepka
      const cap = new THREE.Mesh(capGeometry(d.shape, r), this.fabricMat);
      cap.rotation.y = Math.PI / 2;
      cap.position.x = run.len;
      if (d.shape === 'H') cap.rotation.z = 0;
      holder.add(cap);
      // zipy mezi díly: začátek 150 mm, pak po max. 5,5 m
      const zips = [];
      const zipPos = [0.15];
      const parts = run.parts;
      const partLen = (run.len - 0.15) / parts;
      for (let k = 1; k < parts; k++) zipPos.push(0.15 + k * partLen);
      const zipGeo = d.shape === 'H' ? new THREE.TorusGeometry(r + 0.004, 0.011, 6, 40, Math.PI) : new THREE.TorusGeometry(r + 0.004, 0.011, 6, 56);
      for (const zx of zipPos) {
        const z = new THREE.Mesh(zipGeo, zipMat);
        z.rotation.y = Math.PI / 2;
        if (d.shape === 'H') z.rotation.x = Math.PI / 2;
        z.position.x = zx;
        z.userData.x = zx;
        z.visible = false;
        holder.add(z);
        zips.push(z);
      }
      // trysky (3D) – malé i velké textilní trysky
      let nozzles = null;
      const o = d.outlet;
      if (o.kind === 'holes' && o.key !== 'perforation') {
        const dn = o.holeSize / 1000;
        const ng = new THREE.CylinderGeometry(dn * 0.5, dn * 0.78, Math.max(0.03, dn * 0.9), 14, 1, true);
        ng.translate(0, Math.max(0.03, dn * 0.9) / 2, 0);
        const nm = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.8), roughness: 0.85, side: THREE.DoubleSide });
        const list = [];
        const pitch = o.pitch;
        for (const a of o.angles) {
          const count = Math.floor(run.len / pitch);
          for (let k = 0; k < count; k++) list.push({ x: (k + 0.5) * pitch, a });
        }
        nozzles = new THREE.InstancedMesh(ng, nm, Math.max(1, list.length));
        nozzles.count = list.length;
        nozzles.userData.list = list;
        nozzles.castShadow = false;
        holder.add(nozzles);
      }
      // závěsný systém
      const susp = new THREE.Group();
      const inst = d.install.no;
      const top = d.shape === 'H' ? 0 : r;
      if ([3, 5, 6, 8].includes(inst)) {
        const profs = inst === 6 || inst === 8 ? [-r * 0.55, r * 0.55] : [0];
        if (d.shape === 'H') profs.splice(0, profs.length, -r, r);
        for (const pz of profs) {
          const pr = new THREE.Mesh(new THREE.BoxGeometry(run.len + 0.1, 0.032, 0.03), alu);
          pr.position.set(run.len / 2, top + 0.018, pz);
          susp.add(pr);
          if (inst === 5 || inst === 6) {
            const hang = Math.max(0.02, inp.H - (run.zc + top + 0.035));
            const hg = new THREE.CylinderGeometry(0.004, 0.004, hang, 5);
            hg.translate(0, hang / 2, 0);
            const count = Math.ceil(run.len / 2) + 1;
            for (let k = 0; k < count; k++) {
              const h = new THREE.Mesh(hg, wireMat);
              h.position.set(Math.min(run.len, k * 2), top + 0.035, pz);
              susp.add(h);
            }
          }
        }
      } else {
        const wr = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, run.len + 1, 5), wireMat);
        wr.rotation.z = Math.PI / 2;
        wr.position.set(run.len / 2, top + 0.02, 0);
        susp.add(wr);
      }
      holder.add(susp);
      this.group.add(holder);
      this.runs.push({ run, mesh, geo: g, cap, zips, nozzles, holder, susp });
    });

    // rozvodná (transportní) větev
    if (d.header) {
      const h = d.header;
      const len = h.len;
      const g = tubeGeometry('C', h.Dm / 2, len, { seed: 9 });
      const mesh = new THREE.Mesh(g, hdrMat);
      mesh.castShadow = true;
      const holder = new THREE.Group();
      holder.position.set(X(h.x - h.Dm / 2 - 0.02), h.z, Z(h.y0 - 0.3));
      holder.rotation.y = -Math.PI / 2;
      holder.add(mesh);
      for (const end of [0, len]) {
        const cap = new THREE.Mesh(capGeometry('C', h.Dm / 2), hdrMat);
        cap.rotation.y = Math.PI / 2;
        cap.position.x = end;
        holder.add(cap);
      }
      this.group.add(holder);
      this.header = { mesh, geo: g, holder };
    }

    // VZT jednotka
    const a = d.ahu;
    const ahu = new THREE.Group();
    const w = a.w;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w * 1.7, w * 1.15, w * 1.25), new THREE.MeshStandardMaterial({ color: 0x46535b, roughness: 0.55, metalness: 0.35 }));
    body.castShadow = true;
    ahu.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 1.71, w * 0.08, w * 1.26), new THREE.MeshStandardMaterial({ color: 0x00a98e, emissive: 0x00a98e, emissiveIntensity: 0.6 }));
    stripe.position.y = w * 0.38;
    ahu.add(stripe);
    this.ahuStripe = stripe;
    // hrdlo z jednotky přes stěnu až k rozvodné větvi / začátku vyústky
    const spD = d.header ? d.header.Dm : d.runs[0].Dm;
    const target = d.header ? d.header.x - d.header.Dm : d.runs[0].x0;
    const outside = 0.9;
    const spigotLen = outside + Math.max(0.1, target);
    const spigot = new THREE.Mesh(new THREE.CylinderGeometry(spD * 0.5, spD * 0.5, spigotLen, 28), new THREE.MeshStandardMaterial({ color: 0xaab4ba, roughness: 0.35, metalness: 0.8 }));
    spigot.rotation.z = Math.PI / 2;
    spigot.position.x = w * 0.85 + spigotLen / 2;
    ahu.add(spigot);
    ahu.position.set(X(0) - outside - w * 0.85, a.z, Z(a.y));
    this.group.add(ahu);
    this.ahu = ahu;

    this.applyInflation(0);
  }

  /** Spustí animaci „zapnutí ventilátoru“. */
  start(duration) {
    const L = this.design.runs[0].len;
    this.anim = { t: 0, running: true, dur: duration ?? Math.min(4.2, 1.6 + L / 30) };
  }

  setInflated() {
    this.anim = { t: 1, running: false, dur: 1 };
    this.applyInflation(1);
  }

  /** Délka již nafouknuté části vyústky od začátku (m). */
  inflatedLength() {
    const T = this.anim.t;
    const hdrPhase = this.header ? 0.18 : 0.06;
    const tt = Math.max(0, (T - hdrPhase) / (1 - hdrPhase));
    const len = this.design.runs[0].len;
    return Math.max(0, Math.min(len, tt * (len + 3.5) - 0.9 * 3.5));
  }

  /** Lokální míra nafouknutí 0–1 v místě x (m od začátku vyústky). */
  inflationAt(x) {
    const T = this.anim.t;
    const hdrPhase = this.header ? 0.18 : 0.06;
    const tt = Math.max(0, (T - hdrPhase) / (1 - hdrPhase));
    const wave = 3.5;
    const len = this.design.runs[0].len;
    return Math.min(1, Math.max(0, (tt * (len + wave) - x) / wave));
  }

  update(dt) {
    if (!this.anim.running) return false;
    this.anim.t = Math.min(1, this.anim.t + dt / this.anim.dur);
    this.applyInflation(this.anim.t);
    if (this.anim.t >= 1) this.anim.running = false;
    return true;
  }

  applyInflation(T) {
    const hdrPhase = this.header ? 0.18 : 0.06;
    if (this.header) {
      const e = easeOutBack(Math.min(1, T / hdrPhase));
      morph(this.header.geo, () => e);
    }
    const tt = Math.max(0, (T - hdrPhase) / (1 - hdrPhase));
    const wave = 3.5;
    for (const R of this.runs) {
      const len = R.run.len;
      const fn = (x) => easeOutBack(Math.min(1, Math.max(0, (tt * (len + wave) - x) / wave)));
      morph(R.geo, fn);
      const capE = fn(len);
      R.cap.scale.setScalar(Math.max(0.05, Math.min(1.1, capE)));
      R.cap.position.y = (1 - Math.min(1, capE)) * -R.run.r * 1.2;
      for (const z of R.zips) z.visible = fn(z.userData.x) > 0.96;
      if (R.nozzles) {
        const list = R.nozzles.userData.list;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const r = R.run.r;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          const e = fn(it.x);
          const s = e > 0.9 ? Math.min(1, (e - 0.9) * 10) : 0.0001;
          const a = (it.a * Math.PI) / 180;
          const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
          q.setFromUnitVectors(up, dir);
          m.compose(new THREE.Vector3(it.x, dir.y * r * 0.985, dir.z * r * 0.985), q, new THREE.Vector3(s, s, s));
          R.nozzles.setMatrixAt(i, m);
        }
        R.nozzles.instanceMatrix.needsUpdate = true;
      }
    }
    if (this.ahuStripe) this.ahuStripe.material.emissiveIntensity = 0.4 + 0.8 * Math.max(0, Math.sin(Math.min(1, T * 3) * Math.PI));
  }

  setArt(image) {
    this.artImage = image;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }
}

function morph(g, fn) {
  const { inf, def, along } = g.userData;
  const pos = g.attributes.position.array;
  let lastX = -1;
  let e = 0;
  for (let k = 0; k < along.length; k++) {
    const x = along[k];
    if (x !== lastX) {
      e = fn(x);
      lastX = x;
    }
    const i = k * 3;
    pos[i] = inf[i];
    pos[i + 1] = def[i + 1] + (inf[i + 1] - def[i + 1]) * e;
    pos[i + 2] = def[i + 2] + (inf[i + 2] - def[i + 2]) * e;
  }
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
}

// ---------------------------------------------------------------------------
// Klasický rozvod pro srovnání: plechové spiro potrubí + vyústky

export function buildSteel(design, conv) {
  const inp = design.inp;
  const X = (x) => x - inp.L / 2;
  const Z = (y) => y - inp.W / 2;
  const group = new THREE.Group();
  group.name = 'steel';
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c2c8, roughness: 0.32, metalness: 0.88 });
  const seamTex = spiralTexture();
  steel.map = seamTex;
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.6, metalness: 0.5 });
  const r = design.runs[0].r;
  for (const run of design.runs) {
    const g = new THREE.CylinderGeometry(r, r, run.len, 40, 1, false);
    const m = new THREE.Mesh(g, steel);
    m.rotation.z = Math.PI / 2;
    m.position.set(X(run.x0 + run.len / 2), run.zc, Z(run.y));
    m.castShadow = true;
    group.add(m);
    const hangers = new THREE.CylinderGeometry(0.006, 0.006, Math.max(0.05, inp.H - run.zc - r), 5);
    for (let x = run.x0; x <= run.x1; x += 3) {
      const h = new THREE.Mesh(hangers, grilleMat);
      h.position.set(X(x), run.zc + r + (inp.H - run.zc - r) / 2, Z(run.y));
      group.add(h);
    }
  }
  if (design.header) {
    const h = design.header;
    const g = new THREE.CylinderGeometry(h.Dm / 2, h.Dm / 2, h.len, 32);
    const m = new THREE.Mesh(g, steel);
    m.rotation.x = Math.PI / 2;
    m.position.set(X(h.x - h.Dm / 2 - 0.02), h.z, Z((h.y0 + h.y1) / 2));
    m.castShadow = true;
    group.add(m);
  }
  const gs = conv.grilleSize / 1000;
  const gGeo = new THREE.BoxGeometry(gs, gs * 0.6, 0.05);
  const lam = new THREE.MeshStandardMaterial({ color: 0x5b666e, roughness: 0.4, metalness: 0.7 });
  for (const gr of conv.grilles) {
    const m = new THREE.Mesh(gGeo, lam);
    const a = (gr.ang * Math.PI) / 180;
    const dy = Math.sin(a);
    const dz = Math.cos(a);
    m.position.set(X(gr.x), design.runs[0].zc + dz * (r + 0.03), Z(gr.y) + dy * (r + 0.03));
    m.lookAt(m.position.x, m.position.y + dz, m.position.z + dy);
    group.add(m);
  }
  return group;
}

function spiralTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e8ecef';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(60,70,78,0.35)';
  g.lineWidth = 3;
  for (let i = -256; i < 512; i += 42) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 90, 256);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 18);
  return t;
}
