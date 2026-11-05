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

## Versioni della famiglia nel preventivo

- L'elenco delle famiglie mostra la versione di ciascuna, ad es. “Finestra (v2)”, e sotto cosa ha cambiato quella
  versione rispetto alla precedente (aggiunte, rimosse, economiche, descrittive) con **Vedi modifiche**, che apre il
  confronto nella pagina della famiglia.
- Una posizione calcolata da una versione più vecchia mostra la versione sotto il nome della linea e, quando si può
  preventivare una versione più recente, il badge **v3 disponibile**: cliccalo per vedere cosa è cambiato e il link al
  confronto. La posizione mantiene il suo prezzo; modificala per passare alla nuova versione.
- Nel PDF il titolo di ogni famiglia mostra la sua versione e, sotto, cosa è cambiato rispetto alla versione precedente:
  cosa è stato aggiunto o rimosso e quali voci hanno modifiche di prezzo (le tabelle prezzi con il loro intervallo in %)
  o di testo. La prima versione di una copia non viene confrontata con la famiglia da cui è stata copiata.

## Cronologia

Apri **Cronologia** in fondo al preventivo per vedere chi l’ha creato e chi ha aggiunto, modificato, duplicato,
riordinato o eliminato quale posizione, e quando. Chi può vedere il preventivo può vederne la cronologia.

![Cronologia del preventivo](/img/screens/quote-history.png)

## Non ancora realizzato

- Flusso di stato — ogni preventivo resta **Bozza** (Inviato / Accettato / Rifiutato esistono solo nel modello dati).
- Modifica dell'intestazione, eliminazione dell'intero preventivo, duplicazione dell'intero preventivo.
