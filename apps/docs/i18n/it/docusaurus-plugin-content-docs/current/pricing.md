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
| Al metro di altezza | `(H/1000) * valore` |
| Al m² | `((B*H)/1000000) * valore` |
| 2 × altezza | `(H*2/1000) * valore` |
| Larghezza + 2 × altezza | `((H*2+B)/1000) * valore` |
| Ore di posa | `ore_di_posa * valore` — `ore_di_posa` sono le ore della linea più quelle delle opzioni scelte |
| Tabella prezzi | prima larghezza ≥ B, prima altezza ≥ H — nessun prezzo se la misura supera la tabella |

`valore` è il valore della linea a catalogo.

Un file fatto con la versione 1 del modello Excel mantiene la formula "2 × altezza" di quella versione,
`(B*2/1000) * valore` (un errore corretto dalla versione 2), così reimportarlo non cambia nessun prezzo.

### Prezzo minimo

Una linea o un'opzione con un **prezzo d'acquisto minimo** (`MinValue` nell'Excel) non costa mai meno:
se il prezzo calcolato è più basso, si usa il minimo — prima di sconto e ricarico.

Il proprietario del catalogo può anche scrivere una formula
propria usando `valore`, `B`, `H`, `valore_base_in_vendita`, `ore_di_posa` e `min`, `max`, `round`, `ceil`,
`floor`, `abs`, `sqrt`, `pow`.

## 2. Ogni opzione scelta

Stesse regole, con un'aggiunta: le opzioni **"% del prezzo del prodotto"** usano
`valore_base_in_vendita * valore / 100`, dove `valore_base_in_vendita` è il prezzo della linea del punto 1.

Un'opzione importata da un Excel della versione 2 ha **sconto e ricarico propri**, usati per il suo prezzo
al posto di quelli della posizione. Le opzioni senza (versione 1) prendono quelli della posizione.

## 3. Il totale della posizione

```
ogni parte        = prezzo × (1 − sconto% / 100) × (markup% / 100)
totale posizione  = (parte linea + somma delle parti delle opzioni) × quantità
```

- La linea usa **sconto** e **markup** della posizione; ogni opzione i propri, o quelli della posizione
  se non ne ha. Senza sconti o markup delle opzioni equivale a
  `(linea + opzioni) × quantità × (1 − sconto%) × markup%`.
- Lo **sconto** parte dallo sconto della condivisione (se la famiglia è condivisa con te a più dello 0%),
  altrimenti dallo sconto a catalogo della linea. Si può cambiare per ogni posizione. Su una famiglia
  condivisa lo sconto della posizione sostituisce anche gli sconti propri delle opzioni.
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
