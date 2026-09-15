# Příhoda AI Air Studio – jednoduše

> Ukázková aplikace pro kurz AI. Není to oficiální produkt firmy PŘÍHODA s.r.o.

## O co jde

Firma Příhoda z Hlinska vyrábí **látkové vzduchotechnické potrubí**. Místo plechových trubek s mřížkami visí pod stropem látkové „rukávy“, které se nafouknou a vzduch z nich proudí tisíci malých otvorů. Jsou lehčí, rychleji se montují a lidem pod nimi netáhne.

Navrhnout takový rozvod je normálně práce pro projektanta. Aplikace ukazuje, že s pomocí AI to jde **během minuty** – rovnou s 3D vizualizací a nabídkou pro zákazníka.

## Co aplikace umí

- **Rozumí zadání v češtině** – stačí napsat, nadiktovat nebo vyfotit půdorys („Pekárna 30 × 18 m, chlazení, lidem nesmí táhnout“).
- **Navrhne rozvod** – kolik trubek, jak velkých, kde budou otvory a jaký tlak.
- **Ukáže ho ve 3D** – proudění vzduchu jako tisíce částic; postavy jsou zelené, oranžové nebo červené podle toho, jestli jim táhne.
- **Porovná ho s plechem** – o kolik je lehčí, rychleji namontovaný a s menší uhlíkovou stopou.
- **Připraví nabídku do PDF** – česky, anglicky nebo německy.
- **Dá se s ní mluvit** – „zvyš průtok“, „udělej to červené“, „proč tyhle otvory?“ – návrh se hned přepočítá.

## Jak to funguje

Uvnitř spolupracují tři části:

| Část | Co dělá | Přirovnání |
|---|---|---|
| **AI (Claude)** | rozumí textu, hlasu i obrázkům, převede zadání na čísla, ovládá aplikaci a vysvětluje výsledky | tlumočník a obchodník |
| **Výpočetní jádro** | podle fyzikálních vzorců spočítá, jak vzduch z otvorů proudí, zpomaluje, klesá (studený) nebo stoupá (teplý); vyzkouší stovky variant a vybere tu, kde lidem netáhne podle normy ISO 7730 | inženýr v krabičce |
| **Simulace proudění (CFD)** | nezávislá kontrola – rozdělí řez halou na tisíce políček a živě počítá pohyb vzduchu v každém z nich | druhý názor |

**AI si čísla nevymýšlí.** Všechno spočítá výpočetní jádro – AI jen zadává, čte a vysvětluje.

Krok za krokem:

1. Napíšete, co potřebujete.
2. AI z textu vytáhne rozměry, průtok a teploty a doplní rozumné předpoklady.
3. Jádro za zlomek vteřiny prověří stovky variant.
4. Uvidíte nejlepší návrh ve 3D, s čísly a kontrolou norem.
5. Úpravy řešíte v chatu, na konci si uložíte nabídku.

## Proč je to dobrá ukázka AI

AI tu není jen chatbot, který odpovídá textem – **ovládá skutečný odborný nástroj**: spouští výpočty, mění parametry, čte výsledky a píše z nich nabídku i v cizím jazyce. Na tomhle principu fungují takzvaní AI agenti.

## Na co pamatovat

- Výsledky jsou **orientační** – rychlý předběžný návrh, ne náhrada projektanta.
- Bez připojení k AI aplikace funguje taky, jen zadání čte jednodušší „čtečka“ češtiny.

## Jak ji spustit

1. Dvakrát klikněte na soubor `Prihoda-AI-Air-Studio.html` – stačí prohlížeč, nic se neinstaluje.
2. Pro zapnutí AI klikněte vpravo nahoře na štítek „Offline režim“ a vložte klíč ke Claude API.
3. Tlačítko **Demo** projde celou aplikaci automaticky i s popisky.
