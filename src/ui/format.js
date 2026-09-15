// Formátování čísel a jednotek (čeština: desetinná čárka, mezera jako oddělovač tisíců).
const NBSP = ' ';

export function nf(v, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '–';
  return (+v).toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export const n0 = (v) => nf(v, 0);
export const n1 = (v) => nf(v, 1);
export const n2 = (v) => nf(v, 2);
export const unit = (v, u, d = 0) => `${nf(v, d)}${NBSP}${u}`;
export const m = (v, d = 1) => unit(v, 'm', d).replace(/,0 m$/, ' m');
export const m3h = (v) => unit(Math.round(v / 10) * 10, 'm³/h');
export const pct = (v) => unit(v, '%');
export const ms = (v) => unit(v, 'm/s', 2);
export const degC = (v, d = 1) => unit(v, '°C', d);
export const kg = (v) => unit(v, 'kg');
export const mm = (v) => unit(v, 'mm');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Čeština – tvar podle počtu (1 větev, 2–4 větve, 5 větví). */
export function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export function dateCz(d = new Date()) {
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
}
