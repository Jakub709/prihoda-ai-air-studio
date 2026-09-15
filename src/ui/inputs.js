// Levý panel: parametry projektu (skupiny, obousměrná vazba na stav, zvýraznění změn od AI).
import { APPLICATIONS, COLORS, INSTALLATIONS, MATERIALS, MODES, NOISE_CLASSES, OUTLETS } from '../engine/catalog.js';
import { PATTERNS } from '../engine/designer.js';
import { emit, on, patchProject, resetProject, state } from '../state.js';
import { esc, n0, n1 } from './format.js';

const AUTO = 'auto';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const numField = (key, label, unitTxt, { step = 'any', min, max, full = false, allowAuto = false, placeholder = '' } = {}) => ({
  key,
  html: `<div class="field ${full ? 'full' : ''}" data-key="${key}">
      <label>${label}${allowAuto ? '<span class="auto" hidden>auto</span>' : ''}</label>
      <div class="inp"><input type="number" inputmode="decimal" step="${step}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} placeholder="${placeholder}" /><span class="unit">${unitTxt}</span></div>
    </div>`,
  bind(root) {
    const input = root.querySelector('input');
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      if (raw === '' && allowAuto) patchProject({ [key]: AUTO });
      else if (raw !== '' && Number.isFinite(+raw)) patchProject({ [key]: +raw });
    });
    return (p, d) => {
      const v = p[key];
      const isAuto = v === AUTO || v === null || v === undefined;
      if (document.activeElement !== input) input.value = isAuto ? '' : v;
      if (allowAuto) {
        root.querySelector('.auto').hidden = !isAuto;
        input.placeholder = isAuto && d ? autoValue(key, d) : placeholder;
      }
    };
  },
});

function autoValue(key, d) {
  switch (key) {
    case 'pressure':
      return `${d.outlet.p}`;
    case 'mountHeight':
      return n1(d.geo.zc);
    case 'flow':
      return n0(d.inp.flow);
    default:
      return '';
  }
}

const selField = (key, label, options, { full = false, allowAuto = true, autoLabel } = {}) => ({
  key,
  html: `<div class="field ${full ? 'full' : ''}" data-key="${key}">
      <label>${label}${allowAuto ? '<span class="auto" hidden>auto</span>' : ''}</label>
      <div class="inp"><select>${allowAuto ? `<option value="auto">Automaticky</option>` : ''}${options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>
    </div>`,
  bind(root) {
    const sel = root.querySelector('select');
    sel.addEventListener('change', () => {
      const v = sel.value;
      patchProject({ [key]: v === AUTO ? AUTO : Number.isFinite(+v) && key !== 'pattern' ? +v : v });
    });
    return (p, d) => {
      const v = p[key];
      const isAuto = v === AUTO || v === null || v === undefined;
      sel.value = isAuto ? AUTO : String(v);
      if (allowAuto) {
        root.querySelector('.auto').hidden = !isAuto;
        const o = sel.querySelector('option[value="auto"]');
        if (o) o.textContent = isAuto && d && autoLabel ? `Auto · ${autoLabel(d)}` : 'Automaticky';
      }
    };
  },
});

const segField = (key, label, options, { full = true, cls = '' } = {}) => ({
  key,
  html: `<div class="field ${full ? 'full' : ''}" data-key="${key}">
      <label>${label}</label>
      <div class="seg ${cls}">${options.map(([v, t]) => `<button type="button" data-v="${esc(v)}">${esc(t)}</button>`).join('')}</div>
    </div>`,
  bind(root) {
    root.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const v = b.dataset.v;
        const patch = { [key]: v };
        if (key === 'mode' && v === 'ventilation') patch.ts = state.project.tr;
        patchProject(patch);
      }),
    );
    return (p) => {
      root.querySelectorAll('button').forEach((b) => b.classList.toggle('active', String(p[key]) === b.dataset.v));
    };
  },
});

