---
sidebar_position: 3
title: Accessi demo
---

# Accessi demo

Il database contiene aziende demo e un utente per ogni ruolo. Nella pagina di login, nella sezione
**"Dev seed login"**, scegli una delle email qui sotto e premi il pulsante — **non serve la password**.

![Pagina di login con la sezione di accesso demo](/img/screens/login.png)

:::warning
L'accesso demo è controllato da `ALLOW_DEV_LOGIN`. In locale è attivo
(`NEXT_PUBLIC_ALLOW_DEV_LOGIN=true`); sul container web pubblico è **spento**
finché non si imposta `ALLOW_DEV_LOGIN=true`. Con il flag spento la sezione sparisce
e `POST /api/auth/dev-login` risponde 403 — resta solo email + password.
:::

## Aziende demo

| Azienda | Capacità | Cosa può fare |
|---|---|---|
| Schüco / PREVIO Platform | platform | Gestore della piattaforma (azienda del super-admin) |
| Suppli S.r.l. | manufacturer + supplier | Possiede e modifica famiglie di prodotto, le condivide, **crea preventivi** |
| Technometal S.p.A. | client | Consulta le famiglie condivise con lei (unità Technometal_A, Technometal_B) |
| Fabbrikka S.r.l. | client | Consulta le famiglie condivise con lei |

## Utenti demo

| Email | Nome | Ruolo | Azienda | Ideale per testare |
|---|---|---|---|---|
| `admin@schuco-demo.it` | Anna Bianchi | Super admin | Schüco | Pannello admin, approvazioni, ruoli, diritti di accesso — vede tutte le aziende |
| `admin@suppli-demo.it` | Paolo Suppli | Admin aziendale | Suppli | **Catalogo + preventivi dall'inizio alla fine**, condivisione, inviti |
| `admin@technometal-demo.it` | Luca Verdi | Admin aziendale | Technometal | Vista cliente, inviti (richiedono approvazione) |
| `manager@technometal-demo.it` | Giulia Neri | Super user | Technometal | Vista cliente con diritti sul catalogo (limitati dalla capacità client) |
| `sales@technometal-demo.it` | Marco Rossi | User | Technometal | Ruolo più basso, principalmente lettura |
| `admin@fabbrikka-demo.it` | Sara Fabbrikka | Admin aziendale | Fabbrikka | Secondo cliente — verifica che non veda i dati di Technometal |
| `elena.costa@schuco-demo.it` | Elena Costa | Admin aziendale | Schüco | **Inattiva** — non compare nella lista di accesso demo |

:::tip Perché un utente Technometal non può creare un preventivo?
I permessi effettivi sono *permessi del ruolo ∩ capacità dell'azienda*. Technometal è un **client**, e
solo un'azienda **supplier** può creare preventivi; solo un **manufacturer** può modificare i cataloghi.
Per testare i preventivi accedi come **`admin@suppli-demo.it`**. Vedi [Ruoli e permessi](./features/roles-and-permissions.md).
:::

## Login reale con email + password

Gli utenti creati tramite invito accedono con la propria email e la password scelta nella pagina
"Imposta password" (almeno 10 caratteri). Per averne uno per i test, invita te stesso — vedi
[Utenti e onboarding](./features/users-and-onboarding.md) — e apri l'email in [Mailpit](./email-mailpit.mdx).
