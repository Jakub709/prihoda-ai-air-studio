// Pohled „Analýza“: grafy komfortu, útlum proudu, řez s trajektoriemi, varianty, kusovník, srovnání.
import { emit, on, state } from '../state.js';
import { barChart, lineChart, SERIES } from './charts.js';
import { clockSVG, planSVG, sectionSVG } from './drawings.js';
import { esc, n0, n1, n2 } from './format.js';
import { toast } from './toast.js';

export function drBins(dr, nx, ny, W, L) {
  const bins = [0, 0, 0, 0];
  let cnt = 0;
  for (let j = 0; j < ny; j++) {
    const y = (j / (ny - 1)) * W;
    if (y < 0.5 || y > W - 0.5) continue;
    for (let i = 0; i < nx; i++) {
      const x = (i / (nx - 1)) * L;
      if (x < 0.5 || x > L - 0.5) continue;
      const v = dr[j * nx + i];
      bins[v < 10 ? 0 : v < 20 ? 1 : v < 30 ? 2 : 3]++;
      cnt++;
    }
  }
  return bins.map((b) => (100 * b) / Math.max(1, cnt));
}

/** Nejhorší (max. přes délku) a průměrný příčný profil z mapy pobytové zóny. */
export function mapProfiles(map) {
  const xs = [];
  const mx = [];
  const mean = [];
  for (let j = 0; j < map.ny; j++) {
    let a = 0;
    let s = 0;
    let c = 0;
    for (let i = 0; i < map.nx; i++) {
      const x = (i / (map.nx - 1)) * map.L;
      if (x < 1 || x > map.L - 1) continue;
      const v = map.u[j * map.nx + i];
      a = Math.max(a, v);
      s += v;
      c++;
    }
    xs.push((j / (map.ny - 1)) * map.W);
    mx.push(a);
    mean.push(s / Math.max(1, c));
  }
  return { xs, mx, mean };
}