const toggleField = (key, label, note) => ({
  key,
  html: `<div class="field full" data-key="${key}">
      <div class="toggle-row"><span>${label}${note ? `<br><span class="note">${note}</span>` : ''}</span><label class="switch"><input type="checkbox" /><span></span></label></div>
    </div>`,
  bind(root) {
    const cb = root.querySelector('input');
    cb.addEventListener('change', () => patchProject({ [key]: cb.checked }));
    return (p) => {
      cb.checked = !!p[key];
    };
  },
});

const textField = (key, label, placeholder = '') => ({
  key,
  html: `<div class="field full" data-key="${key}"><label>${label}</label><div class="inp"><input type="text" placeholder="${esc(placeholder)}" /></div></div>`,
  bind(root) {
    const input = root.querySelector('input');
    input.addEventListener('change', () => patchProject({ [key]: input.value }));
    return (p) => {
      if (document.activeElement !== input) input.value = p[key] || '';
    };
  },
});

const colorField = {
  key: 'color',
  html: `<div class="field full" data-key="color">
      <label>Barva tkaniny <span class="note" id="colorName"></span></label>
      <div class="swatches">
        ${Object.values(COLORS).map((c) => `<button type="button" class="swatch" data-c="${c.code}" title="${c.name} (${c.ral})" style="background:${c.hex}"></button>`).join('')}
        <label class="swatch art" title="Prihoda ART – libovolná barva"><input type="color" value="#00a98e" /></label>
      </div>
      <div class="toggle-row" style="margin-top:6px"><span class="note">Prihoda ART – logo nebo motiv na vyústce</span><button type="button" class="btn sm" id="artBtn">Nahrát logo</button><input type="file" accept="image/*" id="artFile" hidden /></div>
    </div>`,
  bind(root) {
    root.querySelectorAll('.swatch[data-c]').forEach((b) => b.addEventListener('click', () => patchProject({ color: b.dataset.c, customColor: null })));
    const ci = root.querySelector('input[type=color]');
    ci.addEventListener('input', () => patchProject({ customColor: ci.value }));
    const file = root.querySelector('#artFile');
    root.querySelector('#artBtn').addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => emit('art', img);
      img.src = URL.createObjectURL(f);
    });
    return (p) => {
      root.querySelectorAll('.swatch[data-c]').forEach((b) => b.classList.toggle('active', !p.customColor && p.color === b.dataset.c));
      root.querySelector('.swatch.art').classList.toggle('active', !!p.customColor);
      const c = p.customColor ? { name: `ART ${p.customColor}` } : COLORS[p.color];
      root.querySelector('#colorName').textContent = c ? c.name + (c.ral ? ` · ${c.ral}` : '') : '';
    };
  },
};

