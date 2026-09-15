// Technická nabídka (A4, tisk do PDF) – čeština / angličtina / němčina (+ texty AI v libovolném jazyce).
import { COMPANY } from '../engine/catalog.js';
import { HEAT_KINDS, rampBytes, rampCss } from '../viz/colormaps.js';
import { app } from '../app.js';
import { on, state } from '../state.js';
import { clockSVG, planSVG, sectionSVG } from './drawings.js';
import { drBins, mapProfiles } from './analysis.js';
import { esc, n0, n1, n2 } from './format.js';
import { aiAvailable, sendMessage } from './chat.js';
import { comfortLabel, patternName, reportText, tn } from './i18n.js';

const LANGS = { cs: 'čeština', en: 'English', de: 'Deutsch', sk: 'slovenčina', pl: 'polski', es: 'español', fr: 'français' };
const LOCALE = { cs: 'cs-CZ', en: 'en-GB', de: 'de-DE', sk: 'sk-SK', pl: 'pl-PL', es: 'es-ES', fr: 'fr-FR' };

function mapImage(map, kind, inp) {
  const K = HEAT_KINDS[kind];
  const ramp = rampBytes(K.ramp);
  const src = kind === 'velocity' ? map.u : kind === 'dr' ? map.dr : map.t;
  const lo = K.relative ? inp.tr + K.min : K.min;
  const hi = K.relative ? inp.tr + K.max : K.max;
  const c = document.createElement('canvas');
  c.width = map.nx;
  c.height = map.ny;
  const g = c.getContext('2d');
  const img = g.createImageData(map.nx, map.ny);
  for (let j = 0; j < map.ny; j++) {
    for (let i = 0; i < map.nx; i++) {
      const v = Math.max(0, Math.min(1, (src[j * map.nx + i] - lo) / (hi - lo)));
      const q = ((v * 255) | 0) * 4;
      const o = (j * map.nx + i) * 4;
      img.data[o] = ramp[q];
      img.data[o + 1] = ramp[q + 1];
      img.data[o + 2] = ramp[q + 2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const big = document.createElement('canvas');
  big.width = 900;
  big.height = Math.round((900 * inp.W) / inp.L);
  const bg = big.getContext('2d');
  bg.imageSmoothingEnabled = true;
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(c, 0, 0, big.width, big.height);
  return big.toDataURL('image/png');
}

function staticLine(series, { w = 640, h = 220, yMax, limit, xMax, xLabel = '', yLabel = '' }) {
  const m = { l: 42, r: 14, t: 12, b: 30 };
  const X = (x) => m.l + (x / xMax) * (w - m.l - m.r);
  const Y = (y) => h - m.b - (y / yMax) * (h - m.t - m.b);
  let s = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" font-family="InterVar, Segoe UI, sans-serif" font-size="10">`;
  for (let k = 0; k <= 4; k++) {
    const yv = (yMax * k) / 4;
    s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(yv)}" y2="${Y(yv)}" stroke="#e3e8eb"/><text x="${m.l - 6}" y="${Y(yv) + 3}" text-anchor="end" fill="#5c6b74">${n2(yv)}</text>`;
  }
  for (let k = 0; k <= 5; k++) {
    const xv = (xMax * k) / 5;
    s += `<text x="${X(xv)}" y="${h - m.b + 14}" text-anchor="middle" fill="#5c6b74">${n0(xv)}</text>`;
  }
  s += `<line x1="${m.l}" x2="${w - m.r}" y1="${h - m.b}" y2="${h - m.b}" stroke="#8a979f"/>`;
  if (limit) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(limit.y)}" y2="${Y(limit.y)}" stroke="#c98500" stroke-dasharray="5 4" stroke-width="1.4"/><text x="${w - m.r}" y="${Y(limit.y) - 4}" text-anchor="end" fill="#a36a00" font-weight="600">${limit.label}</text>`;
  for (const se of series) {
    s += `<polyline fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" points="${se.x.map((x, i) => `${X(x).toFixed(1)},${Y(Math.min(yMax, se.y[i])).toFixed(1)}`).join(' ')}"/>`;
    const i = Math.floor(se.x.length * (se.at ?? 0.7));
    s += `<text x="${X(se.x[i])}" y="${Y(Math.min(yMax, se.y[i])) - 6}" text-anchor="middle" fill="${se.color}" font-weight="700">${se.label}</text>`;
  }
  s += `<text x="${w - m.r}" y="${h - 2}" text-anchor="end" fill="#5c6b74">${xLabel}</text><text x="4" y="${m.t + 2}" fill="#5c6b74">${yLabel}</text></svg>`;
  return s;
}

const mark = `<svg viewBox="0 0 40 40"><path d="M5 14c6-5 11 5 17 0s11 0 13 0" stroke="#00a98e"/><path d="M5 21c6-5 11 5 17 0s11 0 13 0" stroke="#007298"/><path d="M5 28c6-5 11 5 17 0s11 0 13 0" stroke="#00a98e" opacity=".55"/></svg>`;

function templateTexts(d) {
  const inp = d.inp;
  const m = d.metrics;
  const modeCz = { cooling: 'chlazení', heating: 'vytápění', ventilation: 'větrání' }[inp.mode];
  return {
    jazyk: 'cs',
    osloveni: `děkujeme za poptávku. Pro váš prostor (${inp.app.name.toLowerCase()}, ${n1(inp.L)} × ${n1(inp.W)} m, světlá výška ${n1(inp.H)} m) jsme připravili návrh tkaninového rozvodu vzduchu na míru. Návrh vychází z fyzikálního modelu proudění a vyhodnocení ${n0(d.stats.evaluated)} variant.`,
    popis_reseni: `Vzduch o průtoku ${n0(inp.flow)} m³/h (${modeCz}, přívod ${n1(inp.ts)} °C, prostor ${n1(inp.tr)} °C) ${d.n >= 2 && d.n <= 4 ? 'rozvádějí' : 'rozvádí'} ${d.n} ${d.n === 1 ? 'tkaninová vyústka' : d.n < 5 ? 'tkaninové vyústky' : 'tkaninových vyústek'} ${d.shape === 'C' ? 'kruhového' : 'půlkruhového'} průřezu Ø ${d.runs[0].D} mm o délce ${n1(d.runs[0].len)} m. Výstup vzduchu: ${d.outlet.name.toLowerCase()} v poloze ${d.outlet.patternName}, statický tlak ${d.outlet.p} Pa. V pobytové zóně je nejvyšší rychlost ${n2(m.vMax)} m/s (${inp.catLabel}). Vyústky jsou z materiálu ${d.material.code} (${d.material.name}), barva ${d.color.name.toLowerCase()}${d.color.ral ? ` (${d.color.ral})` : ''}.`,
    prinosy: [
      inp.app.why,
      `Hmotnost ${n0(d.totalWeight)} kg místo ${n0(d.conventional.steelKg)} kg u plechového rozvodu – minimální zatížení střešní konstrukce.`,
      `Montáž přibližně za 20 % času oproti plechu (úspora cca ${n0(d.conventional.steelHours - d.conventional.fabricHours)} montážních hodin).`,
      'Rovnoměrná bezprůvanová distribuce po celé délce haly namísto několika bodových vyústek.',
      'Snadná údržba – vyústky se perou v pračce, jednotlivé díly jsou spojené zipy a mají vlastní prací štítek.',
      inp.condensation ? 'Prodyšná tkanina brání kondenzaci i při přívodu pod rosným bodem – bez izolace.' : 'Bez koroze, bez nutnosti izolace, s dlouhou životností a zárukou.',
    ],
    doporuceni: [
      'Ověřit konečné rozměry, polohu VZT jednotky a kotevní body v konstrukci.',
      'Finální výpočet a výrobní dokumentace v programu Příhoda Air Tailor; pro složité případy CFD simulace ve Fluentu.',
      'Zvolit barvu (9 skladových barev nebo Prihoda ART s logem zákazníka).',
    ],
  };
}

export function mountReport(root) {
  let lang = 'cs';
  const open = () => {
    const d = state.design;
    if (!d) return;
    // čistý snímek pro titulní stranu (bez barevné mapy)
    const prevHeat = state.layers.heat;
    app.viz.setLayers({ heat: 'none' });
    const shot = app.viz.snapshot(1600, 900);
    app.viz.setLayers({ heat: prevHeat });
    render(d, shot);
    root.hidden = false;
    root.scrollTop = 0;
  };

  const render = (d, shot) => {
    const inp = d.inp;
    const m = d.metrics;
    const c = d.conventional;
    const P = state.proposal && state.proposal.at ? state.proposal : null;
    const pl = P?.jazyk?.slice(0, 2).toLowerCase() || lang;
    lang = pl in LANGS ? pl : lang;
    const stale = P && d.at && P.at < d.at - 500;
    const L = reportText(pl);
    const base = templateTexts(d);
    const T = P ? { ...base, ...P } : base;
    const aiTag = P ? `<span class="ai-tag">${L.aiTag}</span>` : '';
    const heating = inp.mode === 'heating';
    const date = new Date().toLocaleDateString(LOCALE[pl] || 'cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
    const head = (pg) => `<div class="pg-head"><span class="lg">${mark}Příhoda AI Air Studio</span><span>${esc(inp.name)} · ${date}</span></div><div class="pg-foot"><span>${L.foot} ${COMPANY.name}</span><span>${pg} / 5</span></div>`;
    const pp = mapProfiles(d.ozMap);
    const cp = mapProfiles(c.ozMap);
    const yMax = Math.max(0.3, inp.vAllow * 1.6, Math.min(1.2, Math.max(...cp.mx) * 1.05));
    const bp = drBins(d.ozMap.dr, d.ozMap.nx, d.ozMap.ny, inp.W, inp.L);
    const bc = drBins(c.ozMap.dr, c.ozMap.nx, c.ozMap.ny, inp.W, inp.L);
    const chk = (l) => ({ ok: '<span class="ok">✓</span>', warn: '<span class="warn">!</span>', err: '<span class="err">✕</span>', info: '<span class="muted">i</span>' })[l];
    const bomNames = Array.isArray(P?.kusovnik_preklad) && P.kusovnik_preklad.length === d.bom.length ? P.kusovnik_preklad : null;
    const checkNames = Array.isArray(P?.kontroly_preklad) && P.kontroly_preklad.length === d.checks.length ? P.kontroly_preklad : null;
    const cz = pl === 'cs';
    const oName = tn(pl, 'outlet', d.outlet.key, d.outlet.name);
    const pName = patternName(pl, d.outlet.pattern, d.outlet.patternName);
    const cName = tn(pl, 'color', d.color.code, d.color.name);
    const iName = tn(pl, 'install', d.install.no, d.install.name);
    const aName = tn(pl, 'app', inp.appKey, inp.app.name);
    const nName = tn(pl, 'noise', inp.noise, inp.noiseClass.name);
    const kLabel = comfortLabel(pl, inp, inp.catLabel);
    root.innerHTML = `
      <div class="report-bar">
        <button class="btn" id="repBack">← Zpět do aplikace</button>
        <h3>Technická nabídka · náhled A4</h3>
        ${stale ? '<span class="assumption" style="background:rgba(250,178,25,.14);color:#fab219;border-color:rgba(250,178,25,.35)">Texty AI jsou z předchozí verze návrhu – nechte je napsat znovu</span>' : ''}
        ${!P && lang !== 'cs' ? '<span class="assumption">Statické části přeloženy · texty nabídky napíše AI</span>' : ''}
        <span class="sp"></span>
        <select id="repLang" title="Jazyk nabídky">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === lang ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn" id="repAi">${aiAvailable() ? '✦ Napsat texty s AI' : '✦ Texty AI (vyžaduje klíč)'}</button>
        <button class="btn primary" id="repPrint">Tisk / Uložit PDF</button>
      </div>
      <div class="pages">
        <section class="page">${head(1)}
          <div class="muted" style="font-size:9pt;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#00896f">${L.kicker}</div>
          <h1>${esc(inp.name)}</h1>
          <p class="muted">${esc(inp.customer || L.noCustomer)}${inp.location ? ` · ${esc(inp.location)}` : ''} · ${cz ? esc(inp.app.name) + ' · ' : ''}${n1(inp.L)} × ${n1(inp.W)} × ${n1(inp.H)} m</p>
          <img class="cover-img" src="${shot}" alt="3D">
          <div class="kgrid">
            <div class="kbox"><div class="k">${L.kDuct}</div><div class="v">${d.n}× Ø${d.runs[0].D}<small> mm</small></div></div>
            <div class="kbox"><div class="k">${L.kVmax}</div><div class="v">${n2(m.vMax)}<small> m/s</small></div></div>
            <div class="kbox"><div class="k">${heating ? L.penetration : L.kDR}</div><div class="v">${heating ? n0(Math.min(100, m.penetration * 100)) : n0(m.drMax)}<small> %</small></div></div>
            <div class="kbox"><div class="k">${L.kWeight}</div><div class="v">−${n0(100 * (1 - d.totalWeight / c.steelKg))}<small> %</small></div></div>
          </div>
          <h2>${L.dear}${aiTag}</h2>
          <p class="ai-text">${esc(T.osloveni || '')}</p>
        </section>

        <section class="page">${head(2)}
          <h2>${L.brief}</h2>
          <table><tbody>
            <tr><td>${L.app}</td><td>${esc(aName)}</td><td>${L.dims}</td><td class="r">${n1(inp.L)} × ${n1(inp.W)} × ${n1(inp.H)} m</td></tr>
            <tr><td>${L.mode}</td><td>${esc(L.modes[inp.mode])}</td><td>${L.flow}</td><td class="r">${n0(inp.flow)} m³/h (${n1(inp.ach)} h⁻¹)</td></tr>
            <tr><td>${L.temps}</td><td>${n1(inp.ts)} / ${n1(inp.tr)} °C</td><td>${L.power}</td><td class="r">${n1(Math.abs(inp.heatKW))} kW</td></tr>
            <tr><td>${L.rh}</td><td>${n0(inp.rh)} % / ${n1(inp.Td)} °C</td><td>${L.oz}</td><td class="r">≤ ${n1(inp.oz)} m</td></tr>
            <tr><td>${L.comfort}</td><td>${esc(kLabel)}</td><td>${L.acoustic}</td><td class="r">${esc(nName)}</td></tr>
          </tbody></table>
          ${state.assumptions.length && cz ? `<p class="muted" style="margin-top:2mm">${L.assumptions}: ${state.assumptions.map(esc).join('; ')}.</p>` : ''}
          <h2>${L.solution}${aiTag}</h2>
          <p class="ai-text">${esc(T.popis_reseni || '')}</p>
          <table><tbody>
            <tr><td>${L.shape}</td><td>${d.shape === 'C' ? 'C' : 'H'} Ø ${d.runs[0].D} mm</td><td>${L.runs}</td><td class="r">${d.n} × ${n1(d.runs[0].len)} m</td></tr>
            <tr><td>${L.outlet}</td><td>${esc(oName)}</td><td>${L.pattern}</td><td class="r">${esc(pName)}</td></tr>
            <tr><td>${L.pressure}</td><td>${d.outlet.p} Pa (ext. ≈ ${n0(d.extPressure)} Pa)</td><td>${L.vduct}</td><td class="r">${n1(d.runs[0].vIn)} m/s</td></tr>
            <tr><td>${d.outlet.kind === 'holes' ? L.holes : L.microHoles}</td><td>${d.outlet.kind === 'holes' ? `${n0(d.outlet.count)} × Ø ${d.outlet.holeSize} mm` : `≈ ${n1(d.outlet.microHoles / 1e6)} mil.`}</td><td>${L.throw}</td><td class="r">${n1(m.throw02 || 0)} m</td></tr>
            <tr><td>${L.material}</td><td>${esc(d.material.code)} – ${esc(d.material.name)}</td><td>${L.color}</td><td class="r">${esc(cName)}${d.color.ral ? ` (${esc(d.color.ral)})` : ''}</td></tr>
            <tr><td>${L.install}</td><td colspan="3">${cz ? 'č.' : 'No.'} ${d.install.no} – ${esc(iName)}</td></tr>
          </tbody></table>
          <h2>${L.benefits}${aiTag}</h2>
          <ul>${(T.prinosy || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        </section>

        <section class="page">${head(3)}
          <h2>${L.plan}</h2>
          <div class="fig">${planSVG(d, { width: 700, light: true })}</div>
          <div class="cap">${L.planCap}</div>
          <h2>${L.section}</h2>
          <div class="two" style="grid-template-columns:1fr 150px;align-items:center">
            <div class="fig">${sectionSVG(d, { width: 620, light: true })}</div>
            <div class="fig" style="text-align:center">${clockSVG(d, { size: 150, light: true })}<div class="cap">${L.outletPos} ${esc(pName)}</div></div>
          </div>
          <div class="cap">${L.sectionCap}</div>
        </section>

        <section class="page">${head(4)}
          <h2>${L.comfortH}</h2>
          <div class="two">
            <div class="fig"><img src="${mapImage(d.ozMap, 'dr', inp)}" alt="DR"><div class="cap"><b>${L.fabric}:</b> ${n0(m.drOkShare * 100)} % ${L.inLimit}</div></div>
            <div class="fig"><img src="${mapImage(c.ozMap, 'dr', inp)}" alt="DR"><div class="cap"><b>${L.steel}:</b> ${n0(c.metrics.drOkShare * 100)} % ${L.inLimit}</div></div>
          </div>
          <div style="height:6px;border-radius:2px;margin:2mm 0 1mm;background:${rampCss(HEAT_KINDS.dr.ramp)}"></div>
          <div class="cap" style="display:flex;justify-content:space-between"><span>DR 0 %</span><span>ISO 7730</span><span>40 %</span></div>
          <h3>${L.profile} (${n1(inp.oz)} m)</h3>
          <div class="fig">${staticLine(
            [
              { x: pp.xs, y: pp.mx, color: '#00896f', label: L.fabric, at: 0.5 },
              { x: cp.xs, y: cp.mx, color: '#d95926', label: L.steel, at: 0.25 },
            ],
            { yMax, xMax: inp.W, limit: { y: inp.vAllow, label: `limit ${n2(inp.vAllow)} m/s` }, xLabel: L.width, yLabel: 'm/s' },
          )}</div>
          <h2>${L.compare}</h2>
          <table><thead><tr><th>${L.indicator}</th><th class="r">${L.fabric}</th><th class="r">${L.steel}</th></tr></thead><tbody>
            <tr><td>${L.weight}</td><td class="r">${n0(d.totalWeight)} kg</td><td class="r">${n0(c.steelKg + c.insulKg)} kg</td></tr>
            <tr><td>${L.installH}</td><td class="r">${n0(c.fabricHours)} h</td><td class="r">${n0(c.steelHours)} h</td></tr>
            <tr><td>${L.co2}</td><td class="r">${n0(c.co2Fabric)} kg CO₂e</td><td class="r">${n0(c.co2Steel)} kg CO₂e</td></tr>
            <tr><td>${L.zoneShare}</td><td class="r">${n0(bp[0])} / ${n0(bp[0] + bp[1])} / ${n0(bp[0] + bp[1] + bp[2])} %</td><td class="r">${n0(bc[0])} / ${n0(bc[0] + bc[1])} / ${n0(bc[0] + bc[1] + bc[2])} %</td></tr>
            ${heating ? `<tr><td>${L.penetration}</td><td class="r">${n0(Math.min(100, m.penetration * 100))} %</td><td class="r">${n0(Math.min(100, c.metrics.penetration * 100))} %</td></tr>` : ''}
            <tr><td>${L.cleaning}</td><td class="r">${L.washable} / ${inp.condensation ? L.noCond : L.noRisk}</td><td class="r">${L.ductCleaning} / ${inp.condensation ? L.insulation : L.noRisk}</td></tr>
          </tbody></table>
          <h3>${L.checks}</h3>
          <table><tbody>${d.checks.map((ch, i) => `<tr><td style="width:6mm">${chk(ch.level)}</td><td><b>${esc(checkNames ? checkNames[i] : ch.title)}</b>${cz ? `<br><span class="muted">${esc(ch.text)}</span>` : ''}</td></tr>`).join('')}</tbody></table>
        </section>

        <section class="page">${head(5)}
          <h2>${L.bom}</h2>
          <table><thead><tr><th>${L.item}</th><th>${L.spec}</th><th class="r">${L.qty}</th></tr></thead><tbody>
            ${d.bom.map((b, i) => `<tr><td>${esc(bomNames ? bomNames[i] : b.item)}</td><td class="muted">${cz ? esc(b.detail) : ''}</td><td class="r">${n0(b.qty)} ${esc(b.unit)}</td></tr>`).join('')}
          </tbody></table>
          <h2>${L.next}${aiTag}</h2>
          <ul>${(T.doporuceni || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          <div class="disclaimer">Výpočty jsou orientační: integrální model volného proudu (Morton–Taylor–Turner) se vztlakem a stratifikací, hodnocení komfortu dle ISO 7730 (DR) a ASHRAE 113 (ADPI), katalogová data ${COMPANY.name} (Technical data 1/2024). Konečný návrh, výpočet tlakových ztrát, hlukových parametrů a výrobní dokumentaci zpracuje ${COMPANY.name} v programu Air Tailor, pro složité případy CFD simulací. Tento dokument je výstupem konceptu aplikace vytvořeného pro výukové účely a není oficiální nabídkou společnosti ${COMPANY.name}.</div>
        </section>
      </div>`;
    root.querySelector('#repBack').addEventListener('click', () => {
      root.hidden = true;
    });
    root.querySelector('#repPrint').addEventListener('click', () => window.print());
    root.querySelector('#repLang').addEventListener('change', (e) => {
      lang = e.target.value;
      // texty AI v jiném jazyce už neplatí – statické části se přeloží hned
      if (state.proposal && state.proposal.jazyk !== lang) state.proposal = null;
      render(d, shot);
    });
    root.querySelector('#repAi').addEventListener('click', () => {
      root.hidden = true;
      app.setTab('chat');
      sendMessage(`Připrav texty technické nabídky pro zákazníka v jazyce: ${LANGS[lang]} (kód ${lang}). Použij nástroj pripravit_nabidku${lang !== 'cs' ? ' a přelož i názvy položek kusovníku a kontrol (kusovnik_preklad, kontroly_preklad)' : ''}.`);
    });
  };

  app.openReport = open;
  on('proposal', () => {
    if (!root.hidden) open();
  });
}
