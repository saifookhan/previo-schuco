---
sidebar_position: 14
title: Note di rilascio
---

# Note di rilascio

Cosa è cambiato, dal più recente. Utile per sapere cosa c'è di nuovo da testare.

## Ottobre 2026

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
