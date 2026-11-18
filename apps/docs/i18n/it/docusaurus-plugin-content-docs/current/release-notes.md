---
sidebar_position: 14
title: Note di rilascio
---

# Note di rilascio

Cosa è cambiato, dal più recente. Utile per sapere cosa c'è di nuovo da testare.

## Novembre 2026

**Settimana del 16 novembre**
- **Condivisione per linea e opzione**: la finestra di condivisione elenca ogni linea di prodotto e opzione della famiglia, ognuna con il proprio **sconto**, **ricarico** e **ore di posa** per quell'azienda, partendo dai valori dell'Excel (0% / 100% / 0 dove non ne ha). Una nuova versione parte da ciò che l'azienda aveva sulla precedente, abbinato per nome. Lo sconto unico per azienda non c'è più. Vedi [Condivisione delle famiglie](./features/sharing.md).
- **Preventivi da una famiglia condivisa**: ogni posizione parte dai valori della condivisione per la sua linea, e ogni opzione è calcolata con i valori della condivisione per quell'opzione.
- *Condivise con me* mostra **il tuo sconto max**: il più alto su una linea o opzione.

**Settimana del 9 novembre**
- **Template Excel versione 2**: **Distributore** e **Note** della famiglia, un **prezzo d'acquisto minimo** (`MinValue`) su linee e opzioni, e per ogni opzione il suo **sconto**, **ricarico** e le sue **ore di posa**. I file della versione 1 si importano ancora. Vedi [Formato di importazione Excel](./excel-format.md).
- **Prezzi**: una linea o un'opzione non costa mai meno del suo minimo; ogni opzione è calcolata con il proprio sconto e ricarico (la linea con quelli della posizione; su una famiglia condivisa lo sconto della posizione vale anche per le opzioni), indicati accanto all'opzione nella posizione; le ore di posa delle opzioni si sommano a quelle della linea per le opzioni "Ore di posa". Vedi [Come vengono calcolati i prezzi](./pricing.md).
- **Correzioni all'importazione**: `NO` nel foglio Relations non vale più come "si applica"; un foglio tabella prezzi inesistente blocca l'importazione indicandone il nome, invece di un'opzione senza prezzi; le linee con prezzo vuoto si importano a 0; nuovo tipo `Altezza x [€/m]`, e nei file della versione 2 `2xAltezza x [€/m]` vale due volte l'**altezza** (i file della versione 1 mantengono la formula del loro modello).
- **Versioni e modifiche**: una linea o un'opzione rinominata al suo posto appare come una modifica descrittiva, non come rimossa + aggiunta; un'opzione aggiunta o rimossa per intero è una sola modifica, non anche una per ogni linea che la offre; si confrontano anche i nuovi campi.
- **Preventivo**: scegliendo una famiglia si apre lì, sotto l'elenco, l'albero completo di cosa ha cambiato la sua versione (si chiude con **Nascondi modifiche**). Le modifiche vengono rilevate dal contenuto delle due versioni al caricamento della nuova — mai dal nome del file — e salvate con essa.
- La pagina della famiglia mostra il distributore, la nota, i minimi delle linee e le condizioni proprie delle opzioni; il file Excel di esempio scaricabile ora è nella versione 2.

**Settimana del 2 novembre**
- **Elenco famiglie di prodotto, nuove colonne** (dal mock-up del cliente): **Con listino** (Sì / No), **Data inizio** e **Data fine validità** come campi data, **Pronta per la fatturazione** e **In libreria** (Sì / No) — tutte modificabili direttamente nella riga.
- **In libreria**: ogni azienda sceglie quali famiglie (proprie o condivise) propone il suo preventivo; per gli altri utenti le famiglie fuori dalla libreria spariscono dal catalogo.
- **Con listino**: solo informativo; il preventivo segnala le famiglie senza listino.
- Pagina **Partner** (barra laterale): connettiti con clienti e fornitori — **Connetti**, **Accetta** / **Rifiuta**, **Rimuovi connessione**, con ricerca per nome, sede o indirizzo. Le famiglie ora si condividono solo con aziende connesse; le aziende che si condividevano già famiglie sono state connesse automaticamente. Rimuovere una connessione interrompe le condivisioni tra le due aziende.
- **Notifiche**: una campanella accanto al tuo nome per richieste di connessione, risposte e rimozioni (accetta o rifiuta direttamente lì); una richiesta invia anche un'email.
- **Finestra di condivisione**: casella di ricerca che elenca solo i partner connessi.
- Nuovo permesso `partners.manage` (admin aziendali e manager).
- **Versioni e modifiche** nella pagina di una famiglia: una linea del tempo con tutte le versioni e un albero di cosa è cambiato tra due versioni qualsiasi — modifiche aggiunte, rimosse, economiche e descrittive, ognuna nascondibile; una tabella prezzi cambiata mostra quali misure sono più care o più economiche.
- **Grafico delle versioni** nella pagina di una famiglia: le versioni, le copie fatte da essa (ognuna un ramo dalla versione da cui è stata copiata) e la famiglia da cui è stata copiata; una copia si può confrontare con l'originale.
- **Preventivo e versioni**: sotto l'elenco delle famiglie, cosa ha cambiato la versione scelta rispetto alla precedente; su una posizione calcolata da una versione più vecchia, il badge **vN disponibile** con le sue modifiche; nel PDF del preventivo, la versione di ogni famiglia e cosa è cambiato rispetto alla precedente.
- **Preventivo**: ogni famiglia nell'elenco mostra la sua versione, ad es. “Finestra (v2)”, perché si possono offrire due versioni allo stesso tempo.
- **Correzioni dal giro di test del 28 ottobre**: l'accesso demo senza password è spento a meno che il server non lo attivi; le pagine per cui non hai i permessi (Utenti, Azienda, Registro attività, Diritti di accesso e le altre del menu) ora riportano alla Dashboard invece di mostrare errori di caricamento; la Dashboard propone solo le azioni rapide che puoi usare; un upload senza file o un indirizzo malformato danno un errore chiaro invece di un errore del server; gli stati degli utenti sono tradotti; l'uscita porta sempre alla pagina di accesso; la vecchia pagina demo **Invoice** è stata tolta (il suo indirizzo apre i Preventivi).

