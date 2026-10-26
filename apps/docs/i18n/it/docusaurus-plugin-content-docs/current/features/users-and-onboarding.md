---
sidebar_position: 4
title: Utenti e onboarding
---

# Utenti e onboarding

Non esiste registrazione pubblica. Gli utenti entrano solo tramite **invito**.

**Dove:** *Impostazioni → Utenti* · richiede `users.manage`.

![Utenti nelle impostazioni](/img/screens/settings-users.png)

## Flusso di invito

1. Un admin aziendale clicca **Aggiungi utente**, inserisce un'email e sceglie uno o più ruoli.
   Può assegnare solo ruoli i cui permessi possiede lui stesso.
2. L'utente è **in attesa di approvazione** — nessuna email viene inviata.
3. Un super-admin approva o rifiuta in *Admin → Utenti*.
4. All'approvazione viene inviata un'email di invito (vedi [Email e Mailpit](../email-mailpit.mdx)) con un link monouso.
5. L'utente apre il link, imposta una password (almeno 10 caratteri) in **Imposta password**, e può accedere.

**Password dimenticata** nella pagina di login invia un link di reset allo stesso modo.

Un utente può avere **più ruoli**; i suoi permessi sono l'unione di tutti.

## Modificare un utente

Clicca la **matita** sulla riga di un utente per cambiare **nome**, **ruoli** e se è **attivo**.

- L'email non si può cambiare: è con quella che l'utente accede.
- Un utente non attivo non può accedere e viene disconnesso al clic successivo. Spunta di nuovo **Attivo** per riammetterlo.
- Attivo/non attivo si può cambiare solo dopo che l'utente ha accettato l'invito.
- Non puoi disattivare te stesso né togliere il tuo ruolo *Company Admin* (o *Super Admin*), e un'azienda mantiene sempre almeno un admin aziendale attivo: così non resta mai bloccata fuori.
- Un admin aziendale non può modificare un super-admin e può assegnare solo ruoli di cui ha i permessi.
