// Procedurální textury (bez externích souborů) – podlahy, tkanina s perforací.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
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

function noise(ctx, w, h, amount, seed = 7, alpha = 0.06) {
  const r = rng(seed);
  for (let i = 0; i < amount; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = 0.6 + r() * 2.2;
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`;
    ctx.fillRect(x, y, s, s);
  }
}

/**
 * Textura podlahy celé haly (L × W m) – jedna textura bez opakování (kvůli čárám hřiště apod.).
 */
export function floorTexture(type, L, W) {
  const ppm = Math.min(48, 2600 / Math.max(L, W)); // px na metr
  const w = Math.round(L * ppm);
  const h = Math.round(W * ppm);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const m = (v) => v * ppm;
  switch (type) {
    case 'sports': {
      g.fillStyle = '#a8703f';
      g.fillRect(0, 0, w, h);
      // parkety
      const r = rng(3);
      for (let x = 0; x < w; x += m(0.09)) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,220,180' : '60,30,10'},${0.05 + r() * 0.06})`;
        g.fillRect(x, 0, m(0.085), h);
      }
      noise(g, w, h, w * h * 0.004, 5, 0.08);
      // hřiště (basketbal / volejbal)
      const cw = Math.min(W - 2, 15);
      const cl = Math.min(L - 3, 28);
      const x0 = (w - m(cl)) / 2;
      const y0 = (h - m(cw)) / 2;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = Math.max(2, m(0.06));
      g.strokeRect(x0, y0, m(cl), m(cw));
      g.beginPath();
      g.moveTo(w / 2, y0);
      g.lineTo(w / 2, y0 + m(cw));
      g.stroke();
      g.beginPath();
      g.arc(w / 2, h / 2, m(1.8), 0, Math.PI * 2);
      g.stroke();
      for (const sx of [x0, x0 + m(cl)]) {
        const dir = sx === x0 ? 1 : -1;
        g.beginPath();
        g.arc(sx, h / 2, m(6.75), -Math.PI / 2, Math.PI / 2, dir < 0);
        g.stroke();
        g.fillStyle = 'rgba(40,90,160,0.55)';
        g.fillRect(dir > 0 ? sx : sx - m(5.8), h / 2 - m(2.45), m(5.8), m(4.9));
        g.strokeRect(dir > 0 ? sx : sx - m(5.8), h / 2 - m(2.45), m(5.8), m(4.9));
      }
      g.strokeStyle = 'rgba(245,190,60,0.8)';
      g.lineWidth = Math.max(1.5, m(0.05));
      g.strokeRect(x0 + m(cl / 2 - 9), y0 + m(cw / 2 - 4.5), m(18), m(9));
      break;
    }
    case 'pool': {
      g.fillStyle = '#c9d6db';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(80,110,125,0.25)';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += m(0.3)) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += m(0.3)) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      noise(g, w, h, w * h * 0.002, 9, 0.05);
      break;
    }
    case 'tiles': {
      g.fillStyle = '#b9bfc2';
      g.fillRect(0, 0, w, h);
      const r = rng(11);
      for (let x = 0; x < w; x += m(0.6)) {
        for (let y = 0; y < h; y += m(0.6)) {
          g.fillStyle = `rgba(255,255,255,${r() * 0.07})`;
          g.fillRect(x, y, m(0.6), m(0.6));
        }
      }
      g.strokeStyle = 'rgba(60,70,75,0.28)';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += m(0.6)) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += m(0.6)) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      break;
    }
    case 'carpet': {
      g.fillStyle = '#3b4650';
      g.fillRect(0, 0, w, h);
      noise(g, w, h, w * h * 0.03, 13, 0.1);
      g.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let x = 0; x < w; x += m(0.5)) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      break;
    }
    case 'epoxy': {
      g.fillStyle = '#8f9d99';
      g.fillRect(0, 0, w, h);
      noise(g, w, h, w * h * 0.01, 17, 0.06);
      // žluté značení komunikací
      g.strokeStyle = 'rgba(240,190,40,0.85)';
      g.lineWidth = Math.max(2, m(0.1));
      g.strokeRect(m(1.2), m(1.2), w - m(2.4), h - m(2.4));
      g.setLineDash([m(0.8), m(0.5)]);
      g.beginPath();
      g.moveTo(m(1.2), h / 2);
      g.lineTo(w - m(1.2), h / 2);
      g.stroke();
      g.setLineDash([]);
      break;
    }
    default: {
      // beton
      g.fillStyle = '#858b8e';
      g.fillRect(0, 0, w, h);
      noise(g, w, h, w * h * 0.012, 19, 0.07);
      const r = rng(23);
      for (let i = 0; i < 18; i++) {
        const grd = g.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, m(1 + r() * 3));
        grd.addColorStop(0, 'rgba(40,40,40,0.08)');
        grd.addColorStop(1, 'rgba(40,40,40,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      }
      g.strokeStyle = 'rgba(40,44,46,0.35)';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += m(6)) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += m(6)) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      g.strokeStyle = 'rgba(240,190,40,0.7)';
      g.lineWidth = Math.max(2, m(0.1));
      g.strokeRect(m(1), m(1), w - m(2), h - m(2));
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Textura povrchu vyústky: u = obvod (0 = nahoře, po směru hodin), v = 1 m délky (opakuje se).
 * Kreslí se ve stupních šedi – barvu dává materiál (násobení).
 */
