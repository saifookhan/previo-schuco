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
| Pro m² | `((B*H)/1000000) * valore` |
| 2 × Breite | `(B*2/1000) * valore` |
| Breite + 2 × Höhe | `((H*2+B)/1000) * valore` |
| Montagestunden | `ore_di_posa * valore` |
| Preistabelle | erste Breite ≥ B, erste Höhe ≥ H — kein Preis, wenn das Maß größer als die Tabelle ist |

`valore` ist der Wert der Linie im Katalog. Der Katalogbesitzer kann auch eine eigene Formel schreiben mit
`valore`, `B`, `H`, `valore_base_in_vendita`, `ore_di_posa` und `min`, `max`, `round`, `ceil`,
`floor`, `abs`, `sqrt`, `pow`.

## 2. Jede gewählte Option

Gleiche Regeln, mit einer Ergänzung: Optionen **„% des Produktpreises“** verwenden
`valore_base_in_vendita * valore / 100`, wobei `valore_base_in_vendita` der Linienpreis aus Schritt 1 ist.

## 3. Die Positionssumme

```
Stückpreis       = Linienpreis + Summe der gewählten Optionspreise
Positionssumme   = Stückpreis × Menge × (1 − Rabatt% / 100) × (Aufschlag% / 100)
```

- Der **Rabatt** startet mit dem Rabatt der Freigabe (wenn die Familie mit mehr als 0 % mit dir geteilt wurde),
  sonst mit dem Katalograbatt der Linie. Er kann pro Position geändert werden.
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
