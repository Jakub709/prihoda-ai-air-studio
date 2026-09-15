// Integrační test agentní smyčky proti lokálnímu mocku (node scripts/mock-claude.mjs musí běžet).
import { agentTurn } from '../src/ai/claude.js';
import { TOOLS, runTool, designSummary } from '../src/ai/tools.js';
import { systemPrompt } from '../src/ai/prompts.js';
import { app } from '../src/app.js';
import { state } from '../src/state.js';
import { computeDesign } from '../src/engine/designer.js';

// náhrada UI vazeb
app.requestDesign = async () => {
  state.design = computeDesign(state.project);
  return state.design;
};
app.setView = (v) => console.log('  [view]', v);
app.openReport = () => console.log('  [report opened]', JSON.stringify(state.proposal).slice(0, 120));
app.viz = { setLayers() {}, setCamera(c) { console.log('  [camera]', c); } };
state.design = computeDesign(state.project);

const settings = { apiKey: 'sk-ant-test', model: 'claude-opus-5', effort: 'low', baseURL: 'http://127.0.0.1:8787' };
const history = [];
async function turn(text) {
  history.push({ role: 'user', content: [{ type: 'text', text: `${text}\n\n<stav_navrhu>${JSON.stringify(designSummary())}</stav_navrhu>` }] });
  let out = '';
  await agentTurn({
    settings,
    system: systemPrompt(),
    tools: TOOLS,
    messages: history,
    onText: (d) => (out += d),
    onToolStart: (b) => console.log('  [tool start]', b.name, JSON.stringify(b.input)),
    onToolEnd: (b, r) => console.log('  [tool end]', r.summary),
    runTool,
  });
  console.log('  [text]', out.replace(/\n/g, ' | '));
}

console.log('TURN 1'); await turn('Zákazník chce červené vyústky a víc vzduchu');
console.log('  design now:', state.design.inp.flow, state.design.color.code, `${state.design.n}× Ø${state.design.runs[0].D}`);
console.log('TURN 2'); await turn('Připrav nabídku v angličtině');
console.log('history roles:', history.map((m) => m.role + ':' + (Array.isArray(m.content) ? m.content.map((b) => b.type).join('+') : 'text')).join('  '));
console.log('system prompt length (chars):', systemPrompt().length);
