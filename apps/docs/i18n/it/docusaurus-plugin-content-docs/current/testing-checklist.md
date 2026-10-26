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
- [ ] Condividi la famiglia demo con Fabbrikka al 5%.

## Visibilità

- [ ] Gli utenti Technometal vedono *Demo Window W70* in *Condivise con me* con il 10%.
- [ ] Fabbrikka la vede con il 5%; dopo aver rimosso la condivisione, Fabbrikka non la vede più.
- [ ] Dopo averla ritirata dalla pubblicazione, Technometal non la vede più (poi ripubblicala).

## Preventivi — come `admin@suppli-demo.it`

- [ ] Crea un preventivo.
- [ ] Aggiungi *Finestra 1 anta*, 800 × 1200, qtà 4, Triplo vetro / Antracite / Con chiave → **1 857,02 €**
      (vedi l'[esempio svolto](./pricing.md#esempio-svolto)).
- [ ] Prova una misura più grande della tabella (es. 1300 × 900) → errore chiaro, nessun prezzo.
- [ ] Passa una posizione e una caratteristica al prezzo manuale.
- [ ] Modifica, duplica, riordina ed elimina posizioni.
- [ ] Scarica il PDF e controlla i totali.
- [ ] Apri *Cronologia* nel preventivo — ogni passo sopra è elencato con il tuo nome.
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
