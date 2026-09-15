// Pohled „Řez & CFD“ – živá 2D simulace příčného řezu halou.
import CfdWorker from '../cfd/worker.js?worker&inline';
import { cfdConfig } from '../cfd/config.js';
import { RAMP_TEMP, RAMP_VELOCITY, rampBytes, rampCss } from '../viz/colormaps.js';
import { on, state } from '../state.js';
import { lineChart, SERIES } from './charts.js';
import { n0, n1, n2 } from './format.js';

export function mountCfdView(root) {
  root.innerHTML = `
    <div class="cfd-head">
      <h3>Živá CFD simulace · příčný řez halou</h3>
      <span class="meta" id="cfdMeta">připravuji…</span>
      <span class="sp"></span>
      <div class="seg" id="cfdField"><button data-v="speed" class="active">Rychlost</button><button data-v="temp">Teplota</button></div>
      <div class="seg" id="cfdAvg"><button data-v="0" class="active">Okamžitě</button><button data-v="1">Časový průměr</button></div>
      <div class="chipbar"><button class="chip active" id="cfdParticles">Stopovací částice</button></div>
      <select id="cfdSpeed" class="btn sm" title="Rychlost simulace"><option value="1">1×</option><option value="2" selected>2×</option><option value="4">4×</option></select>
      <button class="btn sm" id="cfdPlay">Pozastavit</button>
      <button class="btn sm" id="cfdReset">Restart</button>
    </div>
    <div class="cfd-stage" id="cfdStage">
      <canvas id="cfdCanvas"></canvas>
      <div class="vp-probe" id="cfdProbe" hidden></div>
    </div>
    <div class="cfd-foot">
      <div class="acard"><h3>Rychlost ve výšce pobytové zóny napříč halou</h3><p class="desc">Časově průměrovaná CFD vs. návrhový model · limit dle ISO 7730</p><div id="cfdChart"></div></div>
      <div class="acard"><h3>Stav simulace</h3><p class="desc">Navierovy–Stokesovy rovnice, Boussinesqův vztlak, turbulentní viskozita (Chen &amp; Xu), MacCormackova advekce, projekce tlaku (SOR). 2D řez je pro lineární vyústky oprávněný; řadu trysek ale nahrazuje souvislým zdrojem (konzervativní) a navíc zachycuje i studený spád u stěn, který integrální model nepočítá.</p><div class="cfd-stats" id="cfdStats"></div></div>
    </div>`;

  const canvas = root.querySelector('#cfdCanvas');
  const ctx = canvas.getContext('2d');
  const stage = root.querySelector('#cfdStage');
  const probe = root.querySelector('#cfdProbe');
  const trail = document.createElement('canvas');
  const tctx = trail.getContext('2d');
  const field = document.createElement('canvas');
  const fctx = field.getContext('2d');
  const rampV = rampBytes(RAMP_VELOCITY);
  const rampT = rampBytes(RAMP_TEMP);

  let worker = null;
  let meta = null; // {nx, ny, h, solid, outflow, inflow}
  let frame = null;
  let prof = null;
  let running = true;
  let mode = 'speed';
  let showParticles = true;
  let active = false;
  let designKey = '';
  let geom = null; // přepočet souřadnic
  let parts = null;
  let lastT = performance.now();
  let chartTimer = 0;
  let stepsPerSec = 0;
  let lastSteps = 0;
  let lastStepT = performance.now();
  let vmaxScale = 1;

  function start() {
    const d = state.design;
    if (!d) return;
    const key = JSON.stringify([d.inp.L, d.inp.W, d.inp.H, d.n, d.runs[0].D, d.outlet.key, d.outlet.pattern, d.outlet.p, d.outlet.holeSize, d.inp.ts, d.inp.tr, d.inp.flow]);
    if (key === designKey && worker) return;
    designKey = key;
    if (worker) worker.terminate();
    try {
      worker = new CfdWorker();
    } catch (e) {
      console.error(e);
      root.querySelector('#cfdMeta').textContent = 'CFD simulaci nelze spustit – prohlížeč blokuje Web Workery.';
      worker = null;
      return;
    }
    worker.onerror = (e) => {
      console.error('CFD worker', e);
      root.querySelector('#cfdMeta').textContent = 'CFD simulace selhala – zkuste Restart.';
    };
    meta = null;
    frame = null;
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') {
        meta = m;
        layout();
        initParticles();
      } else if (m.type === 'frame') {
        frame = m.frame;
        prof = { oz: m.prof, ank: m.ank };
        const now = performance.now();
        if (now - lastStepT > 1000) {
          stepsPerSec = ((frame.steps - lastSteps) * 1000) / (now - lastStepT);
          lastSteps = frame.steps;
          lastStepT = now;
        }
      }
    };
    const cfg = cfdConfig(d, 'prihoda');
    worker.postMessage({ type: 'init', cfg, run: active && running });
    worker.postMessage({ type: 'speed', speed: +root.querySelector('#cfdSpeed').value });
    // měřítko rychlostí podle návrhu
    vmaxScale = Math.max(0.5, Math.min(2.5, d.outlet.kind === 'band' ? 0.8 : 1.4));
    lastSteps = 0;
  }

  function layout() {
    const d = state.design;
    if (!d || !meta) return;
    const r = stage.getBoundingClientRect();
    const pad = { l: 46, r: 14, t: 14, b: 30 };
    const availW = Math.max(200, r.width - 24 - pad.l - pad.r);
    const availH = Math.max(120, r.height - 24 - pad.t - pad.b);
    const scale = Math.min(availW / d.inp.W, availH / d.inp.H);
    const w = Math.round(d.inp.W * scale);
    const h = Math.round(d.inp.H * scale);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round((w + pad.l + pad.r) * dpr);
    canvas.height = Math.round((h + pad.t + pad.b) * dpr);
    canvas.style.width = `${w + pad.l + pad.r}px`;
    canvas.style.height = `${h + pad.t + pad.b}px`;
    trail.width = Math.round(w * dpr);
    trail.height = Math.round(h * dpr);
    field.width = meta.nx;
    field.height = meta.ny;
    geom = { pad, w, h, scale, dpr, W: d.inp.W, H: d.inp.H };
  }

  function initParticles() {
    if (!meta) return;
    const n = 2400;
    parts = { x: new Float32Array(n), y: new Float32Array(n), px: new Float32Array(n), py: new Float32Array(n), age: new Float32Array(n), life: new Float32Array(n), n };
    for (let i = 0; i < n; i++) respawn(i, true);
  }

  function respawn(i, randomAge = false) {
    const { nx, ny, solid, inflow } = meta;
    let x;
    let y;
    // třetina částic startuje u výtoků (zviditelnění proudů)
    if (Math.random() < 0.35 && inflow.length) {
      const k = inflow[(Math.random() * inflow.length) | 0];
      x = (k % nx) + Math.random();
      y = Math.floor(k / nx) + Math.random();
    } else {
      for (let t = 0; t < 20; t++) {
        x = 1 + Math.random() * (nx - 2);
        y = 1 + Math.random() * (ny - 2);
        if (!solid[(y | 0) * nx + (x | 0)]) break;
      }
    }
    parts.x[i] = parts.px[i] = x;
    parts.y[i] = parts.py[i] = y;
    parts.life[i] = 3 + Math.random() * 5;
    parts.age[i] = randomAge ? Math.random() * parts.life[i] : 0;
  }

  function sampleUV(x, y) {
    const { nx, ny } = meta;
    let fx = x - 0.5;
    let fy = y - 0.5;
    fx = Math.max(0, Math.min(nx - 1.001, fx));
    fy = Math.max(0, Math.min(ny - 1.001, fy));
    const i = fx | 0;
    const j = fy | 0;
    const a = fx - i;
    const b = fy - j;
    const k = j * nx + i;
    const u = frame.u;
    const v = frame.v;
    return [
      (u[k] * (1 - a) + u[k + 1] * a) * (1 - b) + (u[k + nx] * (1 - a) + u[k + nx + 1] * a) * b,
      (v[k] * (1 - a) + v[k + 1] * a) * (1 - b) + (v[k + nx] * (1 - a) + v[k + nx + 1] * a) * b,
    ];
  }

  function draw() {
    requestAnimationFrame(draw);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (!active || !frame || !meta || !geom) return;
    const d = state.design;
    const { pad, w, h, dpr } = geom;
    const { nx, ny } = meta;
    // pole
    const img = fctx.createImageData(nx, ny);
    const data = img.data;
    const src = mode === 'speed' ? frame.speed : frame.T;
    const ramp = mode === 'speed' ? rampV : rampT;
    const span = mode === 'speed' ? vmaxScale : Math.max(1.5, Math.abs(d.inp.dT0) * 0.35);
    for (let j = 0; j < ny; j++) {
      const row = ny - 1 - j;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const o = (row * nx + i) * 4;
        if (meta.solid[k] && !meta.outflow[k]) {
          data[o] = 14;
          data[o + 1] = 22;
          data[o + 2] = 30;
          data[o + 3] = 255;
          continue;
        }
        let t = mode === 'speed' ? Math.min(1, src[k] / span) : 0.5 + (0.5 * src[k]) / span;
        t = Math.max(0, Math.min(1, t));
        const q = ((t * 255) | 0) * 4;
        data[o] = ramp[q];
        data[o + 1] = ramp[q + 1];
        data[o + 2] = ramp[q + 2];
        data[o + 3] = 255;
      }
    }
    fctx.putImageData(img, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(field, pad.l, pad.t, w, h);

    // stopovací částice
    if (showParticles && parts) {
      const cell = w / nx;
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.globalCompositeOperation = 'destination-out';
      tctx.fillStyle = 'rgba(0,0,0,0.16)';
      tctx.fillRect(0, 0, trail.width, trail.height);
      tctx.globalCompositeOperation = 'source-over';
      tctx.strokeStyle = 'rgba(255,255,255,0.75)';
      tctx.lineWidth = 1.1 * dpr;
      tctx.beginPath();
      const simSpeed = 1.6;
      for (let i = 0; i < parts.n; i++) {
        const [u, v] = sampleUV(parts.x[i], parts.y[i]);
        parts.px[i] = parts.x[i];
        parts.py[i] = parts.y[i];
        parts.x[i] += (u * dt * simSpeed) / meta.h;
        parts.y[i] += (v * dt * simSpeed) / meta.h;
        parts.age[i] += dt;
        const xi = parts.x[i] | 0;
        const yi = parts.y[i] | 0;
        if (parts.age[i] > parts.life[i] || xi < 1 || yi < 1 || xi >= nx - 1 || yi >= ny - 1 || meta.solid[yi * nx + xi]) {
          respawn(i);
          continue;
        }
        const x0 = parts.px[i] * cell * dpr;
        const y0 = (ny - parts.py[i]) * cell * dpr;
        const x1 = parts.x[i] * cell * dpr;
        const y1 = (ny - parts.y[i]) * cell * dpr;
        tctx.moveTo(x0, y0);
        tctx.lineTo(x1, y1);
      }
      tctx.stroke();
      ctx.drawImage(trail, pad.l, pad.t, w, h);
    }

    // geometrie a popisky
    const X = (y) => pad.l + (y / d.inp.W) * w;
    const Y = (z) => pad.t + h - (z / d.inp.H) * h;
    ctx.strokeStyle = 'rgba(150,200,225,0.55)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(pad.l, pad.t, w, h);
    // pobytová zóna
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(250,178,25,0.9)';
    ctx.beginPath();
    ctx.moveTo(X(0), Y(d.inp.oz));
    ctx.lineTo(X(d.inp.W), Y(d.inp.oz));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(250,178,25,0.95)';
    ctx.font = '600 11px InterVar, Segoe UI, sans-serif';
    ctx.fillText(`pobytová zóna ${n1(d.inp.oz)} m`, X(0) + 6, Y(d.inp.oz) - 5);
    // vyústky
    for (const run of d.runs) {
      ctx.beginPath();
      const cx = X(run.y);
      const cy = Y(d.geo.zc);
      const rr = (d.geo.r / d.inp.W) * w;
      if (d.shape === 'H') ctx.arc(cx, cy, rr, 0, Math.PI);
      else ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fillStyle = d.color.hex;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      for (const a of d.outlet.angles) {
        const ar = (a * Math.PI) / 180;
        const x1 = cx + Math.sin(ar) * rr;
        const y1 = cy - Math.cos(ar) * rr;
        const x2 = cx + Math.sin(ar) * (rr + 11);
        const y2 = cy - Math.cos(ar) * (rr + 11);
        ctx.strokeStyle = '#1ccaa9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    // odtah (vratné mřížky)
    ctx.fillStyle = 'rgba(150,200,225,0.8)';
    ctx.font = '10px InterVar, Segoe UI, sans-serif';
    ctx.fillText('odtah', X(0) + 4, Y(d.inp.H) + 12);
    ctx.textAlign = 'right';
    ctx.fillText('odtah', X(d.inp.W) - 4, Y(d.inp.H) + 12);
    ctx.textAlign = 'left';
    // osy
    ctx.fillStyle = 'rgba(160,180,195,0.9)';
    ctx.font = '10.5px InterVar, Segoe UI, sans-serif';
    const stepY = d.inp.W > 30 ? 5 : d.inp.W > 12 ? 2 : 1;
    ctx.textAlign = 'center';
    for (let y = 0; y <= d.inp.W + 1e-6; y += stepY) ctx.fillText(`${y}`, X(y), pad.t + h + 16);
    ctx.textAlign = 'right';
    for (let z = 0; z <= d.inp.H + 1e-6; z += d.inp.H > 6 ? 2 : 1) ctx.fillText(`${z}`, pad.l - 7, Y(z) + 3.5);
    ctx.textAlign = 'left';
    ctx.fillText('m', pad.l + w + 2, pad.t + h + 16);
    // legenda
    const lg = ctx.createLinearGradient(pad.l + w - 160, 0, pad.l + w - 20, 0);
    const rmp = mode === 'speed' ? RAMP_VELOCITY : RAMP_TEMP;
    rmp.forEach((c, i) => lg.addColorStop(i / (rmp.length - 1), `rgb(${c[0]},${c[1]},${c[2]})`));
    ctx.fillStyle = 'rgba(8,15,21,0.8)';
    ctx.fillRect(pad.l + w - 170, pad.t + 6, 160, 30);
    ctx.fillStyle = lg;
    ctx.fillRect(pad.l + w - 160, pad.t + 12, 140, 7);
    ctx.fillStyle = '#c8d4dc';
    ctx.font = '10px InterVar, Segoe UI, sans-serif';
    if (mode === 'speed') {
      ctx.fillText('0', pad.l + w - 160, pad.t + 31);
      ctx.textAlign = 'right';
      ctx.fillText(`${n1(vmaxScale)} m/s`, pad.l + w - 20, pad.t + 31);
    } else {
      ctx.fillText(`${n1(d.inp.tr - span)} °C`, pad.l + w - 160, pad.t + 31);
      ctx.textAlign = 'right';
      ctx.fillText(`${n1(d.inp.tr + span)} °C`, pad.l + w - 20, pad.t + 31);
    }
    ctx.textAlign = 'left';

    // statistiky a graf (2× za s)
    chartTimer += dt;
    if (chartTimer > 0.6 && prof) {
      chartTimer = 0;
      renderStats();
    }
  }

  function renderStats() {
    const d = state.design;
    if (!d || !prof || !meta) return;
    const nx = meta.nx;
    const xs = [];
    const cfdY = [];
    for (let i = 2; i < nx - 2; i++) {
      xs.push(((i + 0.5) / nx) * d.inp.W);
      cfdY.push(Math.max(prof.oz.speed[i], prof.ank.speed[i]));
    }
    const mY = [];
    const mX = [];
    for (let k = 0; k < d.prof.ny; k++) {
      mX.push(d.prof.ys[k]);
      mY.push(d.prof.uPk[k]);
    }
    lineChart(root.querySelector('#cfdChart'), {
      series: [
        { name: 'CFD – časový průměr', color: SERIES.prihoda, x: xs, y: cfdY, label: 'CFD' },
        { name: 'Návrhový model (vč. recirkulace)', color: SERIES.model, x: mX, y: mY, dash: true, label: 'model', labelAt: 0.3 },
      ],
      refLines: [{ y: d.inp.vAllow, label: `limit ${n2(d.inp.vAllow)} m/s` }],
      xMarks: d.runs.map((r) => ({ x: r.y, label: `V${r.id}` })),
      xMin: 0,
      xMax: d.inp.W,
      yMin: 0,
      height: 170,
      unit: 'm/s',
      xName: 'poloha',
      xUnit: 'm',
      yLabel: 'm/s',
      xLabel: 'šířka haly (m)',
    });
    let ozMax = 0;
    let ozMean = 0;
    let tMin = Infinity;
    let tMax = -Infinity;
    for (let i = 3; i < nx - 3; i++) {
      const v = Math.max(prof.oz.speed[i], prof.ank.speed[i]);
      ozMax = Math.max(ozMax, v);
      ozMean += v;
      tMin = Math.min(tMin, prof.oz.T[i]);
      tMax = Math.max(tMax, prof.oz.T[i]);
    }
    ozMean /= nx - 6;
    root.querySelector('#cfdStats').innerHTML = `
      <div><span>Simulovaný čas</span><b>${n0(frame.time)} s</b></div>
      <div><span>Kroků / s</span><b>${n0(stepsPerSec)}</b></div>
      <div><span>Síť</span><b>${meta.nx} × ${meta.ny} buněk</b></div>
      <div><span>Velikost buňky</span><b>${n0(meta.h * 1000)} mm</b></div>
      <div><span>CFD – v max v zóně</span><b>${n2(ozMax)} m/s</b></div>
      <div><span>CFD – v průměr v zóně</span><b>${n2(ozMean)} m/s</b></div>
      <div><span>Model – v max / průměr</span><b>${n2(d.metrics.vMax)} / ${n2(d.metrics.vMean)} m/s</b></div>
      <div><span>CFD – teplota v zóně</span><b>${n1(d.inp.tr + tMin)} – ${n1(d.inp.tr + tMax)} °C</b></div>`;
    root.querySelector('#cfdMeta').textContent = `Navier–Stokes + Boussinesq · síť ${meta.nx} × ${meta.ny} · t = ${n0(frame.time)} s · ${d.n}× ${d.outlet.short} ${d.outlet.patternName}`;
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!geom || !frame || !meta) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left - geom.pad.l;
    const y = e.clientY - r.top - geom.pad.t;
    if (x < 0 || y < 0 || x > geom.w || y > geom.h) {
      probe.hidden = true;
      return;
    }
    const d = state.design;
    const yy = (x / geom.w) * d.inp.W;
    const zz = (1 - y / geom.h) * d.inp.H;
    const i = Math.min(meta.nx - 1, Math.floor((yy / d.inp.W) * meta.nx));
    const j = Math.min(meta.ny - 1, Math.floor((zz / d.inp.H) * meta.ny));
    const k = j * meta.nx + i;
    probe.hidden = false;
    const sr = stage.getBoundingClientRect();
    probe.style.left = `${e.clientX - sr.left}px`;
    probe.style.top = `${e.clientY - sr.top}px`;
    probe.innerHTML = `<b>Bod řezu</b> · y ${n1(yy)} m, výška ${n1(zz)} m
      <div class="row"><span>Rychlost</span><span>${n2(frame.speed[k])} m/s</span></div>
      <div class="row"><span>Teplota</span><span>${n1(d.inp.tr + frame.T[k])} °C</span></div>`;
  });
  canvas.addEventListener('pointerleave', () => {
    probe.hidden = true;
  });

  root.querySelector('#cfdField').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mode = b.dataset.v;
    root.querySelectorAll('#cfdField button').forEach((x) => x.classList.toggle('active', x === b));
  });
  root.querySelector('#cfdAvg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    root.querySelectorAll('#cfdAvg button').forEach((x) => x.classList.toggle('active', x === b));
    worker?.postMessage({ type: 'avg', avg: b.dataset.v === '1' });
  });
  root.querySelector('#cfdParticles').addEventListener('click', (e) => {
    showParticles = !showParticles;
    e.currentTarget.classList.toggle('active', showParticles);
    tctx.clearRect(0, 0, trail.width, trail.height);
  });
  root.querySelector('#cfdSpeed').addEventListener('change', (e) => worker?.postMessage({ type: 'speed', speed: +e.target.value }));
  root.querySelector('#cfdPlay').addEventListener('click', (e) => {
    running = !running;
    e.currentTarget.textContent = running ? 'Pozastavit' : 'Spustit';
    worker?.postMessage({ type: 'run', run: running && active });
  });
  root.querySelector('#cfdReset').addEventListener('click', () => {
    designKey = '';
    start();
  });

  new ResizeObserver(() => {
    if (active) layout();
  }).observe(stage);

  on('view', (v) => {
    active = v === 'cfd';
    if (active) {
      start();
      layout();
      worker?.postMessage({ type: 'run', run: running });
    } else worker?.postMessage({ type: 'run', run: false });
  });
  on('design', () => {
    if (active) start();
    else designKey = '';
  });
  requestAnimationFrame(draw);
  void rampCss;
}
