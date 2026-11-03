---
sidebar_position: 14
title: Versionshinweise
---

# Versionshinweise

Was sich geändert hat, neueste zuerst. Zeigt, was neu zu testen ist.

## November 2026

**Woche vom 2. November**
- **Produktfamilien-Liste, neue Spalten** (aus dem Mock-up des Kunden): **Mit Preisliste** (Ja / Nein), **Gültig ab** und **Gültig bis** als Datumsfelder, **Bereit zur Fakturierung** und **In Bibliothek** (Ja / Nein) — alle direkt in der Zeile änderbar.
- **In Bibliothek**: jedes Unternehmen wählt, welche Familien (eigene oder geteilte) sein Angebot anbietet; für andere Benutzer verschwinden Familien außerhalb der Bibliothek aus dem Katalog.
- **Mit Preisliste**: nur informativ; das Angebot markiert Familien ohne Preisliste.
- Seite **Partner** (Seitenleiste): mit Kunden und Lieferanten verbinden — **Verbinden**, **Annehmen** / **Ablehnen**, **Verbindung entfernen**, mit Suche nach Name, Niederlassung oder Adresse. Familien können jetzt nur noch mit verbundenen Unternehmen geteilt werden; Unternehmen, die bereits Familien teilten, wurden automatisch verbunden. Das Entfernen einer Verbindung beendet die Freigaben zwischen den beiden Unternehmen.
- **Benachrichtigungen**: eine Glocke neben Ihrem Namen für Verbindungsanfragen, Antworten und Entfernungen (direkt dort annehmen oder ablehnen); eine Anfrage sendet auch eine E-Mail.
- **Freigabe-Dialog**: Suchfeld, das nur verbundene Partner listet.
- Neue Berechtigung `partners.manage` (Unternehmensadmins und Manager).

## Oktober 2026

**Woche vom 26. Oktober**
- **Bereit zur Fakturierung** bei Produktfamilien (Ja / Nein in der Liste, auf der Seite der Familie und in den Upload- und Kopier-Dialogen): nur bereite Familien werden im Angebot angeboten. Bestehende Familien wurden als bereit markiert; neue starten als nicht bereit, Kopien und neue Versionen übernehmen die Einstellung des Originals.
- **Filter bei Produktfamilien**: Suche, Kategorie, Marke, Status, Preisgültigkeit, Gültigkeitstag, Aktualisierungszeitraum, nur neueste Versionen, Eigentümer und Rabatt (geteilter Reiter) sowie Sortierung. Sie bleiben in der Seitenadresse.
- **Ladeanzeigen in jeder Tabelle**: ein Platzhalter beim ersten Laden der Seite und ein Fortschrittsbalken mit „Wird aktualisiert…“, wenn eine Tabelle nach Filter, Sortierung, Reiter oder Aktion neu lädt — die Zeilen bleiben sichtbar.

**Woche vom 20. Oktober**
- **Excel-Upload in zwei Schritten**: Die Datei wird zuerst geprüft und ein Dialog zeigt ihren Inhalt; dann Name, **Preisgültigkeit** (ab/bis) und Veröffentlichung festlegen. Neue Angebotspositionen verwenden nur Familien mit heute gültigen Preisen.
- **Duplizieren** einer Produktfamilie öffnet jetzt denselben Dialog: Name, Preisgültigkeit und Veröffentlichung.
- **Benutzer bearbeiten** unter *Einstellungen → Benutzer* (Stift in jeder Zeile): Name, Rollen, aktiv/inaktiv.
- **Rollen-Seite ausgeblendet** — eigene Rollen werden vorerst nicht gebraucht. Die Beschreibung jeder Rolle steht unter *Einstellungen → Zugriffsrechte*: auf das ⓘ neben dem Rollennamen klicken.
- **Angebot** (der alte Demo-Editor) aus der Seitenleiste entfernt, er wurde mit Angebote verwechselt.

**Woche vom 13. Oktober**
- **Verlauf** bei Angeboten und Produktfamilien: wer was geändert hat, direkt auf der Seite.
- **Aktivitätsprotokoll**: *Einstellungen → Aktivitätsprotokoll* (Unternehmensadmins) und *Admin → Aktivitätsprotokoll* (Super-Admin) — wer was wann geändert hat; inklusive Anmeldungen und fehlgeschlagener Anmeldungen.
- **Testdokumentation** (diese Seite): Demo-Anmeldungen, URLs, Mailpit, Funktionen, Preise, Excel-Format, Screenshots.
- **Demo-Daten**: die Familie *Demo Window W70* wird automatisch angelegt, dazu eine Beispiel-Excel-Datei zum Herunterladen.
- **Eigene Rollen**: Super-Admins können eigene Rollen anlegen.
- **Berechtigungsmatrix** (*Einstellungen → Zugriffsrechte*): festlegen, welche Berechtigungen jede Rolle hat.
- **Freigabe pro Familie** mit Standardrabatt, statt Verknüpfungen zwischen Unternehmen.
- **Mehrere Rollen pro Benutzer**, und Unternehmensfähigkeiten (manufacturer / supplier / client / platform) als Kontrollkästchen.
- **Positionsformular des Angebots** in klare Abschnitte gegliedert.

**Woche vom 6. Oktober**
- Eigener **Positionsname/-code** (nicht nur P01, P02, …).
- **Live-Preisvorschau** beim Hinzufügen einer Position.
- **Manueller Preis (A/M-Schalter)** pro Position und pro Option.

**Woche vom 29. September**
- Automatisches **HTTPS** auf dem Server; Mailpit per HTTPS mit Anmeldung erreichbar.
- Automatisches Deployment nach jedem erfolgreichen Build.

## September 2026

- **Freigabe von Einladungen**: von einem Unternehmensadmin eingeladene Benutzer warten auf die Freigabe eines Super-Admins.
- **Eigene Anmeldung mit E-Mail + Passwort** (statt des bisherigen Identity-Providers), Passwort-Reset per E-Mail.
- **Admin-Bereich**: Unternehmen anlegen, bearbeiten, deaktivieren.
- **Angebote**: Angebotserstellung und PDF.
- **Produktfamilien**: Excel-Import, bearbeitbare Preise und Preistabellen, Versionen, Veröffentlichen, Löschen.
- Mandantentrennung, Audit-Log und Hintergrundjobs (Grundlagen).
