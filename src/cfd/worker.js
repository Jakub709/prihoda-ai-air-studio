// CFD ve vlastním vlákně: počítá kroky a posílá snímky (~25 fps).
import { CfdSolver } from './solver.js';

let solver = null;
let running = false;
let speed = 1;
let avg = false;
let timer = null;
let lastPost = 0;

function loop() {
  if (!solver || !running) return;
  const t0 = performance.now();
  const budget = 22 * speed;
  let n = 0;
  while (performance.now() - t0 < budget && n < 40) {
    solver.step();
    n++;
  }
  const now = performance.now();
  if (now - lastPost > 38) {
    lastPost = now;
    post();
  }
  timer = setTimeout(loop, 4);
}

function post() {
  const f = solver.frame(avg);
  const prof = solver.profile(solver.cfg.oz);
  const ank = solver.profile(0.12);
  self.postMessage(
    { type: 'frame', frame: f, prof, ank, dt: solver.dt },
    [f.speed.buffer, f.T.buffer, f.u.buffer, f.v.buffer, prof.speed.buffer, prof.T.buffer, ank.speed.buffer, ank.T.buffer],
  );
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    clearTimeout(timer);
    solver = new CfdSolver(m.cfg);
    self.postMessage({ type: 'ready', nx: solver.nx, ny: solver.ny, h: solver.h, solid: solver.solid, outflow: solver.outflow, inflow: solver.inflow.map((f) => f.k) });
    running = m.run !== false;
    if (running) loop();
  } else if (m.type === 'run') {
    const was = running;
    running = !!m.run;
    if (running && !was) loop();
  } else if (m.type === 'speed') {
    speed = m.speed;
  } else if (m.type === 'avg') {
    avg = !!m.avg;
    if (solver && !running) post();
  }
};
