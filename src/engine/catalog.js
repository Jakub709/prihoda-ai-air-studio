// Katalogová data Příhoda s.r.o. (zdroj: Technical data – Fabric Ducting & Diffusers, 1/2024,
// FAQ „How much pressure…“ a „What is the ideal velocity…“, www.prihoda.com).
// Hodnoty, které katalog neuvádí (např. plošné hmotnosti), jsou označeny jako orientační.

export const COMPANY = {
  name: 'PŘÍHODA s.r.o.',
  address: 'Za Radnicí 476, 539 01 Hlinsko',
  web: 'www.prihoda.com',
  email: 'info@prihoda.com',
  founded: 1994,
  facts: [
    '70 000+ realizovaných zakázek',
    '10 000 000+ m² ušitých vyústek',
    '70+ zemí',
    'výroba: Česko, Čína, Mexiko, Egypt, Indie',
  ],
};

/** Standardní výrobní rozměry (mm) – katalog kap. 2.2 */
export const STANDARD_DIAMETERS = [
  100, 125, 160, 200, 250, 315, 400, 500, 630, 710, 800, 900, 1000, 1120, 1250, 1400, 1600, 1800, 2000,
];

/** Průřezy – katalog kap. 2.1 */
export const SHAPES = {
  C: {
    code: 'C',
    name: 'Kruhový',
    area: (D) => (Math.PI * D * D) / 4,
    perimeter: (D) => Math.PI * D,
    note: 'Standardní tvar, snadná údržba, preferovaně doporučený.',
  },
  H: {
    code: 'H',
    name: 'Půlkruhový',
    area: (D) => (Math.PI * D * D) / 8,
    perimeter: (D) => (Math.PI * D) / 2 + D,
    note: 'Pro prostory s nízkým stropem a estetické aplikace – montáž přímo pod strop.',
  },
};

/**
 * Způsoby výstupu vzduchu – katalog kap. 1.1 a 4.1.
 * throw = dosah proudu na 0,2 m/s dle katalogu (m).
 * Cc/Cv = kontrakce a rychlostní součinitel otvoru (modelové hodnoty).
 */
export const OUTLETS = {
  microUniform: {
    key: 'microUniform',
    name: 'Mikroperforace rovnoměrná',
    short: 'Mikroperforace (R)',
    hole: '200–400 µm',
    throw: [0, 1.5],
    kind: 'band',
    bandWidth: 150, // úhlová šířka pole mikroperforace (°)
    Cc: 1.0,
    Cv: 0.42,
    desc: 'Laserem řezané otvory 200–400 µm po obvodu – velmi nízké rychlosti, bezprůvanové rozptýlení.',
  },
  microDirectional: {
    key: 'microDirectional',
    name: 'Mikroperforace směrovaná',
    short: 'Mikroperforace (S)',
    hole: '200–400 µm',
    throw: [0, 3],
    kind: 'band',
    bandWidth: 50,
    Cc: 1.0,
    Cv: 0.45,
    desc: 'Pásy mikroperforace v zadané poloze – nízkorychlostní, ale směrovaný přívod.',
  },
  perforation: {
    key: 'perforation',
    name: 'Perforace',
    short: 'Perforace',
    hole: '≥ 4 mm',
    throw: [3, 12],
    kind: 'holes',
    sizes: [4, 6, 8, 10, 12, 14, 16, 20],
    Cc: 0.64,
    Cv: 0.97,
    desc: 'Řady laserem řezaných otvorů ≥ 4 mm – směrovaný přívod na střední vzdálenosti.',
  },
  smallNozzle: {
    key: 'smallNozzle',
    name: 'Malé textilní trysky',
    short: 'Malé trysky',
    hole: 'Ø 20 / 30 / 40 / 60 mm',
    throw: [4, 15],
    kind: 'holes',
    sizes: [20, 30, 40, 60],
    Cc: 0.86,
    Cv: 0.97,
    desc: 'Směrované proudy, dosah o cca 25 % delší než u perforace, minimální odklon proudu.',
  },
  bigNozzle: {
    key: 'bigNozzle',
    name: 'Velké textilní trysky',
    short: 'Velké trysky',
    hole: 'Ø 50–100 mm',
    throw: [10, 30],
    kind: 'holes',
    sizes: [50, 60, 80, 100],
    Cc: 0.9,
    Cv: 0.97,
    desc: 'Nejdelší dosahy (> 20 m dle tlaku a rozdílu teplot), pevné, nastavitelné i směrované.',
  },
};

