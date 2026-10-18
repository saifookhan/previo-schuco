---
sidebar_position: 2
title: Familien teilen
---

# Familien teilen

Ein Unternehmen entscheidet, wer jede seiner Produktfamilien nutzen darf und mit welchem Standardrabatt.

**Wo:** Familienliste oder Familienseite → **Teilen** · benötigt `catalog.share`.

![Teilen-Dialog](/img/screens/share-dialog.png)

## Regeln

- Eine Familie muss **veröffentlicht** sein, bevor sie geteilt werden kann.
- Jede Freigabe lautet *„Unternehmen A teilt Familie F mit Unternehmen B zu Rabatt d“*. Der Rabatt ist der
  Startwert für die Angebotspositionen von B — er kann pro Position trotzdem geändert werden.
  `0 %` heißt kein eigener Rabatt: es gilt der Katalograbatt der Linie.
- Nur der **Besitzer** oder ein Unternehmen, mit dem die Familie selbst geteilt wurde, darf sie weiterteilen.
  So entsteht eine Kette, z. B. Hersteller → Händler → Kunde.
- Das **Zurückziehen** der Veröffentlichung oder das Entfernen einer Freigabe weiter oben verbirgt die
  Familie sofort für alle weiter unten in der Kette.

## So testen

Die Demo-Familie *Demo Window W70* ist bereits mit Technometal zu 10 % geteilt.

1. Als `admin@technometal-demo.it`: *Produktfamilien → Mit mir geteilt* zeigt sie mit „Dein Rabatt 10 %“.

   ![Reiter Mit mir geteilt](/img/screens/product-families-shared.png)

2. Als `admin@suppli-demo.it`: sie zusätzlich mit **Fabbrikka** zu 5 % teilen.
3. Als `admin@fabbrikka-demo.it`: sie erscheint nun mit 5 %. Freigabe wieder entfernen → sie ist weg.
4. Wieder als Suppli: Veröffentlichung zurückziehen → sie verschwindet für Technometal.
