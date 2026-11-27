---
sidebar_position: 6
title: Pannello admin
---

# Pannello admin

Solo super-admin (`admin@schuco-demo.it`). Si apre da **Admin portal** nella barra laterale.

| Pagina | Cosa fa |
|---|---|
| Dashboard | Totali: utenti, utenti attivi, aziende, super-admin; utenti recenti |
| Utenti | Tutti gli utenti di tutte le aziende, più le **approvazioni in attesa** (approva / rifiuta inviti) |
| Aziende | Crea e modifica aziende, imposta le capacità (manufacturer / supplier / client / platform), disattiva e riattiva |
| Registro attività | Ogni modifica sulla piattaforma — chi, cosa, quando, su quale elemento — per tutte le aziende; filtri per azienda, tipo, date, persona o ID richiesta |

![Dashboard admin](/img/screens/admin-dashboard.png)

![Tutti gli utenti](/img/screens/admin-users.png)

![Aziende](/img/screens/admin-companies.png)

## Registro attività

Gli admin aziendali hanno lo stesso registro per la propria azienda in **Impostazioni → Registro attività**.
Le voci non si possono modificare né eliminare. Registra le modifiche (catalogo, condivisioni, preventivi,
utenti, ruoli, aziende) e gli accessi: login riusciti, login falliti su un account reale, password impostate
e reset password richiesti. Clicca una persona per vedere solo le sue azioni; apri una riga per i dettagli e l'ID richiesta.

![Registro attività](/img/screens/audit-log.png)

Un super-admin può anche operare all'interno di una specifica azienda (tenant override), e ogni modifica
viene scritta in un **log di audit** non modificabile.