/** Materiály – katalog kap. 5 (plošné hmotnosti orientační). */
export const MATERIALS = {
  PMI: { code: 'PMI', family: 'Premium', permeable: true, weight: 'medium', gsm: 230, fire: 'B-s1,d0', antibacterial: true, antistatic: true, washable: true, colors: 9, recycled: false },
  NMI: { code: 'NMI', family: 'Premium', permeable: false, weight: 'medium', gsm: 230, fire: 'B-s1,d0', antibacterial: true, antistatic: true, washable: true, colors: 9, recycled: false },
  PMS: { code: 'PMS', family: 'Classic', permeable: true, weight: 'medium', gsm: 220, fire: 'B-s1,d0', antibacterial: false, antistatic: false, washable: true, colors: 9, recycled: false },
  NMS: { code: 'NMS', family: 'Classic', permeable: false, weight: 'medium', gsm: 220, fire: 'B-s1,d0', antibacterial: false, antistatic: false, washable: true, colors: 9, recycled: false },
  PMSre: { code: 'PMSre', family: 'Recycled', permeable: true, weight: 'medium', gsm: 220, fire: 'B-s1,d0', antibacterial: false, antistatic: false, washable: true, colors: 9, recycled: true },
  NMSre: { code: 'NMSre', family: 'Recycled', permeable: false, weight: 'medium', gsm: 220, fire: 'B-s1,d0', antibacterial: false, antistatic: false, washable: true, colors: 9, recycled: true },
  PLS: { code: 'PLS', family: 'Light', permeable: true, weight: 'light', gsm: 100, fire: 'B', antibacterial: false, antistatic: false, washable: true, colors: 9, recycled: false, minPressure: 20 },
  NLS: { code: 'NLS', family: 'Light', permeable: false, weight: 'light', gsm: 100, fire: 'B', antibacterial: false, antistatic: false, washable: true, colors: 9, recycled: false, minPressure: 20 },
  NMR: { code: 'NMR', family: 'Durable', permeable: false, weight: 'medium', gsm: 260, fire: 'B', antibacterial: true, antistatic: true, washable: true, colors: 4, recycled: false },
  NHE: { code: 'NHE', family: 'Glass', permeable: false, weight: 'heavy', gsm: 400, fire: 'A', antibacterial: false, antistatic: false, washable: false, colors: 7, recycled: false },
};

export const MATERIAL_FAMILY_CZ = {
  Premium: 'Prihoda Premium',
  Classic: 'Prihoda Classic',
  Recycled: 'Prihoda Recycled',
  Light: 'Prihoda Light',
  Durable: 'Prihoda Durable',
  Glass: 'Prihoda Glass',
};

/** 9 skladových barev – katalog kap. 5.2 (hex = orientační převod z RAL/Pantone). */
export const COLORS = {
  WH: { code: 'WH', name: 'Bílá', ral: 'RAL 9016', hex: '#eef0ec' },
  YE: { code: 'YE', name: 'Žlutá', ral: 'RAL 1017', pantone: '135', hex: '#f6b23c' },
  LG: { code: 'LG', name: 'Světle šedá', ral: 'RAL 7035', pantone: '420', hex: '#c7cbc8' },
  DG: { code: 'DG', name: 'Tmavě šedá', ral: 'RAL 7037', pantone: '424', hex: '#77797a' },
  GR: { code: 'GR', name: 'Zelená', ral: 'RAL 6024', pantone: '341', hex: '#0b7f58' },
  RE: { code: 'RE', name: 'Červená', ral: 'RAL 3001', pantone: '187', hex: '#a51f28' },
  LB: { code: 'LB', name: 'Světle modrá', ral: 'RAL 5012', pantone: '2915', hex: '#4a9fd6' },
  BL: { code: 'BL', name: 'Modrá', ral: 'RAL 5005', pantone: '7462', hex: '#154f8a' },
  BC: { code: 'BC', name: 'Černá', ral: 'RAL 9017', pantone: '419', hex: '#232524' },
};

/** Typy montáže – katalog kap. 3 */
export const INSTALLATIONS = {
  1: { no: 1, name: 'Lanko, jednoduché zavěšení', items: ['poplastované ocelové lanko', 'háčky', 'napínací šrouby', 'Gripple závěsy'], shapes: ['C'] },
  2: { no: 2, name: 'Lanko, dvojité zavěšení', items: ['2× poplastované ocelové lanko', 'háčky', 'napínací šrouby', 'Gripple závěsy'], shapes: ['C'] },
  3: { no: 3, name: 'Profil přímo na strop / suchý zip', items: ['hliníkový profil', 'suchý zip', 'napínák v profilu'], shapes: ['C'] },
  5: { no: 5, name: 'Zavěšený profil, jednoduché zavěšení', items: ['hliníkový profil', 'spojky profilů', 'Gripple závěsy', 'napínák v profilu'], shapes: ['C'] },
  6: { no: 6, name: 'Zavěšený profil, dvojité zavěšení', items: ['2× hliníkový profil', 'spojky profilů', 'Gripple závěsy', 'napínák v profilu'], shapes: ['C'] },
  8: { no: 8, name: 'Půlkruh v profilech na stropě', items: ['2× hliníkový profil', 'suchý zip', 'napínák v profilu'], shapes: ['H'] },
};

