// Offline porozumění českému zadání (bez API) – regulární výrazy + doménová pravidla.
// Slouží jako záloha, když není k dispozici Claude API.
import { APPLICATIONS, COLORS } from '../engine/catalog.js';

const NUM = '(-?\\d+(?:[.,]\\d+)?)';
const toNum = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));

const APP_RULES = [
  ['cold', /chladír|mrazír|mrazák|nízk\w* teplot|chlazen\w* sklad|zrání masa/i],
  ['pool', /bazén|aquapark|plaveck|wellness|lázn|sauna/i],
  ['kitchen', /kuchyn|gastro|restaura|jídeln|vývařovn|menz/i],
  ['lab', /laborato|čist\w* prostor|cleanroom|lékárn|nemocnic|operační|farmac/i],
  ['food', /pekárn|masn|mlékárn|potravin|cukrárn|uzen|jatk|porcov|balírn|pivovar|sýrárn|výrob\w* (?:pečiva|jídel|potravin)/i],
  ['sports', /sportov|tělocvičn|fotbal|hokej|stadion|arén|fitness|fitko|posilovn|hřiště/i],
  ['store', /supermarket|hypermarket|obchod|prodejn|market|nákupn|showroom/i],
  ['office', /kancelář|open ?space|kancl|zasedač|coworking|call ?cent|škol|učebn|tříd/i],
  ['warehouse', /sklad|logisti|distribučn|expedic/i],
  ['industry', /výrobn\w* hal|průmysl|dílna|dílny|montáž|lakovn|svařovn|strojírn|výrob[auy]\b|hala/i],
];

const COLOR_RULES = [
  ['LB', /světle ?modr/i],
  ['DG', /tmavě ?šed|antracit/i],
  ['BL', /modr/i],
  ['RE', /červen|rud/i],
  ['GR', /zelen/i],
  ['YE', /žlut/i],
  ['BC', /čern/i],
  ['LG', /šed|stříbr/i],
  ['WH', /bíl/i],
];

