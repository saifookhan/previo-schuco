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
2. Apri il preventivo. Ha tre sezioni:
   - **A sinistra — posizioni:** il riepilogo del preventivo, ogni posizione con il suo prezzo, **Nuova posizione** e il
     totale. Clicca una posizione per modificarla; quella selezionata ha anche **sposta su / giù**, **duplica** ed
     **elimina**.
   - **Al centro — il modulo della posizione:**
     - **Prodotto** — scegli una famiglia (tua o condivisa con te) e una linea di prodotto.
     - **Misure e posizione** — nome/codice posizione (codici personalizzati ammessi), larghezza, altezza, quantità.
     - **Caratteristiche** — una riga per ogni opzione della linea, con prezzo automatico (**A**) o manuale (**M**).
     - **Prezzo** — il prezzo della linea è calcolato automaticamente (**A**); passa a manuale (**M**) per
       sovrascriverlo. Sconto e ricarico.
   - **A destra — anteprima:**
     - **Calcolo** — come si forma il prezzo, in tempo reale mentre scrivi: listino della linea, sconto e ricarico, ogni
       opzione con le sue condizioni, prezzo unitario, quantità e totale, più una **Traccia formule** con ogni passaggio.
     - **PDF** — il PDF del preventivo come è salvato. Si ricarica dopo che aggiungi o salvi una posizione.
3. **Aggiungi posizione** / **Salva modifiche**. Dopo il salvataggio la posizione resta selezionata. Se clicchi
   un'altra posizione (o **Nuova posizione**) con modifiche non salvate, ti viene chiesto prima di annullarle.
4. **Scarica il PDF** (in alto a destra).

Su uno schermo più piccolo l'anteprima scende sotto il modulo; sul telefono le tre sezioni sono schede (**Posizioni**,
**Modifica**, **Anteprima**).

![Preventivo: posizioni, modulo e calcolo](/img/screens/quote-detail.png)

![L'anteprima del PDF](/img/screens/add-position.png)

Le posizioni da una famiglia condivisa partono con sconto, ricarico e ore di posa impostati sulla condivisione per quella linea e le sue opzioni. Come viene calcolato ogni numero: [Come vengono calcolati i prezzi](../pricing.md).

## Versioni della famiglia nel preventivo

- L'elenco delle famiglie mostra la versione di ciascuna, ad es. “Finestra (v2)”. Appena scelta una famiglia, sotto si
  apre come albero cosa ha cambiato quella versione rispetto alla precedente (aggiunte, rimosse, economiche,
  descrittive), come nella pagina della famiglia: nascondi tipi di modifica, passa all'elenco, clicca una modifica per
  il prima e dopo (o la tabella prezzi cella per cella). **Nascondi modifiche** lo chiude; **Pagina della famiglia**
  apre lì il confronto.
- Le modifiche vengono rilevate dal contenuto delle due versioni al caricamento della nuova, non dal nome del file né
  dalle celle evidenziate, e salvate con la versione.
- Quando si può preventivare una versione più recente della famiglia di una posizione, la posizione mostra un'icona di
  ramo nell'elenco e, aprendola, **v3 disponibile** con cosa è cambiato e il link al confronto. La posizione mantiene il
  suo prezzo finché non passi: scegli la nuova versione nel suo modulo — misure, quantità e codice restano, e così la
  linea e le opzioni che hanno lo stesso nome nella nuova versione — poi **Salva modifiche**.
- Nel PDF il titolo di ogni famiglia mostra la sua versione e, sotto, cosa è cambiato rispetto alla versione precedente:
  cosa è stato aggiunto o rimosso e quali voci hanno modifiche di prezzo (le tabelle prezzi con il loro intervallo in %)
  o di testo. La prima versione di una copia non viene confrontata con la famiglia da cui è stata copiata.

## Cronologia

Apri **Riepilogo preventivo** nelle posizioni, poi **Cronologia**, per vedere chi l’ha creato e chi ha aggiunto, modificato, duplicato,
riordinato o eliminato quale posizione, e quando. Chi può vedere il preventivo può vederne la cronologia.

![Cronologia del preventivo](/img/screens/quote-history.png)

## Non ancora realizzato

- Flusso di stato — ogni preventivo resta **Bozza** (Inviato / Accettato / Rifiutato esistono solo nel modello dati).
- Modifica dell'intestazione, eliminazione dell'intero preventivo, duplicazione dell'intero preventivo.
