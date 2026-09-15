// Metodika – modely, předpoklady a zdroje (pro technické publikum).
export function openMethodology() {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal" style="width:min(820px,94vw)" role="dialog" aria-label="Metodika výpočtu">
      <div class="modal-head"><h3>Metodika výpočtu</h3><button class="btn ghost icon-only" data-close title="Zavřít">✕</button></div>
      <div class="modal-body" style="font-size:12.5px;line-height:1.55">
        <p><b>1. Katalogová data Příhoda.</b> Standardní průměry 100–2000 mm, průřezy C/H, díly se zipy (začátek 100–200 mm, průběžné a koncové díly max. 5 500 mm), typy výstupu a jejich katalogové dosahy na 0,2 m/s (mikroperforace rovnoměrná 0–1,5 m, směrovaná 0–3 m, perforace 3–12 m, malé trysky 4–15 m, velké trysky 10–30 m), provozní tlaky 40–400 Pa (typicky 120 Pa; min. 20 Pa lehké, 50 Pa střední tkaniny), rychlosti v potrubí dle hlukové třídy (2–4 / 4–7 / 7–10 m/s), materiály, 9 barev a typy montáže. Zdroj: Technical data 1/2024, FAQ Příhoda.</p>
        <p><b>2. Optimalizace.</b> Engine prohledá prostor variant: počet větví × typ výstupu × poloha otvorů (2–10, 3–9, 4–8, 5–7, 6 h) × statický tlak × velikost otvoru/trysky. Průměr se volí z řady standardních průměrů podle cílové rychlosti; počet a rozteč otvorů z potřebné otevřené plochy (Q = C<sub>c</sub>·A·v<sub>0</sub>, v<sub>0</sub> = C<sub>v</sub>·√(2p/ρ)) s kontrolou vyrobitelnosti. Hrubé prohledání → zjemnění → přesné přehodnocení 10 nejlepších. Skóre kombinuje komfort, dosah, hluk, energii a spotřebu tkaniny.</p>
        <p><b>3. Proudy.</b> Integrální model volného proudu (Morton–Taylor–Turner, profil top-hat) pro kruhové proudy (perforace, trysky; strhávání α = 0,082 → v<sub>x</sub> ≈ 6,9·v<sub>0</sub>·√A<sub>0</sub>/x) a vějířové proudy mikroperforace (růst šířky dle úhlové šířky pásu). Vztlak dle Boussinesqa, stabilní stratifikace místnosti (gradient dle ΔT), dopad na podlahu (stěnový proud), přilnutí ke stropu (Coandův jev) a odtržení chladného proudu (lokální Archimedovo číslo). Konstanty odpovídají standardní teorii volného proudu; katalogové dosahy Příhoda slouží jako orientační rozsahy typů výstupu (proud přilnutý ke stropu dosáhne dál než volný proud).</p>
        <p><b>4. Pobytová zóna.</b> Superpozice proudů všech větví včetně zrcadlení u stěn ve výšce hlavy (1,1 / 1,8 m) i kotníků (0,1 m), plus recirkulace indukovaná hybností přívodu (u ~ √(M/ρ·A)) a gravitační proud chladného vzduchu (u ~ (g′q′)<sup>1/3</sup>). Komfort: <b>ISO 7730</b> Draught Rate (Tu = 40 %, kategorie A/B/C), <b>ASHRAE 113</b> ADPI; u vytápění rychlost teplého vzduchu, průnik do zóny a rozdíl teplot hlava–kotníky; u chladných pracovišť v ≤ 0,20 m/s. Rosný bod (Magnus) → volba prodyšné tkaniny proti kondenzaci.</p>
        <p><b>5. Srovnání s plechem.</b> Stejné trasy jako spiro potrubí (tloušťka plechu dle průměru), vyústky po 3–8 m po obou stranách (čelní rychlost 3,2 m/s) – bodové proudy stejným integrálním modelem v 3D. Hmotnost 7 850 kg/m³ + 12 % spoje, montáž tkaniny 20 % času plechu (údaj Příhoda), uhlíková stopa cradle-to-gate (ocel 2,3; PES 6,0 / rPES 3,0; hliník 8,2 kg CO₂e/kg).</p>
        <p><b>6. Živá CFD.</b> 2D řez halou, nestlačitelné Navierovy–Stokesovy rovnice s Boussinesqovým vztlakem, MacCormackova advekce, projekce tlaku (red-black SOR), turbulence modelem nulového řádu pro vnitřní prostředí (Chen &amp; Xu 1998: ν<sub>t</sub> = 0,03874·|V|·l, l = vzdálenost od stěny, implicitní difuze); výtoky jako zdroje hybnosti a vztlaku se stejným tokem jako v návrhu; tepelná bilance (chlazení: zisky v pobytové zóně 65 % a pod střechou 35 %; vytápění: ztráty stropem a stěnami), odtah u stropu. Pro lineární tkaninové vyústky je 2D řez fyzikálně oprávněný (proudění je po délce homogenní). Výsledky jsou orientační.</p>
        <p><b>7. AI.</b> Claude (Anthropic) s nástroji nad stejným enginem – AI nic „nevymýšlí“: mění vstupy, čte výsledky výpočtu a vysvětluje je. Bez klíče offline parser češtiny.</p>
        <div class="note-box">Výstupy jsou orientační a slouží k rychlé předběžné nabídce. Konečný návrh, tlakové ztráty, hluk a výrobní dokumentaci zpracuje PŘÍHODA s.r.o. v programu Air Tailor, u složitých případů CFD simulací (Fluent).</div>
      </div>
      <div class="modal-foot"><button class="btn primary" data-close>Rozumím</button></div>
    </div>`;
  modal.hidden = false;
  const close = () => {
    modal.hidden = true;
    modal.innerHTML = '';
  };
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };
}
