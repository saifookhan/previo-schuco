---
sidebar_position: 3
title: Angebote
---

# Angebote

**Wo:** *Angebote* in der Seitenleiste · Ansehen benötigt `quote.view`, Erstellen und Bearbeiten benötigt
`quote.edit`, das nur Unternehmen mit Fähigkeit **supplier** haben (in den Demo-Daten: Suppli).

![Angebotsliste](/img/screens/quotes.png)

## Ablauf

1. **Neues Angebot** → Referenz und Kunde (Steuernummer, Adresse, Ort und Projekt sind optional und später änderbar).
2. Das Angebot öffnet sich auf einer Seite, wie im Design des Kunden:
   - **Obere Leiste** — Referenz, Version und Status, Kunde und Projekt (anklicken, um Kunde, Steuernummer, Adresse,
     Ort, Projekt, Datum und interne Notizen zu ändern), die **Summe zzgl. MwSt** und die Schaltflächen
     **Druckeinstellungen**, **Vorschau**, **Export** (demnächst), **Änderungsverlauf** und **Speichern**.
   - **Einleitung** — Textmodule (Überschriften, Fett, Listen, Ausrichtung, Links, Bilder bis 1 MB). Leeren Text oder
     einen der **gespeicherten Texte** des Unternehmens hinzufügen; jeder Text kann als neuer gespeicherter Text
     gesichert werden. Ziehen oder Pfeile zum Sortieren.
   - **Produktfamilien** — **Produktfamilie hinzufügen** wählt eine Familie aus dem Katalog (veröffentlicht, in der
     Bibliothek, abrechnungsbereit und heute gültig; Suche und Kategoriefilter) oder ein **leeres Produkt** von Hand.
     Jede Familie hat das Gültigkeitsabzeichen, **ALT/STD**, Duplizieren, Löschen, Einklappen und **Details &
     Spezifikationen** (Kategorie, Beschreibung, Notizen und technische Tabelle).
   - **Linien** — je eine Zeile: Pos, Menge, Linie, ME, B, H, m², Extra%, €/Stk, Rab%, Netto €, Gesamt, MwSt,
     Montage h, dann ALT/STD, Duplizieren, Löschen, Merkmale und Sperre. Linien und Familien lassen sich ziehen oder
     mit Pfeilen verschieben.
   - **Zusammenfassung und Abschluss** — sortierbare Blöcke: Texte, *Details nach Produkt*, *Gruppierung nach
     Kategorie* (Kategorien sortierbar), *Angebotssumme*, *Zahlungsplan* (mit Prüfung auf 100%) und *Leistungen*
     (zwischen **Inbegriffen** und **Nicht inbegriffen** ziehen; das Auge blendet eine im Druck aus). Neue Angebote
     beginnen mit dem Standard-Zahlungsplan und den Standard-Leistungen des Kunden.
3. **Speichern** fragt wie: bei einem **Entwurf** **Version N korrigieren** oder **Als neue Version speichern**; bei
   einer **gesendeten**, angenommenen oder abgelehnten Version nur **Als neue Version speichern** — eine gesendete
   Version ändert sich nie.
4. **Vorschau** öffnet *Anteprima Preventivo* in einem neuen Tab: A4-Seiten mit Logo und Farbe der Niederlassung im
   Kopf, Steuerdaten und *Seite X von Y* in der Fußzeile. **Drucken / Als PDF speichern** nutzt den Druckdialog des
   Browsers. Ungespeicherte Änderungen werden mit angezeigt.

## Preise

- **€/Stk** ist der Listenpreis der Linie mit ihren Merkmalen (mit Rabatt und Aufschlag der Familie oder der
  Freigabe). Er wird neu berechnet, sobald Linie, Merkmale oder Maße sich ändern, und bei jedem Speichern erneut auf dem Server.
- **Netto** = €/Stk × (1 + Extra%/100) × (1 − Rab%/100); **Gesamt** = Menge × Netto.
- Alternative Linien (**ALT**) zählen nicht zur Zwischensumme der Familie, alternative Familien nicht zur Angebotssumme.
- Ein eigener €/Stk macht die Linie manuell (kursiv); der Pfeil daneben führt zum Listenpreis zurück.
- Die Sperre friert nur die Zeile im Editor ein; Preis und Druck bleiben unverändert.

Wie jede Zahl berechnet wird: [Wie Preise berechnet werden](../pricing.md).

## Druckeinstellungen

Wer als **Ansprechpartner** gedruckt wird (*Vostro referente*: Name, E-Mail, Telefon), welche **Niederlassung** die
Seiten führt (wenn der Ansprechpartner für mehrere arbeitet) und welche Teile gedruckt werden: Ansprechpartner,
Familienbeschreibungen, Merkmale der Zeilen, Details nach Produkt, Gruppierung nach Kategorie, Angebotssumme,
Zahlungsplan, Leistungen, Spalten Extra % und Rabatt %. Die Rabattspalte ist Pflicht, solange eine Zeile einen Rabatt hat.

Kopf, Fußzeile und Ansprechpartner kommen aus **Einstellungen → Unternehmen**: Steuerdaten, Niederlassungen (Logo bis
512 KB, Farbe, Adresse, E-Mail, Telefon, Benutzer), Telefon jedes Benutzers und die gespeicherten Texte.

## Versionen und abgelaufene Preislisten

- Jede Version hat ihr eigenes Dokument; das Versionsmenü in der oberen Leiste wechselt zwischen ihnen und ändert den
  Status: Entwurf → **gesendet** → **angenommen** / **abgelehnt**.
- Sind die Preise einer Familie abgelaufen, verschiebt ein **Entwurf** ihre Linien auf die neueste gültige Version der
  Familie (nach Namen von Linie und Merkmal) und berechnet sie neu, mit einem Hinweis, was verschoben wurde und was
  nicht. Eine gesendete Version behält ihre Preise; **Preise aktualisieren** übernimmt die neue Version in die
  Änderungen, die dann eine neue Version werden.
- Gibt es keine gültige Version der Familie, sind Speichern und Drucken gesperrt und das Angebot verweist auf die
  Familie, um eine neue Preisliste hochzuladen.

## Verlauf

**Änderungsverlauf** listet jede Speicherung der Version — wer, wann, die Summe und was sich geändert hat (Felder des
Kopfes, Familien und Linien, hinzugefügte/entfernte/umsortierte Elemente, Abschluss und Druckeinstellungen). Jede
Speicherung lässt sich schreibgeschützt öffnen und **Wiederherstellen** als Ausgangspunkt. Das Audit-Protokoll des
Angebots (Erstellung, Speichern, neue Version, Status) bleibt wie bisher.

## Noch nicht gebaut

- Export nach Word und Excel, Bilder im Druck, Versand des Angebots per E-Mail aus der App.
- Ein ganzes Angebot löschen oder duplizieren.
