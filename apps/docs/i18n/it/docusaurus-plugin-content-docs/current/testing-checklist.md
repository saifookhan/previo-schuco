---
sidebar_position: 10
title: Checklist di test
---

# Checklist di test

Un percorso completo dei flussi principali. Usa gli [Accessi demo](./demo-logins.md) per cambiare utente.

## Login

- [ ] L'accesso demo funziona per ogni utente demo attivo.
- [ ] Una password errata nel modulo normale mostra un errore.
- [ ] Il cambio lingua IT / EN / DE funziona.

## Catalogo — come `admin@suppli-demo.it`

- [ ] *Demo Window W70* è presente e pubblicata.
- [ ] Importa [l'Excel di esempio](pathname:///samples/previo-sample-family.xlsx) — una finestra mostra i conteggi (3 linee, 3 caratteristiche, 9 opzioni, 1 tabella prezzi, 7 relazioni); nulla viene salvato prima di **Importa famiglia**.
- [ ] Nella finestra, un *Valido fino al* precedente a *Valido dal* disattiva il salvataggio; salva con le date e **Pubblica subito** — si apre la nuova famiglia, pubblicata, con le sue date.
- [ ] Nella pagina della famiglia, **Modifica** la validità con un periodo passato — la famiglia risulta **Scaduta** e il preventivo non la propone più; una posizione esistente resta modificabile.
- [ ] **Duplica** una famiglia — una finestra chiede nome, validità prezzi e pubblicazione; la copia si apre con quei valori e l’originale resta invariato.
- [ ] **Nuova versione** apre la stessa finestra; la versione precedente mantiene le sue date.
- [ ] Modifica il prezzo di una linea, una caratteristica e una tabella prezzi; salva.
- [ ] Pubblicala — ora la modifica è bloccata.
- [ ] Crea una **nuova versione**, modificala, pubblicala.
- [ ] Condividi la famiglia demo con Fabbrikka al 5% (se Fabbrikka non compare, prima connettiti in *Partner*).
- [ ] In *Famiglie di prodotto*, prova ogni filtro e l’ordinamento — l’elenco e il conteggio “x di y” si aggiornano; copia l’URL in una nuova scheda e gli stessi filtri vengono applicati; **Indietro** annulla l’ultimo filtro.
- [ ] Imposta **Pronta per la fatturazione** di una famiglia su **No** — il preventivo non la propone più e una posizione esistente resta modificabile; rimettila su **Sì** e torna disponibile. Una famiglia appena importata parte da **No** se non spuntata nella finestra.
- [ ] Nell'elenco, cambia la **Data fine validità** di una famiglia a ieri ed esci dal campo — compare **Scaduta** e il preventivo non la propone più; prova a svuotare la **Data inizio validità** — compare un errore e la data torna com'era.
- [ ] Imposta **Con listino** su **No** — il preventivo mostra la famiglia come *(senza listino)* con un promemoria, e si può comunque aggiungere.
- [ ] Come `admin@suppli-demo.it`, imposta **In libreria** su **No** per una famiglia — il preventivo non la propone più; accedi come utente commerciale della stessa azienda — la famiglia non è nell'elenco; l'azienda che l'ha condivisa (o che ne è proprietaria) la vede ancora nella propria libreria.

## Partner

- [ ] Come `admin@technometal-demo.it`, *Partner* mostra solo *Fornitori*; cercando la città di una sede si trova l'azienda; **Connetti** con l'azienda piattaforma → **In attesa**.
- [ ] Come `admin@schuco-demo.it`, la campanella mostra 1 e Mailpit ha l'email di richiesta; **Accetta** dalla campanella → la scheda mostra **Connesso**; la campanella di Technometal dice che è stata accettata.
- [ ] Invia una richiesta e **Annulla richiesta**; inviane una e **Rifiuta** — chi l'ha inviata viene avvisato e può chiedere di nuovo.
- [ ] Come `admin@suppli-demo.it`, la ricerca della finestra di condivisione elenca solo aziende connesse; **Rimuovi connessione** con un'azienda con cui condividi → dopo la conferma, le famiglie condivise spariscono per lei.
- [ ] Come `sales@technometal-demo.it`, niente menu *Partner* e niente campanella.

## Visibilità

- [ ] Gli utenti Technometal vedono *Demo Window W70* in *Condivise con me* con il 10%.
- [ ] Fabbrikka la vede con il 5%; dopo aver rimosso la condivisione, Fabbrikka non la vede più.
- [ ] Dopo averla ritirata dalla pubblicazione, Technometal non la vede più (poi ripubblicala).

## Preventivi — come `admin@suppli-demo.it`

- [ ] Crea un preventivo.
- [ ] **Aggiungi famiglia di prodotto** → *Finestra 1 anta*; sulla linea imposta 800 × 1200, Q.tà 4 e, nelle caratteristiche, Triplo vetro / Antracite / Con chiave → Totale **1 857,02 €**
      (vedi l'[esempio svolto](./pricing.md#esempio-svolto)).
- [ ] Prova una misura più grande della tabella (es. 1300 × 900) → errore chiaro, nessun prezzo.
- [ ] Scrivi un €/pz proprio su una linea — diventa manuale (corsivo); la freccia accanto riporta il prezzo di listino. Extra% 110 e Sc% 10 cambiano Netto e Totale.
- [ ] Segna una linea e una famiglia **ALT** — escono dal subtotale e dal totale.
- [ ] Duplica, trascina, sposta con le frecce ed elimina linee e famiglie; riordina i blocchi di chiusura, le categorie e le rate; trascina un'attività tra *Incluse* e *Non incluse*.
- [ ] Aggiungi un testo d'intestazione, salvalo come testo salvato e aggiungilo di nuovo da **Testi salvati**.
- [ ] **Salva** → **Correggi la versione 1**; poi segnala come **Inviato**; modifica di nuovo → c'è solo **Salva come nuova versione** → v2.
- [ ] **Cronologia modifiche** elenca ogni salvataggio con cosa è cambiato; aprine uno vecchio e **Ripristina**.
- [ ] **Anteprima** → pagine A4 con logo dell'unità, *Vostro referente* e piè di pagina; **Stampa / Salva PDF**; togli campi nelle **Impostazioni di stampa** e verifica che spariscano (la colonna sconto resta se una riga ha uno sconto).
- [ ] Porta la validità della famiglia nel passato: una bozza passa alla versione valida più recente con un avviso; senza versione più recente, Salva e Anteprima sono disattivati con un link per caricarla.
- [ ] *Impostazioni → Azienda*: cambia i dati fiscali, aggiungi un'unità con logo e colore, imposta il telefono di un referente — l'anteprima li mostra.
- [ ] Come `sales@technometal-demo.it`: nessuna possibilità di creare preventivi.

## Utenti e onboarding

- [ ] Come admin aziendale, invita `tester@example.com` → stato *in attesa di approvazione*, nessuna email in Mailpit.
- [ ] Come super-admin, approvalo → l'email di invito compare in Mailpit.
- [ ] Imposta la password dal link nell'email, poi accedi con essa.
- [ ] Password dimenticata → email di reset in Mailpit → la nuova password funziona.
- [ ] *Impostazioni → Utenti*: modifica un altro utente (nome, ruolo, togli **Attivo**) — la riga si aggiorna; quell’utente non può più accedere finché non viene riattivato. Sulla tua riga il ruolo *Company Admin* e **Attivo** sono bloccati.

## Ruoli e accessi — come `admin@schuco-demo.it`

- [ ] In Diritti di accesso, clicca l'icona ⓘ accanto a ogni ruolo — compare la sua descrizione, in italiano, senza allargare la tabella.
- [ ] L'utente vede esattamente le pagine consentite dai suoi permessi (∩ capacità dell'azienda).
- [ ] Le celle del super-admin e `users.manage` dell'admin aziendale non si possono deselezionare.

## Admin

- [ ] Crea un'azienda, imposta le capacità, disattivala e riattivala.
- [ ] *Admin → Registro attività* mostra ognuna delle modifiche sopra, dalla più recente; *Carica altri* va avanti.
- [ ] Accedi con una password sbagliata per un account reale → compare una voce `auth.login_failed` per la sua azienda.
- [ ] Come `admin@suppli-demo.it`, *Impostazioni → Registro attività* mostra solo le voci di Suppli.
