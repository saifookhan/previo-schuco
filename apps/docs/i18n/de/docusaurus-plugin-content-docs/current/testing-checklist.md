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
- [ ] Die Demo-Familie mit Fabbrikka zu 5 % teilen (wird Fabbrikka nicht angeboten, zuerst unter *Partner* verbinden).
- [ ] Unter *Produktfamilien* jeden Filter und die Sortierung ausprobieren — Liste und „x von y“ aktualisieren sich; die URL in einem neuen Tab öffnen zeigt dieselben Filter; **Zurück** macht den letzten Filter rückgängig.
- [ ] **Bereit zur Fakturierung** einer Familie auf **Nein** setzen — das Angebot bietet sie nicht mehr an, eine bestehende Position bleibt bearbeitbar; zurück auf **Ja** und sie wird wieder angeboten. Eine neu importierte Familie startet mit **Nein**, wenn im Dialog nicht angekreuzt.
- [ ] In der Liste **Gültig bis** einer Familie auf gestern setzen und das Feld verlassen — sie zeigt **Abgelaufen** und das Angebot bietet sie nicht mehr an; **Gültig ab** leeren — ein Fehler erscheint und das Datum kommt zurück.
- [ ] **Mit Preisliste** auf **Nein** setzen — das Angebot zeigt die Familie als *(ohne Preisliste)* mit Hinweis, und sie kann trotzdem hinzugefügt werden.
- [ ] Als `admin@suppli-demo.it` bei einer Familie **In Bibliothek** auf **Nein** setzen — das Angebot bietet sie nicht mehr an; als Vertriebsbenutzer desselben Unternehmens anmelden — die Familie ist nicht in der Liste; das Unternehmen, das sie geteilt hat (oder Eigentümer ist), sieht sie weiter in seiner eigenen Bibliothek.

## Partner

- [ ] Als `admin@technometal-demo.it` zeigt *Partner* nur *Lieferanten*; die Suche nach der Stadt einer Niederlassung findet das Unternehmen; **Verbinden** mit dem Plattform-Unternehmen → **Ausstehend**.
- [ ] Als `admin@schuco-demo.it` zeigt die Glocke 1 und Mailpit hat die Anfrage-E-Mail; über die Glocke **annehmen** → die Karte zeigt **Verbunden**; Technometals Glocke meldet die Annahme.
- [ ] Eine Anfrage senden und **zurückziehen**; eine senden und **ablehnen** — der Absender wird benachrichtigt und kann erneut anfragen.
- [ ] Als `admin@suppli-demo.it` listet die Suche im Freigabe-Dialog nur verbundene Unternehmen; **Verbindung entfernen** mit einem Unternehmen, mit dem Sie teilen → nach der Bestätigung verschwinden die geteilten Familien für dieses.
- [ ] Als `sales@technometal-demo.it` kein Menü *Partner* und keine Glocke.

## Sichtbarkeit

- [ ] Technometal-Benutzer sehen *Demo Window W70* unter *Mit mir geteilt* mit 10 %.
- [ ] Fabbrikka sieht sie mit 5 %; nach Entfernen der Freigabe sieht Fabbrikka sie nicht mehr.
- [ ] Nach dem Zurückziehen der Veröffentlichung sieht Technometal sie nicht mehr (danach wieder veröffentlichen).

## Angebote — als `admin@suppli-demo.it`

- [ ] Ein Angebot erstellen.
- [ ] **Produktfamilie hinzufügen** → *Finestra 1 anta*; auf der Linie 800 × 1200, Menge 4 und bei den Merkmalen Triplo vetro / Antracite / Con chiave → Gesamt **1 857,02 €**
      (siehe [Rechenbeispiel](./pricing.md#rechenbeispiel)).
- [ ] Ein Maß größer als die Tabelle versuchen (z. B. 1300 × 900) → klare Fehlermeldung, kein Preis.
- [ ] Einen eigenen €/Stk auf einer Linie eingeben — sie wird manuell (kursiv); der Pfeil daneben holt den Listenpreis zurück. Extra% 110 und Rab% 10 ändern Netto und Gesamt.
- [ ] Eine Linie und eine Familie als **ALT** markieren — sie fallen aus Zwischensumme und Summe.
- [ ] Linien und Familien duplizieren, ziehen, mit Pfeilen verschieben und löschen; Abschlussblöcke, Kategorien und Raten umsortieren; eine Leistung zwischen *Inbegriffen* und *Nicht inbegriffen* ziehen.
- [ ] Einen Einleitungstext hinzufügen, als gespeicherten Text sichern und über **Gespeicherte Texte** erneut einfügen.
- [ ] **Speichern** → **Version 1 korrigieren**; dann als **Gesendet** markieren; erneut ändern → nur **Als neue Version speichern** → v2.
- [ ] **Änderungsverlauf** listet jede Speicherung mit den Änderungen; eine ältere öffnen und **Wiederherstellen**.
- [ ] **Vorschau** → A4-Seiten mit Logo der Niederlassung, *Vostro referente* und Fußzeile; **Drucken / Als PDF speichern**; Felder in den **Druckeinstellungen** abwählen und prüfen, dass sie verschwinden (die Rabattspalte bleibt, solange eine Zeile Rabatt hat).
- [ ] Die Gültigkeit der Familie in die Vergangenheit setzen: ein Entwurf wechselt mit Hinweis auf die neueste gültige Version; ohne neuere Version sind Speichern und Vorschau gesperrt, mit Link zum Hochladen.
- [ ] *Einstellungen → Unternehmen*: Steuerdaten ändern, eine Niederlassung mit Logo und Farbe anlegen, das Telefon eines Ansprechpartners setzen — die Vorschau zeigt sie.
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
