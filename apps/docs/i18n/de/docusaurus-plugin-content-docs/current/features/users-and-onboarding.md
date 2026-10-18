---
sidebar_position: 4
title: Benutzer & Onboarding
---

# Benutzer & Onboarding

Es gibt keine öffentliche Registrierung. Benutzer kommen nur per **Einladung** dazu.

**Wo:** *Einstellungen → Benutzer* · benötigt `users.manage`.

![Benutzer in den Einstellungen](/img/screens/settings-users.png)

## Einladungsablauf

1. Ein Unternehmensadmin klickt **Benutzer hinzufügen**, gibt eine E-Mail ein und wählt eine oder mehrere Rollen.
   Er kann nur Rollen vergeben, deren Berechtigungen er selbst hat.
2. Der Benutzer **wartet auf Freigabe** — es wird noch keine E-Mail verschickt.
3. Ein Super-Admin gibt unter *Admin → Benutzer* frei oder lehnt ab.
4. Nach der Freigabe wird eine Einladung verschickt (siehe [E-Mail & Mailpit](../email-mailpit.mdx)) mit einem einmaligen Link.
5. Der Benutzer öffnet den Link, legt auf **Passwort festlegen** ein Passwort fest (mindestens 10 Zeichen) und kann sich anmelden.

**Passwort vergessen** auf der Anmeldeseite schickt auf dieselbe Weise einen Reset-Link.

Ein Benutzer kann **mehrere Rollen** haben; seine Berechtigungen sind die Vereinigung aller.