export function mountAnalysis(root) {
  let visible = false;
  let dirty = true;

  const render = () => {
    const d = state.design;
    if (!d || !visible) {
      dirty = true;
      return;
    }
    dirty = false;
    const inp = d.inp;
    const c = d.conventional;
    const heating = inp.mode === 'heating';
    root.innerHTML = `
      <div class="agrid">
        <div class="acard"><h3>Rychlost v pobytové zóně napříč halou</h3><p class="desc">Nejhorší místo po délce haly · výška ${n1(inp.oz)} m i u kotníků · limit ${n2(inp.vAllow)} m/s (${esc(inp.catLabel)})</p><div id="chProfile"></div></div>
        <div class="acard"><h3>Rozložení průvanu v pobytové zóně</h3><p class="desc">Podíl plochy pobytové zóny v kategoriích DR dle ISO 7730</p><div id="chDR"></div></div>
        <div class="acard wide"><h3>Příčný řez – trajektorie proudů</h3><p class="desc">Integrální model volného proudu se vztlakem a stratifikací (${heating ? 'teplý vzduch stoupá – proudy ho musí dopravit dolů' : 'chladný vzduch klesá'}) · tloušťka a barva = rychlost</p>
          <div style="display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:12px;align-items:center"><div>${sectionSVG(d, { width: 900 })}</div><div style="text-align:center">${clockSVG(d, { size: 200 })}<div class="desc" style="margin-top:4px">${esc(d.outlet.name)} · ${esc(d.outlet.patternName)}</div></div></div></div>
        <div class="acard"><h3>Útlum rychlosti v proudu</h3><p class="desc">Rychlost v ose proudu podél trajektorie · katalogový dosah ${d.outlet.throwRange[0]}–${d.outlet.throwRange[1]} m (na 0,2 m/s)</p><div id="chDecay"></div></div>
        <div class="acard"><h3>Rychlost vzduchu uvnitř vyústky</h3><p class="desc">Podélná rychlost klesá, jak vzduch vystupuje otvory · statický tlak je po délce téměř konstantní (${d.outlet.p} Pa)</p><div id="chAlong"></div></div>
        <div class="acard wide"><h3>Půdorys rozvodu</h3><p class="desc">${d.n} ${d.n === 1 ? 'větev' : d.n < 5 ? 'větve' : 'větví'}, díly spojené zipy (max. 5,5 m), ${d.header ? 'rozvodná větev u čela haly' : 'přímé napojení na VZT jednotku'}</p>${planSVG(d, { width: 1100 })}</div>
        <div class="acard wide"><h3>Optimalizátor – nejlepší varianty</h3><p class="desc">Vyhodnoceno ${n0(d.stats.evaluated)} kombinací (počet větví × typ výstupu × poloha otvorů × tlak × velikost otvorů) za ${n0(d.stats.ms)} ms · kliknutím variantu použijete</p>
          <div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Větve</th><th>Výstup vzduchu</th><th>Poloha</th><th class="r">Tlak</th><th class="r">Otvor</th><th class="r">Rychlost v potrubí</th><th class="r">v max. v zóně</th><th class="r">DR max</th><th class="r">${heating ? 'Průnik' : 'ADPI'}</th><th class="r">Tkanina</th><th class="r">Skóre</th></tr></thead>
          <tbody>${d.variants.map((v, i) => `<tr class="clickable ${i === 0 ? 'best' : ''}" data-v="${i}"><td>${i === 0 ? '<span class="pill best">✓</span>' : i}</td><td>${v.n}× Ø${v.D}</td><td>${esc(v.outletName)}</td><td>${esc(v.patternName)}</td><td class="r">${v.p} Pa</td><td class="r">${v.holeSize ? `Ø ${v.holeSize}` : '–'}</td><td class="r">${n1(v.vIn)} m/s</td><td class="r">${n2(v.vMax)} m/s</td><td class="r">${n0(v.drMax)} %</td><td class="r">${heating ? `${n0(Math.min(120, v.penetration * 100))} %` : `${n0(v.adpi)} %`}</td><td class="r">${n0(v.fabricArea)} m²</td><td class="r">${n1(v.score)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="acard wide"><h3 style="display:flex;justify-content:space-between;align-items:center">Kusovník <button class="btn sm" id="bomCsv">Export CSV</button></h3><p class="desc">Orientační specifikace dodávky dle katalogu Příhoda · montáž č. ${d.install.no} – ${esc(d.install.name)}</p>
          <div class="table-wrap"><table class="data"><thead><tr><th>Položka</th><th>Specifikace</th><th class="r">Množství</th></tr></thead><tbody>${bomRows(d)}</tbody></table></div></div>
        <div class="acard wide"><h3>Srovnání s plechovým rozvodem</h3><p class="desc">Spiro potrubí ${c.sheet} mm s ${n0(c.nOut)} vyústkami (á ${c.spacing} m) pro stejný průtok · hmotnosti, montáž a emise orientační</p>
          <div class="table-wrap"><table class="data"><thead><tr><th>Ukazatel</th><th class="r">Příhoda – tkanina</th><th class="r">Plech + vyústky</th><th class="r">Rozdíl</th></tr></thead><tbody>
          ${cmpRow('Hmotnost rozvodu vč. závěsů', `${n0(d.totalWeight)} kg`, `${n0(c.steelKg + c.insulKg)} kg`, pctDiff(d.totalWeight, c.steelKg + c.insulKg))}
          ${cmpRow('Montáž (člověkohodiny)', `${n0(c.fabricHours)} h`, `${n0(c.steelHours)} h`, pctDiff(c.fabricHours, c.steelHours))}
          ${cmpRow('Uhlíková stopa materiálu', `${n0(c.co2Fabric)} kg CO₂e`, `${n0(c.co2Steel)} kg CO₂e`, pctDiff(c.co2Fabric, c.co2Steel))}
          ${cmpRow('Objem při dopravě', `${n1(c.volFabric)} m³`, `${n1(c.volSteel)} m³`, pctDiff(c.volFabric, c.volSteel))}
          ${cmpRow('Max. rychlost v pobytové zóně', `${n2(d.metrics.vMax)} m/s`, `${n2(c.metrics.vMax)} m/s`, '')}
          ${cmpRow('Pobytová zóna v limitu průvanu', `${n0(d.metrics.drOkShare * 100)} %`, `${n0(c.metrics.drOkShare * 100)} %`, '')}
          ${heating ? cmpRow('Průnik teplého vzduchu k lidem', `${n0(Math.min(100, d.metrics.penetration * 100))} %`, `${n0(Math.min(100, c.metrics.penetration * 100))} %`, '') : ''}
          ${cmpRow('Kondenzace při chlazení pod rosným bodem', inp.condensation ? 'ne – prodyšná tkanina' : 'ne', inp.condensation ? 'ano – nutná izolace' : 'ne', '')}
          ${cmpRow('Čištění', 'praní v pračce', 'mechanické čištění potrubí', '')}
          </tbody></table></div>
          <p class="desc" style="margin-top:8px">Předpoklady: plech ${c.sheet} mm (dle průměru), 7 850 kg/m³, +12 % spoje a tvarovky; montáž tkaniny = 20 % času plechu (údaj Příhoda); emisní faktory cradle-to-gate: ocel 2,3 kg CO₂e/kg, PES ${c.pesFactor} kg CO₂e/kg, hliník 8,2 kg CO₂e/kg.</p></div>
      </div>`;

    // grafy
    const cp = mapProfiles(c.ozMap);
    const pp = mapProfiles(d.ozMap);
    lineChart(root.querySelector('#chProfile'), {
      series: [
        { name: 'Příhoda – tkanina', color: SERIES.prihoda, x: pp.xs, y: pp.mx, label: 'Příhoda', labelAt: 0.5 },
        { name: 'Plech + vyústky (nejhorší řez)', color: SERIES.conventional, x: cp.xs, y: cp.mx, label: 'plech', labelAt: 0.25 },
      ],
      refLines: [{ y: inp.vAllow, label: `limit ${n2(inp.vAllow)} m/s` }],
      xMarks: d.runs.map((r) => ({ x: r.y, label: `V${r.id}` })),
      xMin: 0,
      xMax: inp.W,
      yMin: 0,
      height: 230,
      unit: 'm/s',
      xName: 'poloha',
      xUnit: 'm',
      yLabel: 'm/s',
      xLabel: 'šířka haly (m)',
    });
    const bp = drBins(d.ozMap.dr, d.ozMap.nx, d.ozMap.ny, inp.W, inp.L);
    const bc = drBins(c.ozMap.dr, c.ozMap.nx, c.ozMap.ny, inp.W, inp.L);
    barChart(root.querySelector('#chDR'), {
      cats: ['A · DR < 10 %', 'B · 10–20 %', 'C · 20–30 %', 'mimo · > 30 %'],
      series: [
        { name: 'Příhoda – tkanina', color: SERIES.prihoda, values: bp },
        { name: 'Plech + vyústky', color: SERIES.conventional, values: bc },
      ],
      unit: '% plochy',
      height: 230,
      yMax: 100,
      valueLabels: true,
    });
    // útlum v ose hlavního proudu
    const main = d.trajs[0];
    const sx = [];
    const sy = [];
    for (const br of main.branches) {
      for (let i = 0; i < br.n; i += Math.max(1, Math.floor(br.n / 80))) {
        sx.push(br.s[i]);
        sy.push(br.uc[i]);
      }
    }
    const order = sx.map((_, i) => i).sort((a, b) => sx[a] - sx[b]);
    const ctr = c.traj.branches.flatMap((br) => Array.from({ length: br.n }, (_, i) => [br.s[i], br.uc[i]])).sort((a, b) => a[0] - b[0]);
    const maxS = Math.min(30, Math.max(8, (d.metrics.throw02 || 4) * 1.8));
    const fil = (arr) => arr.filter(([s]) => s <= maxS);
    const ps = fil(order.map((i) => [sx[i], sy[i]]));
    const cs = fil(ctr);
    lineChart(root.querySelector('#chDecay'), {
      series: [
        { name: `${d.outlet.short} (${d.outlet.u0.toFixed(1).replace('.', ',')} m/s)`, color: SERIES.prihoda, x: ps.map((p) => p[0]), y: ps.map((p) => p[1]), label: 'Příhoda', labelAt: 0.12 },
        { name: 'Vyústka plechového rozvodu', color: SERIES.conventional, x: cs.map((p) => p[0]), y: cs.map((p) => p[1]), label: 'plech', labelAt: 0.6 },
      ],
      refLines: [{ y: 0.2, label: '0,2 m/s' }],
      yMin: 0,
      yMax: Math.min(6, Math.max(1.2, Math.max(...ps.map((p) => p[1]).slice(2)) * 1.1)),
      height: 210,
      unit: 'm/s',
      xName: 'vzdálenost',
      xUnit: 'm',
      yLabel: 'm/s',
      xLabel: 'dráha proudu (m)',
    });
    const r0 = d.runs[0];
    const ax = [];
    const av = [];
    for (let k = 0; k <= 40; k++) {
      const x = (k / 40) * r0.len;
      ax.push(x);
      av.push(r0.vIn * (1 - x / r0.len));
    }
    lineChart(root.querySelector('#chAlong'), {
      series: [{ name: 'Podélná rychlost ve vyústce', color: SERIES.model, x: ax, y: av }],
      refLines: [{ y: inp.noiseClass.vGreen, label: `doporučené max. ${n1(inp.noiseClass.vGreen)} m/s`, color: '#8a9aa6' }],
      yMin: 0,
      height: 210,
      unit: 'm/s',
      xName: 'délka',
      xUnit: 'm',
      yLabel: 'm/s',
      xLabel: 'vzdálenost od přívodu (m)',
    });

    root.querySelectorAll('tr[data-v]').forEach((tr) => tr.addEventListener('click', () => emit('applyVariant', +tr.dataset.v)));
    root.querySelector('#bomCsv').addEventListener('click', () => exportCsv(d));
  };

  on('design', render);
  on('view', (v) => {
    visible = v === 'analysis';
    if (visible && dirty) render();
    else if (visible) render();
  });
}

function bomRows(d) {
  let g = '';
  let out = '';
  for (const b of d.bom) {
    if (b.group !== g) {
      g = b.group;
      out += `<tr class="group"><td colspan="3">${esc(g)}</td></tr>`;
    }
    out += `<tr><td>${esc(b.item)}</td><td class="muted">${esc(b.detail)}</td><td class="r">${n0(b.qty)} ${esc(b.unit)}</td></tr>`;
  }
  return out;
}
function cmpRow(k, a, b, diff) {
  return `<tr><td>${esc(k)}</td><td class="r"><b>${esc(a)}</b></td><td class="r">${esc(b)}</td><td class="r" style="color:var(--teal-ink)">${esc(diff)}</td></tr>`;
}
function pctDiff(a, b) {
  if (!b) return '';
  return `−${n0(100 * (1 - a / b))} %`;
}

function exportCsv(d) {
  const rows = [['Skupina', 'Položka', 'Specifikace', 'Množství', 'Jednotka']];
  for (const b of d.bom) rows.push([b.group, b.item, b.detail, b.qty, b.unit]);
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kusovnik-${(d.inp.name || 'projekt').replace(/[^\w\-]+/g, '_')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Kusovník exportován do CSV');
}