export function parseBrief(text, current = null) {
  const t = ` ${text.replace(/ /g, ' ')} `;
  const patch = {};
  const found = [];
  const assumptions = [];

  // typ provozu
  let app = null;
  for (const [key, re] of APP_RULES) {
    if (re.test(t)) {
      app = key;
      break;
    }
  }

  // rozměry: 30 × 18 (× 5,5) m
  const dimRe = new RegExp(`${NUM}\\s*(?:m\\s*)?(?:×|x|\\*|krát|na)\\s*${NUM}(?:\\s*(?:m\\s*)?(?:×|x|\\*|krát|na)\\s*${NUM})?`, 'i');
  const dm = t.match(dimRe);
  if (dm) {
    const a = toNum(dm[1]);
    const b = toNum(dm[2]);
    patch.L = Math.max(a, b);
    patch.W = Math.min(a, b);
    if (dm[3]) patch.H = toNum(dm[3]);
    found.push('rozměry');
  }
  const single = (re) => {
    const m = t.match(re);
    return m ? toNum(m[1]) : null;
  };
  const len = single(new RegExp(`(?:délk\\w*|dlouh\\w*)\\D{0,12}?${NUM}\\s*m`, 'i'));
  const wid = single(new RegExp(`(?:šířk\\w*|širok\\w*)\\D{0,12}?${NUM}\\s*m`, 'i'));
  const hei = single(new RegExp(`(?:výšk\\w*|výšce|vysok\\w*|strop\\w*)\\D{0,16}?${NUM}\\s*m(?![³3])`, 'i'));
  if (len) patch.L = len;
  if (wid) patch.W = wid;
  if (hei) patch.H = hei;
  const area = single(new RegExp(`${NUM}\\s*(?:m2|m²|metrů čtverečních)`, 'i'));
  if (area && !patch.L) {
    const w = Math.sqrt(area / 1.6);
    patch.W = Math.round(w);
    patch.L = Math.round(area / patch.W);
    assumptions.push(`Z plochy ${area} m² odhadnut půdorys ${patch.L} × ${patch.W} m`);
  }

  // průtok
  const flowRe = /(\d[\d\s.]*(?:[.,]\d+)?)\s*(tisíc|tis\.?|k)?\s*(?:m3|m³|m\^3|kubík\w*|metrů krychlových)\s*(?:\/|za\s*|v\s*)?\s*(?:h\b|hod)/i;
  const fm = t.match(flowRe);
  if (fm) {
    let f = toNum(fm[1].replace(/\.(?=\d{3})/g, ''));
    if (fm[2]) f *= 1000;
    patch.flow = Math.round(f);
    found.push('průtok');
  }
  const ach = single(new RegExp(`${NUM}\\s*(?:×|x|krát)?\\s*(?:výměn|h-1|h⁻¹)`, 'i'));
  if (ach && !patch.flow) {
    patch.ach = ach;
    patch.flow = null;
  }
  const kw = single(new RegExp(`${NUM}\\s*kW`, 'i'));
  if (kw && !patch.flow) {
    patch.loadKW = kw;
    patch.flow = null;
    assumptions.push(`Průtok dopočten z výkonu ${kw} kW a rozdílu teplot`);
  }

  // režim
  if (/chlazen|chladit|klimatiz|ochlaz/i.test(t)) patch.mode = 'cooling';
  if (/vytápěn|topen|teplovzdušn|vytápět|ohřev|temperov/i.test(t)) patch.mode = patch.mode === 'cooling' ? 'cooling' : 'heating';
  if (!patch.mode && /větrán|výměn\w* vzduchu|čerstv\w* vzduch/i.test(t)) patch.mode = 'ventilation';

  // teploty s kontextem
  const temps = [];
  // dvojice „26/20 °C“
  const pair = t.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)\s*°\s*C/i);
  if (pair) {
    temps.push({ v: toNum(pair[1]), role: null }, { v: toNum(pair[2]), role: null });
  }
  const tRe = /(-?\d+(?:[.,]\d+)?)\s*°\s*C|(-?\d+(?:[.,]\d+)?)\s*stup\w*/gi;
  let m;
  let prevEnd = 0;
  const TS_RE = /přívod|přivád|přiváděn|foukat|z jednotky|vyfuk|ven z/g;
  const TR_RE = /v hale|v prostoru|uvnitř|udržovat|udržet|udržova|v místnost|v kancel|v prodejn|ve skladu|vnitřn|interiér|v kuchyn|ve výrob|v bazén|v obchod|žádan|v chladírn|v labor|prostor|teplota v/g;
  while ((m = tRe.exec(t))) {
    if (pair && m.index >= pair.index && m.index < pair.index + pair[0].length) {
      prevEnd = m.index + m[0].length;
      continue;
    }
    const v = toNum(m[1] ?? m[2]);
    // kontext = text od předchozího čísla (klíčové slovo patří nejbližší hodnotě)
    const ctx = t.slice(Math.max(prevEnd, m.index - 40), m.index).toLowerCase();
    let role = null;
    let best = -1;
    for (const [re, r] of [[TS_RE, 'ts'], [TR_RE, 'tr']]) {
      re.lastIndex = 0;
      let k;
      while ((k = re.exec(ctx))) {
        if (k.index > best) {
          best = k.index;
          role = r;
        }
      }
    }
    temps.push({ v, role });
    prevEnd = m.index + m[0].length;
  }
  for (const tt of temps) {
    if (tt.role === 'ts') patch.ts = tt.v;
    if (tt.role === 'tr') patch.tr = tt.v;
  }
  const free = temps.filter((x) => !x.role).map((x) => x.v);
  if (free.length && (patch.ts === undefined || patch.tr === undefined)) {
    const all = [...free];
    if (patch.ts === undefined && patch.tr === undefined && all.length >= 2) {
      const lo = Math.min(...all);
      const hi = Math.max(...all);
      const mode = patch.mode || (app ? APPLICATIONS[app].mode : 'cooling');
      patch.ts = mode === 'heating' ? hi : lo;
      patch.tr = mode === 'heating' ? lo : hi;
    } else if (patch.tr === undefined && free.length) patch.tr = free[0];
    else if (patch.ts === undefined && free.length) patch.ts = free[0];
  }
  if (patch.ts !== undefined && patch.tr !== undefined && !patch.mode) {
    patch.mode = patch.ts < patch.tr - 0.5 ? 'cooling' : patch.ts > patch.tr + 0.5 ? 'heating' : 'ventilation';
  }

  // vlhkost
  const rh = single(/(?:vlhkost\w*|rv|rh)\D{0,10}?(\d{1,2})\s*%|(\d{1,2})\s*%\s*(?:rv|rh|vlhk)/i) ?? null;
  if (rh) patch.rh = rh;

  // požadavky
  if (/tich|hluk|nesmí být slyšet|akustik/i.test(t)) patch.noise = 'quiet';
  if (/hygien|praní|prát|sanitac|potravin/i.test(t)) patch.hygiene = true;
  if (/recykl|ekolog|udržiteln|eko\b|co2|uhlíkov/i.test(t)) patch.eco = true;
  if (/nehořlav|třídy? a\b|a1\b|požární odoln/i.test(t)) patch.fireA = true;
  if (/kategori\w* a\b|velmi přísn|špičkov\w* komfort/i.test(t)) patch.cat = 'A';
  else if (/průvan|netáh|táhnout|táhne|foukal[oa]? na/i.test(t)) patch.cat = patch.cat || 'B';
  if (/sed[íě]|u stol|u počítač|kancel/i.test(t)) patch.oz = 1.1;
  else if (/stoj[íě]|u link|pracovníci|dělníc/i.test(t)) patch.oz = 1.8;

  // tvar, barva, počty, výustě
  if (/půlkruh|polokruh|pod strop/i.test(t)) patch.shape = 'H';
  else if (/kruhov/i.test(t)) patch.shape = 'C';
  for (const [code, re] of COLOR_RULES) {
    if (re.test(t)) {
      patch.color = code;
      patch.customColor = null;
      found.push(`barva ${COLORS[code].name.toLowerCase()}`);
      break;
    }
  }
  const runs = t.match(/(\d+)\s*(?:větv|potrub|vyúst|řad\w* potrub)/i);
  if (runs) patch.runs = Math.min(8, Math.max(1, +runs[1]));
  if (/mikroperfor/i.test(t)) patch.outlet = /rovnoměrn/i.test(t) ? 'microUniform' : 'microDirectional';
  else if (/perforac/i.test(t)) patch.outlet = 'perforation';
  else if (/velk\w* tryst|velk\w* dýz/i.test(t)) patch.outlet = 'bigNozzle';
  else if (/tryst|trysk|dýz/i.test(t)) patch.outlet = 'smallNozzle';
  const press = single(/(\d{2,3})\s*Pa\b/i);
  if (press) patch.pressure = press;

  // zákazník
  const cust = t.match(/(?:pro (?:firmu|společnost|zákazníka)|zákazník(?:em)?:?)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^,;\n]{1,48}?)(?=,|;|\s(?:v|ve|na|se)\s|\s*$)/);
  if (cust) patch.customer = cust[1].trim();
  const CITIES = {
    Hlinsku: 'Hlinsko', Praze: 'Praha', Brně: 'Brno', Ostravě: 'Ostrava', Plzni: 'Plzeň', Pardubicích: 'Pardubice',
    'Hradci Králové': 'Hradec Králové', Olomouci: 'Olomouc', Liberci: 'Liberec', Zlíně: 'Zlín', Jihlavě: 'Jihlava',
    Chrudimi: 'Chrudim', Vídni: 'Vídeň', Bratislavě: 'Bratislava', Budějovicích: 'České Budějovice',
  };
  const loc = t.match(new RegExp(`\\b(?:v|ve)\\s+(${Object.keys(CITIES).join('|')})`));
  if (loc) patch.location = CITIES[loc[1]];

  // doplnění předpokladů
  const tpl = APPLICATIONS[app || current?.app || 'food'];
  if (!app && !current) assumptions.push(`Typ provozu nerozpoznán – použita šablona „${tpl.name}“`);
  if (patch.L === undefined && !current) assumptions.push(`Rozměry neuvedeny – typické ${tpl.dims[0]} × ${tpl.dims[1]} m`);
  if (patch.H === undefined && (dm || len)) assumptions.push(`Výška neuvedena – předpoklad ${String(tpl.dims[2]).replace('.', ',')} m`);
  if (patch.flow === undefined && patch.loadKW === undefined && patch.ach === undefined && (dm || len)) {
    const L = patch.L ?? tpl.dims[0];
    const W = patch.W ?? tpl.dims[1];
    const H = patch.H ?? tpl.dims[2];
    patch.flow = Math.round((tpl.ach * L * W * H) / 100) * 100;
    assumptions.push(`Průtok neuveden – ${tpl.ach} výměn/h → ${patch.flow.toLocaleString('cs-CZ')} m³/h`);
  }
  if (patch.ts === undefined && patch.mode && patch.mode !== (current?.mode ?? tpl.mode)) {
    const tr = patch.tr ?? current?.tr ?? tpl.tr;
    patch.ts = patch.mode === 'heating' ? tr + 12 : patch.mode === 'cooling' ? tr - 6 : tr;
    assumptions.push(`Teplota přívodu neuvedena – předpoklad ${patch.ts} °C`);
  }
  if (patch.tr !== undefined && patch.ts === undefined && !current) {
    const mode = patch.mode ?? tpl.mode;
    patch.ts = mode === 'heating' ? patch.tr + 12 : mode === 'cooling' ? patch.tr - 6 : patch.tr;
    assumptions.push(`Teplota přívodu neuvedena – předpoklad ${patch.ts} °C`);
  }
  return { app, patch, found, assumptions, understood: Object.keys(patch).length + (app ? 1 : 0) };
}

