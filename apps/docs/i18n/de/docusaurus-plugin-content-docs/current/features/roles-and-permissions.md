---
sidebar_position: 5
title: Rollen & Berechtigungen
---

# Rollen & Berechtigungen

## Berechtigungen

| Berechtigung | Erlaubt |
|---|---|
| `catalog.view` | Produktfamilien ansehen |
| `catalog.edit` | Produktfamilien importieren, bearbeiten, veröffentlichen, versionieren |
| `catalog.share` | Familien mit anderen Unternehmen teilen |
| `quote.view` | Angebote ansehen |
| `quote.edit` | Angebote erstellen und bearbeiten |
| `users.manage` | Benutzer ins eigene Unternehmen einladen |

## Standardrollen

| Rolle | Standardberechtigungen |
|---|---|
| Super-Admin | Alles, über alle Unternehmen (nicht änderbar) |
| Unternehmensadmin | Alle sechs (behält immer `users.manage`) |
| Super-User | Katalog ansehen/bearbeiten/teilen, Angebote ansehen/bearbeiten |
| User | Katalog ansehen, Angebote ansehen/bearbeiten |

Ein Super-Admin kann diese unter **Einstellungen → Zugriffsrechte** (Matrix Rolle × Berechtigung) ändern. Ein
Klick auf das ⓘ neben einem Rollennamen zeigt die Beschreibung der Rolle. Rollen sind global — für jedes
Unternehmen gleich. Die Rollen-Seite (eigene Rollen anlegen) ist vorerst ausgeblendet.

![Matrix der Zugriffsrechte](/img/screens/access-rights.png)

## Unternehmensfähigkeiten

Eine Berechtigung wirkt nur, wenn auch das **Unternehmen** des Benutzers eine Fähigkeit hat, die sie freischaltet:

| Fähigkeit | Schaltet frei |
|---|---|
| Manufacturer | Katalog ansehen, bearbeiten, teilen · Benutzer |
| Supplier | Katalog ansehen, teilen · Angebote ansehen, bearbeiten · Benutzer |
| Client | Katalog ansehen · Benutzer |
| Platform | Katalog ansehen · Angebote ansehen · Benutzer |

**Effektive Berechtigungen = Rollenberechtigungen ∩ Unternehmensfähigkeiten.** Beispiel: Marco Rossi hat die
Rolle *User* (die `quote.edit` enthält), aber Technometal ist nur *client*, daher kann er keine Angebote erstellen.

Fähigkeiten setzt ein Super-Admin pro Unternehmen unter *Admin → Unternehmen*.
