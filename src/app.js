// Sdílené API aplikace (vyplní main.js) – aby moduly nemusely importovat main.
export const app = {
  viz: null,
  setView: () => {},
  requestDesign: () => {},
  awaitDesign: () => Promise.resolve(null),
  openReport: () => {},
  setTab: () => {},
};