/**
 * Aplikační šablony – předvolby pro typické provozy (výchozí hodnoty lze přepsat).
 * ach = orientační intenzita výměny (h⁻¹) pro případ, že není zadán průtok.
 * cat = požadovaná kategorie prostředí dle ISO 7730 (A/B/C).
 */
export const APPLICATIONS = {
  food: {
    key: 'food', name: 'Potravinářská výroba', icon: '🥖',
    dims: [30, 18, 5.5], flow: 12000, mode: 'cooling', tr: 16, ts: 10, rh: 65, ach: 8, oz: 1.8, cat: 'B', noise: 'normal', hygiene: true,
    floor: 'epoxy', props: 'food',
    brief: 'Pekárna 30 × 18 m, výška 5,5 m. Chlazení výrobní haly, 12 000 m³/h, přívod 10 °C, v hale 16 °C. Pracovníci stojí u linek, nesmí na ně táhnout. Požadavek na hygienu a snadné praní.',
    why: 'Hygiena (antibakteriální úprava Premium, praní v pračce), bezprůvanový přívod chladného vzduchu k pracovníkům.',
  },
  cold: {
    key: 'cold', name: 'Chladírna / nízké teploty', icon: '❄️',
    dims: [24, 12, 5], flow: 16000, mode: 'cooling', tr: 4, ts: 0, rh: 85, ach: 20, oz: 1.8, cat: 'C', noise: 'normal', hygiene: true,
    floor: 'epoxy', props: 'cold',
    brief: 'Chladírna masa 24 × 12 m, výška 5 m, udržovat 4 °C, přívod 0 °C, 16 000 m³/h. Lidé tu pracují celou směnu.',
    why: 'Rovnoměrná teplota pro produkty a nízká rychlost proudění pro zaměstnance v chladu.',
  },
  sports: {
    key: 'sports', name: 'Sportovní hala', icon: '🏀',
    dims: [44, 24, 9], flow: 22000, mode: 'heating', tr: 18, ts: 30, rh: 45, ach: 2.2, oz: 1.8, cat: 'C', noise: 'normal', hygiene: false,
    floor: 'sports', props: 'sports',
    brief: 'Sportovní hala 44 × 24 m, výška 9 m. Teplovzdušné vytápění 22 000 m³/h, přívod 30 °C, v hale 18 °C. Chceme dostat teplo dolů ke hřišti.',
    why: 'Dopravení teplého vzduchu z velké výšky do pobytové zóny bez rozvrstvení a průvanu.',
  },
  pool: {
    key: 'pool', name: 'Bazén / wellness', icon: '🏊',
    dims: [28, 16, 7], flow: 12000, mode: 'heating', tr: 30, ts: 34, rh: 60, ach: 4, oz: 1.8, cat: 'B', noise: 'normal', hygiene: false,
    floor: 'pool', props: 'pool', vLimit: 0.3,
    brief: 'Krytý bazén 28 × 16 m, výška 7 m, vzduch 30 °C, přívod 34 °C, 12 000 m³/h. Mokrá kůže – žádný průvan. Agresivní vlhké prostředí.',
    why: 'Odolnost vůči vlhkému prostředí, žádná koroze, bezprůvanový přívod nad mokrou kůži.',
  },
  industry: {
    key: 'industry', name: 'Výrobní hala', icon: '🏭',
    dims: [60, 30, 10], flow: 42000, mode: 'heating', tr: 18, ts: 28, rh: 45, ach: 3, oz: 1.8, cat: 'C', noise: 'industrial', hygiene: false,
    floor: 'concrete', props: 'industry',
    brief: 'Výrobní hala 60 × 30 m, výška 10 m, větrání a teplovzdušné vytápění 42 000 m³/h, přívod 28 °C, v hale 18 °C.',
    why: 'Nízká hmotnost na střešní konstrukci, rychlá montáž, dopravení vzduchu na velké vzdálenosti tryskami.',
  },
  store: {
    key: 'store', name: 'Supermarket / prodejna', icon: '🛒',
    dims: [50, 30, 5.5], flow: 30000, mode: 'cooling', tr: 24, ts: 17, rh: 50, ach: 4, oz: 1.8, cat: 'B', noise: 'normal', hygiene: false,
    floor: 'tiles', props: 'store',
    brief: 'Supermarket 50 × 30 m, výška 5,5 m, chlazení 30 000 m³/h, přívod 17 °C, v prodejně 24 °C. Důležitý je vzhled – barva dle firemního designu.',
    why: 'Rovnoměrné proudění nad regály, estetika (9 barev, Prihoda ART), úspora oproti plechu.',
  },
  office: {
    key: 'office', name: 'Kancelář / open space', icon: '💼',
    dims: [24, 14, 3.4], flow: 6000, mode: 'cooling', tr: 24, ts: 18, rh: 50, ach: 6, oz: 1.1, cat: 'B', noise: 'quiet', hygiene: false,
    floor: 'carpet', props: 'office',
    brief: 'Open space kancelář 24 × 14 m, světlá výška 3,4 m, chlazení 6 000 m³/h, přívod 18 °C, v kanceláři 24 °C. Tichý provoz, lidé sedí u stolů.',
    why: 'Tichý bezprůvanový přívod podobný chladicím trámům za zlomek ceny, design.',
  },
  kitchen: {
    key: 'kitchen', name: 'Kuchyně / gastro', icon: '🍳',
    dims: [18, 10, 3.6], flow: 13000, mode: 'cooling', tr: 26, ts: 20, rh: 55, ach: 20, oz: 1.8, cat: 'C', noise: 'normal', hygiene: true,
    floor: 'tiles', props: 'kitchen',
    brief: 'Velkokuchyně 18 × 10 m, výška 3,6 m, přívod 13 000 m³/h, 20 °C, v kuchyni 26 °C. Vysoká tepelná zátěž, hygiena.',
    why: 'Velké průtoky bez průvanu v malém prostoru, odolnost vůči párám, snadné praní.',
  },
  warehouse: {
    key: 'warehouse', name: 'Sklad / logistika', icon: '📦',
    dims: [72, 36, 11], flow: 48000, mode: 'heating', tr: 17, ts: 29, rh: 45, ach: 1.5, oz: 1.8, cat: 'C', noise: 'industrial', hygiene: false,
    floor: 'concrete', props: 'warehouse',
    brief: 'Logistický sklad 72 × 36 m, výška 11 m, teplovzdušné vytápění 48 000 m³/h, přívod 29 °C, ve skladu 17 °C.',
    why: 'Dlouhé dosahy tryskami z velké výšky, nízká hmotnost, rychlá montáž.',
  },
  lab: {
    key: 'lab', name: 'Laboratoř / čistý provoz', icon: '🧪',
    dims: [16, 10, 3.5], flow: 6700, mode: 'cooling', tr: 21, ts: 17, rh: 45, ach: 12, oz: 1.8, cat: 'B', noise: 'quiet', hygiene: true,
    floor: 'epoxy', props: 'lab',
    brief: 'Laboratoř 16 × 10 m, výška 3,5 m, 6 700 m³/h, přívod 17 °C, 21 °C. Požadavek na čistotu, antistatiku a velmi nízké rychlosti.',
    why: 'Nulové uvolňování vláken (čisté prostory až ISO 4), antistatika Premium, laminární charakter.',
  },
};

