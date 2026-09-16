# Příhoda AI Air Studio

Koncept webové aplikace pro firmu **PŘÍHODA s.r.o.** (Hlinsko) – výrobce tkaninových vyústek a potrubí na míru.
Z volného zadání (text, hlas, fotografie půdorysu) během desítek sekund vytvoří **inženýrský návrh tkaninového rozvodu vzduchu**,
ukáže ho ve **3D digitálním dvojčeti** haly se živým prouděním, spočítá **komfort dle ISO 7730**, porovná ho s **plechovým potrubím**,
spustí **živou CFD simulaci** a připraví **nabídku do PDF** – a to vše může ovládat **AI konzultant (Claude)**.

> Koncept vytvořený s pomocí AI pro ukázku kurzu. Technická data pocházejí z veřejného katalogu Příhoda
> (Technical data 1/2024, FAQ). Nejde o oficiální produkt společnosti; výpočty jsou orientační.

## Spuštění

**Nejjednodušší:** dvojklikem otevřete `Prihoda-AI-Air-Studio.html` (Chrome nebo Edge). Soubor je soběstačný – funguje
i bez internetu (kromě AI konzultanta, který potřebuje připojení k Claude API).

**Pro vývoj:**

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # vytvoří dist/index.html a Prihoda-AI-Air-Studio.html
```

## Nasazení na web (Netlify)

Web běží jako statický build + Edge Function `netlify/edge-functions/claude.js`, která drží **váš klíč na serveru**
a streamuje odpovědi Claude do prohlížeče. Návštěvníci nic nevkládají – AI funguje rovnou.

1. **Netlify → Add new project → Import an existing project → GitHub** → vyberte repozitář. Build nastaví
   `netlify.toml` sám (`npm run build:web`, složka `dist`).
2. **Project configuration → Environment variables:** přidejte `ANTHROPIC_API_KEY` (váš klíč, scope musí zahrnovat
   Functions). Pak **Deploys → Trigger deploy**, aby se proměnná projevila.
3. **Anthropic Console → Limits:** nastavte měsíční limit útraty (nejspolehlivější pojistka).

Ochrana klíče: server vkládá vlastní systémový prompt (proxy nejde použít jako obecné API), povolí jen modely,
nástroje a parametry aplikace, max. 40 požadavků/min na IP, **150 požadavků/den na IP** a **600/den pro celý web**
(jeden dotaz v chatu = 1–3 požadavky). Limity lze změnit proměnnými `AI_LIMIT_PER_IP_DAY`, `AI_LIMIT_PER_DAY`,
povolené modely `AI_ALLOWED_MODELS` (např. `claude-sonnet-5` pro nižší náklady). Kdo vloží vlastní klíč v Nastavení,
volá Claude přímo bez limitů webu.

**Nefunguje AI?** Otevřete `https://<váš-web>.netlify.app/api/claude/health` – pole `reason` řekne, co chybí
(stejná hláška je v aplikaci v Nastavení). Netlify AI Gateway (modely typu gpt‑4.1‑mini v nastavení Netlify) aplikace
nepoužívá: proxy volá vždy přímo api.anthropic.com a přijme jen vlastní klíč `sk-ant-…`. Web musí být nasazený
z GitHubu nebo přes Netlify CLI – při přetažení složky (Netlify Drop) se edge funkce nenasadí.

Lokální test nasazení: `npm run build:web`, pak `ANTHROPIC_API_KEY=… npm run serve:local` → http://127.0.0.1:8888.

## AI konzultant (Claude)

Na webu s nastavenou serverovou AI (viz výše) funguje AI bez klíče. Lokálně (soubor HTML, `npm run dev`)
vpravo nahoře klikněte na **Offline režim → Nastavení**, vložte Anthropic API klíč a uložte. Klíč zůstává jen ve vašem
prohlížeči (localStorage) a posílá se výhradně na `api.anthropic.com`. Výchozí model je **Claude Opus 5** (lze přepnout
na Sonnet 5 / Haiku 4.5), s rychlou úrovní uvažování vhodnou pro živé demo. U Opus 5 je zapnutý serverový záložní model
pro případ odmítnutí bezpečnostním filtrem.

