---
sidebar_position: 14
title: Versionshinweise
---

# Versionshinweise

Was sich geändert hat, neueste zuerst. Zeigt, was neu zu testen ist.

## November 2026

**Woche vom 16. November**
- **Teilen pro Linie und Option**: Der Teilen-Dialog listet jede Produktlinie und Option der Familie, jeweils mit eigenem **Rabatt**, **Aufschlag** und **Montagestunden** für dieses Unternehmen, ausgehend von den Werten der Excel (0 % / 100 % / 0, wo sie keine hat). In einer neuen Version füllt das, was das Unternehmen in der früheren hatte (nach Namen zugeordnet), die Werte aus, die die neue Excel leer lässt. Der einzelne Rabatt pro Unternehmen entfällt. Siehe [Familien teilen](./features/sharing.md).
- **Angebote aus einer geteilten Familie**: Jede Position startet mit den Werten der Freigabe für ihre Linie, und jede Option wird mit den Werten der Freigabe für diese Option berechnet.
- *Mit mir geteilt* zeigt **Ihren max. Rabatt**: den höchsten auf einer Linie oder Option.

**Woche vom 9. November**
- **Excel-Vorlage Version 2**: **Distributore** (Händler) und **Note** der Familie, ein **Mindesteinkaufspreis** (`MinValue`) für Linien und Optionen sowie pro Option ein eigener **Rabatt**, **Aufschlag** und eigene **Montagestunden**. Dateien der Version 1 lassen sich weiterhin importieren. Siehe [Excel-Importformat](./excel-format.md).
- **Preise**: Eine Linie oder Option kostet nie weniger als ihr Minimum; jede Option wird mit ihrem eigenen Rabatt und Aufschlag berechnet (die Linie mit denen der Position; bei einer geteilten Familie gilt der Rabatt der Position auch für die Optionen), angezeigt neben der Option in der Position; die Montagestunden der Optionen werden für „Ore di posa“-Optionen zu denen der Linie addiert. Siehe [Wie Preise berechnet werden](./pricing.md).
- **Import-Korrekturen**: `NO` im Blatt Relations zählt nicht mehr als „gilt“; ein fehlendes Preistabellen-Blatt stoppt den Import mit seinem Namen, statt eine Option ohne Preise anzulegen; Linien mit leerem Preis werden mit 0 importiert; neuer Typ `Altezza x [€/m]`, und in Dateien der Version 2 ist `2xAltezza x [€/m]` die doppelte **Höhe** (Dateien der Version 1 behalten die Formel ihrer Vorlage).
- **Versionen und Änderungen**: Eine an ihrer Stelle umbenannte Linie oder Option erscheint als eine Beschreibungsänderung, nicht als entfernt + hinzugefügt; eine ganz hinzugefügte oder entfernte Option ist eine Änderung, nicht zusätzlich eine pro Linie, die sie anbietet; die neuen Felder werden ebenfalls verglichen.
- **Angebotserstellung**: Die Wahl einer Familie öffnet direkt unter der Familienliste den ganzen Baum, was ihre Version geändert hat (zuklappen mit **Änderungen ausblenden**). Die Änderungen werden beim Hochladen der neuen Version aus dem Inhalt beider Versionen erkannt — nie aus dem Dateinamen — und mit ihr gespeichert.
- Die Seite der Familie zeigt Händler, Hinweis, Mindestpreise der Linien und die eigenen Konditionen der Optionen; die herunterladbare Beispiel-Arbeitsmappe ist jetzt Version 2.

**Woche vom 2. November**
- **Produktfamilien-Liste, neue Spalten** (aus dem Mock-up des Kunden): **Mit Preisliste** (Ja / Nein), **Gültig ab** und **Gültig bis** als Datumsfelder, **Bereit zur Fakturierung** und **In Bibliothek** (Ja / Nein) — alle direkt in der Zeile änderbar.
- **In Bibliothek**: jedes Unternehmen wählt, welche Familien (eigene oder geteilte) sein Angebot anbietet; für andere Benutzer verschwinden Familien außerhalb der Bibliothek aus dem Katalog.
- **Mit Preisliste**: nur informativ; das Angebot markiert Familien ohne Preisliste.
- Seite **Partner** (Seitenleiste): mit Kunden und Lieferanten verbinden — **Verbinden**, **Annehmen** / **Ablehnen**, **Verbindung entfernen**, mit Suche nach Name, Niederlassung oder Adresse. Familien können jetzt nur noch mit verbundenen Unternehmen geteilt werden; Unternehmen, die bereits Familien teilten, wurden automatisch verbunden. Das Entfernen einer Verbindung beendet die Freigaben zwischen den beiden Unternehmen.
- **Benachrichtigungen**: eine Glocke neben Ihrem Namen für Verbindungsanfragen, Antworten und Entfernungen (direkt dort annehmen oder ablehnen); eine Anfrage sendet auch eine E-Mail.
- **Freigabe-Dialog**: Suchfeld, das nur verbundene Partner listet.
- Neue Berechtigung `partners.manage` (Unternehmensadmins und Manager).
- **Versionen und Änderungen** auf der Seite einer Familie: eine Zeitleiste aller Versionen und ein Baum, was sich zwischen zwei beliebigen Versionen geändert hat — hinzugefügte, entfernte, wirtschaftliche und beschreibende Änderungen, jede Art ausblendbar; eine geänderte Preistabelle zeigt, welche Größen teurer oder günstiger wurden.
- **Versionsgraph** auf der Seite einer Familie: die Versionen, die daraus erstellten Kopien (jede ein Zweig von der Version, aus der sie kopiert wurde) und die Familie, aus der sie kopiert wurde; eine Kopie lässt sich mit dem Original vergleichen.
- **Angebot und Versionen**: unter der Familienliste, was die gewählte Version gegenüber der vorherigen geändert hat; bei einer Position aus einer älteren Version das Abzeichen **vN verfügbar** mit ihren Änderungen; im Angebots-PDF die Version jeder Familie und was sich seit der vorherigen geändert hat.
- **Angebotserstellung**: Jede Familie in der Liste zeigt ihre Version, z. B. „Finestra (v2)“, da zwei Versionen gleichzeitig angeboten werden können.
- **Korrekturen aus der Testrunde vom 28. Oktober**: Die Demo-Anmeldung ohne Passwort ist aus, solange der Server sie nicht einschaltet; Seiten ohne Berechtigung (Benutzer, Unternehmen, Aktivitätsprotokoll, Zugriffsrechte und die anderen im Menü) führen jetzt zum Dashboard statt Ladefehler zu zeigen; das Dashboard bietet nur Schnellaktionen an, die man nutzen kann; ein Upload ohne Datei oder eine fehlerhafte Adresse liefern einen klaren Fehler statt eines Serverfehlers; Benutzerstatus sind übersetzt; Abmelden führt immer zur Anmeldeseite; die alte Demo-Seite **Invoice** ist entfernt (ihre Adresse öffnet die Angebote).

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
