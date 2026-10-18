---
sidebar_position: 3
title: Demo-Anmeldungen
---

# Demo-Anmeldungen

Die Datenbank enthält Demo-Unternehmen und einen Benutzer pro Rolle. Auf der Anmeldeseite unter
**„Dev seed login“** eine der E-Mails unten wählen und auf den Button klicken — **kein Passwort nötig**.

![Anmeldeseite mit dem Demo-Anmeldebereich](/img/screens/login.png)

:::warning
Die Demo-Anmeldung wird über `ALLOW_DEV_LOGIN` gesteuert (standardmäßig an). Sie muss auf `false`
gesetzt werden, bevor echte Kunden den Server nutzen — dann verschwindet der Bereich und nur E-Mail + Passwort funktioniert.
:::

## Demo-Unternehmen

| Unternehmen | Fähigkeiten | Was es kann |
|---|---|---|
| Schüco / PREVIO Platform | platform | Plattformbetreiber (Unternehmen des Super-Admins) |
| Suppli S.r.l. | manufacturer + supplier | Besitzt und bearbeitet Produktfamilien, gibt sie frei, **erstellt Angebote** |
| Technometal S.p.A. | client | Sieht Familien, die mit ihm geteilt wurden (Einheiten Technometal_A, Technometal_B) |
| Fabbrikka S.r.l. | client | Sieht Familien, die mit ihm geteilt wurden |

## Demo-Benutzer

| E-Mail | Name | Rolle | Unternehmen | Am besten zum Testen von |
|---|---|---|---|---|
| `admin@schuco-demo.it` | Anna Bianchi | Super-Admin | Schüco | Admin-Bereich, Freigaben, Rollen, Zugriffsrechte — sieht alle Unternehmen |
| `admin@suppli-demo.it` | Paolo Suppli | Unternehmensadmin | Suppli | **Katalog + Angebote von Anfang bis Ende**, Freigaben, Einladungen |
| `admin@technometal-demo.it` | Luca Verdi | Unternehmensadmin | Technometal | Kundenansicht, Einladungen (brauchen Freigabe) |
| `manager@technometal-demo.it` | Giulia Neri | Super-User | Technometal | Kundenansicht mit Katalogrechten (durch Fähigkeit „client“ begrenzt) |
| `sales@technometal-demo.it` | Marco Rossi | User | Technometal | Niedrigste Rolle, überwiegend lesend |
| `admin@fabbrikka-demo.it` | Sara Fabbrikka | Unternehmensadmin | Fabbrikka | Zweiter Kunde — prüfen, dass er Technometals Daten nicht sieht |
| `elena.costa@schuco-demo.it` | Elena Costa | Unternehmensadmin | Schüco | **Inaktiv** — erscheint nicht in der Demo-Anmeldeliste |

:::tip Warum kann ein Technometal-Benutzer kein Angebot erstellen?
Effektive Berechtigungen = *Rollenberechtigungen ∩ Unternehmensfähigkeiten*. Technometal ist ein **client**,
und nur ein **supplier** kann Angebote erstellen; nur ein **manufacturer** kann Kataloge bearbeiten.
Zum Testen von Angeboten mit **`admin@suppli-demo.it`** anmelden. Siehe [Rollen & Berechtigungen](./features/roles-and-permissions.md).
:::

## Echte Anmeldung mit E-Mail + Passwort

Per Einladung angelegte Benutzer melden sich mit ihrer E-Mail und dem Passwort an, das sie auf der Seite
„Passwort festlegen“ gewählt haben (mindestens 10 Zeichen). Für einen Testzugang sich selbst einladen — siehe
[Benutzer & Onboarding](./features/users-and-onboarding.md) — und die E-Mail in [Mailpit](./email-mailpit.mdx) öffnen.
