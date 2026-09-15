// Klient výpočtu: Web Worker (inline), s fallbackem na výpočet v hlavním vlákně.
import EngineWorker from './worker.js?worker&inline';
import { computeDesign } from './designer.js';

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new EngineWorker();
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.design);
    };
    worker.onerror = (e) => {
      console.warn('Engine worker selhal, přepínám na hlavní vlákno', e);
      worker = false;
      for (const [id, p] of pending) {
        pending.delete(id);
        try {
          p.resolve(computeDesign(p.project));
        } catch (err) {
          p.reject(err);
        }
      }
    };
  } catch (e) {
    console.warn('Web Worker nedostupný', e);
    worker = false;
  }
  return worker;
}

/** Spočítá návrh; starší rozpracované požadavky se zahodí (vrací jen nejnovější). */
export function computeDesignAsync(project) {
  const w = getWorker();
  const snapshot = JSON.parse(JSON.stringify(project));
  if (!w) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(computeDesign(snapshot));
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, project: snapshot });
    w.postMessage({ id, project: snapshot });
  });
}

export function latestSeq() {
  return seq;
}
