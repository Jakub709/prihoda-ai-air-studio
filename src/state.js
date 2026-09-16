// Jednoduchý globální stav aplikace s událostmi.
import { defaultProject } from './engine/designer.js';

function load(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* úložiště nemusí být dostupné */
  }
}

const savedSettings = load('pas.settings') || {};

export const state = {
  project: load('pas.project') || defaultProject('food'),
  design: null,
  view: 'design',
  layers: { particles: true, heat: 'velocity', people: true, section: false, color: 'temp' },
  settings: {
    apiKey: '',
    model: 'claude-sonnet-5',
    effort: 'low',
    autoSend: true,
    ...savedSettings,
  },
  assumptions: load('pas.assumptions') || [],
  proposal: null,
  chat: [],
  busy: false,
  artImage: null,
};

const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, data) {
  for (const fn of listeners.get(evt) || []) {
    try {
      fn(data);
    } catch (e) {
      console.error(`[event ${evt}]`, e);
    }
  }
}

export function saveProject() {
  save('pas.project', state.project);
  save('pas.assumptions', state.assumptions);
}
export function saveSettings() {
  save('pas.settings', state.settings);
}

/** Úprava projektu – vrací seznam klíčů, které se skutečně změnily. */
export function patchProject(patch, { source = 'user' } = {}) {
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (JSON.stringify(state.project[k]) !== JSON.stringify(v)) {
      state.project[k] = v;
      changed.push(k);
    }
  }
  if (changed.length) {
    saveProject();
    emit('project', { changed, source });
  }
  return changed;
}

export function resetProject(appKey, patch = {}, { source = 'user' } = {}) {
  const base = defaultProject(appKey);
  state.project = { ...base, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  saveProject();
  emit('project', { changed: Object.keys(state.project), source, reset: true });
}
