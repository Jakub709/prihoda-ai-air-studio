// Pravý panel – výsledky návrhu.
import { MODES } from '../engine/catalog.js';
import { emit, on, state } from '../state.js';
import { esc, n0, n1, n2, plural } from './format.js';

const ICON = { ok: '✓', warn: '!', err: '×', info: 'i' };

export function mountResults(container) {
  const render = () => {
    const d = state.design;
    if (!d) {
      container.innerHTML = '<div class="chat-empty"><b>Počítám návrh…</b>Fyzikální model vyhodnocuje stovky variant.</div>';
      return;
    }
    const inp = d.inp;
    const m = d.metrics;
    const conv = d.conventional;
    const worst = d.checks.some((c) => c.level === 'err') ? 'err' : d.checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
    const verdictTxt = { ok: 'Návrh splňuje všechna kritéria', warn: 'Návrh s upozorněním', err: 'Návrh vyžaduje úpravu' }[worst];
    const heating = inp.mode === 'heating';
    const vSt = m.vMax <= inp.vAllow * 1.05 ? 'ok' : m.vMax <= inp.vAllow * 1.3 ? 'warn' : 'err';
    const drSt = m.drMax <= inp.drLimit ? 'ok' : m.drMax <= inp.drLimit + 15 ? 'warn' : 'err';
    const vr = d.vr.level === 'green' ? 'ok' : d.vr.level === 'blue' ? 'info' : d.vr.level === 'orange' ? 'warn' : 'err';
    const weightSave = 100 * (1 - d.totalWeight / conv.steelKg);
    const ceilJet = d.trajs.some((t) => t.info.ceilingAttached);
    const kpi = (k, v, u, dsc, st, bar) => `<div class="kpi">${st ? `<span class="st ${st}"></span>` : ''}<div class="k">${k}</div><div class="v">${v}<small>${u}</small></div><div class="d">${dsc}</div>${bar !== undefined ? `<div class="bar"><i style="width:${Math.max(3, Math.min(100, bar))}%"></i></div>` : ''}</div>`;

    container.innerHTML = `
      <div class="hero">
        <div class="kicker">Návrh tkaninového rozvodu</div>
        <div class="headline">${d.n}× ${d.shape === 'C' ? 'Ø' : 'H '}${d.runs[0].D} mm <span style="color:var(--text-3);font-weight:500">·</span> ${n1(d.runs[0].len)} m</div>
        <div class="sub">${esc(d.outlet.name)} · ${esc(d.outlet.patternName)} · ${d.outlet.p} Pa · ${esc(d.material.code)} ${esc(d.color.name.toLowerCase())}</div>
        <div class="verdict ${worst}">${ICON[worst]} ${verdictTxt}</div>
      </div>
      ${state.assumptions.length ? `<div class="section-t">Předpoklady AI</div><div class="assumptions">${state.assumptions.map((a) => `<span class="assumption">${esc(a)}</span>`).join('')}</div>` : ''}
      <div class="kpis">
        ${kpi('Max. rychlost v pobytové zóně', n2(m.vMax), ' m/s', `limit ${n2(inp.vAllow)} m/s při ${n1(inp.tr)} °C`, vSt)}
        ${heating
          ? kpi('Zóna v limitu rychlosti', n0(m.vOkShare * 100), ' %', `teplý vzduch · DR ${n0(m.drMax)} % (info)`, m.vOkShare >= 0.95 ? 'ok' : m.vOkShare >= 0.8 ? 'warn' : 'err', m.vOkShare * 100)
          : kpi('Riziko průvanu DR', n0(m.drMax), ' %', `${esc(inp.catLabel)}`, drSt, (m.drMax / Math.max(1, inp.drLimit)) * 70)}
        ${heating
          ? kpi('Rozdíl teplot hlava–kotníky', n1(m.gradient), ' K', `průnik teplého vzduchu ${n0(Math.min(100, m.penetration * 100))} %`, m.gradient <= 3 && m.penetration >= 0.9 ? 'ok' : 'warn')
          : kpi('ADPI (ASHRAE 113)', n0(m.adpi), ' %', 'kvalita distribuce, > 80 % výborné', m.adpi >= 80 ? 'ok' : m.adpi >= 65 ? 'warn' : 'err', m.adpi)}
        ${kpi('Rychlost v potrubí', n1(d.runs[0].vIn), ' m/s', `${esc(d.vr.label)} · ${esc(inp.noiseClass.name.toLowerCase())}`, vr)}
        ${kpi('Statický tlak', n0(d.outlet.p), ' Pa', `externí ≈ ${n0(d.extPressure)} Pa · ventilátor ≈ ${n1(d.fanPowerW / 1000)} kW`, d.outlet.p >= 50 ? 'ok' : 'warn')}
        ${kpi('Dosah proudu (0,2 m/s)', n1(m.throw02 || 0), ' m', ceilJet ? `vč. přilnutí ke stropu (Coandův jev) · katalog pro volný proud ${d.outlet.throwRange[0]}–${d.outlet.throwRange[1]} m` : `katalog: ${d.outlet.throwRange[0]}–${d.outlet.throwRange[1]} m`, null)}
        ${kpi(`${inp.mode === 'heating' ? 'Topný' : inp.mode === 'cooling' ? 'Chladicí' : 'Tepelný'} výkon přívodu`, n1(Math.abs(inp.heatKW)), ' kW', `${n0(inp.flow)} m³/h · ${n1(inp.ach)} výměn/h`, null)}
        ${kpi('Hmotnost rozvodu', n0(d.totalWeight), ' kg', `plech ≈ ${n0(conv.steelKg)} kg → úspora ${n0(weightSave)} %`, 'ok', 100 - weightSave)}
      </div>
      <div class="section-t">Kontroly návrhu</div>
      <div class="checks">${d.checks.map((c) => `<div class="check ${c.level}"><span class="ci">${ICON[c.level]}</span><b>${esc(c.title)}</b><p>${esc(c.text)}</p></div>`).join('')}</div>
      <div class="section-t">Proč právě tento návrh</div>
      <ul class="rationale">${d.rationale.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="section-t"><span>Specifikace</span><span>${esc(MODES[inp.mode])}</span></div>
      <table class="spec">
        <tr><td>Tvar / průměr</td><td>${esc(d.shapeName)} ${d.runs[0].D} mm</td></tr>
        <tr><td>Počet větví × délka</td><td>${d.n} × ${n1(d.runs[0].len)} m</td></tr>
        <tr><td>Průtok na větev</td><td>${n0(d.runs[0].flowM3h)} m³/h</td></tr>
        <tr><td>Výstup vzduchu</td><td>${esc(d.outlet.name)}</td></tr>
        <tr><td>Poloha otvorů</td><td>${esc(d.outlet.patternName)} (${esc(d.outlet.patternDesc)})</td></tr>
        ${d.outlet.kind === 'holes'
          ? `<tr><td>Otvory na větev</td><td>${n0(d.outlet.count)} × Ø ${d.outlet.holeSize} mm</td></tr><tr><td>Rozteč v řadě</td><td>${d.outlet.pitch >= 1 ? n2(d.outlet.pitch) + ' m' : n0(d.outlet.pitch * 1000) + ' mm'}</td></tr>`
          : `<tr><td>Mikrootvory na větev</td><td>≈ ${n1(d.outlet.microHoles / 1e6)} mil.</td></tr>`}
        <tr><td>Výtoková rychlost</td><td>${n1(d.outlet.u0)} m/s</td></tr>
        <tr><td>Díly / zipy na větev</td><td>${d.runs[0].parts + 1} / ${d.runs[0].zippers}</td></tr>
        <tr><td>Materiál</td><td>${esc(d.material.code)} · ${esc(d.material.name)}</td></tr>
        <tr><td>Barva</td><td>${esc(d.color.name)}${d.color.ral ? ` (${esc(d.color.ral)})` : ''}</td></tr>
        <tr><td>Montáž</td><td>č. ${d.install.no} – ${esc(d.install.name)}</td></tr>
        <tr><td>Plocha tkaniny</td><td>${n0(d.fabricArea)} m²${d.material.recycled ? ` · ♻ ${n0(d.fabricArea * 13)} PET lahví` : ''}</td></tr>
        <tr><td>Rosný bod prostoru</td><td>${n1(inp.Td)} °C</td></tr>
      </table>
      <div class="section-t"><span>Alternativní varianty</span><span>${n0(d.stats.evaluated)} vyhodnoceno za ${n0(d.stats.ms)} ms</span></div>
      <table class="data">
        <thead><tr><th>Varianta</th><th class="r">DR</th><th class="r">Tkanina</th></tr></thead>
        <tbody>${d.variants.slice(0, 4).map((v, i) => `<tr class="clickable ${i === 0 ? 'best' : ''}" data-v="${i}"><td>${i === 0 ? '<span class="pill best">zvoleno</span> ' : ''}${v.n}× Ø${v.D} · ${esc(v.outletName)}<br><span class="muted">${esc(v.patternName)} · ${v.p} Pa${v.holeSize ? ` · Ø${v.holeSize} mm` : ''}</span></td><td class="r">${n0(v.drMax)} %</td><td class="r">${n0(v.fabricArea)} m²</td></tr>`).join('')}</tbody>
      </table>
      <button class="btn sm" id="allVariants" style="align-self:flex-start">Všechny varianty a grafy →</button>
    `;
    container.querySelectorAll('tr[data-v]').forEach((tr) => tr.addEventListener('click', () => emit('applyVariant', +tr.dataset.v)));
    container.querySelector('#allVariants').addEventListener('click', () => emit('setView', 'analysis'));
    void plural;
  };
  on('design', render);
  on('assumptions', render);
  render();
}
