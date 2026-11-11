---
sidebar_position: 6
title: Wie Preise berechnet werden
---

# Wie Preise berechnet werden

Alle Maße sind in **Millimetern**. `B` = Breite, `H` = Höhe.

## 1. Der Preis der Produktlinie

Entweder in einer **Preistabelle** nachgeschlagen oder mit der Formel ihres Preistyps berechnet:

| Preistyp | Formel |
|---|---|
| Fest pro Stück | `valore` |
| Pro Meter Umfang | `((B+H)*2/1000) * valore` |
| Pro Meter Breite | `(B/1000) * valore` |
| Pro Meter Höhe | `(H/1000) * valore` |
| Pro m² | `((B*H)/1000000) * valore` |
| 2 × Höhe | `(H*2/1000) * valore` |
| Breite + 2 × Höhe | `((H*2+B)/1000) * valore` |
| Montagestunden | `ore_di_posa * valore` — `ore_di_posa` sind die Stunden der Linie plus die der gewählten Optionen |
| Preistabelle | erste Breite ≥ B, erste Höhe ≥ H — kein Preis, wenn das Maß größer als die Tabelle ist |

`valore` ist der Wert der Linie im Katalog.

Eine Datei aus Version 1 der Excel-Vorlage behält die „2 × Höhe“-Formel dieser Version,
`(B*2/1000) * valore` (ein Fehler, den Version 2 behoben hat), sodass ein erneuter Import keinen Preis ändert.

### Mindestpreis

Eine Linie oder Option mit einem **Mindesteinkaufspreis** (`MinValue` in der Excel-Datei) kostet nie
weniger: Ist der berechnete Preis niedriger, wird das Minimum verwendet — vor Rabatt und Aufschlag.

Der Katalogbesitzer kann auch eine eigene Formel schreiben mit
`valore`, `B`, `H`, `valore_base_in_vendita`, `ore_di_posa` und `min`, `max`, `round`, `ceil`,
`floor`, `abs`, `sqrt`, `pow`.

## 2. Jede gewählte Option

Gleiche Regeln, mit einer Ergänzung: Optionen **„% des Produktpreises“** verwenden
`valore_base_in_vendita * valore / 100`, wobei `valore_base_in_vendita` der Linienpreis aus Schritt 1 ist.

Eine aus einer Excel-Datei der Version 2 importierte Option hat **eigenen Rabatt und Aufschlag**, die für
ihren Preis statt denen der Position gelten. Optionen ohne (Version 1) übernehmen die der Position.

## 3. Die Positionssumme

```
jeder Teil       = Preis × (1 − Rabatt% / 100) × (Aufschlag% / 100)
Positionssumme   = (Linienteil + Summe der Optionsteile) × Menge
```

- Die Linie verwendet **Rabatt** und **Aufschlag** der Position; jede Option ihre eigenen oder, wenn sie
  keine hat, die der Position. Ohne Rabatte oder Aufschläge der Optionen entspricht das
  `(Linie + Optionen) × Menge × (1 − Rabatt%) × Aufschlag%`.
- Der **Rabatt** startet mit dem Rabatt der Freigabe (wenn die Familie mit mehr als 0 % mit dir geteilt wurde),
  sonst mit dem Katalograbatt der Linie. Er kann pro Position geändert werden. Bei einer geteilten
  Familie ersetzt der Rabatt der Position auch die eigenen Rabatte der Optionen.
- Der **Aufschlag** startet mit dem Katalogaufschlag der Linie. `100` bedeutet kein Aufschlag.
- **Manueller (M)** Preis ersetzt den berechneten Linien- oder Optionspreis durch den eingegebenen Wert.

Die Angebotssumme ist die Summe der Positionen, **ohne MwSt.**

## Rechenbeispiel

Demo Window W70 → *Finestra 1 anta*, 800 × 1200 mm, Menge 4, *Triplo vetro*, *Antracite*, *Con chiave*,
Standardrabatt 10 % und Aufschlag 130 %:

| Teil | Berechnung | € |
|---|---|---|
| Linie (Preistabelle, 800 × 1200) | Tabellenzelle | 295,00 |
| Triplo vetro | 0,96 m² × 45 | 43,20 |
| Antracite | 8 % von 295,00 | 23,60 |
| Con chiave | fest | 35,00 |
| **Stückpreis** | | **396,80** |
| × 4 Stück | | 1 587,20 |
| − 10 % Rabatt | | 1 428,48 |
| × 130 % Aufschlag | | **1 857,02** |

Das ist Position P01 im Screenshot unter [Angebote](./features/quotes.md).
