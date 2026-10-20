---
sidebar_position: 3
title: Preventivi
---

# Preventivi

**Dove:** *Preventivi* nella barra laterale · la visualizzazione richiede `quote.view`, creare e modificare
richiede `quote.edit`, che hanno solo le aziende **supplier** (nei dati demo: Suppli).

![Elenco preventivi](/img/screens/quotes.png)

## Flusso

1. **Nuovo preventivo** → riferimento, nome cliente, codice fiscale, indirizzo, città, luogo del progetto.
2. Apri il preventivo → **Aggiungi posizione**:
   - **Prodotto** — scegli una famiglia (tua o condivisa con te) e una linea di prodotto.
   - **Misure e posizione** — larghezza, altezza, quantità, nome/codice posizione (codici personalizzati ammessi).
   - **Prezzo** — calcolato automaticamente (**A**); passa a manuale (**M**) per sovrascriverlo.
     Un'anteprima del prezzo si aggiorna mentre scrivi.
   - **Caratteristiche** — opzioni della linea, ognuna anch'essa con prezzo automatico o manuale.
3. Modifica, duplica, elimina e **riordina** le posizioni.
4. **Scarica il PDF**.

![Preventivo con tre posizioni](/img/screens/quote-detail.png)

![Modulo per aggiungere una posizione](/img/screens/add-position.png)

Le posizioni da una famiglia condivisa partono con lo sconto impostato sulla condivisione. Come viene calcolato ogni numero: [Come vengono calcolati i prezzi](../pricing.md).

## Cronologia

Apri **Cronologia** in fondo al preventivo per vedere chi l’ha creato e chi ha aggiunto, modificato, duplicato,
riordinato o eliminato quale posizione, e quando. Chi può vedere il preventivo può vederne la cronologia.

![Cronologia del preventivo](/img/screens/quote-history.png)

## Non ancora realizzato

- Flusso di stato — ogni preventivo resta **Bozza** (Inviato / Accettato / Rifiutato esistono solo nel modello dati).
- Modifica dell'intestazione, eliminazione dell'intero preventivo, duplicazione dell'intero preventivo.
