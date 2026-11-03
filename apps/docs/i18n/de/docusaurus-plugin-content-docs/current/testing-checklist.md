---
sidebar_position: 10
title: Test-Checkliste
---

# Test-Checkliste

Ein kompletter Durchlauf der wichtigsten Abläufe. Mit den [Demo-Anmeldungen](./demo-logins.md) den Benutzer wechseln.

## Anmeldung

- [ ] Die Demo-Anmeldung funktioniert für jeden aktiven Demo-Benutzer.
- [ ] Ein falsches Passwort im normalen Formular zeigt einen Fehler.
- [ ] Sprachwechsel IT / EN / DE funktioniert.

## Katalog — als `admin@suppli-demo.it`

- [ ] *Demo Window W70* ist vorhanden und veröffentlicht.
- [ ] [Die Beispiel-Excel](pathname:///samples/previo-sample-family.xlsx) importieren — ein Dialog zeigt die Anzahlen (3 Linien, 3 Merkmale, 9 Optionen, 1 Preistabelle, 7 Zuordnungen); gespeichert wird erst mit **Familie importieren**.
- [ ] Im Dialog sperrt ein *Gültig bis* vor *Gültig ab* das Speichern; mit Daten und **Sofort veröffentlichen** speichern — die neue Familie öffnet sich, veröffentlicht, mit ihren Daten.
- [ ] Auf der Seite der Familie die Preisgültigkeit auf einen vergangenen Zeitraum **bearbeiten** — die Familie zeigt **Abgelaufen**, das Angebot bietet sie nicht mehr an; eine bestehende Position bleibt bearbeitbar.
- [ ] Eine Familie **duplizieren** — ein Dialog fragt nach Name, Preisgültigkeit und Veröffentlichung; die Kopie öffnet sich mit diesen Werten, das Original bleibt unverändert.
- [ ] **Neue Version** öffnet denselben Dialog; die alte Version behält ihre Daten.
- [ ] Einen Linienpreis, ein Merkmal und eine Preistabelle bearbeiten; speichern.
- [ ] Veröffentlichen — Bearbeiten ist nun gesperrt.
- [ ] Eine **neue Version** erstellen, bearbeiten, veröffentlichen.
- [ ] Die Demo-Familie mit Fabbrikka zu 5 % teilen.
- [ ] Unter *Produktfamilien* jeden Filter und die Sortierung ausprobieren — Liste und „x von y“ aktualisieren sich; die URL in einem neuen Tab öffnen zeigt dieselben Filter; **Zurück** macht den letzten Filter rückgängig.
- [ ] **Bereit zur Fakturierung** einer Familie auf **Nein** setzen — das Angebot bietet sie nicht mehr an, eine bestehende Position bleibt bearbeitbar; zurück auf **Ja** und sie wird wieder angeboten. Eine neu importierte Familie startet mit **Nein**, wenn im Dialog nicht angekreuzt.
- [ ] In der Liste **Gültig bis** einer Familie auf gestern setzen und das Feld verlassen — sie zeigt **Abgelaufen** und das Angebot bietet sie nicht mehr an; **Gültig ab** leeren — ein Fehler erscheint und das Datum kommt zurück.
- [ ] **Mit Preisliste** auf **Nein** setzen — das Angebot zeigt die Familie als *(ohne Preisliste)* mit Hinweis, und sie kann trotzdem hinzugefügt werden.
- [ ] Als `admin@suppli-demo.it` bei einer Familie **In Bibliothek** auf **Nein** setzen — das Angebot bietet sie nicht mehr an; als Vertriebsbenutzer desselben Unternehmens anmelden — die Familie ist nicht in der Liste; das Unternehmen, das sie geteilt hat (oder Eigentümer ist), sieht sie weiter in seiner eigenen Bibliothek.

## Sichtbarkeit

- [ ] Technometal-Benutzer sehen *Demo Window W70* unter *Mit mir geteilt* mit 10 %.
- [ ] Fabbrikka sieht sie mit 5 %; nach Entfernen der Freigabe sieht Fabbrikka sie nicht mehr.
- [ ] Nach dem Zurückziehen der Veröffentlichung sieht Technometal sie nicht mehr (danach wieder veröffentlichen).

## Angebote — als `admin@suppli-demo.it`

- [ ] Ein Angebot erstellen.
- [ ] *Finestra 1 anta* hinzufügen, 800 × 1200, Menge 4, Triplo vetro / Antracite / Con chiave → **1 857,02 €**
      (siehe [Rechenbeispiel](./pricing.md#rechenbeispiel)).
- [ ] Ein Maß größer als die Tabelle versuchen (z. B. 1300 × 900) → klare Fehlermeldung, kein Preis.
- [ ] Eine Position und ein Merkmal auf manuellen Preis umstellen.
- [ ] Positionen bearbeiten, duplizieren, umsortieren und löschen.
- [ ] Das PDF herunterladen und die Summen prüfen.
- [ ] *Verlauf* im Angebot öffnen — jeder Schritt oben steht mit deinem Namen da.
- [ ] Als `sales@technometal-demo.it`: keine Möglichkeit, Angebote zu erstellen.

## Benutzer & Onboarding

- [ ] Als Unternehmensadmin `tester@example.com` einladen → Status *wartet auf Freigabe*, keine E-Mail in Mailpit.
- [ ] Als Super-Admin freigeben → die Einladung erscheint in Mailpit.
- [ ] Passwort über den Link in der E-Mail festlegen, dann damit anmelden.
- [ ] Passwort vergessen → Reset-E-Mail in Mailpit → das neue Passwort funktioniert.
- [ ] *Einstellungen → Benutzer*: einen anderen Benutzer bearbeiten (Name, Rolle, **Aktiv** abwählen) — die Zeile wird aktualisiert; der Benutzer kann sich erst nach Reaktivierung wieder anmelden. In der eigenen Zeile sind die *Company-Admin*-Rolle und **Aktiv** gesperrt.

## Rollen & Zugriff — als `admin@schuco-demo.it`

- [ ] Unter Zugriffsrechte auf das ⓘ neben jeder Rolle klicken — die Beschreibung erscheint auf Deutsch, ohne die Tabelle zu verbreitern.
- [ ] Der Benutzer sieht genau die Seiten, die seine Berechtigungen (∩ Unternehmensfähigkeiten) erlauben.
- [ ] Die Zellen des Super-Admins und `users.manage` des Unternehmensadmins lassen sich nicht abwählen.

## Admin

- [ ] Ein Unternehmen anlegen, Fähigkeiten setzen, deaktivieren und wieder aktivieren.
- [ ] *Admin → Aktivitätsprotokoll* zeigt jede dieser Änderungen, neueste zuerst; *Mehr laden* blättert weiter.
- [ ] Mit falschem Passwort an einem echten Konto anmelden → ein Eintrag `auth.login_failed` erscheint für dessen Unternehmen.
- [ ] Als `admin@suppli-demo.it` zeigt *Einstellungen → Aktivitätsprotokoll* nur Einträge von Suppli.
