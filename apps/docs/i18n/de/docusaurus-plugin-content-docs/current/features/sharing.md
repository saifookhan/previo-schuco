---
sidebar_position: 2
title: Familien teilen
---

# Familien teilen

Ein Unternehmen entscheidet, wer jede seiner Produktfamilien nutzen darf und was jedes Unternehmen für jede
Produktlinie und Option erhält: einen Rabatt, einen Aufschlag und Montagestunden.

**Wo:** Familienliste oder Familienseite → **Teilen** · benötigt `catalog.share`. Teilen ist nur mit Unternehmen
möglich, mit denen Sie auf der Seite [Partner](./partners.md) verbunden sind; die Suche im Dialog listet nur diese.

![Teilen-Dialog](/img/screens/share-dialog.png)

## Regeln

- Eine Familie muss **veröffentlicht** sein, bevor sie geteilt werden kann.
- Jede Freigabe lautet *„Unternehmen A teilt Familie F mit Unternehmen B“*, mit **Rabatt %**, **Aufschlag %**
  und **Montagestunden** pro Einheit für jede Produktlinie und jede Option. Mit diesen Werten starten die
  Angebotspositionen von B — B kann Rabatt und Aufschlag der Position trotzdem ändern.
- Wenn Sie ein Unternehmen hinzufügen, starten die Werte mit denen der Familie (aus der hochgeladenen Excel). Wo die
  Excel-Zelle leer ist (oder bei einer Option aus Version 1), starten sie mit 0 % Rabatt, 100 % Aufschlag und 0 Stunden. Ein
  Aufschlag von `100 %` heißt kein Aufschlag; `130 %` schlägt 30 % auf.
- **Neue Version:** Freigaben gehören zu einer Version. Wenn Sie ein Unternehmen zu einer neuen Version hinzufügen,
  mit dem Sie eine frühere Version geteilt haben, füllen seine damaligen Werte aus, was die neue Excel leer lässt,
  nach Namen der Linie und Option zugeordnet („Werte aus einer anderen Version“). Ein Wert aus der neuen Excel hat
  immer Vorrang. Eine in dieser Version neue Linie oder Option startet mit den Werten der Excel. Sie können alle
  Werte vor dem Speichern ändern.
- Nur der **Besitzer** oder ein Unternehmen, mit dem die Familie selbst geteilt wurde, darf sie weiterteilen.
  So entsteht eine Kette, z. B. Hersteller → Händler → Kunde.
- Das **Zurückziehen** der Veröffentlichung oder das Entfernen einer Freigabe weiter oben verbirgt die
  Familie sofort für alle weiter unten in der Kette.

## So testen

Die Demo-Familie *Demo Window W70* ist bereits mit Technometal zu 10 % auf jede Linie und Option geteilt.

1. Als `admin@technometal-demo.it`: *Produktfamilien → Mit mir geteilt* zeigt sie mit „Ihr max. Rabatt 10 %“
   (der höchste Rabatt auf einer Linie oder Option).

   ![Reiter Mit mir geteilt](/img/screens/product-families-shared.png)

2. Als `admin@suppli-demo.it`: sie zusätzlich mit **Fabbrikka** teilen (falls Fabbrikka nicht erscheint,
   zuerst unter *Partner* verbinden). Ihre Linien und Optionen öffnen sich mit den Werten der Excel; *Finestra 1 anta*
   auf 5 % setzen und speichern. Einen Wert leeren und speichern → das Unternehmen öffnet sich wieder mit einer
   Meldung, nichts wird gespeichert.
3. Als `admin@fabbrikka-demo.it`: sie erscheint nun mit 10 % (die 10 % der Excel auf *Finestra 2 ante* sind der
   höchste Wert). Freigabe wieder entfernen → sie ist weg.
4. Wieder als Suppli: Veröffentlichung zurückziehen → sie verschwindet für Technometal.
