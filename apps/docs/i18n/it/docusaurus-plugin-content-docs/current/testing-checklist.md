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
- [ ] Importa [l'Excel di esempio](pathname:///samples/previo-sample-family.xlsx) — compare una nuova famiglia in bozza.
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
- [ ] Come `sales@technometal-demo.it`: nessuna possibilità di creare preventivi.

## Utenti e onboarding

- [ ] Come admin aziendale, invita `tester@example.com` → stato *in attesa di approvazione*, nessuna email in Mailpit.
- [ ] Come super-admin, approvalo → l'email di invito compare in Mailpit.
- [ ] Imposta la password dal link nell'email, poi accedi con essa.
- [ ] Password dimenticata → email di reset in Mailpit → la nuova password funziona.

## Ruoli e accessi — come `admin@schuco-demo.it`

- [ ] Crea un ruolo personalizzato, dagli permessi in Diritti di accesso, assegnalo a un utente.
- [ ] L'utente vede esattamente le pagine consentite dai suoi permessi (∩ capacità dell'azienda).
- [ ] Le celle del super-admin e `users.manage` dell'admin aziendale non si possono deselezionare.

## Admin

- [ ] Crea un'azienda, imposta le capacità, disattivala e riattivala.
