// Budova a vybavení podle typu provozu (low-poly „architektonický model“).
// Souřadnice: svět X = x − L/2 (délka haly), Z = y − W/2 (šířka), Y = výška.
import * as THREE from 'three';
import { floorTexture, groundTexture } from './textures.js';

const MAT = {
  wall: () => new THREE.MeshStandardMaterial({ color: 0x7d8a92, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
  plinth: () => new THREE.MeshStandardMaterial({ color: 0x3c474e, roughness: 0.8, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  window: () => new THREE.MeshStandardMaterial({ color: 0x6f93a8, roughness: 0.2, metalness: 0.1, emissive: 0x1d3b4c, emissiveIntensity: 0.3, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  truss: () => new THREE.MeshStandardMaterial({ color: 0x8c979e, roughness: 0.5, metalness: 0.45 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0x9aa6ad, roughness: 0.45, metalness: 0.55 }),
  stainless: () => new THREE.MeshStandardMaterial({ color: 0xcfd6db, roughness: 0.28, metalness: 0.75 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x2e373e, roughness: 0.7 }),
  light: () => new THREE.MeshStandardMaterial({ color: 0xe3e7ea, roughness: 0.8 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x9a7552, roughness: 0.75 }),
  machine: () => new THREE.MeshStandardMaterial({ color: 0x3f6f8c, roughness: 0.55, metalness: 0.2 }),
  yellow: () => new THREE.MeshStandardMaterial({ color: 0xd8a434, roughness: 0.6 }),
  pallet: () => new THREE.MeshStandardMaterial({ color: 0xa88b62, roughness: 0.9 }),
  box: () => new THREE.MeshStandardMaterial({ color: 0xc2a27a, roughness: 0.9 }),
  rack: () => new THREE.MeshStandardMaterial({ color: 0x2f6aa3, roughness: 0.55, metalness: 0.3 }),
  rackBeam: () => new THREE.MeshStandardMaterial({ color: 0xe08a2a, roughness: 0.55, metalness: 0.2 }),
  water: () => new THREE.MeshPhysicalMaterial({ color: 0x2aa6c9, roughness: 0.08, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.78, clearcoat: 1 }),
  person: () => new THREE.MeshStandardMaterial({ color: 0x9db3c2, roughness: 0.65 }),
  screen: () => new THREE.MeshStandardMaterial({ color: 0x0f1a22, roughness: 0.3, emissive: 0x1d3b4d, emissiveIntensity: 0.6 }),
};

const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.translate(0, 0.5, 0); // počátek ve spodní ploše

function instBoxes(list, material, { cast = true, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(unitBox, material, Math.max(1, list.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  list.forEach((b, i) => {
    e.set(0, b.ry || 0, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(b.x, b.y ?? 0, b.z), q, new THREE.Vector3(b.sx, b.sy, b.sz));
    mesh.setMatrixAt(i, m);
  });
  mesh.count = list.length;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function buildHall(inp) {
  const { L, W, H } = inp;
  const group = new THREE.Group();
  group.name = 'hall';
  const X = (x) => x - L / 2;
  const Z = (y) => y - W / 2;

  // ---------- terén a podlaha ----------
  const gt = groundTexture();
  const gs = Math.max(L, W) * 7;
  gt.repeat.set(gs / 4, gs / 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  const floorType = inp.app.floor;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshStandardMaterial({ map: floorTexture(floorType, L, W), roughness: floorType === 'epoxy' || floorType === 'tiles' ? 0.45 : 0.85, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // ---------- stěny (automaticky se zprůhlední ty mezi kamerou a halou) ----------
  const walls = [];
  const wallDefs = [
    { name: 'N', w: L, pos: [0, H / 2, -W / 2], rotY: 0, normal: [0, 0, 1] },
    { name: 'S', w: L, pos: [0, H / 2, W / 2], rotY: Math.PI, normal: [0, 0, -1] },
    { name: 'W', w: W, pos: [-L / 2, H / 2, 0], rotY: Math.PI / 2, normal: [1, 0, 0] },
    { name: 'E', w: W, pos: [L / 2, H / 2, 0], rotY: -Math.PI / 2, normal: [-1, 0, 0] },
  ];
  for (const d of wallDefs) {
    const wg = new THREE.Group();
    wg.position.set(...d.pos);
    wg.rotation.y = d.rotY;
    const mats = [];
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(d.w, H), MAT.wall());
    wall.receiveShadow = true;
    mats.push(wall.material);
    wg.add(wall);
    const plinth = new THREE.Mesh(new THREE.PlaneGeometry(d.w, Math.min(0.35, H * 0.08)), MAT.plinth());
    plinth.position.set(0, -H / 2 + Math.min(0.35, H * 0.08) / 2, 0.01);
    mats.push(plinth.material);
    wg.add(plinth);
    if (H > 3.2 && d.w > 8) {
      // pás oken / světlíků
      const wh = Math.min(1.6, H * 0.18);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(d.w * 0.86, wh), MAT.window());
      win.position.set(0, H / 2 - wh / 2 - H * 0.12, 0.012);
      mats.push(win.material);
      wg.add(win);
    }
    group.add(wg);
    walls.push({ ...d, group: wg, mats, normalV: new THREE.Vector3(...d.normal), center: new THREE.Vector3(d.pos[0], 0, d.pos[2]), opacity: 1 });
  }

  // obrysové hrany budovy
  const e = [];
  const p = (x, y, z) => e.push(x, y, z);
  const hx = L / 2;
  const hz = W / 2;
  for (const y of [0, H]) {
    p(-hx, y, -hz); p(hx, y, -hz);
    p(hx, y, -hz); p(hx, y, hz);
    p(hx, y, hz); p(-hx, y, hz);
    p(-hx, y, hz); p(-hx, y, -hz);
  }
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) {
    p(x, 0, z);
    p(x, H, z);
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(e, 3));
  const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x7fd8c4, transparent: true, opacity: 0.35 }));
  group.add(edges);

  // ---------- nosná konstrukce ----------
  const beams = [];
  const cols = [];
  if (H >= 4.5) {
    const nT = Math.max(2, Math.round(L / 6));
    const sp = L / nT;
    const depth = Math.min(1.4, 0.35 + W * 0.03);
    for (let i = 0; i <= nT; i++) {
      const x = X(i * sp);
      beams.push({ x, y: H - 0.18, z: 0, sx: 0.16, sy: 0.18, sz: W });
      beams.push({ x, y: H - depth, z: 0, sx: 0.14, sy: 0.14, sz: W });
      const nd = Math.max(4, Math.round(W / 2.2));
      for (let k = 0; k <= nd; k++) {
        const z = -W / 2 + (k * W) / nd;
        beams.push({ x, y: H - depth, z, sx: 0.07, sy: depth - 0.18, sz: 0.07 });
        if (k < nd) {
          const len = Math.hypot(W / nd, depth - 0.18);
          const ang = Math.atan2(depth - 0.18, W / nd) * (k % 2 ? 1 : -1);
          const b = { x, y: H - depth + (depth - 0.18) / 2 - len / 2, z: z + W / nd / 2, sx: 0.05, sy: len, sz: 0.05, rx: ang };
          beams.push(b);
        }
      }
      if (W > 10) {
        cols.push({ x, y: 0, z: -W / 2 + 0.2, sx: 0.32, sy: H - depth, sz: 0.32 });
        cols.push({ x, y: 0, z: W / 2 - 0.2, sx: 0.32, sy: H - depth, sz: 0.32 });
      }
    }
    const nP = Math.max(3, Math.round(W / 3));
    for (let k = 0; k <= nP; k++) beams.push({ x: 0, y: H - 0.1, z: -W / 2 + (k * W) / nP, sx: L, sy: 0.1, sz: 0.1 });
    // šikmé diagonály vyžadují rotaci kolem X
    const trussMesh = instBoxesRot(beams, MAT.truss());
    trussMesh.castShadow = false;
    group.add(trussMesh);
    if (cols.length) group.add(instBoxes(cols, MAT.truss()));
  } else {
    // podhledový rastr kanceláře
    const g2 = [];
    for (let x = 0; x <= L; x += 1.2) g2.push(X(x), H - 0.01, -hz, X(x), H - 0.01, hz);
    for (let y = 0; y <= W; y += 1.2) g2.push(-hx, H - 0.01, Z(y), hx, H - 0.01, Z(y));
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(g2, 3));
    group.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xb8c7cf, transparent: true, opacity: 0.12 })));
  }

  // ---------- vybavení ----------
  const occupied = []; // obdélníky [x0,y0,x1,y1] v souřadnicích haly (pro rozmístění lidí)
  const props = buildProps(inp, X, Z, occupied);
  for (const m of props) group.add(m);

  // ---------- lidé ----------
  const people = placePeople(inp, occupied);
  const pg = new THREE.Group();
  pg.name = 'people';
  const bodyGeo = new THREE.CapsuleGeometry(0.19, 0.95, 4, 10);
  bodyGeo.translate(0, 0.19 + 0.475, 0);
  const headGeo = new THREE.SphereGeometry(0.12, 14, 10);
  headGeo.translate(0, 1.58, 0);
  const seated = inp.oz < 1.5;
  const bodyMat = MAT.person();
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, Math.max(1, people.length));
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xd9b89a, roughness: 0.6 }), Math.max(1, people.length));
  const mtx = new THREE.Matrix4();
  people.forEach((pp, i) => {
    const s = seated ? 0.78 : 1;
    mtx.compose(new THREE.Vector3(X(pp.x), 0, Z(pp.y)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pp.rot, 0)), new THREE.Vector3(1, s, 1));
    bodies.setMatrixAt(i, mtx);
    heads.setMatrixAt(i, mtx);
    bodies.setColorAt(i, new THREE.Color(0x9db3c2));
  });
  bodies.count = heads.count = people.length;
  bodies.castShadow = heads.castShadow = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  pg.add(bodies, heads);
  group.add(pg);

  return { group, walls, people, bodies, floor };
}

