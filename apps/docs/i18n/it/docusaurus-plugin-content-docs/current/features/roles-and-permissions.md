---
sidebar_position: 5
title: Ruoli e permessi
---

# Ruoli e permessi

## Permessi

| Permesso | Consente |
|---|---|
| `catalog.view` | Vedere le famiglie di prodotto |
| `catalog.edit` | Importare, modificare, pubblicare, versionare famiglie |
| `catalog.share` | Condividere famiglie con altre aziende |
| `quote.view` | Vedere i preventivi |
| `quote.edit` | Creare e modificare preventivi |
| `users.manage` | Invitare utenti nella propria azienda |

## Ruoli predefiniti

| Ruolo | Permessi predefiniti |
|---|---|
| Super admin | Tutto, su tutte le aziende (non modificabile) |
| Admin aziendale | Tutti e sei (mantiene sempre `users.manage`) |
| Super user | catalogo vedere/modificare/condividere, preventivi vedere/modificare |
| User | catalogo vedere, preventivi vedere/modificare |

Un super-admin può cambiarli in **Impostazioni → Diritti di accesso** (matrice ruolo × permesso). Clicca
l'icona ⓘ accanto al nome di un ruolo per vederne la descrizione. I ruoli sono globali — uguali per ogni
azienda. La pagina Ruoli (creazione di ruoli personalizzati) per ora è nascosta.

![Matrice dei diritti di accesso](/img/screens/access-rights.png)

## Capacità aziendali

Un permesso vale solo se anche l'**azienda** dell'utente ha una capacità che lo sblocca:

| Capacità | Sblocca |
|---|---|
| Manufacturer | catalogo vedere, modificare, condividere · utenti |
| Supplier | catalogo vedere, condividere · preventivi vedere, modificare · utenti |
| Client | catalogo vedere · utenti |
| Platform | catalogo vedere · preventivi vedere · utenti |

**Permessi effettivi = permessi del ruolo ∩ capacità dell'azienda.** Esempio: Marco Rossi ha il ruolo
*User* (che include `quote.edit`), ma Technometal è solo *client*, quindi non può creare preventivi.

Le capacità si impostano per azienda da un super-admin in *Admin → Aziende*.
