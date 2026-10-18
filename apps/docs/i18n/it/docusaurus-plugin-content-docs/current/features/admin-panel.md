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

![Dashboard admin](/img/screens/admin-dashboard.png)

![Tutti gli utenti](/img/screens/admin-users.png)

![Aziende](/img/screens/admin-companies.png)

Un super-admin può anche operare all'interno di una specifica azienda (tenant override), e ogni modifica
viene scritta in un **log di audit** non modificabile.
