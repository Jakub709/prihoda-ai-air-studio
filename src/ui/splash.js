// Úvodní obrazovka.
import { COMPANY } from '../engine/catalog.js';

export function showSplash({ onStart, onDemo }) {
  const el = document.getElementById('splash');
  el.innerHTML = `
    <div class="splash-inner">
      <svg class="splash-logo" viewBox="0 0 40 40"><path d="M5 14c6-5 11 5 17 0s11 0 13 0"/><path d="M5 21c6-5 11 5 17 0s11 0 13 0"/><path d="M5 28c6-5 11 5 17 0s11 0 13 0"/></svg>
      <h1>Příhoda <span>AI Air Studio</span></h1>
      <p class="tag">Od zadání k inženýrskému návrhu tkaninového rozvodu za desítky sekund.<br>Řekněte, co potřebujete – AI navrhne, spočítá, ukáže a připraví nabídku.</p>
      <div class="feats">
        <div class="feat"><b>✦ AI aplikační inženýr</b><span>Zadání textem, hlasem i fotkou půdorysu. AI sama ovládá návrh a vysvětluje.</span></div>
        <div class="feat"><b>⚙ Fyzikální engine</b><span>Stovky variant, model proudů se vztlakem, komfort dle ISO 7730, katalog Příhoda.</span></div>
        <div class="feat"><b>◉ 3D digitální dvojče</b><span>Nafukující se vyústky, proudění vzduchu, mapa průvanu, lidé v hale.</span></div>
        <div class="feat"><b>≋ Živá CFD simulace</b><span>Navier–Stokes v řezu halou v reálném čase, přímo v prohlížeči.</span></div>
        <div class="feat"><b>⇄ Srovnání s plechem</b><span>Komfort, hmotnost, montáž a uhlíková stopa vedle sebe.</span></div>
        <div class="feat"><b>▤ Nabídka do PDF</b><span>Výkresy, kusovník a texty v libovolném jazyce jedním klikem.</span></div>
      </div>
      <div class="cta">
        <button class="btn primary" id="spStart">Začít navrhovat</button>
        <button class="btn" id="spDemo">▶ Spustit prezentaci (autopilot)</button>
      </div>
      <div class="foot">Koncept aplikace vytvořený s pomocí AI (Claude) pro ukázku kurzu · technická data z veřejného katalogu ${COMPANY.name} · není oficiálním produktem společnosti</div>
    </div>`;
  const close = () => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 650);
  };
  el.querySelector('#spStart').addEventListener('click', () => {
    close();
    onStart?.();
  });
  el.querySelector('#spDemo').addEventListener('click', () => {
    close();
    onDemo?.();
  });
}
