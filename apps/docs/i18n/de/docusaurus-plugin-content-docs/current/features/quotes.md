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
   - **Obere Leiste** — Referenz, Variante (`V1A2`), Name und Status, Kunde und Projekt (anklicken, um Kunde, Steuernummer, Adresse,
     Ort, Projekt, Datum und interne Notizen zu ändern), die **Summe zzgl. MwSt** und die Schaltflächen
     **Versionsmatrix**, **Druckeinstellungen**, **Vorschau**, **Export** (demnächst), **Änderungsverlauf** und **Speichern**.
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
3. **Speichern** fragt wie: bei einem **Entwurf** diese Variante korrigieren oder nur diese Alternative als nächste
   Version speichern (`V1A2` bleibt, `V2A2` entsteht). Bei einer **fakturierten** oder **angenommenen** Variante gibt es nur diese neue Version.
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

## Versionen, Alternativen und abgelaufene Preislisten

Ein Angebot ist ein Raster: Versionen nach unten, Alternativen nach rechts (`V1A1`, `V1A2`, `V2A2`). Siehe
[ADR 0016](https://github.com/saifookhan/previo-schuco/blob/main/docs/adr/0016-quote-variants.md).

- **Neue Alternative** kopiert nur die offene Zelle auf die nächste freie Alternative derselben Version (`V1A2` → `V1A3`).
- **Als neue Version speichern** kopiert nur diese Alternative auf die nächste Version (`V1A2` → `V2A2`). Die anderen Spalten bleiben leer.
- Die **Versionsmatrix** (im Editor und in der aufgeklappten Zeile der Liste) zeigt das Raster. Über einer gespeicherten Zelle
  entsteht die darunter. Über einer leeren Zelle, wenn die darüber existiert, wird das gespeicherte Dokument nach unten kopiert.
  Ungespeicherte Änderungen im Editor sind nicht dabei.
- Das Variantenmenü setzt den Namen, dupliziert diese Variante als neues Angebot (nur `V1A1`), markiert sie als **final**
  (die das Dashboard nutzt) und setzt den Status auf **Entwurf**, **fakturiert** oder **angenommen** — jeder außer dem aktuellen.
  Nur ein Entwurf wird an Ort und Stelle bearbeitet. Fakturiert oder angenommen verlangt Katalogfamilien mit heute gültigen Preisen.
- Sind die Preise einer Familie abgelaufen, verschiebt ein **Entwurf** ihre Linien auf die neueste gültige Version der
  Familie (nach Namen von Linie und Merkmal) und berechnet sie neu, mit einem Hinweis, was verschoben wurde und was
  nicht. Eine fakturierte oder angenommene Variante behält ihre Preise; **Preise aktualisieren** übernimmt die neue Version in die
  Änderungen, die dann nur die nächste Version dieser Alternative werden.
- Gibt es keine gültige Version der Familie, sind Speichern, Drucken und das Verlassen des Entwurfs gesperrt und das Angebot verweist auf die
  Familie, um eine neue Preisliste hochzuladen.

## Liste, Archiv und Kurzansicht

Die Liste sucht Referenz, Kunde und Projekt und filtert nach Status. **Archiviert** bleibt aus, bis es angehakt wird.
Jede Zeile zeigt die Alternativen der letzten Version. Der blaue Stern markiert eine Favoriten-Variante (mehrere sind möglich); der gelbe Stern ist das finale Angebot, das das Dashboard nutzt. **Favoriten** bleibt aus, bis es angehakt wird. Die Zeile öffnen für die Matrix, **Duplizieren** einer Variante und
**Archivieren** (Unternehmensadmins und Super-Admins). Das Auge ist eine kurze Übersicht von Familien und Linien. Archivieren
blendet das Angebot aus der Liste aus; der direkte Link öffnet es weiter. Dasselbe Archiv gilt für Produktfamilien, eine Version nach der anderen.

## Verlauf

**Änderungsverlauf** listet jede Speicherung der Version — wer, wann, die Summe und was sich geändert hat (Felder des
Kopfes, Familien und Linien, hinzugefügte/entfernte/umsortierte Elemente, Abschluss und Druckeinstellungen). Jede
Speicherung lässt sich schreibgeschützt öffnen und **Wiederherstellen** als Ausgangspunkt. Das Audit-Protokoll des
Angebots (Erstellung, Speichern, neue Version, Status) bleibt wie bisher.

## Noch nicht gebaut

- Export nach Word und Excel, Bilder im Druck, Versand des Angebots per E-Mail aus der App.
- Ein Angebot endgültig löschen. Archivieren blendet es aus.
