// Web Worker – výpočet návrhu mimo hlavní vlákno (UI zůstává plynulé).
import { computeDesign } from './designer.js';

self.onmessage = (e) => {
  const { id, project } = e.data;
  try {
    const design = computeDesign(project);
    self.postMessage({ id, design });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack ? err.stack : err) });
  }
};
