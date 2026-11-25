---
sidebar_position: 3
title: Preventivi
---

# Preventivi

**Dove:** *Preventivi* nella barra laterale · per vedere serve `quote.view`, per creare e modificare serve `quote.edit`,
che hanno solo le aziende **fornitore** (nei dati demo: Suppli).

![Elenco preventivi](/img/screens/quotes.png)

## Flusso

1. **Nuovo preventivo** → riferimento e cliente (codice fiscale, indirizzo, città e progetto sono facoltativi e modificabili dopo).
2. Il preventivo si apre su una sola pagina, come nel design del cliente:
   - **Barra in alto** — riferimento, versione e stato, cliente e progetto (cliccali per modificare cliente, codice
     fiscale, indirizzo, città, progetto, data e note interne), il **totale IVA esclusa** e i pulsanti **Impostazioni di
     stampa**, **Anteprima**, **Esporta** (presto), **Cronologia modifiche** e **Salva**.
   - **Intestazione** — moduli di testo (titoli, grassetto, elenchi, allineamento, link, immagini fino a 1 MB). Aggiungi un
     testo vuoto o uno dei **testi salvati** dell'azienda; ogni testo può essere salvato come nuovo testo salvato.
     Trascina o usa le frecce per riordinare.
   - **Famiglie di prodotto** — **Aggiungi famiglia di prodotto** sceglie una famiglia dal catalogo (pubblicata, in
     libreria, pronta per la fatturazione e valida oggi; ricerca e filtro per categoria) o un **Prodotto vuoto** a mano.
     Ogni famiglia ha il badge di validità, **ALT/STD**, duplica, elimina, comprimi e **Dettagli & Specifiche**
     (categoria, descrizione, note e tabella tecnica).
   - **Linee** — una riga ciascuna: Pos, Q.tà, Linea, U.M., B, H, m², Extra%, €/pz, Sc%, Netto €, Totale, IVA, Ore posa,
     poi ALT/STD, duplica, elimina, caratteristiche e blocco. Linee e famiglie si trascinano o si spostano con le frecce.
   - **Riepilogo e Chiusura** — blocchi ordinabili: testi, *Dettaglio per prodotto*, *Raggruppamento per categoria*
     (categorie riordinabili), *Totale offerta*, *Piano di pagamento* (con controllo del 100%) e *Attività* (trascina tra
     **Incluse** e **Non incluse**; l'occhio la esclude dalla stampa). I nuovi preventivi partono con il piano di
     pagamento e le attività predefinite del cliente.
3. **Salva** chiede come: su una **bozza**, **Correggi la versione N** o **Salva come nuova versione**; su una versione
   **inviata**, accettata o rifiutata, solo **Salva come nuova versione** — una versione inviata non cambia mai.
4. **Anteprima** apre *Anteprima Preventivo* in una nuova scheda: pagine A4 con logo e colore dell'unità locale
   nell'intestazione, dati fiscali e *Pagina X di Y* a piè di pagina. **Stampa / Salva PDF** usa la stampa del browser.
   Mostra anche le modifiche non salvate.

## Prezzi

- **€/pz** è il prezzo di listino della linea con le sue caratteristiche (con lo sconto e il ricarico della famiglia o
  della condivisione). Si ricalcola appena cambiano linea, caratteristiche o misure, e di nuovo sul server a ogni salvataggio.
- **Netto** = €/pz × (1 + Extra%/100) × (1 − Sc%/100); **Totale** = Q.tà × Netto.
- Le linee alternative (**ALT**) non contano nel subtotale della famiglia, le famiglie alternative nel totale offerta.
- Scrivere un €/pz proprio rende la linea manuale (in corsivo); la freccia accanto torna al prezzo di listino.
- Il lucchetto blocca solo la riga nell'editor; non cambia prezzo né stampa.

Come si calcola ogni numero: [Come vengono calcolati i prezzi](../pricing.md).

## Impostazioni di stampa

Chi stampa come **referente** (*Vostro referente*: nome, email, telefono), quale **unità locale** è in testa alle pagine
(se il referente lavora per più unità) e quali parti stampare: referente, descrizioni delle famiglie, caratteristiche
delle righe, dettaglio per prodotto, raggruppamento per categoria, totale offerta, piano di pagamento, attività,
colonne Extra % e Sconto %. La colonna sconto è obbligatoria se una riga ha uno sconto.

Intestazione, piè di pagina e referenti vengono da **Impostazioni → Azienda**: dati fiscali, unità locali (logo fino a
512 KB, colore, indirizzo, email, telefono, utenti), telefono di ogni utente e testi salvati.

## Versioni e listini scaduti

- Ogni versione ha il suo documento; il menu versione nella barra in alto passa dall'una all'altra e cambia lo stato:
  bozza → **inviato** → **accettato** / **rifiutato**.
- Quando i prezzi di una famiglia sono scaduti, una **bozza** sposta le sue linee sulla versione valida più recente di
  quella famiglia (per nome di linea e caratteristica) e le ricalcola, con un avviso di cosa è stato spostato e cosa no.
  Una versione inviata mantiene i suoi prezzi; **Aggiorna prezzi** applica la versione nuova alle modifiche, che
  diventano una nuova versione.
- Se non esiste una versione valida della famiglia, salvataggio e stampa sono bloccati e il preventivo rimanda alla
  famiglia per caricare un nuovo listino.

## Cronologia

**Cronologia modifiche** elenca ogni salvataggio della versione — chi, quando, il totale e cosa è cambiato (campi
dell'intestazione, famiglie e linee, elementi aggiunti/rimossi/riordinati, chiusura e impostazioni di stampa). Ogni
salvataggio si può aprire in sola lettura e **Ripristinare** come punto di partenza. Il registro di audit del preventivo
(creazione, salvataggi, nuove versioni, stato) resta come prima.

## Non ancora disponibile

- Esportazione Word ed Excel, immagini nella stampa, invio del preventivo per email dall'app.
- Eliminare o duplicare un intero preventivo.
