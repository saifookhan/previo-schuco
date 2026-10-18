---
sidebar_position: 6
title: Come vengono calcolati i prezzi
---

# Come vengono calcolati i prezzi

Tutte le misure sono in **millimetri**. `B` = larghezza, `H` = altezza.

## 1. Il prezzo della linea di prodotto

Viene cercato in una **tabella prezzi**, oppure calcolato con la formula del suo tipo di listino:

| Tipo di listino | Formula |
|---|---|
| Fisso al pezzo | `valore` |
| Al metro di perimetro | `((B+H)*2/1000) * valore` |
| Al metro di larghezza | `(B/1000) * valore` |
| Al m² | `((B*H)/1000000) * valore` |
| 2 × larghezza | `(B*2/1000) * valore` |
| Larghezza + 2 × altezza | `((H*2+B)/1000) * valore` |
| Ore di posa | `ore_di_posa * valore` |
| Tabella prezzi | prima larghezza ≥ B, prima altezza ≥ H — nessun prezzo se la misura supera la tabella |

`valore` è il valore della linea a catalogo. Il proprietario del catalogo può anche scrivere una formula
propria usando `valore`, `B`, `H`, `valore_base_in_vendita`, `ore_di_posa` e `min`, `max`, `round`, `ceil`,
`floor`, `abs`, `sqrt`, `pow`.

## 2. Ogni opzione scelta

Stesse regole, con un'aggiunta: le opzioni **"% del prezzo del prodotto"** usano
`valore_base_in_vendita * valore / 100`, dove `valore_base_in_vendita` è il prezzo della linea del punto 1.

## 3. Il totale della posizione

```
prezzo unitario   = prezzo linea + somma dei prezzi delle opzioni scelte
totale posizione  = prezzo unitario × quantità × (1 − sconto% / 100) × (markup% / 100)
```

- Lo **sconto** parte dallo sconto della condivisione (se la famiglia è condivisa con te a più dello 0%),
  altrimenti dallo sconto a catalogo della linea. Si può cambiare per ogni posizione.
- Il **markup** parte dal markup a catalogo della linea. `100` significa nessun ricarico.
- Il prezzo **manuale (M)** sostituisce il prezzo calcolato della linea o dell'opzione con quello inserito.

Il totale del preventivo è la somma delle posizioni, **IVA esclusa**.

## Esempio svolto

Demo Window W70 → *Finestra 1 anta*, 800 × 1200 mm, quantità 4, *Triplo vetro*, *Antracite*, *Con chiave*,
sconto predefinito 10% e markup 130%:

| Voce | Calcolo | € |
|---|---|---|
| Linea (tabella prezzi, 800 × 1200) | cella della tabella | 295,00 |
| Triplo vetro | 0,96 m² × 45 | 43,20 |
| Antracite | 8% di 295,00 | 23,60 |
| Con chiave | fisso | 35,00 |
| **Prezzo unitario** | | **396,80** |
| × 4 pezzi | | 1 587,20 |
| − 10% sconto | | 1 428,48 |
| × 130% markup | | **1 857,02** |

È la posizione P01 nello screenshot in [Preventivi](./features/quotes.md).