/** ISO 7730 – kategorie prostředí dle DR (draught rate). */
export const COMFORT_CATEGORIES = {
  A: { key: 'A', maxDR: 10, label: 'Kategorie A (DR < 10 %)' },
  B: { key: 'B', maxDR: 20, label: 'Kategorie B (DR < 20 %)' },
  C: { key: 'C', maxDR: 30, label: 'Kategorie C (DR < 30 %)' },
};

/** Rychlost v potrubí – FAQ Příhoda: nízká 2–4, střední 4–7, vysoká 7–10 m/s. */
export const NOISE_CLASSES = {
  quiet: { key: 'quiet', name: 'Tichý provoz', vTarget: 3.6, vGreen: 4.0, vOrange: 5.5, note: 'divadla, kanceláře, kina: 2–4 m/s' },
  normal: { key: 'normal', name: 'Běžný provoz', vTarget: 6.0, vGreen: 7.0, vOrange: 8.5, note: 'obchody, sportoviště, laboratoře, haly: 4–7 m/s' },
  industrial: { key: 'industrial', name: 'Průmyslový provoz', vTarget: 8.0, vGreen: 9.0, vOrange: 10.5, note: 'průmysl, kde hluk není kritický: 7–10 m/s' },
};

export const MODES = {
  cooling: 'Chlazení',
  heating: 'Vytápění',
  ventilation: 'Větrání (izotermní)',
};