function groups() {
  const apps = Object.values(APPLICATIONS).map((a) => [a.key, `${a.icon}  ${a.name}`]);
  return [
    {
      id: 'space',
      title: 'Prostor',
      icon: '⬚',
      open: true,
      summary: (p) => `${n1(p.L)} × ${n1(p.W)} × ${n1(p.H)} m`,
      fields: [
        selField('app', 'Typ provozu', apps, { full: true, allowAuto: false }),
        numField('L', 'Délka', 'm', { min: 4, max: 300 }),
        numField('W', 'Šířka', 'm', { min: 3, max: 150 }),
        numField('H', 'Světlá výška', 'm', { min: 2.4, max: 30 }),
        selField('oz', 'Pobytová zóna', [[1.1, '1,1 m – sedící'], [1.8, '1,8 m – stojící']], { allowAuto: false }),
        numField('mountHeight', 'Výška osy vyústky', 'm', { allowAuto: true, full: true }),
      ],
    },
    {
      id: 'air',
      title: 'Vzduch',
      icon: '≋',
      open: true,
      summary: (p, d) => (d ? `${n0(d.inp.flow)} m³/h · ${MODES[d.inp.mode].split(' ')[0]}` : ''),
      fields: [
        segField('mode', 'Režim', Object.entries(MODES).map(([k, v]) => [k, v.split(' ')[0]]), { cls: 'mode' }),
        numField('flow', 'Průtok vzduchu', 'm³/h', { full: true, allowAuto: true, min: 200 }),
        numField('ts', 'Teplota přívodu', '°C'),
        numField('tr', 'Teplota v prostoru', '°C'),
        numField('rh', 'Relativní vlhkost', '%', { min: 5, max: 98 }),
        {
          key: '_info',
          html: '<div class="field" data-key="_info"><label>Výkon / výměna</label><div class="inp"><input type="text" readonly tabindex="-1" /></div></div>',
          bind(root) {
            const i = root.querySelector('input');
            return (p, d) => {
              if (!d) return;
              i.value = `${n1(Math.abs(d.inp.heatKW))} kW · ${n1(d.inp.ach)} h⁻¹`;
            };
          },
        },
      ],
    },
    {
      id: 'req',
      title: 'Požadavky',
      icon: '✓',
      open: false,
      summary: (p) => `kat. ${p.cat} · ${NOISE_CLASSES[p.noise]?.name.split(' ')[0] ?? ''}`,
      fields: [
        segField('cat', 'Kategorie prostředí (ISO 7730)', [['A', 'A · DR < 10 %'], ['B', 'B · < 20 %'], ['C', 'C · < 30 %']]),
        selField('noise', 'Hluk / rychlost v potrubí', Object.values(NOISE_CLASSES).map((n) => [n.key, `${n.name} (${n.note.split(':')[1]?.trim() ?? ''})`]), { full: true, allowAuto: false }),
        toggleField('hygiene', 'Zvýšené hygienické nároky', 'antibakteriální Premium, praní'),
        toggleField('eco', 'Preferovat recyklovaný materiál', 'Prihoda Recycled – z PET lahví'),
        toggleField('fireA', 'Nehořlavost třídy A', 'skelná tkanina NHE'),
      ],
    },
    {
      id: 'duct',
      title: 'Rozvod',
      icon: '⌇',
      open: true,
      summary: (p, d) => (d ? `${d.n}× ${d.shape === 'C' ? 'Ø' : 'H'}${d.runs[0].D} · ${d.outlet.short}` : ''),
      fields: [
        segField('shape', 'Tvar průřezu', [['C', 'Kruhový (C)'], ['H', 'Půlkruhový (H)']]),
        selField('runs', 'Počet větví', [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, `${n}`]), { autoLabel: (d) => `${d.n}` }),
        selField('outlet', 'Výstup vzduchu', Object.values(OUTLETS).map((o) => [o.key, o.name]), { autoLabel: (d) => d.outlet.short }),
        selField('pattern', 'Poloha otvorů', Object.values(PATTERNS).map((pt) => [pt.key, `${pt.name} – ${pt.desc}`]), { autoLabel: (d) => d.outlet.patternName }),
        numField('pressure', 'Statický tlak', 'Pa', { allowAuto: true, min: 20, max: 450 }),
        selField('holeSize', 'Otvor / tryska', [4, 6, 8, 10, 12, 16, 20, 30, 40, 50, 60, 80, 100].map((s) => [s, `Ø ${s} mm`]), { autoLabel: (d) => (d.outlet.holeSize ? `Ø ${d.outlet.holeSize}` : '–') }),
      ],
    },
    {
      id: 'look',
      title: 'Tkanina a vzhled',
      icon: '◐',
      open: false,
      summary: (p, d) => (d ? `${d.material.code} · ${d.color.name}` : ''),
      fields: [
        selField('material', 'Materiál', Object.values(MATERIALS).map((mt) => [mt.code, `${mt.code} – ${mt.family}${mt.permeable ? ', prodyšná' : ''}`]), { full: true, autoLabel: (d) => d.material.code }),
        colorField,
        selField('install', 'Typ montáže', Object.values(INSTALLATIONS).map((i) => [i.no, `č. ${i.no} – ${i.name}`]), { full: true, autoLabel: (d) => `č. ${d.install.no}` }),
      ],
    },
    {
      id: 'meta',
      title: 'Projekt',
      icon: '✎',
      open: false,
      summary: (p) => p.customer || '',
      fields: [
        textField('name', 'Název projektu'),
        textField('customer', 'Zákazník', 'např. Pekárna Hlinsko a.s.'),
        textField('location', 'Místo stavby', 'např. Hlinsko'),
        {
          key: '_io',
          html: `<div class="field full" data-key="_io"><label>Soubor projektu</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn sm" data-io="save">Uložit (.json)</button><button type="button" class="btn sm" data-io="load">Načíst</button><button type="button" class="btn sm" data-io="link">Kopírovat odkaz</button><input type="file" accept=".json,application/json" hidden data-io="file" /></div></div>`,
          bind(root) {
            const file = root.querySelector('[data-io="file"]');
            root.querySelector('[data-io="save"]').addEventListener('click', () => {
              const blob = new Blob([JSON.stringify({ app: 'prihoda-ai-air-studio', version: 1, project: state.project }, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${(state.project.name || 'projekt').replace(/[^\wÀ-ž\- ]+/g, '_')}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            });
            root.querySelector('[data-io="load"]').addEventListener('click', () => file.click());
            file.addEventListener('change', async () => {
              const f = file.files[0];
              file.value = '';
              if (!f) return;
              try {
                const j = JSON.parse(await f.text());
                const p = j.project || j;
                resetProject(APPLICATIONS[p.app] ? p.app : 'food', p, { source: 'preset' });
                emit('toast', `Načten projekt „${p.name || f.name}“`);
              } catch {
                emit('toast', 'Soubor nelze načíst – není to projekt Air Studia.');
              }
            });
            root.querySelector('[data-io="link"]').addEventListener('click', async () => {
              const enc = btoa(unescape(encodeURIComponent(JSON.stringify(state.project))));
              const url = `${location.href.split('#')[0]}#p=${enc}`;
              try {
                await navigator.clipboard.writeText(url);
                emit('toast', 'Odkaz na projekt zkopírován do schránky');
              } catch {
                prompt('Odkaz na projekt:', url);
              }
            });
            return () => {};
          },
        },
      ],
    },
  ];
}

export function mountInputs(container) {
  const gs = groups();
  const updaters = [];
  const summaries = [];
  container.innerHTML = '';
  for (const g of gs) {
    const det = el(`<details class="group" ${g.open ? 'open' : ''} data-group="${g.id}">
      <summary><span class="gico">${g.icon}</span>${g.title}<span class="gsum"></span></summary>
      <div class="group-body"></div></details>`);
    const body = det.querySelector('.group-body');
    for (const f of g.fields) {
      const node = el(f.html);
      body.appendChild(node);
      const up = f.bind(node);
      updaters.push({ key: f.key, node, up });
    }
    summaries.push({ g, node: det.querySelector('.gsum') });
    container.appendChild(det);
  }
  // přepnutí typu provozu = nová šablona (zachová rozměry, pokud je uživatel změnil ručně)
  const appSel = container.querySelector('[data-key="app"] select');
  appSel.addEventListener('change', (e) => {
    e.stopImmediatePropagation();
    const a = APPLICATIONS[appSel.value];
    resetProject(a.key, { name: a.name, customer: state.project.customer, location: state.project.location });
  }, true);

  const refresh = () => {
    const p = state.project;
    const d = state.design;
    for (const u of updaters) u.up(p, d);
    for (const s of summaries) s.node.textContent = s.g.summary(p, d);
  };
  on('project', ({ changed, source }) => {
    refresh();
    if (source === 'ai') flashFields(container, changed);
  });
  on('design', refresh);
  refresh();
}

/** Zvýrazní pole, která změnila AI (otevře jejich skupinu). */
export function flashFields(container, keys) {
  for (const k of keys) {
    const f = container.querySelector(`[data-key="${k}"]`);
    if (!f) continue;
    const det = f.closest('details');
    if (det && !det.open) det.open = true;
    const box = f.querySelector('.inp, .seg, .swatches, .toggle-row');
    if (box) {
      box.classList.remove('changed');
      void box.offsetWidth;
      box.classList.add('changed');
    }
  }
}
