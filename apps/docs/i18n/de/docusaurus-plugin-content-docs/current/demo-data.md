---
sidebar_position: 4
title: Demo-Daten
---

# Demo-Daten

Jede Umgebung enthält vorbereitete Daten, damit direkt nach der Anmeldung getestet werden kann.

| Was | Details |
|---|---|
| Unternehmen & Benutzer | 4 Demo-Unternehmen, 7 Demo-Benutzer — siehe [Demo-Anmeldungen](./demo-logins.md) |
| Produktfamilie | **Demo Window W70**, gehört **Suppli S.r.l.**, veröffentlicht und mit **Technometal** zu **10 %** geteilt |

## Demo Window W70

Ein kleiner, ausgedachter Fensterkatalog. Alle Preise sind fiktiv.

| Produktlinie | Preisbildung | Rabatt / Aufschlag |
|---|---|---|
| Finestra 1 anta (einflügeliges Fenster) | Tabelle Breite × Höhe (siehe unten), pro Stück | 10 % / 130 % |
| Finestra 2 ante (zweiflügeliges Fenster) | 280 € pro m² | 10 % / 130 % |
| Zanzariera (Insektenschutz) | 18 € pro Meter Umfang | 0 % / 140 % |

| Merkmal | Optionen |
|---|---|
| Vetro (Glas) | Doppio vetro 0 €/m² · Triplo vetro 45 €/m² · Vetro acustico 60 €/m² |
| Colore (Farbe) | Bianco 0 € · Antracite +8 % des Produktpreises · Effetto legno +15 % |
| Maniglia (Griff) | Standard 0 € · Con chiave 35 € · Design inox 55 € |

*Zanzariera* bietet nur *Colore*; die Fenster bieten alle drei.

**Preistabelle für „Finestra 1 anta“** (€ pro Stück; Breite waagerecht, Höhe senkrecht, in mm):

| H \ B | 600 | 800 | 1000 | 1200 |
|---|---|---|---|---|
| **800** | 210 | 240 | 270 | 300 |
| **1200** | 260 | 295 | 330 | 365 |
| **1600** | 310 | 350 | 390 | 430 |

Ein Maß zwischen zwei Spalten nimmt die nächstgrößere (z. B. 750 × 1000 → Zelle 800 × 1200 = 295 €).
Ein Maß größer als die Tabelle (z. B. Breite 1300) kann nicht berechnet werden — ein guter Testfall.

## Excel-Datei herunterladen

[**previo-sample-family.xlsx**](pathname:///samples/previo-sample-family.xlsx) — dieselbe Familie als Excel-Datei.
Zum Testen des Imports selbst importieren (es entsteht eine neue Familie im Entwurf), oder als Vorlage für
eigene Testkataloge verwenden. Das Format ist unter [Excel-Importformat](./excel-format.md) erklärt.

## Wenn die Demo-Familie fehlt

Sie wird bei jedem Deployment automatisch angelegt. Lokal ausführen:

```bash
pnpm --filter @schuco/api seed:demo-family
```

Sie wird nur angelegt, wenn Suppli noch keine Familie namens „Demo Window W70“ hat — wurde sie
umbenannt oder gelöscht, legt der nächste Lauf sie neu an.
