---
sidebar_position: 2
title: Partner
---

# Partner

Prima di potersi condividere famiglie di prodotto, due aziende si connettono nella pagina **Partner**: una
chiede, l'altra accetta. La finestra di condivisione propone solo aziende connesse.

**Dove:** barra laterale → **Partner** · richiede `partners.manage` (admin aziendali e manager).

## Schede

- **Clienti** — aziende che possono ricevere le tue famiglie (rivenditori e clienti). Visibile a produttori,
  rivenditori e all'azienda piattaforma.
- **Fornitori** — aziende che possono condividere con te le loro famiglie (produttori, rivenditori, l'azienda
  piattaforma). Visibile a rivenditori e clienti.

Quindi un cliente vede solo *Fornitori*, un produttore solo *Clienti*, un rivenditore entrambe. La ricerca
guarda il nome dell'azienda, i nomi e gli indirizzi delle sue sedi; la scheda mostra l'indirizzo della prima sede.

## Stato della connessione

| Stato | Cosa puoi fare |
|---|---|
| Non connesso | **Connetti** — invia una richiesta |
| In attesa | Hai chiesto e aspetti — **Annulla richiesta** |
| Richiesta ricevuta | **Accetta richiesta** o **Rifiuta** |
| Connesso | **Rimuovi connessione** (chiede conferma) |

- Chiedere a un'azienda che ti ha già chiesto vi connette subito.
- Una richiesta rifiutata si può inviare di nuovo più avanti.
- **Rimuovere una connessione interrompe tutte le condivisioni di famiglie tra le due aziende, in entrambe le
  direzioni** — e, come quando si rimuove una condivisione, anche ciò che da quelle famiglie era stato
  condiviso a sua volta.
- Le aziende che si condividevano già famiglie sono state connesse automaticamente all'arrivo di questa pagina.

## Notifiche

La campanella accanto al tuo nome (barra in alto sul telefono) mostra quante notifiche sono nuove. Vieni avvisato quando:

- un'azienda chiede di connettersi — con **Accetta** / **Rifiuta** direttamente nella notifica;
- la tua richiesta viene accettata o rifiutata;
- un'azienda rimuove la connessione con la tua.

Aprire la campanella le segna come lette. La pagina Partner mostra lo stesso elenco a destra. Una richiesta di
connessione invia anche un'**email** agli admin e ai manager dell'azienda a cui è rivolta (in locale: Mailpit).

## Come testare

1. Come `admin@technometal-demo.it`: *Partner* mostra solo *Fornitori*. Suppli è **Connesso**. Clicca
   **Connetti** sull'azienda piattaforma → mostra **In attesa**.
2. Come `admin@schuco-demo.it`: la campanella mostra **1** e l'email di richiesta è in Mailpit. **Accetta**
   dalla campanella o dalla pagina Partner.
3. Di nuovo come Technometal: la campanella dice che la richiesta è stata accettata; la scheda mostra **Connesso**.
4. Come `admin@suppli-demo.it`: **Condividi** su *Demo Window W70* — la ricerca elenca solo aziende connesse.
   Se Fabbrikka non è ancora connessa, **Connetti** e accetta come `admin@fabbrikka-demo.it`; poi compare
   nella finestra di condivisione.
5. **Rimuovi connessione** con un'azienda con cui condividi famiglie → dopo la conferma, quelle famiglie
   spariscono dalle sue *Condivise con me*.
6. Come `sales@technometal-demo.it`: niente *Partner* nella barra laterale e niente campanella.
