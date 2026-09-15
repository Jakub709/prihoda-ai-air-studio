// Hlavní 3D scéna: digitální dvojče haly s tkaninovým rozvodem, prouděním a mapami komfortu.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildHall } from './hall.js';
import { DuctSystem, buildSteel } from './ducts.js';
import { FabricFlow, GrilleFlow } from './particles.js';
import { HeatSlice, SectionSlice } from './heatmap.js';
import { draughtRate } from '../engine/physics.js';

const L_SHARED = 0;
const L_FABRIC = 1;
const L_STEEL = 2;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function setLayer(obj, layer) {
  obj.traverse((o) => o.layers.set(layer));
}

export class Viz3D {
  constructor(container, labelsEl) {
    this.container = container;
    this.labelsEl = labelsEl;
    this.mode = 'design';
    this.layers = { particles: true, heat: 'none', people: true, section: false, color: 'temp' };
    this.active = true;
    this.listeners = {};

    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false; // scéna je statická – stíny jen při změně
    this.shadowDirty = true;
    r.setClearColor(0x000000, 0);
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a1219, 80, 400);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.38;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 3000);
    this.camera.layers.enableAll();
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.flight = null;
      this.emit('usercamera');
    });

    const hemi = new THREE.HemisphereLight(0xe6f1fb, 0x1b242a, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0x9cc9ff, 0.35);
    fill.position.set(40, 30, -60);
    this.scene.add(fill);
    for (const l of [hemi, sun, fill]) l.layers.enableAll();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.timer = new THREE.Timer();
    this.fpsAcc = { t: 0, n: 0, fps: 60 };

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    r.domElement.addEventListener('pointermove', (e) => this.onPointer(e));
    r.domElement.addEventListener('pointerleave', () => this.emit('probe', null));
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }
  emit(ev, data) {
    for (const fn of this.listeners[ev] || []) fn(data);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.w = w;
    this.h = h;
    this.updateAspect();
    const pr = this.renderer.getPixelRatio();
    for (const f of [this.flow, this.gflow]) if (f) f.s.setResolution(this.mode === 'compare' ? (w / 2) * pr : w * pr, h * pr);
  }

  updateAspect() {
    const w = this.mode === 'compare' ? this.w / 2 : this.w;
    this.camera.aspect = w / this.h;
    this.camera.updateProjectionMatrix();
  }

  setActive(a) {
    this.active = a;
    if (a) this.resize();
  }

  // ------------------------------------------------------------------ návrh
  setDesign(design, { animate = true, keepCamera = false, artImage = null } = {}) {
    const inp = design.inp;
    const hallKey = `${inp.appKey}|${inp.L}|${inp.W}|${inp.H}|${inp.oz}`;
    const firstTime = !this.design;
    this.design = design;
    if (hallKey !== this.hallKey) {
      if (this.hall) {
        this.scene.remove(this.hall.group);
        disposeTree(this.hall.group);
      }
      this.hall = buildHall(inp);
      setLayer(this.hall.group, L_SHARED);
      this.scene.add(this.hall.group);
      this.hallKey = hallKey;
      this.fitShadow(inp);
      this.scene.fog.near = Math.max(inp.L, inp.W) * 1.6;
      this.scene.fog.far = Math.max(inp.L, inp.W) * 6;
      if (!keepCamera || firstTime) this.setCamera('overview', firstTime ? 0 : 1.2);
    }
    // tkaninový rozvod
    if (this.ducts) {
      this.scene.remove(this.ducts.group);
      this.ducts.dispose();
    }
    this.ducts = new DuctSystem(design, { artImage: artImage || this.artImage });
    setLayer(this.ducts.group, L_FABRIC);
    this.scene.add(this.ducts.group);
    if (animate) this.ducts.start();
    else this.ducts.setInflated();
    // plechový rozvod (srovnání)
    if (this.steel) {
      this.scene.remove(this.steel);
      disposeTree(this.steel);
    }
    this.steel = buildSteel(design, design.conventional);
    setLayer(this.steel, L_STEEL);
    this.scene.add(this.steel);
    // částice
    for (const f of [this.flow, this.gflow]) {
      if (f) {
        this.scene.remove(f.s.mesh);
        f.s.dispose();
      }
    }
    const count = Math.round(Math.min(28000, Math.max(11000, inp.L * inp.W * 20)));
    this.flow = new FabricFlow(design, this.ducts, count);
    this.flow.colorMode = this.layers.color;
    this.flow.s.mesh.layers.set(L_FABRIC);
    this.scene.add(this.flow.s.mesh);
    this.gflow = new GrilleFlow(design, design.conventional, Math.round(count * 0.8));
    this.gflow.colorMode = this.layers.color;
    this.gflow.s.mesh.layers.set(L_STEEL);
    this.scene.add(this.gflow.s.mesh);
    this.resize();
    // mapy pobytové zóny
    for (const hs of [this.heatP, this.heatC, this.sectionSlice]) {
      if (hs) {
        this.scene.remove(hs.mesh);
        hs.dispose();
      }
    }
    this.heatP = new HeatSlice(inp);
    this.heatP.mesh.layers.set(L_FABRIC);
    this.heatC = new HeatSlice(inp);
    this.heatC.mesh.layers.set(L_STEEL);
    this.scene.add(this.heatP.mesh, this.heatC.mesh);
    this.sectionSlice = new SectionSlice(inp);
    this.sectionSlice.mesh.layers.set(L_FABRIC);
    this.sectionSlice.set(design.section, 0.8);
    this.scene.add(this.sectionSlice.mesh);
    this.applyLayers();
    this.buildLabels();
    this.colorPeople();
    this.shadowDirty = true;
  }

  setArt(image) {
    this.artImage = image;
    if (this.design) this.setDesign(this.design, { animate: false, keepCamera: true, artImage: image });
  }

  replayInflation() {
    if (this.ducts) this.ducts.start();
  }

  fitShadow(inp) {
    const s = this.sun;
    const R = Math.max(inp.L, inp.W) * 0.62 + 4;
    s.position.set(-inp.L * 0.35, inp.H + R * 1.2, inp.W * 0.55);
    s.target.position.set(0, 0, 0);
    const c = s.shadow.camera;
    c.left = -R;
    c.right = R;
    c.top = R;
    c.bottom = -R;
    c.near = 1;
    c.far = R * 4 + inp.H * 3;
    c.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ vrstvy
  setLayers(patch) {
    Object.assign(this.layers, patch);
    this.applyLayers();
  }

  applyLayers() {
    if (!this.design) return;
    const L = this.layers;
    const d = this.design;
    this.flow.s.mesh.visible = L.particles;
    this.gflow.s.mesh.visible = L.particles && this.mode === 'compare';
    this.flow.colorMode = this.gflow.colorMode = L.color;
    const heatOn = L.heat !== 'none';
    this.heatP.mesh.visible = heatOn;
    this.heatC.mesh.visible = heatOn && this.mode === 'compare';
    if (heatOn) {
      const limits = { v: d.inp.vAllow, dr: d.inp.drLimit };
      this.heatP.set(d.ozMap, L.heat, limits);
      this.heatC.set(d.conventional.ozMap, L.heat, limits);
    }
    this.sectionSlice.mesh.visible = L.section && this.mode !== 'compare';
    this.steel.visible = this.mode === 'compare';
    if (this.hall) this.hall.people && (this.hall.group.getObjectByName('people').visible = L.people);
    this.colorPeople();
  }

  setMode(mode) {
    const prev = this.mode;
    this.mode = mode;
    if (this.design && mode !== prev) this.setCamera(mode === 'compare' ? 'compare' : 'overview', 1.0);
    this.updateAspect();
    this.resize();
    this.applyLayers();
    this.labelsEl.style.display = mode === 'compare' ? 'none' : '';
  }

  /** Obarvení postav podle rizika průvanu v jejich místě. */
  colorPeople() {
    if (!this.hall || !this.design) return;
    const { people, bodies } = this.hall;
    const d = this.design;
    const map = d.ozMap;
    const lim = d.inp.drLimit;
    const heating = d.inp.mode === 'heating';
    const c = new THREE.Color();
    people.forEach((p, i) => {
      if (!this.layers.people) {
        c.set(0x9db3c2);
      } else if (heating) {
        // teplý vzduch: hodnotí se rychlost v místě
        const v = sampleMap(map, map.u, p.x, p.y);
        c.set(v <= d.inp.heatVLimit ? 0x2fbf8f : v <= d.inp.heatVLimit + 0.1 ? 0xf2b134 : 0xe0514f);
      } else {
        const dr = sampleMap(map, map.dr, p.x, p.y);
        c.set(dr <= lim ? 0x2fbf8f : dr <= lim + 8 ? 0xf2b134 : 0xe0514f);
      }
      bodies.setColorAt(i, c);
    });
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ popisky
  buildLabels() {
    const d = this.design;
    const inp = d.inp;
    this.labelsEl.innerHTML = '';
    this.labels = [];
    const add = (html, cls, x, y, z) => {
      const el = document.createElement('div');
      el.className = `label3d ${cls || ''}`;
      el.innerHTML = html;
      this.labelsEl.appendChild(el);
      this.labels.push({ el, p: new THREE.Vector3(x - inp.L / 2, z, y - inp.W / 2) });
    };
    const nf = (v, dg = 0) => v.toLocaleString('cs-CZ', { maximumFractionDigits: dg, minimumFractionDigits: dg });
    d.runs.forEach((run) => {
      if (d.runs.length > 6 && run.id % 2 === 0) return;
      add(`Větev ${run.id}<small>${d.shape === 'C' ? 'Ø' : 'H'}${run.D} · ${nf(run.flowM3h)} m³/h</small>`, '', run.x0 + run.len * 0.62, run.y, run.zc + run.r + 0.25);
    });
    add(`VZT jednotka<small>${nf(inp.flow)} m³/h</small>`, 'ahu', -0.9, d.ahu.y, d.ahu.z + d.ahu.w * 0.75);
    add(`${nf(inp.L, 1).replace(',0', '')} m`, 'dim', inp.L / 2, inp.W + 0.9, 0.05);
    add(`${nf(inp.W, 1).replace(',0', '')} m`, 'dim', inp.L + 0.9, inp.W / 2, 0.05);
    add(`${nf(inp.H, 1).replace(',0', '')} m`, 'dim', inp.L + 0.6, inp.W + 0.6, inp.H / 2);
  }

  updateLabels() {
    if (!this.labels || this.mode === 'compare') return;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      v.copy(l.p).project(this.camera);
      const vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      l.el.style.opacity = vis ? '1' : '0';
      if (vis) {
        l.el.style.left = `${((v.x + 1) / 2) * this.w}px`;
        l.el.style.top = `${((1 - v.y) / 2) * this.h}px`;
      }
    }
  }

  // ------------------------------------------------------------------ kamera
  presetView(name) {
    const inp = this.design?.inp ?? { L: 30, W: 18, H: 6 };
    const { L, W, H } = inp;
    const R = Math.max(L, W * 1.3);
    switch (name) {
      case 'top':
        return { pos: [0.001, R * 1.18 + H, 0.02], target: [0, 0, 0], fov: 40 };
      case 'section':
        return { pos: [L / 2 + Math.max(W, H * 2) * 2.6, H * 0.52, 0], target: [0, H * 0.46, 0], fov: 22 };
      case 'eye': {
        // stojící člověk mezi větvemi, pohled podél haly (vyústky nad hlavou po stranách)
        const ys = this.design?.runs.map((r) => r.y) ?? [W / 2];
        const yEye = ys.length > 1 ? (ys[0] + ys[1]) / 2 : Math.min(W - 1, ys[0] + W / 4);
        const zc = this.design?.geo.zc ?? H * 0.8;
        return { pos: [-L / 2 + Math.min(3.5, L * 0.12), 1.7, yEye - W / 2], target: [L * 0.2, Math.min(zc * 0.72, 1.7 + L * 0.08), yEye - W / 2 + W * 0.04], fov: 64 };
      }
      case 'side':
        return { pos: [0, H * 0.9, W / 2 + R * 0.9], target: [0, H * 0.4, 0], fov: 38 };
      case 'compare':
        // úzké poloviny obrazovky: pohled podél haly od přívodního čela
        return { pos: [-L / 2 - Math.max(6, W * 0.55), H + Math.max(L, W) * 0.42, W * 0.08], target: [L * 0.06, H * 0.1, 0], fov: 52 };
      default:
        return { pos: [-L * 0.5 - 3, H + R * 0.44, W * 0.62 + R * 0.27], target: [L * 0.04, H * 0.3, 0], fov: 38 };
    }
  }

  setCamera(name, dur = 1.2) {
    if (name === 'fly') {
      this.startFlight();
      return;
    }
    this.flight = null;
    const v = this.presetView(name);
    const to = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target), fov: v.fov };
    if (dur <= 0) {
      this.tween = null;
      this.camera.position.copy(to.pos);
      this.controls.target.copy(to.target);
      this.camera.fov = to.fov;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      return;
    }
    this.tween = {
      t: 0,
      dur,
      from: { pos: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov },
      to,
    };
  }

  startFlight() {
    const { L, W, H } = this.design.inp;
    const R = Math.max(L, W);
    const pts = [
      [-L * 0.62 - 4, H + R * 0.5, W * 0.9 + 6],
      [0, H + R * 0.35, W * 1.1 + 4],
      [L * 0.62 + 4, H + R * 0.4, W * 0.5],
      [L * 0.45, H * 0.72, 0],
      [0, H * 0.55, W * 0.18],
      [-L * 0.42, 1.7, W * 0.2],
      [-L * 0.62 - 4, H + R * 0.5, W * 0.9 + 6],
    ].map((p) => new THREE.Vector3(...p));
    const tgs = [
      [0, H * 0.3, 0],
      [0, H * 0.4, 0],
      [0, H * 0.45, 0],
      [-L * 0.2, H * 0.6, 0],
      [-L * 0.4, H * 0.7, -W * 0.1],
      [L * 0.3, H * 0.75, -W * 0.1],
      [0, H * 0.3, 0],
    ].map((p) => new THREE.Vector3(...p));
    this.flight = {
      t: 0,
      dur: 26,
      path: new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
      tpath: new THREE.CatmullRomCurve3(tgs, false, 'centripetal'),
    };
    this.camera.fov = 44;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ sonda
  onPointer(e) {
    if (!this.design) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    let px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let side = 'P';
    let w = rect.width;
    if (this.mode === 'compare') {
      w = rect.width / 2;
      if (px > w) {
        px -= w;
        side = 'C';
      }
    }
    this.pointer.set((px / w) * 2 - 1, -(py / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const inp = this.design.inp;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -inp.oz);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) {
      this.emit('probe', null);
      return;
    }
    const x = hit.x + inp.L / 2;
    const y = hit.z + inp.W / 2;
    if (x < 0 || y < 0 || x > inp.L || y > inp.W) {
      this.emit('probe', null);
      return;
    }
    const map = side === 'C' ? this.design.conventional.ozMap : this.design.ozMap;
    const v = sampleMap(map, map.u, x, y);
    const t = sampleMap(map, map.t, x, y);
    this.emit('probe', { x, y, v, t, dr: draughtRate(t, v, 40), side, clientX: e.clientX - rect.left, clientY: py });
  }

  // ------------------------------------------------------------------ smyčka
  loop() {
    requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    if (!this.active || !this.design) return;
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 1) {
      this.fpsAcc.fps = Math.round(this.fpsAcc.n / this.fpsAcc.t);
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
      this.emit('fps', this.fpsAcc.fps);
    }
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = easeInOut(tw.t);
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
      this.controls.target.lerpVectors(tw.from.target, tw.to.target, e);
      this.camera.fov = tw.from.fov + (tw.to.fov - tw.from.fov) * e;
      this.camera.updateProjectionMatrix();
      if (tw.t >= 1) this.tween = null;
    }
    if (this.flight) {
      const f = this.flight;
      f.t = (f.t + dt / f.dur) % 1;
      const e = f.t;
      f.path.getPoint(e, this.camera.position);
      f.tpath.getPoint(e, this.controls.target);
    }
    this.controls.update();
    if (this.ducts && this.ducts.update(dt)) this.shadowDirty = true;
    if (this.shadowDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    if (this.layers.particles) {
      this.flow.update(dt, true);
      if (this.mode === 'compare') this.gflow.update(dt, true);
    }
    this.fadeWalls(dt);
    // mapa pobytové zóny zeslábne, když je kamera v její výšce (pohled očima pracovníka)
    if (this.heatP && this.design) {
      const dz = Math.abs(this.camera.position.y - this.design.inp.oz);
      const k = Math.min(1, Math.max(0.12, (dz - 0.3) / 1.5));
      this.heatP.mat.uniforms.uOpacity.value = (this.heatP.kind === 'temp' ? 0.62 : 0.86) * k;
    }
    this.updateLabels();
    this.render();
  }

  fadeWalls(dt) {
    if (!this.hall) return;
    const cp = this.camera.position;
    const k = 1 - Math.exp(-dt * 8);
    for (const w of this.hall.walls) {
      const dx = cp.x - w.center.x;
      const dz = cp.z - w.center.z;
      const outside = dx * w.normalV.x + dz * w.normalV.z < 0;
      const target = outside ? 0.06 : 0.92;
      w.opacity += (target - w.opacity) * k;
      for (const m of w.mats) {
        m.opacity = w.opacity * (m.userData.baseOpacity ?? 1);
        m.depthWrite = w.opacity > 0.5;
      }
      w.group.visible = w.opacity > 0.02;
    }
  }

  render() {
    const r = this.renderer;
    if (this.mode === 'compare') {
      const pr = 1;
      const w = this.w;
      const h = this.h;
      r.setScissorTest(true);
      this.camera.layers.set(L_SHARED);
      this.camera.layers.enable(L_FABRIC);
      r.setViewport(0, 0, w / 2, h);
      r.setScissor(0, 0, w / 2, h);
      r.render(this.scene, this.camera);
      this.camera.layers.set(L_SHARED);
      this.camera.layers.enable(L_STEEL);
      r.setViewport(w / 2, 0, w / 2, h);
      r.setScissor(w / 2, 0, w / 2, h);
      r.render(this.scene, this.camera);
      r.setScissorTest(false);
      void pr;
    } else {
      this.camera.layers.set(L_SHARED);
      this.camera.layers.enable(L_FABRIC);
      r.setViewport(0, 0, this.w, this.h);
      r.render(this.scene, this.camera);
    }
  }

  /** Snímek aktuálního pohledu (pro nabídku). */
  snapshot(width = 1600, height = 900) {
    const r = this.renderer;
    const oldW = this.w;
    const oldH = this.h;
    const oldMode = this.mode;
    this.mode = 'design';
    r.setSize(width, height, false);
    this.w = width;
    this.h = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pr = r.getPixelRatio();
    this.flow.s.setResolution(width * pr, height * pr);
    this.render();
    const url = r.domElement.toDataURL('image/jpeg', 0.9);
    this.mode = oldMode;
    r.setSize(oldW, oldH, false);
    this.w = oldW;
    this.h = oldH;
    this.resize();
    return url;
  }
}

export function sampleMap(map, arr, x, y) {
  const fx = Math.min(map.nx - 1.001, Math.max(0, (x / map.L) * (map.nx - 1)));
  const fy = Math.min(map.ny - 1.001, Math.max(0, (y / map.W) * (map.ny - 1)));
  const i = fx | 0;
  const j = fy | 0;
  const wx = fx - i;
  const wy = fy - j;
  const k = j * map.nx + i;
  return (arr[k] * (1 - wx) + arr[k + 1] * wx) * (1 - wy) + (arr[k + map.nx] * (1 - wx) + arr[k + map.nx + 1] * wx) * wy;
}

function disposeTree(obj) {
  obj.traverse((o) => {
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
