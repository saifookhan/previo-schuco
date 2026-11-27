---
sidebar_position: 4
title: Dati demo
---

# Dati demo

Ogni ambiente ha dati già pronti, così puoi iniziare a testare subito dopo il login.

| Cosa | Dettagli |
|---|---|
| Aziende e utenti | 4 aziende demo, 7 utenti demo — vedi [Accessi demo](./demo-logins.md) |
| Famiglia di prodotto | **Demo Window W70**, di **Suppli S.r.l.**, pubblicata e condivisa con **Technometal** al **10%** |

## Demo Window W70

Un piccolo catalogo di finestre inventato. Tutti i prezzi sono fittizi.

| Linea di prodotto | Come viene prezzata | Sconto / markup |
|---|---|---|
| Finestra 1 anta | Tabella larghezza × altezza (vedi sotto), al pezzo | 10% / 130% |
| Finestra 2 ante | €280 al m² | 10% / 130% |
| Zanzariera | €18 al metro di perimetro, almeno €40 | 0% / 140% |

| Caratteristica | Opzioni |
|---|---|
| Vetro | Doppio vetro €0/m² · Triplo vetro €45/m² · Vetro acustico €60/m² (propri 5% / 120%) — triplo e acustico: almeno €30, +0,5 h di posa |
| Colore | Bianco €0 · Antracite +8% del prezzo del prodotto · Effetto legno +15% |
| Maniglia | Standard €0 · Con chiave €35 · Design inox €55 (ricarico proprio 150%) |
| Posa | Esclusa €0 · Inclusa (a ore) €45 per ora di posa, almeno €60 |

La *Zanzariera* offre solo *Colore* e *Posa*; le finestre offrono tutte e quattro.

**Tabella prezzi di "Finestra 1 anta"** (€ al pezzo; larghezza in orizzontale, altezza in verticale, in mm):

| H \ B | 600 | 800 | 1000 | 1200 |
|---|---|---|---|---|
| **800** | 210 | 240 | 270 | 300 |
| **1200** | 260 | 295 | 330 | 365 |
| **1600** | 310 | 350 | 390 | 430 |

Una misura tra due colonne usa quella successiva più grande (es. 750 × 1000 → cella 800 × 1200 = €295).
Una misura più grande della tabella (es. larghezza 1300) non può essere prezzata — un buon caso da testare.

## Scarica il file Excel

[**previo-sample-family.xlsx**](pathname:///samples/previo-sample-family.xlsx) — la stessa famiglia come file Excel.
Importalo per testare l'importazione (verrà creata una nuova famiglia in bozza), oppure usalo come base
per i tuoi cataloghi di test. Il formato è spiegato in [Formato di importazione Excel](./excel-format.md).

## Se la famiglia demo manca

Viene creata automaticamente a ogni deploy. In locale esegui:

```bash
pnpm --filter @schuco/api seed:demo-family
```

Crea la famiglia solo se Suppli non ne ha già una chiamata "Demo Window W70" — se l'hai rinominata o
eliminata, l'esecuzione successiva la ricrea.
