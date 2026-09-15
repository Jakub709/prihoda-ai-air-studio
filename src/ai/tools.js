// Nástroje, kterými AI ovládá aplikaci, a jejich vykonání.
import { APPLICATIONS, COLORS, MATERIALS } from '../engine/catalog.js';
import { emit, patchProject, resetProject, state } from '../state.js';
import { app } from '../app.js';
import { n0, n1 } from '../ui/format.js';

export const TOOLS = [
  {
    name: 'upravit_projekt',
    description:
      'Nastaví nebo změní parametry projektu tkaninového rozvodu a přepočítá návrh fyzikálním enginem (stovky variant). Uveď jen parametry, které se mění. Pro nové zadání použij novy_projekt=true (ostatní hodnoty se vezmou ze šablony typu provozu). Hodnota 0 u číselných voleb nebo "auto" = nechat na optimalizátoru. Vrací souhrn nového návrhu: geometrii, typ výustě, komfort (rychlost, DR dle ISO 7730, ADPI), kontroly a srovnání s plechem.',
    input_schema: {
      type: 'object',
      properties: {
        novy_projekt: { type: 'boolean', description: 'true = začít nový projekt ze šablony typu provozu' },
        typ_provozu: { type: 'string', enum: Object.keys(APPLICATIONS), description: 'šablona provozu' },
        nazev: { type: 'string' },
        zakaznik: { type: 'string' },
        misto: { type: 'string' },
        delka_m: { type: 'number', description: 'délka haly (ve směru vyústek), m' },
        sirka_m: { type: 'number', description: 'šířka haly, m' },
        vyska_m: { type: 'number', description: 'světlá výška, m' },
        rezim: { type: 'string', enum: ['cooling', 'heating', 'ventilation'] },
        prutok_m3h: { type: 'number', description: 'celkový průtok vzduchu m³/h' },
        vymena_h: { type: 'number', description: 'intenzita výměny h⁻¹ (použije se, pokud není průtok)' },
        tepelna_zatez_kW: { type: 'number', description: 'chladicí/topný výkon; průtok se dopočte z rozdílu teplot' },
        teplota_privodu_C: { type: 'number' },
        teplota_prostoru_C: { type: 'number' },
        vlhkost_pct: { type: 'number' },
        pobytova_zona_m: { type: 'number', enum: [1.1, 1.8], description: '1,1 sedící, 1,8 stojící' },
        kategorie: { type: 'string', enum: ['A', 'B', 'C'], description: 'kategorie prostředí ISO 7730 (DR < 10/20/30 %)' },
        hluk: { type: 'string', enum: ['quiet', 'normal', 'industrial'] },
        hygiena: { type: 'boolean' },
        eko: { type: 'boolean', description: 'preferovat recyklovaný materiál' },
        nehorlavost_A: { type: 'boolean' },
        tvar: { type: 'string', enum: ['C', 'H'], description: 'C kruhový, H půlkruhový' },
        pocet_vetvi: { type: 'integer', description: '0 = automaticky' },
        vystup: { type: 'string', enum: ['auto', 'microUniform', 'microDirectional', 'perforation', 'smallNozzle', 'bigNozzle'] },
        poloha_otvoru: { type: 'string', enum: ['auto', '2-10', '3-9', '4-8', '5-7', '6'] },
        tlak_Pa: { type: 'number', description: '0 = automaticky' },
        otvor_mm: { type: 'number', description: 'průměr otvoru/trysky, 0 = automaticky' },
        material: { type: 'string', enum: ['auto', ...Object.keys(MATERIALS)] },
        barva: { type: 'string', enum: Object.keys(COLORS), description: 'skladová barva Příhoda' },
        vlastni_barva_hex: { type: 'string', description: 'Prihoda ART – libovolná barva #rrggbb' },
        montaz: { type: 'integer', enum: [0, 1, 2, 3, 5, 6, 8], description: 'typ montáže dle katalogu, 0 = automaticky' },
        predpoklady: { type: 'array', items: { type: 'string' }, description: 'krátké předpoklady, které jsi doplnil (zobrazí se uživateli)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'ovladat_zobrazeni',
    description: 'Přepne pohled aplikace, barevnou mapu pobytové zóny, kameru 3D modelu a vrstvy. Použij pro vysvětlení výsledků (např. ukázat průvan, řez CFD, srovnání s plechovým potrubím).',
    input_schema: {
      type: 'object',
      properties: {
        pohled: { type: 'string', enum: ['design', 'cfd', 'compare', 'analysis', 'report'], description: 'design = 3D návrh, cfd = živá CFD simulace, compare = srovnání s plechem, analysis = grafy/varianty/kusovník, report = nabídka' },
        mapa: { type: 'string', enum: ['none', 'velocity', 'dr', 'temp'], description: 'mapa pobytové zóny v 3D' },
        kamera: { type: 'string', enum: ['overview', 'top', 'section', 'eye', 'fly'] },
        castice: { type: 'boolean', description: 'zobrazit proudění (částice)' },
        svisly_rez: { type: 'boolean', description: 'svislý řez rychlostí ve 3D' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pouzit_variantu',
    description: 'Použije alternativní variantu z optimalizátoru (index 0–5 ze seznamu variant ve stavu návrhu). Zamkne její parametry.',
    input_schema: { type: 'object', properties: { index: { type: 'integer', minimum: 0, maximum: 5 } }, required: ['index'], additionalProperties: false },
  },
  {
    name: 'pripravit_nabidku',
    description: 'Připraví texty technické nabídky pro zákazníka a otevře náhled nabídky (PDF). Piš v požadovaném jazyce, věcně a přesvědčivě; čísla ber ze souhrnu návrhu.',
    input_schema: {
      type: 'object',
      properties: {
        jazyk: { type: 'string', description: 'kód jazyka, např. cs, en, de, sk, pl' },
        osloveni: { type: 'string', description: 'krátký úvodní odstavec pro zákazníka' },
        popis_reseni: { type: 'string', description: 'popis navrženého řešení (1–2 odstavce)' },
        prinosy: { type: 'array', items: { type: 'string' }, description: '4–6 konkrétních přínosů pro tento provoz' },
        doporuceni: { type: 'array', items: { type: 'string' }, description: 'doporučení a další kroky (2–4 body)' },
        kusovnik_preklad: { type: 'array', items: { type: 'string' }, description: 'jen pro jiný jazyk než čeština: překlad názvů položek kusovníku (pole kusovnik ve stavu návrhu) ve stejném pořadí' },
        kontroly_preklad: { type: 'array', items: { type: 'string' }, description: 'jen pro jiný jazyk než čeština: překlad nadpisů kontrol ve stejném pořadí' },
      },
      required: ['jazyk', 'popis_reseni', 'prinosy'],
      additionalProperties: false,
    },
  },
];

/** Kompaktní souhrn návrhu pro model. */
export function designSummary(d = state.design) {
  if (!d) return { stav: 'návrh se počítá' };
  const i = d.inp;
  const m = d.metrics;
  const c = d.conventional;
  return {
    projekt: { nazev: i.name, zakaznik: i.customer || null, misto: i.location || null, typ_provozu: i.appKey },
    prostor: { delka_m: i.L, sirka_m: i.W, vyska_m: i.H, pobytova_zona_m: i.oz },
    vzduch: {
      rezim: i.mode,
      prutok_m3h: Math.round(i.flow),
      zdroj_prutoku: i.flowSource,
      teplota_privodu_C: i.ts,
      teplota_prostoru_C: i.tr,
      vlhkost_pct: i.rh,
      rosny_bod_C: +i.Td.toFixed(1),
      vykon_kW: +Math.abs(i.heatKW).toFixed(1),
      vymena_h: +i.ach.toFixed(1),
    },
    pozadavky: { kriterium: i.catLabel, limit_DR_pct: i.drLimit, max_rychlost_ms: +i.vAllow.toFixed(2), hluk: i.noise, hygiena: i.hygiene },
    navrh: {
      vetve: d.n,
      tvar: d.shape,
      prumer_mm: d.runs[0].D,
      delka_vetve_m: +d.runs[0].len.toFixed(1),
      prutok_vetev_m3h: Math.round(d.runs[0].flowM3h),
      rychlost_v_potrubi_ms: +d.runs[0].vIn.toFixed(2),
      hodnoceni_rychlosti: d.vr.label,
      vystup: d.outlet.name,
      poloha_otvoru: d.outlet.patternName,
      tlak_Pa: d.outlet.p,
      vytokova_rychlost_ms: +d.outlet.u0.toFixed(1),
      otvor_mm: d.outlet.holeSize,
      pocet_otvoru_na_vetev: d.outlet.count ?? null,
      roztec_mm: d.outlet.pitch ? Math.round(d.outlet.pitch * 1000) : null,
      mikrootvoru_na_vetev: d.outlet.microHoles ?? null,
      material: `${d.material.code} (${d.material.name})`,
      barva: d.color.name,
      montaz: `č. ${d.install.no} ${d.install.name}`,
      plocha_tkaniny_m2: Math.round(d.fabricArea),
      hmotnost_kg: Math.round(d.totalWeight),
    },
    komfort: {
      max_rychlost_pobytova_zona_ms: +m.vMax.toFixed(2),
      DR_max_pct: Math.round(m.drMax),
      podil_zony_v_limitu_pct: Math.round(m.drOkShare * 100),
      ADPI_pct: i.mode === 'heating' ? null : Math.round(m.adpi),
      pruniknuti_tepleho_vzduchu_pct: i.mode === 'heating' ? Math.round(Math.min(1.2, m.penetration) * 100) : null,
      gradient_hlava_kotniky_K: i.mode === 'heating' ? +m.gradient.toFixed(1) : null,
      dosah_proudu_m: +(m.throw02 || 0).toFixed(1),
    },
    kontroly: d.checks.map((ch) => `${ch.level.toUpperCase()}: ${ch.title}`),
    kusovnik: d.bom.map((b) => `${b.item} – ${b.qty} ${b.unit}`),
    varianty: d.variants.map((v, k) => `${k}: ${v.n}× Ø${v.D} ${v.outletName} ${v.patternName} ${v.p} Pa${v.holeSize ? ` Ø${v.holeSize}` : ''} → DR ${Math.round(v.drMax)} %, tkanina ${Math.round(v.fabricArea)} m²`),
    srovnani_s_plechem: {
      plech_kg: Math.round(c.steelKg),
      tkanina_kg: Math.round(d.totalWeight),
      montaz_plech_h: Math.round(c.steelHours),
      montaz_tkanina_h: Math.round(c.fabricHours),
      CO2_plech_kg: Math.round(c.co2Steel),
      CO2_tkanina_kg: Math.round(c.co2Fabric),
      plech_DR_max_pct: Math.round(c.metrics.drMax),
      plech_podil_zony_v_limitu_pct: Math.round(c.metrics.drOkShare * 100),
      plech_pruniknuti_pct: i.mode === 'heating' ? Math.round(c.metrics.penetration * 100) : null,
      vyustek_plech: c.nOut,
    },
    vyhodnoceno_variant: d.stats.evaluated,
  };
}

const MAP = {
  typ_provozu: 'app',
  nazev: 'name',
  zakaznik: 'customer',
  misto: 'location',
  delka_m: 'L',
  sirka_m: 'W',
  vyska_m: 'H',
  rezim: 'mode',
  prutok_m3h: 'flow',
  vymena_h: 'ach',
  tepelna_zatez_kW: 'loadKW',
  teplota_privodu_C: 'ts',
  teplota_prostoru_C: 'tr',
  vlhkost_pct: 'rh',
  pobytova_zona_m: 'oz',
  kategorie: 'cat',
  hluk: 'noise',
  hygiena: 'hygiene',
  eko: 'eco',
  nehorlavost_A: 'fireA',
  tvar: 'shape',
  pocet_vetvi: 'runs',
  vystup: 'outlet',
  poloha_otvoru: 'pattern',
  tlak_Pa: 'pressure',
  otvor_mm: 'holeSize',
  material: 'material',
  barva: 'color',
  vlastni_barva_hex: 'customColor',
  montaz: 'install',
};

/** Popis změny pro čip v chatu. */
export function describeToolInput(name, input) {
  if (name === 'upravit_projekt') {
    const parts = [];
    if (input.novy_projekt) parts.push(`nový projekt${input.typ_provozu ? ` (${APPLICATIONS[input.typ_provozu]?.name})` : ''}`);
    if (input.delka_m || input.sirka_m) parts.push(`${input.delka_m ?? '…'} × ${input.sirka_m ?? '…'}${input.vyska_m ? ` × ${input.vyska_m}` : ''} m`);
    else if (input.vyska_m) parts.push(`výška ${input.vyska_m} m`);
    if (input.prutok_m3h) parts.push(`${n0(input.prutok_m3h)} m³/h`);
    if (input.teplota_privodu_C !== undefined) parts.push(`přívod ${input.teplota_privodu_C} °C`);
    if (input.teplota_prostoru_C !== undefined) parts.push(`prostor ${input.teplota_prostoru_C} °C`);
    if (input.rezim) parts.push({ cooling: 'chlazení', heating: 'vytápění', ventilation: 'větrání' }[input.rezim]);
    if (input.barva) parts.push(`barva ${COLORS[input.barva]?.name.toLowerCase()}`);
    if (input.vlastni_barva_hex) parts.push(`barva ${input.vlastni_barva_hex}`);
    if (input.pocet_vetvi) parts.push(`${input.pocet_vetvi} větve`);
    if (input.vystup && input.vystup !== 'auto') parts.push(input.vystup);
    if (input.tvar) parts.push(input.tvar === 'H' ? 'půlkruh' : 'kruh');
    if (input.hluk) parts.push(`hluk: ${input.hluk}`);
    if (input.kategorie) parts.push(`kat. ${input.kategorie}`);
    const rest = Object.keys(input).filter((k) => !['novy_projekt', 'typ_provozu', 'delka_m', 'sirka_m', 'vyska_m', 'prutok_m3h', 'teplota_privodu_C', 'teplota_prostoru_C', 'rezim', 'barva', 'vlastni_barva_hex', 'pocet_vetvi', 'vystup', 'tvar', 'hluk', 'kategorie', 'predpoklady'].includes(k));
    if (rest.length) parts.push(rest.join(', '));
    return `Upravuji návrh: ${parts.join(' · ') || 'parametry'}`;
  }
  if (name === 'ovladat_zobrazeni') {
    const v = { design: '3D návrh', cfd: 'CFD simulace', compare: 'srovnání s plechem', analysis: 'analýza', report: 'nabídka' };
    const mp = { none: 'bez mapy', velocity: 'mapa rychlosti', dr: 'mapa průvanu', temp: 'mapa teplot' };
    const cm = { overview: 'přehled', top: 'půdorys', section: 'řez', eye: 'očima pracovníka', fly: 'průlet' };
    return `Zobrazuji: ${[input.pohled && v[input.pohled], input.mapa && mp[input.mapa], input.kamera && cm[input.kamera]].filter(Boolean).join(' · ') || 'vrstvy'}`;
  }
  if (name === 'pouzit_variantu') return `Používám variantu č. ${input.index}`;
  if (name === 'pripravit_nabidku') return `Připravuji nabídku (${input.jazyk || 'cs'})`;
  return name;
}

/** Vykoná nástroj; vrací { content (pro model), summary (pro čip) }. */
export async function runTool(name, input) {
  if (name === 'upravit_projekt') {
    const patch = {};
    for (const [k, v] of Object.entries(input)) {
      if (!(k in MAP) || v === undefined || v === null) continue;
      let val = v;
      if (['pocet_vetvi', 'tlak_Pa', 'otvor_mm', 'montaz'].includes(k) && (+v === 0 || v === 'auto')) val = 'auto';
      if (k === 'material' && v === 'auto') val = 'auto';
      patch[MAP[k]] = val;
    }
    if (patch.color) patch.customColor = null;
    if (patch.flow) {
      patch.loadKW = null;
    } else if (patch.loadKW || patch.ach) patch.flow = null;
    if (Array.isArray(input.predpoklady)) {
      state.assumptions = input.predpoklady.slice(0, 8);
      emit('assumptions');
    }
    if (input.novy_projekt) {
      const key = patch.app && APPLICATIONS[patch.app] ? patch.app : state.project.app;
      const a = APPLICATIONS[key];
      if (!patch.name) patch.name = patch.customer ? `${a.name} – ${patch.customer}` : a.name;
      resetProject(key, patch, { source: 'ai' });
    } else {
      if (patch.app && patch.app !== state.project.app) {
        // změna typu provozu bez resetu – jen šablonové doplňky
      }
      const changed = patchProject(patch, { source: 'ai' });
      if (!changed.length) return { content: JSON.stringify({ zmena: 'žádná (hodnoty už byly nastaveny)', navrh: designSummary() }), summary: 'Beze změny', noChange: true };
    }
    const d = await app.requestDesign({ immediate: true, progress: !!input.novy_projekt });
    if (!d) return { content: 'Výpočet návrhu nedoběhl včas.', summary: 'Výpočet se zpozdil', error: true };
    return {
      content: JSON.stringify(designSummary(d)),
      summary: `Návrh přepočítán: ${d.n}× Ø${d.runs[0].D} · ${d.outlet.short} · DR ${n0(d.metrics.drMax)} % · ${n0(d.stats.evaluated)} variant`,
    };
  }
  if (name === 'ovladat_zobrazeni') {
    if (input.pohled) {
      if (input.pohled === 'report') app.openReport();
      else app.setView(input.pohled);
    }
    const lp = {};
    if (input.mapa) lp.heat = input.mapa;
    if (input.castice !== undefined) lp.particles = input.castice;
    if (input.svisly_rez !== undefined) lp.section = input.svisly_rez;
    if (Object.keys(lp).length) {
      Object.assign(state.layers, lp);
      app.viz.setLayers(state.layers);
      emit('design', state.design);
    }
    if (input.kamera) {
      if (!input.pohled || input.pohled === 'design' || input.pohled === 'compare') app.setView(input.pohled || (state.view === 'compare' ? 'compare' : 'design'));
      app.viz.setCamera(input.kamera);
    }
    return { content: 'Zobrazeno.', summary: describeToolInput(name, input).replace('Zobrazuji', 'Zobrazeno') };
  }
  if (name === 'pouzit_variantu') {
    const v = state.design?.variants?.[input.index];
    if (!v) return { content: 'Varianta neexistuje.', summary: 'Varianta neexistuje', error: true };
    emit('applyVariant', input.index);
    const d = await app.requestDesign({ immediate: true });
    return { content: JSON.stringify(designSummary(d)), summary: `Použita varianta: ${v.n}× Ø${v.D} · ${v.outletName}` };
  }
  if (name === 'pripravit_nabidku') {
    state.proposal = { ...input, at: Date.now() };
    emit('proposal', state.proposal);
    app.openReport();
    return { content: 'Nabídka připravena a otevřena v náhledu. Uživatel ji může vytisknout do PDF.', summary: `Nabídka připravena (${input.jazyk || 'cs'})` };
  }
  return { content: `Neznámý nástroj ${name}`, summary: 'Neznámý nástroj', error: true };
}

export function summaryLine(d = state.design) {
  if (!d) return '';
  return `${d.n}× ${d.shape === 'C' ? 'Ø' : 'H'}${d.runs[0].D} mm · ${n1(d.runs[0].len)} m · ${d.outlet.name} ${d.outlet.patternName} · ${d.outlet.p} Pa`;
}