## Ottobre 2026

**Settimana del 26 ottobre**
- **Pronta per la fatturazione** sulle famiglie di prodotto (Sì / No nell'elenco, nella pagina della famiglia e nelle finestre di caricamento e copia): solo le famiglie pronte sono proposte nel preventivo. Le famiglie esistenti sono state segnate pronte; le nuove partono non pronte, copie e nuove versioni mantengono l'impostazione dell'originale.
- **Filtri in Famiglie di prodotto**: ricerca, categoria, marca, stato, validità prezzi, data di validità, periodo di aggiornamento, solo ultime versioni, proprietario e sconto (scheda condivise) e ordinamento. Restano nell’indirizzo della pagina.
- **Indicatori di caricamento su ogni tabella**: un segnaposto al primo caricamento della pagina e una barra di avanzamento con “Aggiornamento…” quando una tabella si ricarica dopo un filtro, un ordinamento, una scheda o un’azione — le righe restano visibili.

**Settimana del 20 ottobre**
- **Caricamento Excel in due passi**: il file viene prima controllato e una finestra mostra cosa contiene; poi si impostano nome, **validità dei prezzi** (dal/al) e pubblicazione. Le nuove posizioni dei preventivi usano solo famiglie con prezzi validi oggi.
- **Duplica** famiglia ora apre lo stesso tipo di finestra: nome, validità prezzi e pubblicazione.
- **Modifica utenti** in *Impostazioni → Utenti* (matita su ogni riga): nome, ruoli, attivo/non attivo.
- **Pagina Ruoli nascosta** — i ruoli personalizzati per ora non servono. La descrizione di ogni ruolo è in *Impostazioni → Diritti di accesso*: clicca la ⓘ accanto al nome del ruolo.
- **Preventivo** (il vecchio editor demo) rimosso dalla barra laterale, si confondeva con Preventivi.

**Settimana del 13 ottobre**
- **Cronologia** su preventivi e famiglie di prodotto: chi ha modificato cosa, direttamente nella pagina.
- **Registro attività**: *Impostazioni → Registro attività* (admin aziendali) e *Admin → Registro attività* (super-admin) — chi ha modificato cosa, e quando; inclusi accessi e accessi falliti.
- **Documentazione per i test** (questo sito): accessi demo, URL, Mailpit, funzionalità, prezzi, formato Excel, screenshot.
- **Dati demo**: la famiglia *Demo Window W70* viene creata automaticamente, più un file Excel di esempio scaricabile.
- **Ruoli personalizzati**: i super-admin possono creare ruoli propri.
- **Matrice dei permessi** (*Impostazioni → Diritti di accesso*): scegli quali permessi ha ogni ruolo.
- **Condivisione per famiglia** con sconto predefinito, al posto dei collegamenti tra aziende.
- **Più ruoli per utente**, e capacità aziendali (manufacturer / supplier / client / platform) come caselle.
- **Modulo posizione del preventivo** riorganizzato in sezioni chiare.

**Settimana del 6 ottobre**
- **Nome/codice posizione** personalizzato (non solo P01, P02, …).
- **Anteprima prezzo in tempo reale** mentre aggiungi una posizione.
- **Prezzo manuale (interruttore A/M)** per posizione e per opzione.

**Settimana del 29 settembre**
- **HTTPS** automatico sul server; Mailpit raggiungibile in HTTPS con login.
- Deploy automatico dopo ogni build riuscita.

## Settembre 2026

- **Approvazione inviti**: gli utenti invitati da un admin aziendale attendono l'approvazione di un super-admin.
- **Login con email + password propri** (al posto del precedente identity provider), reset password via email.
- **Pannello admin**: creare, modificare, disattivare aziende.
- **Preventivi**: composizione del preventivo e PDF.
- **Famiglie di prodotto**: importazione Excel, prezzi e tabelle modificabili, versioni, pubblicazione, eliminazione.
- Isolamento tra aziende, log di audit e job in background (fondamenta).
