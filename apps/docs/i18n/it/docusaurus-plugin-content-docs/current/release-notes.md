---
sidebar_position: 14
title: Note di rilascio
---

# Note di rilascio

Cosa è cambiato, dal più recente. Utile per sapere cosa c'è di nuovo da testare.

## Novembre 2026

**Settimana del 2 novembre**
- **Elenco famiglie di prodotto, nuove colonne** (dal mock-up del cliente): **Con listino** (Sì / No), **Data inizio** e **Data fine validità** come campi data, **Pronta per la fatturazione** e **In libreria** (Sì / No) — tutte modificabili direttamente nella riga.
- **In libreria**: ogni azienda sceglie quali famiglie (proprie o condivise) propone il suo preventivo; per gli altri utenti le famiglie fuori dalla libreria spariscono dal catalogo.
- **Con listino**: solo informativo; il preventivo segnala le famiglie senza listino.
- Pagina **Partner** (barra laterale): connettiti con clienti e fornitori — **Connetti**, **Accetta** / **Rifiuta**, **Rimuovi connessione**, con ricerca per nome, sede o indirizzo. Le famiglie ora si condividono solo con aziende connesse; le aziende che si condividevano già famiglie sono state connesse automaticamente. Rimuovere una connessione interrompe le condivisioni tra le due aziende.
- **Notifiche**: una campanella accanto al tuo nome per richieste di connessione, risposte e rimozioni (accetta o rifiuta direttamente lì); una richiesta invia anche un'email.
- **Finestra di condivisione**: casella di ricerca che elenca solo i partner connessi.
- Nuovo permesso `partners.manage` (admin aziendali e manager).
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