AI ovládá aplikaci nástroji: `upravit_projekt` (nastaví/změní parametry a přepočítá fyzikální model),
`ovladat_zobrazeni` (pohledy, mapy, kamera), `pouzit_variantu` (alternativa z optimalizátoru) a `pripravit_nabidku`
(texty nabídky v libovolném jazyce vč. překladu kusovníku). Bez klíče funguje **offline parser češtiny** (rozměry,
průtoky, teploty, typ provozu, barvy, požadavky, příkazy typu „ukaž CFD“).

## Co ukázat na demu (cca 5 minut)

1. **Úvod → „Spustit prezentaci (autopilot)“** – aplikace sama projde celý příběh s titulky (klávesa Esc ukončí).
2. **Zadání vlastními slovy nebo hlasem** (tlačítko mikrofonu, čeština): např.
   *„Masna 25 × 12 m, výška 4,2 m, chlazení na 8 °C, přívod 4 °C, 9 000 m³/h, červené potrubí.“*
   Sledujte, jak se vyústky „nafouknou“ a vzduch začne proudit otvory přesně podle návrhu.
3. **AI konzultant:** „Zákazník chce tišší provoz“, „Ukaž mi, kde by táhlo“, „Co když bude hala o 2 m vyšší?“,
   „Porovnej to s plechem“, „Připrav nabídku v němčině“. AI mění parametry, přepočítá model a vysvětlí výsledek.
4. **Fotka půdorysu** (sponka v zadání) – AI odhadne rozměry a typ provozu.
5. **Srovnání s plechem** (klávesa 3) – rozdělený 3D pohled, komfort, hmotnost (−95 %), montáž, CO₂.
6. **Řez & CFD** (klávesa 2) – Navierovy–Stokesovy rovnice se vztlakem v reálném čase v prohlížeči.
7. **Nabídka** – výkresy, srovnání, kusovník; tisk do PDF.

Klávesy: `1–4` pohledy · `P` prezentační režim · `Ctrl+Enter` navrhnout · `Esc` zpět.

## Jak to funguje

| Vrstva | Obsah |
|---|---|
| Katalog | standardní průměry 100–2000 mm, typy výstupu (mikroperforace, perforace, malé/velké trysky) s katalogovými dosahy, tlaky 40–400 Pa, rychlosti dle hlukové třídy, materiály (Premium/Classic/Recycled…), 9 barev, typy montáže, díly se zipy max. 5,5 m |
| Návrhový engine | vyhodnotí ~500–900 variant (počet větví × výstup × poloha otvorů × tlak × velikost otvoru), 10 nejlepších přepočítá v plném rozlišení a vybere nejlepší kompromis komfortu, dosahu, hluku, energie a nákladů |
| Fyzika proudění | integrální model volného proudu (Morton–Taylor–Turner) pro kruhové i vějířové proudy, vztlak (Boussinesq), stratifikace místnosti, dopad na podlahu, Coandův jev u stropu a odtržení chladného proudu, recirkulace indukovaná hybností přívodu |
| Komfort | ISO 7730 Draught Rate (kategorie A/B/C), ASHRAE 113 ADPI, u vytápění rychlost teplého vzduchu, průnik do pobytové zóny a gradient hlava–kotníky; rosný bod a riziko kondenzace (volba prodyšné tkaniny) |
| Srovnání | plechové spiro potrubí s vyústkami pro stejný průtok: bodové proudy, hmotnost, montáž (20 % času dle Příhody), uhlíková stopa, doprava, kondenzace, čištění |
| 3D | Three.js: hala s konstrukcí a vybavením dle provozu, vyústky s animací nafouknutí, perforace dle rozteče a hodinové polohy, trysky, zipy, závěsy, VZT jednotka, 10–26 tisíc částic proudění, mapy rychlosti/průvanu/teploty, obarvení osob dle komfortu, sonda hodnot |
| CFD | 2D řez: nestlačitelné N–S + Boussinesq, turbulence modelem nulového řádu (Chen & Xu 1998), MacCormackova advekce, projekce tlaku (red-black SOR), zdroje hybnosti a vztlaku odpovídající návrhu; běží ve Web Workeru |
| AI | Claude API (oficiální SDK, streaming, nástroje, prompt caching, obrázky), offline záloha |

Testovací skripty: `npm run test:engine`, `npm run test:robust`, `npm run test:cfd` (CFD vs. návrhový model pro všechny šablony);
`node scripts/throw-check.mjs` porovná dosahy proudů s katalogovými rozsahy, `node scripts/cfd-diag.mjs food` vypíše střední proudové pole CFD;
`npm run mock` spustí lokální mock Claude API pro test agentní smyčky bez klíče.
