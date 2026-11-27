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
   - **Barra in alto** — riferimento, variante (`V1A2`), nome e stato, cliente e progetto (cliccali per modificare cliente, codice
     fiscale, indirizzo, città, progetto, data e note interne), il **totale IVA esclusa** e i pulsanti **Matrice versioni**, **Impostazioni di
     stampa**, **Anteprima**, **Esporta** (presto), **Cronologia modifiche** e **Salva**. La stella blu accanto al codice è il **preferito**.
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
3. **Salva** chiede come: su una **bozza**, correggi questa variante oppure salva solo questa alternativa come versione
   successiva (`V1A2` resta, nasce `V2A2`). Su una variante **fatturata** o **accettata** c'è solo quella nuova versione.
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
(se il referente lavora per più unità) e quali parti stampare: referente, **immagini**, descrizioni delle famiglie, caratteristiche
delle righe, dettaglio per prodotto, raggruppamento per categoria, totale offerta, piano di pagamento, attività,
colonne Extra % e Sconto %. **Immagini** mostra le tre foto gestite di ogni famiglia insieme a quella famiglia, e le
altre insieme alla fine. I preventivi nuovi nascono con l'opzione attiva. La colonna sconto è obbligatoria se una riga ha uno sconto.

Intestazione, piè di pagina e referenti vengono da **Impostazioni → Azienda**: dati fiscali, unità locali (logo fino a
512 KB, colore, indirizzo, email, telefono, utenti), telefono di ogni utente e testi salvati.

## Versioni, alternative e listini scaduti

Un preventivo è una griglia: versioni in verticale, alternative in orizzontale (`V1A1`, `V1A2`, `V2A2`). Vedi
[ADR 0016](https://github.com/saifookhan/previo-schuco/blob/main/docs/adr/0016-quote-variants.md).

- **Nuova alternativa** copia solo la cella aperta sulla prossima alternativa libera della stessa versione (`V1A2` → `V1A3`).
- **Salva come nuova versione** copia solo quell'alternativa sulla versione successiva (`V1A2` → `V2A2`). Le altre colonne restano vuote.
- La **matrice versioni** (nell'editor e nella riga espansa dell'elenco) mostra la griglia. Passa su una cella salvata
  per creare quella sotto. Passa su una cella vuota, se quella sopra esiste, per copiare quel documento salvato. Le
  modifiche non salvate dell'editor non sono incluse.
- La stella blu segna questa variante come **preferita**. Se ne possono segnare più di una. Non cambia quale è finale, e una nuova versione o un duplicato nascono senza.
- Il menu della variante imposta il nome, duplica questa variante come nuovo preventivo (solo `V1A1`), la segna **finale** (stella ambra, quella usata dalla dashboard) e imposta lo stato **bozza**, **fatturato** o **accettato** — uno qualsiasi tranne quello attuale.
  Solo una bozza si modifica sul posto. Fatturato o accettato richiedono famiglie di catalogo con prezzi validi oggi.
- Quando i prezzi di una famiglia sono scaduti, una **bozza** sposta le sue linee sulla versione valida più recente di
  quella famiglia (per nome di linea e caratteristica) e le ricalcola, con un avviso di cosa è stato spostato e cosa no.
  Una variante fatturata o accettata mantiene i suoi prezzi; **Aggiorna prezzi** applica la versione nuova alle modifiche,
  che diventano solo la versione successiva di questa alternativa.
- Se non esiste una versione valida della famiglia, salvataggio, stampa e l'uscita dalla bozza sono bloccati e il preventivo rimanda alla
  famiglia per caricare un nuovo listino.

## Elenco, archivio e occhiata

L'elenco cerca riferimento, cliente e progetto e filtra per stato. **Archiviati** resta spento finché non lo spunti.
Ogni riga mostra le alternative dell'ultima versione. La stella blu segna una variante preferita (se ne possono segnare più di una); la stella ambra è l'offerta finale usata dalla dashboard. **Preferiti** resta spento finché non lo spunti. Apri la riga per la matrice, **Duplica** di una variante e
**Archivia** (amministratori di azienda e super admin). L'occhio è una sintesi di famiglie e linee. L'archivio nasconde
il preventivo dall'elenco; il link diretto lo apre ancora. Lo stesso archivio vale per le famiglie di prodotto, una versione alla volta.

## Cronologia

**Cronologia modifiche** elenca ogni salvataggio della versione — chi, quando, il totale e cosa è cambiato (campi
dell'intestazione, famiglie e linee, elementi aggiunti/rimossi/riordinati, chiusura e impostazioni di stampa). Ogni
salvataggio si può aprire in sola lettura e **Ripristinare** come punto di partenza. Il registro di audit del preventivo
(creazione, salvataggi, nuove versioni, stato) resta come prima.

## Dashboard

La *Dashboard* usa la variante che ogni preventivo segna come **finale**, e solo i preventivi non archiviati. **Preventivi aperti** conta i finali in bozza o fatturati. La **pipeline** somma i loro totali. La **conversione** è quanti finali sono accettati. **Preventivi recenti** apre quella variante. **Utenti attivi** è ancora un numero di esempio.

## Assistente preventivi

Nell'elenco e su un preventivo, chi può modificare i preventivi ha un pulsante chat. L'assistente crea una bozza, aggiunge un prodotto del catalogo come nuova riga e modifica il preventivo aperto: intestazione, righe, opzioni, attività, pagamenti, testi, impostazioni di stampa e stato (bozza, fatturato o accettato). Non crea alternative, non segna una variante come finale, non archivia e non duplica un preventivo. Un clic su un chip esegue quell'azione. Togliere una riga, un prezzo manuale, una modifica di molte righe e un cambio di stato chiedono conferma. Una riga di catalogo si aggiunge solo a una misura che hai scritto. Netto € e il totale restano calcolati. I prezzi vengono dal catalogo. La conversazione resta solo nel browser; chiuderla o aggiornare la pagina la cancella, e il preventivo salvato resta. Le famiglie in bozza o scadute restano nascoste finché non chiedi di vederle, e comunque non si aggiungono. Se corrispondono più linee o famiglie, l'assistente chiede quale e non sceglie.

## Non ancora disponibile

- Esportazione Word ed Excel, invio del preventivo per email dall'app.
- Eliminare un preventivo in modo definitivo. L'archivio lo nasconde.