export function fabricTexture(design) {
  const D = design.runs[0].Dm;
  const shape = design.shape;
  const perim = shape === 'H' ? (Math.PI * D) / 2 : Math.PI * D;
  const W = 1024;
  const ppm = W / perim;
  const H = Math.max(128, Math.min(2048, Math.round(ppm)));
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  // jemná vazba tkaniny
  g.globalAlpha = 0.05;
  g.fillStyle = '#000';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H);
  g.globalAlpha = 1;
  // podélný šev s pásem pro zavěšení (nahoře)
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(0, 0, 4, H);
  g.fillRect(W - 4, 0, 4, H);

  const o = design.outlet;
  const angToU = (a) => {
    if (shape === 'H') return (a - 90) / 180; // spodní půlkruh 90° … 270°
    return a / 360;
  };
  if (o.kind === 'holes' && o.key === 'perforation') {
    const rpx = Math.max(1.2, ((o.holeSize / 1000) * ppm) / 2);
    const pitchPx = o.pitch * ppm;
    for (const a of o.angles) {
      const u = angToU(a) * W;
      g.fillStyle = 'rgba(20,28,32,0.55)';
      if (pitchPx < 1.2) {
        g.fillRect(u - rpx, 0, rpx * 2, H);
        continue;
      }
      const n = Math.max(1, Math.round(H / pitchPx));
      const step = H / n;
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.arc(u, (i + 0.5) * step, rpx, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (o.kind === 'band') {
    const bandDeg = (o.fan * 180) / Math.PI;
    const r = rng(29);
    for (const a of o.angles) {
      const u0 = angToU(a - bandDeg / 2) * W;
      const u1 = angToU(a + bandDeg / 2) * W;
      const grd = g.createLinearGradient(u0, 0, u1, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.2, 'rgba(0,0,0,0.09)');
      grd.addColorStop(0.8, 'rgba(0,0,0,0.09)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(Math.min(u0, u1), 0, Math.abs(u1 - u0), H);
      // mikrootvory – jemné tečkování
      g.fillStyle = 'rgba(0,0,0,0.22)';
      const cnt = Math.abs(u1 - u0) * H * 0.02;
      for (let i = 0; i < cnt; i++) g.fillRect(Math.min(u0, u1) + r() * Math.abs(u1 - u0), r() * H, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Textura Prihoda ART – opakovaný motiv (logo/obrázek) na povrchu vyústky. */
export function artTexture(image, baseHex, design) {
  const D = design.runs[0].Dm;
  const perim = design.shape === 'H' ? (Math.PI * D) / 2 : Math.PI * D;
  const W = 1024;
  const H = Math.max(256, Math.min(2048, Math.round((W / perim) * 2))); // 2 m motivu
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = baseHex || '#ffffff';
  g.fillRect(0, 0, W, H);
  // motiv na bocích vyústky (3 h a 9 h), orientovaný podél délky vyústky
  const ar = image.width / image.height;
  let lengthPx = H * 0.7;
  let circPx = lengthPx / ar;
  if (circPx > W * 0.3) {
    circPx = W * 0.3;
    lengthPx = circPx * ar;
  }
  for (const u of [0.25, 0.75]) {
    g.save();
    g.translate(u * W, H / 2);
    g.rotate(u < 0.5 ? -Math.PI / 2 : Math.PI / 2);
    g.drawImage(image, -lengthPx / 2, -circPx / 2, lengthPx, circPx);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.userData.metersPerRepeat = 2;
  return tex;
}

/** Jemná mřížka pro okolní terén. */
export function groundTexture() {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#0c141a';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(120,170,190,0.10)';
  g.lineWidth = 1;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath();
    g.moveTo(i + 0.5, 0);
    g.lineTo(i + 0.5, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i + 0.5);
    g.lineTo(512, i + 0.5);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
