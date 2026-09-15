// Barevné škály – sdílené 3D, CFD, grafy a legendy.
// Sekvenční = jeden odstín (na tmavém pozadí od tmavé k světlé), divergentní = dva odstíny + neutrální šedá.

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// modrá rampa (palette.md, kroky 700 → 100) – rychlost proudění
export const RAMP_VELOCITY = ['#0d366b', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'].map(hex);
// oranžová rampa – průvan (DR)
export const RAMP_DR = ['#3a1a0c', '#5c2710', '#7d3413', '#9e3c14', '#c24a19', '#d95926', '#eb6834', '#f08452', '#f49c76', '#f7b597', '#facdb7', '#fde3d6'].map(hex);
// divergentní modrá ↔ šedá ↔ červená – teplota vůči žádané
export const RAMP_TEMP = ['#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b8c2cb', '#d8d8d4', '#d8d8d4', '#f2b0a5', '#ec8a80', '#e66767', '#e34948', '#b3261e'].map(hex);
// částice na tmavé scéně: světlejší kroky téže divergentní škály (chladný ↔ neutrální ↔ teplý)
export const RAMP_TEMP_PARTICLES = ['#5aa6ff', '#7db8f5', '#a9cdf2', '#cdd6de', '#cdd6de', '#f3b3a4', '#f58c78', '#ff6550'].map(hex);
// tyrkysová (Příhoda) – rychlost částic
export const RAMP_TEAL = ['#083d36', '#0b5a4e', '#077565', '#00917b', '#00a98e', '#1ccaa9', '#62e3c9', '#a9f2e2'].map(hex);

export function sampleRamp(ramp, t) {
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  const j = Math.min(ramp.length - 1, i + 1);
  const w = x - i;
  const a = ramp[i];
  const b = ramp[j];
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
}

export function rampCss(ramp, dir = '90deg') {
  const stops = ramp.map((c, i) => `rgb(${c[0]},${c[1]},${c[2]}) ${((i / (ramp.length - 1)) * 100).toFixed(1)}%`);
  return `linear-gradient(${dir}, ${stops.join(',')})`;
}

/** 256×1 RGBA pole rampy (pro DataTexture / canvas). */
export function rampBytes(ramp, n = 256) {
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = sampleRamp(ramp, i / (n - 1));
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Definice vrstev mapy pobytové zóny. */
export const HEAT_KINDS = {
  velocity: { key: 'velocity', label: 'Rychlost v pobytové zóně', unit: 'm/s', ramp: RAMP_VELOCITY, min: 0, max: 0.5, fmt: (v) => v.toFixed(2).replace('.', ',') },
  dr: { key: 'dr', label: 'Riziko průvanu DR (ISO 7730)', unit: '%', ramp: RAMP_DR, min: 0, max: 40, fmt: (v) => Math.round(v) },
  temp: { key: 'temp', label: 'Teplota v pobytové zóně', unit: '°C', ramp: RAMP_TEMP, min: -3, max: 3, fmt: (v) => v.toFixed(1).replace('.', ','), relative: true },
};