/** Rozpoznání pokynů v chatu (offline): pohledy, vysvětlení, změny parametrů. */
export function parseCommand(text) {
  const t = text.toLowerCase();
  const actions = [];
  if (/(ukaž|zobraz|přepni|otevři|pusť|spusť).{0,20}(cfd|simulac|řez)/.test(t) || /^cfd/.test(t)) actions.push({ view: 'cfd' });
  if (/(porovn|srovn|plech|klasick)/.test(t)) actions.push({ view: 'compare' });
  if (/(nabídk|pdf|report|tisk)/.test(t)) actions.push({ view: 'report' });
  if (/(variant|graf|analýz|kusovník)/.test(t)) actions.push({ view: 'analysis' });
  if (/průlet|proleť|fly/.test(t)) actions.push({ camera: 'fly' });
  if (/půdorys|shora/.test(t)) actions.push({ camera: 'top' });
  if (/očima|pohled pracovník|z pohledu člověk/.test(t)) actions.push({ camera: 'eye' });
  if (/průvan|dr\b/.test(t) && /(mapa|ukaž|zobraz)/.test(t)) actions.push({ heat: 'dr' });
  if (/teplot/.test(t) && /(mapa|ukaž|zobraz)/.test(t)) actions.push({ heat: 'temp' });
  const explain = /(proč|vysvětli|zdůvodni|jak jsi|co znamená)/.test(t);
  return { actions, explain };
}
