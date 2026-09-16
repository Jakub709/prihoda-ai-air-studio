# Příhoda AI Air Studio – kompletní dokumentace

> Koncept aplikace vytvořený pro ukázku kurzu AI (září 2026). Technická data pocházejí z veřejného katalogu firmy
> PŘÍHODA s.r.o. (Technical data 1/2024, FAQ). **Nejde o oficiální produkt společnosti Příhoda; výpočty jsou orientační.**
> Stručná verze pro laiky je v souboru [JAK-TO-FUNGUJE.md](JAK-TO-FUNGUJE.md).

## Obsah

1. [Shrnutí](#1-shrnutí)
2. [Kontext: Příhoda a látkové rozvody](#2-kontext-příhoda-a-látkové-rozvody)
3. [Co aplikace umí](#3-co-aplikace-umí)
4. [Prohlídka aplikace](#4-prohlídka-aplikace)
5. [Jak to celé funguje – architektura](#5-jak-to-celé-funguje--architektura)
6. [Výpočetní jádro](#6-výpočetní-jádro)
7. [Hodnocení komfortu](#7-hodnocení-komfortu)
8. [Srovnání s plechovým rozvodem](#8-srovnání-s-plechovým-rozvodem)
9. [3D vizualizace](#9-3d-vizualizace)
10. [Živá CFD simulace](#10-živá-cfd-simulace)
11. [AI konzultant (Claude)](#11-ai-konzultant-claude)
12. [Technická nabídka](#12-technická-nabídka)
13. [Scénář ukázky na kurzu](#13-scénář-ukázky-na-kurzu)
14. [Omezení a přesnost](#14-omezení-a-přesnost)
15. [Technické informace](#15-technické-informace)
16. [Slovníček pojmů](#16-slovníček-pojmů)
17. [Zdroje](#17-zdroje)

---

## 1. Shrnutí

**Příhoda AI Air Studio** je webová aplikace, která z volného zadání (text, hlas nebo fotografie půdorysu) během
několika sekund vytvoří **předběžný inženýrský návrh látkového rozvodu vzduchu** – počet a průměr potrubí, typ a polohu
otvorů, provozní tlak, materiál, montáž i kusovník. Návrh zobrazí ve **3D digitálním dvojčeti** haly se živým
prouděním vzduchu, vyhodnotí **tepelnou pohodu podle ISO 7730 a ASHRAE 113**, porovná ho s **klasickým plechovým
rozvodem**, ověří ho **živou CFD simulací** a připraví **technickou nabídku do PDF**.

Celou aplikaci může ovládat **AI konzultant (Claude od Anthropicu)**: rozumí češtině, obrázkům i hlasu, sám mění
parametry, nechává návrh přepočítat a vysvětluje výsledky. Čísla přitom nikdy nevymýšlí – vždy je spočítá fyzikální
výpočetní jádro.

| Klíčové údaje | |
|---|---|
| Doba výpočtu návrhu | 0,05–0,4 s (500–900 vyhodnocených variant) |
| Šablony provozů | 10 (potravinářství, chladírna, sport, bazén, výroba, obchod, kancelář, kuchyně, sklad, laboratoř) |
| 3D vizualizace | 11–28 tisíc částic proudění, 60 snímků/s |
| CFD simulace | 2D řez, cca 12–18 tisíc buněk, běží živě v prohlížeči |
| Nabídka | 5 stran A4, 7 jazyků (čeština, angličtina, němčina, slovenština, polština, španělština, francouzština) |
| Distribuce | jeden soubor HTML (1,2 MB), bez instalace, funguje i offline (kromě AI) |

---

## 2. Kontext: Příhoda a látkové rozvody

**PŘÍHODA s.r.o.** z Hlinska vyrábí od roku 1994 textilní (tkaninové) vyústky a potrubí na míru. Místo plechového
potrubí s mřížkami visí pod stropem látkové „rukávy“. Ventilátor je nafoukne a vzduch z nich vychází **po celé délce**
tisíci otvory – od mikroskopických po velké trysky. Výsledkem je rovnoměrné rozvedení vzduchu bez průvanu, výrazně nižší
hmotnost, rychlá montáž a snadná údržba (vyústky se perou v pračce).

### Způsoby výstupu vzduchu (podle katalogu)

| Typ výstupu | Otvory | Katalogový dosah na 0,2 m/s | Typické použití |
|---|---|---|---|
| Mikroperforace rovnoměrná | 200–400 µm po obvodu | 0–1,5 m | velmi nízké rychlosti, bezprůvanové rozptýlení |
| Mikroperforace směrovaná | 200–400 µm v pásech | 0–3 m | nízkorychlostní, ale směrovaný přívod |
| Perforace | ≥ 4 mm | 3–12 m | směrovaný přívod na střední vzdálenosti |
| Malé textilní trysky | Ø 20 / 30 / 40 / 60 mm | 4–15 m | směrované proudy, dosah o cca 25 % delší než perforace |
| Velké textilní trysky | Ø 50–100 mm | 10–30 m | nejdelší dosahy, vysoké haly |

Poloha otvorů se udává jako na hodinách: **12 h nahoře, 6 h dole**. Aplikace pracuje s polohami 2 a 10 h (šikmo
vzhůru, využití stropu), 3 a 9 h (vodorovně), 4 a 8 h (šikmo dolů), 5 a 7 h (strmě dolů) a 6 h (svisle dolů).

### Katalogová data v aplikaci

- **Průměry:** standardní řada 100–2000 mm, průřez kruhový (C) nebo půlkruhový pod strop (H).
- **Díly:** počáteční díl se zipem (100–200 mm), průběžné díly max. 5 500 mm, koncový díl se záslepkou.
- **Tlaky:** běžně 40–400 Pa (typicky 120 Pa); minimum 20 Pa u lehkých a 50 Pa u středních/těžkých tkanin.
- **Rychlost v potrubí podle hlukové třídy:** tichý provoz 2–4 m/s, běžný 4–7 m/s, průmyslový 7–10 m/s.
- **Materiály:** Premium (PMI/NMI – antibakteriální a antistatická úprava), Classic (PMS/NMS), Recycled
  (PMSre/NMSre – 13 PET lahví na 1 m²), Light (PLS/NLS), Durable (NMR), skelná tkanina NHE (nehořlavost třídy A).
  Písmeno P = prodyšná tkanina, N = neprodyšná.
- **Barvy:** 9 skladových (bílá, žlutá, světle a tmavě šedá, zelená, červená, světle modrá, modrá, černá) + **Prihoda
  ART** – libovolná barva, logo nebo motiv.
- **Montáže:** č. 1/2 lanko (jednoduché/dvojité), č. 3 profil přímo na strop, č. 5/6 zavěšený profil (jednoduché/
  dvojité zavěšení), č. 8 půlkruh v profilech.

---

## 3. Co aplikace umí

| Oblast | Funkce |
|---|---|
| **Zadání** | volný text, diktování česky (mikrofon), fotografie půdorysu nebo výkresu (AI z ní odhadne rozměry), 10 šablon provozů, podrobné parametry |
| **Návrh** | počet větví, průměr, délka a dělení na díly, typ výstupu, poloha otvorů, statický tlak, velikost a počet otvorů, materiál, barva, montáž, kusovník |
| **Kontroly** | rychlost v potrubí, tlak, průvan / rychlost teplého vzduchu, ADPI nebo teplotní gradient, průnik teplého vzduchu, rosný bod a kondenzace, výrobní proveditelnost otvorů |
| **3D digitální dvojče** | hala s konstrukcí a vybavením podle provozu, animace nafouknutí vyústek, částice proudění, mapy rychlosti / průvanu / teploty, postavy obarvené podle komfortu, sonda hodnot, pohledy kamery |
| **Srovnání s plechem** | rozdělená obrazovka (látkový vs. plechový rozvod) a srovnávací karty: komfort, hmotnost, montáž, uhlíková stopa, objem při dopravě |
| **CFD** | živá 2D simulace proudění v řezu halou, rychlost i teplota, okamžité i časově průměrované pole, stopovací částice, porovnání s návrhovým modelem |
| **Analýza** | grafy rychlosti a průvanu, trajektorie proudů, útlum rychlosti, rychlost uvnitř vyústky, půdorys, tabulka variant optimalizátoru, kusovník s exportem do CSV |
| **Nabídka** | 5stránkový dokument A4 s 3D snímkem, výkresy, mapami komfortu, srovnáním a kusovníkem; tisk / uložení do PDF; texty může napsat AI v jiném jazyce |
| **AI konzultant** | chat, který ovládá celou aplikaci nástroji; každou změnu lze vrátit |
| **Prezentace** | autopilot „Demo“ s titulky, prezentační režim (3D přes celé okno s panelem hlavních čísel) |
| **Projekt** | uložení a načtení projektu (JSON), sdílený odkaz s kompletním zadáním |

### Šablony provozů a jejich výchozí výsledek

Šablony nastaví typické rozměry, průtok, teploty a požadavky. Výsledek v tabulce je to, co výpočetní jádro samo vybere
(stav k 14. 9. 2026).

| Šablona | Prostor (m) | Průtok | Režim (přívod / prostor) | Navržený rozvod | Max. rychlost v zóně |
|---|---|---|---|---|---|
| Potravinářská výroba | 30 × 18 × 5,5 | 12 000 m³/h | chlazení 10 / 16 °C | 2× Ø630, mikroperforace směrovaná 2 a 10 h, 70 Pa | 0,13 m/s |
| Chladírna | 24 × 12 × 5 | 16 000 m³/h | chlazení 0 / 4 °C | 2× Ø710, mikroperforace směrovaná 2 a 10 h, 50 Pa | 0,15 m/s |
| Sportovní hala | 44 × 24 × 9 | 22 000 m³/h | vytápění 30 / 18 °C | 2× Ø900, malé trysky Ø40 mm 6 h, 200 Pa | 0,29 m/s |
| Bazén | 28 × 16 × 7 | 12 000 m³/h | vytápění 34 / 30 °C | 2× Ø630, mikroperforace směrovaná 6 h, 70 Pa | 0,27 m/s |
| Výrobní hala | 60 × 30 × 10 | 42 000 m³/h | vytápění 28 / 18 °C | 2× Ø1000, malé trysky Ø60 mm 6 h, 150 Pa | 0,33 m/s |
| Supermarket | 50 × 30 × 5,5 | 30 000 m³/h | chlazení 17 / 24 °C | 2× Ø1000, perforace Ø20 mm 2 a 10 h, 80 Pa | 0,14 m/s |
| Kancelář | 24 × 14 × 3,4 | 6 000 m³/h | chlazení 18 / 24 °C | 2× Ø630, mikroperforace směrovaná 2 a 10 h, 50 Pa | 0,12 m/s |
| Kuchyně | 18 × 10 × 3,6 | 13 000 m³/h | chlazení 20 / 26 °C | 2× Ø630, mikroperforace směrovaná 2 a 10 h, 50 Pa | 0,23 m/s |
| Sklad | 72 × 36 × 11 | 48 000 m³/h | vytápění 29 / 17 °C | 2× Ø1120, velké trysky Ø60 mm 6 h, 250 Pa | 0,35 m/s |
| Laboratoř | 16 × 10 × 3,5 | 6 700 m³/h | chlazení 17 / 21 °C | 2× Ø630, mikroperforace směrovaná 2 a 10 h, 50 Pa | 0,17 m/s |

---

## 4. Prohlídka aplikace

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Příhoda │ projekt │ 3D návrh · Řez & CFD · Srovnání · Analýza │ AI │ Demo │ Nabídka  │
├──────────────┬────────────────────────────────────────────────┬──────────────────────┤
│ AI zadání    │                                                │ Výsledky návrhu      │
│ projektu     │        hlavní pohled                           │  / AI konzultant     │
│ Šablony      │   (3D, CFD, srovnání, analýza)                 │                      │
│ Parametry    │                                                │                      │
├──────────────┴────────────────────────────────────────────────┴──────────────────────┤
│ stavový řádek: model · normy · čas výpočtu · Metodika výpočtu · klávesové zkratky    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Horní lišta:** přepínání pohledů, štítek stavu AI („Offline režim“ nebo název modelu – kliknutím se otevře
  nastavení), tlačítko **Demo** (autopilot), prezentační režim, **Nabídka**, nastavení.
- **Levý panel:** pole *AI zadání projektu* (text, mikrofon, sponka pro obrázek, tlačítko *Navrhnout rozvod*),
  10 šablon a parametry ve skupinách *Prostor, Vzduch, Požadavky, Rozvod, Tkanina a vzhled, Projekt*. Téměř každý
  parametr může být „auto“ – pak ho zvolí optimalizátor. Hodnoty změněné AI krátce zablikají.
- **Pravý panel:** záložka *Výsledky návrhu* (hlavní výsledek, 8 ukazatelů, kontroly, zdůvodnění, specifikace, varianty)
  a záložka *AI konzultant* (chat s návrhy dotazů).
- **Stavový řádek:** použitý model, normy, zdroj dat, doba výpočtu, odkaz **Metodika výpočtu** (popis modelů pro
  odborníky).

**Klávesové zkratky:** `1`–`4` pohledy · `P` prezentační režim · `Ctrl+Enter` navrhnout · `Esc` zpět / ukončit demo.

---

## 5. Jak to celé funguje – architektura

```
          Zadání (text / hlas / foto)
                     │
                     ▼
   ┌───────────────────────────┐   nástroje    ┌──────────────────────────┐
   │ AI konzultant (Claude)    │ ────────────► │ Stav projektu            │
   │ nebo offline parser       │ ◄──────────── │ (parametry + návrh)      │
   └───────────────────────────┘ souhrn návrhu └────────────┬─────────────┘
                                                            │ přepočet
                                                            ▼
                                             ┌──────────────────────────┐
                                             │ Výpočetní jádro          │ Web Worker
                                             │ stovky variant → návrh   │
                                             └────────────┬─────────────┘
                                                          │ návrh
         ┌──────────────┬──────────────┬──────────────────┼──────────────┐
         ▼              ▼              ▼                  ▼              ▼
    3D dvojče      CFD simulace     Srovnání           Analýza        Nabídka
    (Three.js)     (Web Worker)     s plechem          (grafy)        (A4 / PDF)
```

**Tři pilíře:**

1. **AI vrstva** – rozumí zadání a ovládá aplikaci. Nemá vlastní výpočty; mění parametry nástroji a čte výsledky.
2. **Výpočetní jádro** – deterministický fyzikální model (JavaScript). Stejný vstup dá vždy stejný výsledek.
3. **Vizualizace** – 3D, CFD, grafy a nabídka čerpají z jednoho objektu návrhu, takže všechno vždy souhlasí.

**Průběh jednoho zadání s AI:**

1. Uživatel napíše zadání, případně přiloží obrázek.
2. Aplikace pošle Claude zprávu doplněnou o blok `<stav_navrhu>` (aktuální stav jako JSON).
3. Claude zavolá nástroj `upravit_projekt` s parametry vyčtenými ze zadání a s doplněnými předpoklady.
4. Aplikace změní parametry a spustí výpočet (ve Web Workeru, UI se neseká).
5. Souhrn nového návrhu se vrátí Claude jako výsledek nástroje.
6. Claude odpoví konkrétními čísly (text se zobrazuje průběžně) a případně přepne pohled nebo mapu.
7. V chatu zůstane „štítek“ změny s tlačítkem **↶ vrátit**.

Bez klíče k AI nastoupí **offline parser** (regulární výrazy a doménová pravidla), který z českého textu vyčte stejné
typy údajů a výpočet spustí přímo.

Vše běží lokálně v prohlížeči. Jediná síťová komunikace je volání Claude API (`api.anthropic.com`).

---

## 6. Výpočetní jádro

### 6.1 Vstupy a odvozené veličiny

| Vstup | Zpracování |
|---|---|
| Rozměry | délka 4–300 m, šířka 3–150 m, světlá výška 2,4–30 m |
| Průtok | zadaný; nebo z tepelné zátěže `Q = P / (ρ·c·ΔT)`; nebo z intenzity výměny `Q = n·V` |
| Teploty | přívod a prostor → rozdíl ΔT, chladicí/topný výkon |
| Vlhkost | rosný bod (Magnus–Tetens) → riziko kondenzace, je-li přívod pod rosným bodem (+0,5 K) |
| Kategorie prostředí | ISO 7730 A/B/C (DR < 10 / 20 / 30 %) |
| Hluková třída | cílová rychlost v potrubí (tichý / běžný / průmyslový provoz) |
| Pobytová zóna | 1,1 m (sedící) nebo 1,8 m (stojící) |
| Stratifikace | modelový svislý teplotní gradient: chlazení 0,09 K/m na 1 K rozdílu teplot (0,2–1,0 K/m), vytápění 0,03 K/m na 1 K (0,15–0,8 K/m) |

### 6.2 Prostor variant

Optimalizátor kombinuje:

- **počet větví** – od nejmenšího počtu, při kterém průměr nepřekročí 1 250 mm, až o 4 víc (omezeno šířkou haly),
- **typ výstupu** – 5 typů (velké trysky jen od výšky 5 m, rovnoměrná mikroperforace jen do 12 m),
- **polohu otvorů** – 5 poloh (při vytápění se vynechá 2 a 10 h, teplý vzduch musí dolů),
- **statický tlak** – podle typu (např. mikroperforace 50–130 Pa, velké trysky 80–350 Pa),
- **velikost otvoru** – perforace 6–20 mm, malé trysky 20–60 mm, velké trysky 50–100 mm.

Pro každou variantu jádro dopočítá:

- **průměr** ze standardní řady podle cílové rychlosti v potrubí a výšku osy vyústky pod stropem,
- **výtokovou rychlost** `v₀ = Cv·√(2p/ρ)` a potřebnou otevřenou plochu `A = Q / (Cc·v₀)`,
- **počet a rozteč otvorů**, včetně kontroly vyrobitelnosti (příliš hustě / řídce, u mikroperforace max. 12 %
  otevřené plochy v pásu).

### 6.3 Model proudu vzduchu

Každý proud se sleduje po své dráze **integrálním modelem volného proudu** (Morton–Taylor–Turner, profil „top-hat“).
Model počítá objemový tok, hybnost a vztlak proudu:

- **Kruhové proudy** (perforace, trysky): strhávání okolního vzduchu s koeficientem α = 0,082, osová rychlost klesá
  přibližně jako `v ≈ 6,9·v₀·√A₀ / x`.
- **Vějířové proudy** (mikroperforace): plošný proud na metr délky vyústky; šířka roste podle úhlové šířky pásu.
- **Vztlak (Boussinesq):** chladný proud se stáčí dolů, teplý nahoru; stabilní stratifikace brzdí svislý pohyb.
- **Dopad na podlahu:** proud přejde ve stěnový proud podél podlahy.
- **Strop:** proud přilne ke stropu (Coandův jev). Chladný proud se od stropu odtrhne, když lokální Archimedovo číslo
  překročí 0,12, a dál padá jako nový proud.
- **Teplý proud mířený dolů** („fontána“) končí v bodě obratu – teplý vzduch pak stoupá kolem proudu a rozlévá se pod
  stropem.
- **Dosah** je délka dráhy, na které osová rychlost klesne na 0,2 m/s.

### 6.4 Pobytová zóna

- Proudy všech větví se sečtou včetně **zrcadlení u stěn** (stěna vrací proud zpět do místnosti). Rychlosti se skládají
  „energeticky“ (součet kvadrátů).
- Hodnotí se ve **výšce hlavy** (1,1 / 1,8 m) i u **kotníků** (0,1 m).
- K proudům se přičítá **pozadí**: turbulence podle intenzity výměny, recirkulace vyvolaná hybností přívodu
  (škálování podle Nielsena, `u ~ √(M / ρ·A_podlahy)`) a u chlazení gravitační proud chladného vzduchu
  (`u ~ (g′·q′)^⅓`).
- Výsledkem je profil rychlosti a teploty napříč halou a 2D mapa pobytové zóny pro 3D zobrazení.

### 6.5 Optimalizace

1. **Hrubé prohledání** celého prostoru variant (zjednodušené trajektorie).
2. **Zjemnění** – plná mřížka tlaků a velikostí otvorů kolem 8 nejlepších kombinací.
3. **Přesné přehodnocení** 10 nejlepších kandidátů v plném rozlišení.

Výsledek je varianta s nejnižším **skóre** (penalizace). Skóre zahrnuje:

- komfort – DR nad limitem, podíl zóny v limitu, ADPI; u vytápění rychlost teplého vzduchu, průnik a gradient,
- dosah – šířka pásu na jednu větev vs. katalogový dosah daného výstupu,
- hluk – rychlost v potrubí a u tichých provozů výtoková rychlost,
- energii – statický tlak,
- náklady – počet větví, plocha tkaniny, počet trysek, velmi velké průměry.

Kromě vítěze aplikace nabídne **6 alternativ** s odlišnou kombinací počtu větví, výstupu a polohy otvorů.

### 6.6 Výstupy návrhu

- **Geometrie:** větve, průměr, délka, dělení na díly se zipy (max. 5,5 m), rozvodná větev při více větvích, poloha
  VZT jednotky.
- **Materiál** se volí podle požadavků: Premium při hygieně, Recycled při preferenci ekologie, skelná NHE při
  nehořlavosti A, jinak Classic. Hrozí-li kondenzace, zvolí se prodyšné provedení.
- **Montáž** (auto): č. 8 pro půlkruh, č. 3 při malém prostoru pod stropem, č. 6 pro průměry od 1 000 mm, jinak č. 5.
- **Kusovník:** vyústky, počáteční, průběžné a koncové díly, zipy, transportní potrubí, odbočky, regulační klapky,
  vyrovnávač proudění EQ, tlumič rázu Beat Absorber, obruče, profily nebo lanka, závěsy Gripple a napínáky.
- **Tlak a ventilátor:** externí tlak = statický tlak + 10–25 Pa (+10 Pa při rychlosti v potrubí nad 6 m/s);
  orientační příkon ventilátoru `P = Q·p_ext / 0,6`.
- **Kontroly** se semaforem (v pořádku / varování / chyba) a **zdůvodnění** návrhu v 5 větách.

---

## 7. Hodnocení komfortu

| Kritérium | Vzorec / pravidlo | Použití |
|---|---|---|
| **Riziko průvanu DR** (ISO 7730) | `DR = (34 − t)·(v − 0,05)^0,62·(0,37·v·Tu + 3,14)`, Tu = 40 % | chlazení a větrání; limit podle kategorie A/B/C (10 / 20 / 30 %) |
| **ADPI** (ASHRAE 113) | podíl bodů, kde efektivní teplota průvanu `EDT = (t − t_r) − 7,66·(v − 0,152)` leží mezi −1,7 a +1,1 K a zároveň v < 0,35 m/s | kvalita distribuce, nad 80 % výborné |
| **Rychlost teplého vzduchu** | v ≤ 0,25 / 0,30 / 0,40 m/s (kat. A / B / C) | vytápění (DR hodnotí jen chladný průvan) |
| **Průnik teplého vzduchu** | jak hluboko proudy dopraví teplý vzduch k pobytové zóně | vytápění; pod 90 % hrozí „tepelný polštář“ pod střechou |
| **Rozdíl teplot hlava–kotníky** | modelový gradient; limit 2 / 3 / 4 K (A / B / C) | vytápění |
| **Chladná pracoviště** | v ≤ 0,20 m/s | prostory pod 12 °C |
| **Rosný bod** | Magnus–Tetens | volba prodyšné tkaniny proti kondenzaci |

Z DR aplikace dopočítá i **nejvyšší přípustnou rychlost** pro danou teplotu (např. v potravinářské výrobě při 16 °C a
kategorii B je to 0,13 m/s) a zakreslí ji jako limit do map a grafů.

---

## 8. Srovnání s plechovým rozvodem

Aplikace pro stejný průtok a stejné trasy navrhne **klasický rozvod**: spiro potrubí s vyústkami po obou stranách a
spočítá ho stejným modelem proudu.

| Položka | Předpoklad |
|---|---|
| Vyústky | rozteč 3–8 m podle výšky pádu, čelní rychlost 3,2 m/s, bodové proudy |
| Plech | tloušťka 0,5–1,25 mm podle průměru, ocel 7 850 kg/m³ + 12 % na spoje, závěsy, vyústky 2,4 kg/ks |
| Montáž | 1,3–1,9 h/m potrubí + 0,45 h na vyústku (+ izolace); látkový rozvod 20 % tohoto času (údaj Příhody) |
| Uhlíková stopa | ocel 2,3 kg CO₂e/kg, izolace 3,5; polyester 6,0 (recyklovaný 3,0); hliník (závěsy) 8,2 kg CO₂e/kg |
| Kondenzace | pod rosným bodem potřebuje plech izolaci; prodyšná tkanina ne |

Srovnávací karty ukazují: **pobytovou zónu bez průvanu** (u vytápění průnik teplého vzduchu), **maximální rychlost**
(u vytápění teplotní gradient), **hmotnost, montáž, uhlíkovou stopu a objem při dopravě**. Například u potravinářské
výroby vychází látkový rozvod 50 kg proti 1 081 kg plechu (−95 %) a pobytová zóna bez průvanu 100 % proti 73 %.

---

## 9. 3D vizualizace

Postavená na knihovně **Three.js** (WebGL), běží v prohlížeči při 60 snímcích za sekundu.

- **Hala** podle typu provozu: podlaha (sportovní palubovka, bazén, epoxid, beton, koberec, dlažba), ocelová
  konstrukce, vybavení (linky, regály, stoly, bazén…) a postavy lidí.
- **Vyústky** přesně podle návrhu: průměr, délka, zipy, perforace v hodinové poloze a rozteči, trysky, závěsy,
  rozvodná větev a VZT jednotka. Barva podle volby, případně potisk **Prihoda ART** s nahraným logem.
- **Animace „ventilátor“:** vyústky se postupně nafouknou od jednotky ke konci; teprve pak začne proudit vzduch.
- **Částice proudění** (11–28 tisíc): vystupují z otvorů nafouknuté části a unáší je pole proudění z modelu.
  Barva ukazuje teplotu (modrá = chladný přívod, šedá = teplota prostoru, červená = teplý přívod).
- **Mapy pobytové zóny:** rychlost, riziko průvanu DR, teplota; bílá izolinie označuje limit.
- **Postavy** jsou obarvené podle komfortu přímo v jejich místě: zelená = v limitu, oranžová = hraniční,
  červená = průvan.
- **Kamery:** Přehled, Půdorys, Řez, Očima pracovníka, Průlet. Svislý řez rychlostí lze zapnout jako vrstvu.
- **Sonda:** po najetí myší na podlahu ukáže rychlost, teplotu a DR v daném místě (ve srovnání pro oba rozvody).
- **Srovnání:** rozdělená obrazovka se stejnou kamerou – vlevo látkový rozvod, vpravo plech s bodovými proudy.

---

## 10. Živá CFD simulace

CFD (Computational Fluid Dynamics) je **nezávislá kontrola** návrhového modelu: počítač rozdělí příčný řez halou na
tisíce buněk a v každé řeší pohybové rovnice vzduchu.

| Vlastnost | Řešení |
|---|---|
| Rovnice | nestlačitelné Navierovy–Stokesovy rovnice s Boussinesqovým vztlakem |
| Síť | 150–260 × 48–120 buněk (podle poměru stran řezu), buňka cca 5–16 cm |
| Advekce | MacCormackovo schéma (nízká numerická difuze) |
| Tlak | projekce s red-black SOR (16 iterací, ω = 1,75) |
| Turbulence | model nulového řádu pro vnitřní prostředí (Chen & Xu 1998): `νt = 0,03874 · V · l` (V = rychlost, l = vzdálenost od stěny); implicitní difuze |
| Výtoky | zdroje hybnosti a vztlaku se stejným tokem hybnosti na metr délky jako v návrhu |
| Tepelná bilance | chlazení: zisky 65 % v pobytové zóně a 35 % pod střechou; vytápění: ztráty stropem a stěnami |
| Odtah | horní část bočních stěn |
| Výpočet | ve Web Workeru; časový průměr s konstantou cca 12 s |

**Ovládání:** rychlost / teplota, okamžitě / časový průměr, stopovací částice, rychlost simulace (1×, 2×, 4×),
pauza a restart, sonda. Pod řezem je graf **rychlosti ve výšce pobytové zóny: CFD vs. návrhový model** a statistiky
(simulovaný čas, kroky za sekundu, maximum a průměr v zóně z CFD i z modelu).

**Shoda s návrhovým modelem** (časově průměrovaná CFD po 150 s simulace, rychlosti v pobytové zóně v m/s):

| Šablona | Model – max / průměr | CFD – max / průměr |
|---|---|---|
| Potravinářská výroba | 0,13 / 0,12 | 0,21 / 0,13 |
| Chladírna | 0,15 / 0,15 | 0,19 / 0,13 |
| Kancelář | 0,12 / 0,10 | 0,15 / 0,12 |
| Supermarket | 0,14 / 0,14 | 0,25 / 0,18 |
| Kuchyně | 0,23 / 0,18 | 0,34 / 0,19 |
| Laboratoř | 0,17 / 0,14 | 0,25 / 0,14 |
| Bazén | 0,27 / 0,16 | 0,25 / 0,15 |
| Sportovní hala | 0,29 / 0,17 | 0,51 / 0,36 |
| Výrobní hala | 0,33 / 0,17 | 0,47 / 0,32 |
| Sklad | 0,35 / 0,17 | 0,58 / 0,36 |

U chlazení se průměry shodují; lokální maxima CFD bývají vyšší v místech, kde klesá studený vzduch. U vytápění
tryskami ukazuje CFD vyšší hodnoty ze dvou důvodů: 2D řez nahrazuje řadu trysek souvislou štěrbinou (ta zpomaluje
pomaleji) a navíc zachycuje studený vzduch padající podél ochlazovaných stěn, který integrální model nepočítá.
Aplikace to uživateli přímo vysvětluje.

---

## 11. AI konzultant (Claude)

### Modely a nastavení

| Nastavení | Možnosti |
|---|---|
| Model | **Claude Sonnet 5** (výchozí), Claude Opus 5, Claude Haiku 4.5 |
| Hloubka uvažování | rychlá (pro demo), vyvážená, důkladná |
| Záložní model | u Opus 5 zapnutý serverový záložní model pro případ odmítnutí bezpečnostním filtrem |
| Diktování | volitelně odeslat zadání hned po nadiktování |

Technicky: oficiální SDK `@anthropic-ai/sdk`, streamování odpovědí, **cachování systémového promptu** (šetří čas i
cenu), až 10 kol volání nástrojů v jednom tahu, obsluha stavů `tool_use`, `pause_turn` a `refusal`, srozumitelné
chybové hlášky a při výpadku spojení přechod do offline režimu.

### Role a pravidla

Systémový prompt z Claude dělá **aplikačního inženýra Příhody**, který aplikaci ovládá nástroji. Obsahuje znalosti
z katalogu (průměry, tlaky, rychlosti, výstupy, materiály, barvy, montáže, příslušenství) a pravidla:

- změny vždy provádět nástrojem, ne jen popisovat,
- chybějící údaje doplnit rozumnými předpoklady a vypsat je uživateli,
- odpovídat čísly z vráceného výsledku (ne z hlavy), česky, stručně, s jednotkami,
- být poctivý – výpočty jsou orientační, nevymýšlet ceny.

### Nástroje

| Nástroj | Co dělá |
|---|---|
| `upravit_projekt` | nastaví nebo změní parametry (rozměry, průtok, teploty, požadavky, výstup, tlak, barvu, materiál, montáž…) a přepočítá návrh; vrací souhrn výsledku |
| `ovladat_zobrazeni` | přepne pohled, mapu pobytové zóny, kameru, částice a svislý řez |
| `pouzit_variantu` | použije jednu ze 6 alternativ optimalizátoru |
| `pripravit_nabidku` | napíše texty nabídky v libovolném jazyce, případně přeloží kusovník a kontroly, a otevře náhled |

Každá zpráva uživatele nese blok `<stav_navrhu>` se souhrnem aktuálního návrhu (prostor, vzduch, rozvod, komfort,
kontroly, varianty, kusovník, srovnání). Claude tak vždy pracuje s aktuálními čísly.

### Obrázky, hlas a vrácení změn

- **Obrázky** (vložení, přetažení nebo sponka) se zmenší na max. 1 568 px a pošlou modelu; Claude z nich odhadne
  rozměry, typ provozu a překážky.
- **Hlas:** rozpoznávání řeči prohlížeče v češtině, zastaví se samo po chvíli ticha.
- **Vrácení:** každá změna provedená AI má v chatu tlačítko **↶ vrátit**.

### Offline režim

Bez klíče rozumí zadání **offline parser češtiny**: typ provozu, rozměry („30 × 18 × 5,5 m“), průtok (i „12 tisíc“),
intenzitu výměny, tepelnou zátěž v kW, teploty podle kontextu („přívod 10 °C, v hale 16 °C“, „26/20 °C“), režim,
vlhkost, požadavky (hygiena, ticho, nehořlavost, ekologie), tvar, barvu, počet větví, typ výstupu, tlak, zákazníka a
místo. Chat v offline režimu zvládne i změny parametrů a jednoduché příkazy („zvyš průtok na 15 000 m³/h“,
„barva červená“, „ukaž CFD“, „porovnej s plechem“, „připrav nabídku“).

### Soukromí a režimy klíče

- **Web na Netlify:** klíč provozovatele je jen na serveru (Edge Function `/api/claude`), návštěvník nic nevkládá.
  Server vkládá vlastní systémový prompt, povolí jen modely, nástroje a parametry aplikace a hlídá limity
  (40 požadavků/min a 150/den na IP, 600/den pro celý web; nastavitelné). Po vyčerpání limitu AI napíše srozumitelnou
  hlášku a aplikace dál funguje bez AI.
- **Vlastní klíč:** ukládá se jen v prohlížeči (localStorage) a posílá se výhradně na `api.anthropic.com`; má přednost
  před serverem. Na veřejném počítači je dobré ho po ukázce smazat.

---

## 12. Technická nabídka

Náhled A4 se otevře tlačítkem **Nabídka** (nebo ho otevře AI). Obsahuje 5 stran:

1. **Titulní strana** – 3D snímek návrhu, 4 hlavní ukazatele, úvodní text pro zákazníka.
2. **Zadání a řešení** – tabulka zadání, popis řešení, parametry rozvodu, přínosy.
3. **Výkresy** – půdorys rozvodu s díly a zipy, příčný řez s trajektoriemi proudů a hodinová poloha otvorů.
4. **Komfort a srovnání** – mapy průvanu (látka vs. plech), profil rychlosti, srovnávací tabulka, kontroly.
5. **Kusovník a další kroky** – položky dodávky, doporučení, upozornění o orientačním charakteru výpočtu.

**Jazyky:** výběr ze 7 jazyků. Pevné části jsou přeložené do angličtiny a němčiny (ostatní jazyky používají anglické
popisky); texty nabídky, názvy položek kusovníku a kontroly napíše a přeloží AI tlačítkem *Napsat texty s AI*.
Pokud se návrh mezitím změní, aplikace upozorní, že texty AI jsou z předchozí verze. Tisk nebo uložení do PDF je přes
tlačítko *Tisk / Uložit PDF*.

---

## 13. Scénář ukázky na kurzu

**Příprava (5 minut předem):**

1. Otevřete `Prihoda-AI-Air-Studio.html` v Chrome nebo Edge.
2. Vložte API klíč (štítek „Offline režim“ vpravo nahoře) a stiskněte *Otestovat*.
3. Vyzkoušejte mikrofon (prohlížeč se zeptá na povolení).
4. Přepněte prohlížeč na celou obrazovku (`F11`); prezentační režim (`P`) navíc skryje boční panely.

**Varianta A – autopilot (cca 1 minuta):** tlačítko **Demo** projde 8 kroků s titulky: zadání → výpočet →
nafouknutí vyústek a pohled očima pracovníka → mapa průvanu → srovnání s plechem → CFD → analýza → nabídka.

**Varianta B – živá ukázka (5–10 minut):**

| Krok | Co udělat | Co tím ukázat |
|---|---|---|
| 1 | Nadiktovat: *„Masna 25 × 12 m, výška 4,2 m, chlazení na 8 °C, přívod 4 °C, 9 000 m³/h, červené potrubí.“* | AI rozumí mluvené češtině, doplní předpoklady |
| 2 | Sledovat nafouknutí a proudění, přepnout *Očima pracovníka* | výsledek je okamžitě „hmatatelný“ |
| 3 | Zeptat se: *„Kde by lidem táhlo?“* | AI sama přepne mapu průvanu a vysvětlí |
| 4 | *„Zákazník chce tišší provoz“* / *„Co když bude hala o 2 m vyšší?“* | AI mění parametry, návrh se přepočítá, lze vrátit |
| 5 | Vložit fotku půdorysu (sponka) | multimodalita – AI čte obrázky |
| 6 | Klávesa `3` – srovnání s plechem | konkrétní přínosy: komfort, hmotnost, montáž, CO₂ |
| 7 | Klávesa `2` – CFD | fyzika běžící živě v prohlížeči |
| 8 | *„Připrav nabídku v němčině“* | AI jako obchodník – překlad i kusovník |

**Hlavní myšlenka pro publikum:** AI tu není chatbot, ale **agent** – rozumí zadání, ovládá odborný nástroj,
kontroluje výsledky a vytvoří obchodní dokument. Odborná správnost je daná výpočetním jádrem, ne jazykovým modelem.

---

## 14. Omezení a přesnost

- **Výpočty jsou orientační.** Slouží k rychlé předběžné nabídce; finální návrh, tlakové ztráty, akustiku a výrobní
  dokumentaci dělá Příhoda v programu Air Tailor, složité případy CFD ve Fluentu.
- **Integrální model** je zjednodušení: nepočítá překážky, tepelné zdroje v detailu ani 3D efekty konců hal.
  Konstanty odpovídají standardní teorii volného proudu; katalogové dosahy slouží jako orientační rozsahy.
- **Dosah mikroperforace** vychází v modelu delší než katalogových 0–3 m (hlavně díky přilnutí proudu ke stropu).
  Aplikace to u ukazatele dosahu uvádí.
- **2D CFD** je u lineárních vyústek fyzikálně oprávněné, ale u řad trysek dává konzervativně vyšší rychlosti
  (viz kapitola 10).
- **AI** může zadání pochopit jinak, než uživatel myslel – proto vypisuje předpoklady a každou změnu lze vrátit.
  Cesta přes skutečné Claude API byla testována proti lokální napodobenině API; před ukázkou ji ověřte s vlastním
  klíčem.
- **Prohlížeč:** doporučen Chrome nebo Edge (WebGL, Web Workers, rozpoznávání řeči). Bez WebGL se 3D nezobrazí,
  zbytek aplikace funguje.
- **Právní status:** koncept pro výuku; používá jméno a veřejná katalogová data Příhody. Před veřejným sdílením se
  doporučuje souhlas firmy.

---

## 15. Technické informace

### Spuštění

- **Uživatel:** dvojklik na `Prihoda-AI-Air-Studio.html`.
- **Vývoj:**

```bash
npm install
npm run dev        # vývojový server http://localhost:5173
npm run build      # jeden soubor: dist/index.html + Prihoda-AI-Air-Studio.html
npm run build:web  # vícesouborový build pro web (Netlify)
```

- **Web (Netlify):** import repozitáře z GitHubu, v Environment variables nastavit `ANTHROPIC_API_KEY`, znovu nasadit.
  Podrobný postup je v [README.md](README.md#nasazení-na-web-netlify). Edge Function `netlify/edge-functions/claude.js`
  drží klíč na serveru a streamuje odpovědi; `npm run serve:local` nasazení emuluje lokálně.

### Technologie

| Oblast | Technologie |
|---|---|
| Sestavení | Vite 8 + vite-plugin-singlefile (vše v jednom HTML, workery a písma vložené) |
| 3D | Three.js 0.186 (WebGL, instancování, vlastní shadery pro částice a mapy) |
| AI | @anthropic-ai/sdk (Claude API, streamování, nástroje, prompt caching) |
| Výpočty | čistý JavaScript, výpočetní jádro a CFD ve Web Workerech |
| Písmo | Inter (latin + latin-ext, vložené) |

### Struktura projektu

| Složka / soubor | Obsah |
|---|---|
| `src/engine/` | katalog (`catalog.js`), fyzika proudu (`physics.js`), návrhový engine (`designer.js`), worker |
| `src/cfd/` | CFD řešič (`solver.js`), převod návrhu na zadání CFD (`config.js`), worker |
| `src/viz3d/` | 3D scéna, hala, vyústky, částice, mapy, textury |
| `src/ai/` | klient Claude (`claude.js`), nástroje (`tools.js`), systémový prompt (`prompts.js`), offline parser, řeč |
| `src/ui/` | panely, výsledky, chat, grafy, analýza, CFD pohled, nabídka, překlady, demo, metodika |
| `scripts/` | testy a diagnostika enginu a CFD, lokální mock Claude API, post-build |

### Testy a diagnostika

| Příkaz | Co ověřuje |
|---|---|
| `npm run test:engine` | návrhy všech 10 šablon, varianty, kontroly |
| `npm run test:robust` | 14 okrajových scénářů (malá místnost, obří hala, nesmyslné hodnoty, zamčené parametry…) |
| `npm run test:cfd` | stabilita CFD a srovnání s návrhovým modelem pro všechny šablony |
| `node scripts/throw-check.mjs` | dosahy proudů vs. katalogové rozsahy |
| `node scripts/cfd-diag.mjs food` | střední proudové pole CFD v textové podobě |
| `npm run mock` + `node scripts/agent-test.mjs` | agentní smyčka AI proti lokální napodobenině API |

### Výkon (orientačně)

- výpočet návrhu 0,05–0,4 s (500–900 variant),
- 3D 60 snímků/s s 11–28 tisíci částic,
- CFD 50–150 kroků za sekundu (podle počítače), ustálení proudění během 10–30 s.

---

## 16. Slovníček pojmů

| Pojem | Vysvětlení |
|---|---|
| **Vyústka** | koncový prvek, kterým vzduch vstupuje do místnosti; u Příhody celé látkové potrubí |
| **Pobytová zóna** | prostor, kde se zdržují lidé – do 1,1 m (sedící) nebo 1,8 m (stojící) nad podlahou |
| **Průtok** | objem vzduchu za hodinu (m³/h) |
| **Intenzita výměny** | kolikrát za hodinu se vymění vzduch v místnosti (h⁻¹) |
| **Statický tlak** | přetlak uvnitř vyústky, který „tlačí“ vzduch otvory ven (Pa) |
| **Dosah proudu** | vzdálenost, na které rychlost proudu klesne na 0,2 m/s |
| **DR (Draught Rate)** | procento lidí nespokojených s průvanem podle ISO 7730 |
| **ADPI** | index kvality distribuce vzduchu podle ASHRAE 113 – podíl míst s příjemnou kombinací rychlosti a teploty |
| **Kategorie A/B/C** | třídy prostředí podle ISO 7730 (DR < 10 / 20 / 30 %) |
| **Coandův jev** | přilnutí proudu vzduchu k blízkému povrchu (např. stropu) |
| **Vztlak** | teplý vzduch stoupá, studený klesá |
| **Stratifikace** | rozvrstvení teplot – nahoře tepleji než dole |
| **Rosný bod** | teplota, pod kterou začne kondenzovat vlhkost ze vzduchu |
| **CFD** | počítačová simulace proudění tekutin |
| **Integrální model proudu** | zjednodušený výpočet proudu po jeho dráze (objem, hybnost, vztlak) |
| **AI agent** | AI, která nejen odpovídá, ale sama používá nástroje a provádí akce |
| **Prompt caching** | uložení opakované části zadání pro AI, aby další dotazy byly rychlejší a levnější |

---

## 17. Zdroje

**Příhoda (veřejné zdroje):**

- [prihoda.com](https://www.prihoda.com/)
- [Air distribution](https://www.prihoda.com/en/air-distribution/) · [Fabric ducting and diffusers](https://www.prihoda.com/en/fabric-ducting-and-diffusers/) · [Air socks](https://www.prihoda.com/en/air-socks/)
- [Material](https://www.prihoda.com/en/material/) · [Installation](https://www.prihoda.com/en/installation/) · [Reasons for fabric](https://www.prihoda.com/en/reasons-for-fabric/)
- [CFD simulations](https://www.prihoda.com/en/cfd-simulations/) · [Design tools](https://www.prihoda.com/en/design-tools/) · [Air Tailor](https://www.prihoda.com/en/prihoda-air-tailor/) · [Velocity calculator](https://www.prihoda.com/en/resources/prihoda-velocity-calculator/)
- [Technical data 1/2024 (PDF)](https://www.prihoda.com/wp-content/uploads/2024/02/BTD-ENG-1.pdf)
- [FAQ – How much pressure do I need (PDF)](https://www.prihoda.com/wp-content/uploads/2025/07/FAQ_How-much-pressure-do-I-need-in-a-fabric-ducting-system-EN.pdf)
- [FAQ – What is the ideal velocity in a fabric duct (PDF)](https://www.prihoda.com/wp-content/uploads/2025/07/FAQ_What-is-the-ideal-velocity-in-a-fabric-duct-EN.pdf)

**Normy a odborná literatura:**

- ISO 7730 – Ergonomie tepelného prostředí (PMV/PPD, riziko průvanu DR, kategorie prostředí)
- ANSI/ASHRAE Standard 113 – Method of Testing for Room Air Diffusion (ADPI)
- Morton, Taylor, Turner (1956): *Turbulent gravitational convection from maintained and instantaneous sources*
- Chen, Xu (1998): *A zero-equation turbulence model for indoor airflow simulation*
- Nielsen: práce o proudění v místnostech se směšovacím větráním (škálování recirkulace)