/** Instanced boxy s volitelnou rotací kolem X (diagonály příhradoviny). */
function instBoxesRot(list, material) {
  const mesh = new THREE.InstancedMesh(unitBox, material, Math.max(1, list.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  list.forEach((b, i) => {
    e.set(b.rx || 0, b.ry || 0, 0);
    q.setFromEuler(e);
    // otočení kolem středu (pro diagonály)
    if (b.rx) {
      const c = new THREE.Vector3(b.x, b.y + b.sy / 2, b.z);
      const off = new THREE.Vector3(0, -b.sy / 2, 0).applyQuaternion(q);
      m.compose(c.add(off), q, new THREE.Vector3(b.sx, b.sy, b.sz));
    } else {
      m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.sx, b.sy, b.sz));
    }
    mesh.setMatrixAt(i, m);
  });
  mesh.count = list.length;
  mesh.receiveShadow = true;
  return mesh;
}

function buildProps(inp, X, Z, occ) {
  const { L, W, H } = inp;
  const out = [];
  const r = rng(41);
  const add = (list, mat, opts) => {
    if (list.length) out.push(instBoxes(list, mat, opts));
  };
  const rect = (x0, y0, x1, y1) => occ.push([x0, y0, x1, y1]);
  switch (inp.app.props) {
    case 'food': {
      const lines = Math.max(1, Math.min(4, Math.floor(W / 5)));
      const tables = [];
      const ovens = [];
      const belts = [];
      for (let i = 0; i < lines; i++) {
        const y = (W * (i + 0.5)) / lines;
        const x0 = L * 0.18;
        const x1 = L * 0.82;
        tables.push({ x: X((x0 + x1) / 2), z: Z(y), sx: x1 - x0, sy: 0.88, sz: 1.1 });
        belts.push({ x: X((x0 + x1) / 2), y: 0.88, z: Z(y), sx: x1 - x0, sy: 0.05, sz: 0.8 });
        rect(x0, y - 0.7, x1, y + 0.7);
        for (let k = 0; k < 2; k++) {
          const ox = k === 0 ? x0 - 2.2 : x1 + 0.2;
          ovens.push({ x: X(ox + 1), z: Z(y), sx: 2, sy: 2.1, sz: 1.8 });
          rect(ox, y - 1, ox + 2, y + 1);
        }
      }
      add(tables, MAT.stainless());
      add(belts, MAT.dark());
      add(ovens, MAT.stainless());
      break;
    }
    case 'cold':
    case 'warehouse': {
      const tall = inp.app.props === 'warehouse' ? Math.min(H - 2.5, 8) : Math.min(H - 1.8, 3.2);
      const rows = [];
      const beams = [];
      const pallets = [];
      const pitch = inp.app.props === 'warehouse' ? 4.2 : 3.6;
      for (let y = 2.2; y < W - 1.5; y += pitch) {
        const x0 = 3;
        const x1 = L - 3;
        const bays = Math.floor((x1 - x0) / 2.7);
        for (let k = 0; k <= bays; k++) {
          const x = x0 + k * 2.7;
          rows.push({ x: X(x), z: Z(y - 0.5), sx: 0.1, sy: tall, sz: 0.1 });
          rows.push({ x: X(x), z: Z(y + 0.5), sx: 0.1, sy: tall, sz: 0.1 });
        }
        const levels = Math.max(2, Math.floor(tall / 1.7));
        for (let lv = 0; lv < levels; lv++) {
          const yy = 0.15 + lv * (tall / levels);
          beams.push({ x: X((x0 + x1) / 2), y: yy, z: Z(y - 0.5), sx: x1 - x0, sy: 0.12, sz: 0.08 });
          beams.push({ x: X((x0 + x1) / 2), y: yy, z: Z(y + 0.5), sx: x1 - x0, sy: 0.12, sz: 0.08 });
          for (let k = 0; k < bays; k++) {
            if (r() < 0.2) continue;
            pallets.push({ x: X(x0 + k * 2.7 + 1.35), y: yy + 0.12, z: Z(y), sx: 2.3, sy: Math.min(1.2, tall / levels - 0.3), sz: 0.95 });
          }
        }
        rect(x0, y - 0.6, x1, y + 0.6);
      }
      add(rows, MAT.rack());
      add(beams, MAT.rackBeam());
      add(pallets, MAT.box());
      break;
    }
    case 'sports': {
      const hoops = [];
      const boards = [];
      for (const x of [L / 2 - 14.5, L / 2 + 14.5]) {
        if (x < 1 || x > L - 1) continue;
        const dir = x < L / 2 ? -1 : 1;
        hoops.push({ x: X(x + dir * 1.2), z: Z(W / 2), sx: 0.25, sy: 3.3, sz: 0.25 });
        boards.push({ x: X(x + dir * 0.2), y: 2.9, z: Z(W / 2), sx: 0.06, sy: 1.05, sz: 1.8 });
      }
      add(hoops, MAT.dark());
      add(boards, MAT.light());
      const benches = [];
      for (let x = 4; x < L - 4; x += 6) benches.push({ x: X(x), z: Z(0.9), sx: 4, sy: 0.45, sz: 0.4 });
      add(benches, MAT.wood());
      break;
    }
    case 'pool': {
      const pl = Math.min(25, L - 4);
      const pw = Math.min(12.5, W - 4);
      const x0 = (L - pl) / 2;
      const y0 = (W - pw) / 2;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(pl, pw), MAT.water());
      water.rotation.x = -Math.PI / 2;
      water.position.set(X(L / 2), 0.03, Z(W / 2));
      water.receiveShadow = true;
      out.push(water);
      const rim = [];
      rim.push({ x: X(L / 2), z: Z(y0 - 0.15), sx: pl + 0.6, sy: 0.08, sz: 0.3 });
      rim.push({ x: X(L / 2), z: Z(y0 + pw + 0.15), sx: pl + 0.6, sy: 0.08, sz: 0.3 });
      rim.push({ x: X(x0 - 0.15), z: Z(W / 2), sx: 0.3, sy: 0.08, sz: pw });
      rim.push({ x: X(x0 + pl + 0.15), z: Z(W / 2), sx: 0.3, sy: 0.08, sz: pw });
      add(rim, MAT.light());
      const lanes = [];
      for (let k = 1; k < 5; k++) lanes.push({ x: X(L / 2), y: 0.035, z: Z(y0 + (k * pw) / 5), sx: pl, sy: 0.03, sz: 0.08 });
      add(lanes, MAT.yellow(), { cast: false });
      const chairs = [];
      for (let x = x0; x < x0 + pl; x += 2.2) chairs.push({ x: X(x), z: Z(y0 + pw + 1.3), sx: 1.8, sy: 0.35, sz: 0.65 });
      add(chairs, MAT.light());
      rect(x0, y0, x0 + pl, y0 + pw);
      break;
    }
    case 'industry': {
      const mach = [];
      const tops = [];
      for (let x = 5; x < L - 5; x += 8) {
        for (let y = 5; y < W - 4; y += 9) {
          const sx = 3 + r() * 2.5;
          const sz = 2 + r() * 1.5;
          const sy = 1.6 + r() * 1.4;
          mach.push({ x: X(x), z: Z(y), sx, sy, sz });
          tops.push({ x: X(x - sx * 0.2), y: sy, z: Z(y), sx: sx * 0.4, sy: 0.35, sz: sz * 0.6 });
          rect(x - sx / 2 - 0.6, y - sz / 2 - 0.6, x + sx / 2 + 0.6, y + sz / 2 + 0.6);
        }
      }
      add(mach, MAT.machine());
      add(tops, MAT.yellow());
      break;
    }
    case 'store': {
      const shelves = [];
      const goods = [];
      const colors = [0xd9534f, 0xf0ad4e, 0x5cb85c, 0x5bc0de, 0x9b59b6, 0xe67e22];
      for (let y = 4; y < W - 3; y += 3.2) {
        const x0 = L * 0.22;
        const x1 = L * 0.9;
        shelves.push({ x: X((x0 + x1) / 2), z: Z(y), sx: x1 - x0, sy: 1.9, sz: 0.9 });
        for (let x = x0 + 0.6; x < x1 - 0.5; x += 1.25) {
          goods.push({ x: X(x), y: 0.35 + Math.floor(r() * 3) * 0.5, z: Z(y - 0.47), sx: 1.1, sy: 0.3, sz: 0.04, c: colors[Math.floor(r() * colors.length)] });
          goods.push({ x: X(x), y: 0.35 + Math.floor(r() * 3) * 0.5, z: Z(y + 0.47), sx: 1.1, sy: 0.3, sz: 0.04, c: colors[Math.floor(r() * colors.length)] });
        }
        rect(x0, y - 0.6, x1, y + 0.6);
      }
      add(shelves, MAT.light());
      const gm = instBoxes(goods, new THREE.MeshStandardMaterial({ roughness: 0.7 }), { cast: false });
      goods.forEach((g, i) => gm.setColorAt(i, new THREE.Color(g.c)));
      if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
      out.push(gm);
      const tills = [];
      for (let y = 3; y < W - 2; y += 3.5) tills.push({ x: X(L * 0.1), z: Z(y), sx: 2.2, sy: 0.95, sz: 0.8 });
      add(tills, MAT.dark());
      break;
    }
    case 'office': {
      const desks = [];
      const screens = [];
      const chairs = [];
      for (let x = 2.5; x < L - 2; x += 3.6) {
        for (let y = 2.2; y < W - 1.8; y += 3.2) {
          desks.push({ x: X(x), z: Z(y), sx: 1.6, sy: 0.74, sz: 1.6 });
          screens.push({ x: X(x - 0.3), y: 0.74, z: Z(y - 0.45), sx: 0.55, sy: 0.36, sz: 0.04 });
          screens.push({ x: X(x + 0.3), y: 0.74, z: Z(y + 0.45), sx: 0.55, sy: 0.36, sz: 0.04 });
          chairs.push({ x: X(x - 0.3), z: Z(y - 1.05), sx: 0.5, sy: 0.9, sz: 0.5 });
          chairs.push({ x: X(x + 0.3), z: Z(y + 1.05), sx: 0.5, sy: 0.9, sz: 0.5 });
          rect(x - 0.9, y - 0.9, x + 0.9, y + 0.9);
        }
      }
      add(desks, MAT.light());
      add(screens, MAT.screen(), { cast: false });
      add(chairs, MAT.dark());
      break;
    }
    case 'kitchen': {
      const isl = [];
      const hoods = [];
      for (let y = 2.5; y < W - 2; y += 3.4) {
        isl.push({ x: X(L / 2), z: Z(y), sx: L * 0.55, sy: 0.9, sz: 1.2 });
        rect(L * 0.22, y - 0.8, L * 0.78, y + 0.8);
      }
      isl.push({ x: X(L / 2), z: Z(0.5), sx: L - 2, sy: 0.9, sz: 0.7 });
      add(isl, MAT.stainless());
      add(hoods, MAT.stainless());
      break;
    }
    case 'lab': {
      const benches = [];
      const hoods = [];
      for (let y = 2.5; y < W - 2; y += 3.5) {
        benches.push({ x: X(L / 2), z: Z(y), sx: L * 0.6, sy: 0.9, sz: 1.4 });
        rect(L * 0.2, y - 0.9, L * 0.8, y + 0.9);
      }
      for (let x = 2; x < L - 2; x += 3) hoods.push({ x: X(x), z: Z(0.55), sx: 1.5, sy: 2.3, sz: 0.9 });
      add(benches, MAT.light());
      add(hoods, MAT.stainless());
      break;
    }
    default:
      break;
  }
  return out;
}

function placePeople(inp, occ) {
  const { L, W } = inp;
  const r = rng(97);
  const n = Math.max(6, Math.min(34, Math.round((L * W) / 55)));
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < 3000) {
    const x = 1.2 + r() * (L - 2.4);
    const y = 1.2 + r() * (W - 2.4);
    if (occ.some(([a, b, c, d]) => x > a - 0.1 && x < c + 0.1 && y > b - 0.1 && y < d + 0.1)) {
      // u stolů a linek lidé stojí těsně vedle – posun
      continue;
    }
    if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < 1.6)) continue;
    pts.push({ x, y, rot: r() * Math.PI * 2 });
  }
  return pts;
}
