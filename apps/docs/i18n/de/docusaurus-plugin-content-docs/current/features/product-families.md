---
sidebar_position: 1
title: Produktfamilien (Katalog)
---

# Produktfamilien (Katalog)

Eine **Produktfamilie** ist der Katalog eines Herstellers für einen Produkttyp (zum Beispiel eine Fensterserie).
Sie enthält **Produktlinien** (die verkaufbaren Artikel), **Merkmale** (Optionen wie Glas oder Farbe,
jeweils mit eigenem Preis) und **Preistabellen** (Preis nach Breite × Höhe).

**Wo:** *Produktfamilien* in der Seitenleiste · benötigt `catalog.view`; Bearbeiten benötigt `catalog.edit`
(nur Unternehmen mit Fähigkeit manufacturer).

Jede Umgebung hat bereits eine: **Demo Window W70** (siehe [Demo-Daten](../demo-data.md)).

![Liste der Produktfamilien](/img/screens/product-families.png)

## Was man tun kann

| Aktion | Wie | Hinweise |
|---|---|---|
| Aus Excel importieren | **Aus Excel importieren** in der Liste | Datei wählen, prüfen, Preisgültigkeit festlegen — siehe [Aus Excel importieren](#aus-excel-importieren) |
| Ansehen | Familie anklicken | Linien, Merkmale, Preistabellen |
| Preise bearbeiten | **Bearbeiten** an einer Linie, einem Merkmal oder einer Tabelle | Wert, Formel, Rabatt, Aufschlag, Montagestunden |
| Tabelle bearbeiten | Bearbeiten → Zeilen und Spalten hinzufügen/entfernen | Raster Breite × Höhe |
| Veröffentlichen / zurückziehen | Aktionsmenü | Nur veröffentlichte Familien können geteilt werden |
| Neue Version | **Neue Version** auf der Seite der Familie | Derselbe Dialog wie beim Import; die neue Version bekommt eine eigene Preisgültigkeit, die alte behält ihre Daten |
| Duplizieren | Kopier-Symbol in den Aktionen | Ein Dialog fragt nach Name, Preisgültigkeit und Veröffentlichung der Kopie (startet mit den Daten des Originals, unveröffentlicht) |
| Löschen | Aktionsmenü | |
| Preisgültigkeit ändern | **Bearbeiten** neben den Daten auf der Seite der Familie | Nur Eigentümer (oder Super-Admin) |
| Bereit zur Fakturierung | **Ja / Nein** in der Liste (oder auf der Seite der Familie) | Nur Familien, die bereit zur Fakturierung sind, werden im Angebot angeboten. Nur Eigentümer |

![Produktfamilie im Detail](/img/screens/product-family-detail.png)

## Aus Excel importieren

1. **Aus Excel importieren** klicken und die `.xlsx`-Datei wählen. Sie wird nur **geprüft** — noch wird nichts gespeichert.
2. Ein Dialog zeigt, was die Datei enthält: den Namen der Familie, wie viele Produktlinien, Merkmale, Optionen,
   Preistabellen, Zuordnungen und Bilder, und was man prüfen sollte (z. B. eine Relations-Zeile mit einer Produktlinie,
   die es nicht gibt — diese Zeile wird übersprungen). Eine nicht importierbare Datei wird hier mit Grund abgelehnt.
3. Ausfüllen:
   - **Name der Familie** — aus der Datei übernommen, änderbar.
   - **Gültig ab** (Pflicht, standardmäßig heute) und **Gültig bis** (leer = bis auf Weiteres).
   - **Sofort veröffentlichen** — sonst wird sie als Entwurf gespeichert.
   - **Bereit zur Fakturierung** — ankreuzen, damit die Familie im Angebot angeboten wird; neue Familien starten als nicht bereit, Kopien und neue Versionen mit der Einstellung des Originals.
4. **Familie importieren** speichert sie und öffnet ihre Seite.

![Upload-Dialog](/img/screens/product-family-upload.png)

Dateiformat: [Excel-Importformat](../excel-format.md).

## Preisgültigkeit

Die Preise einer Familie können in **neuen Angebotspositionen** nur von *Gültig ab* bis *Gültig bis* verwendet werden
(beide Tage eingeschlossen, italienische Zeit). Außerhalb dieser Tage wird die Familie im Angebot nicht angeboten und
die API lehnt sie ab. Positionen, die schon in Angeboten stehen, behalten ihre Preise und bleiben bearbeitbar. Die Liste
zeigt die Daten mit dem Badge **Demnächst** oder **Abgelaufen**; vor dieser Funktion importierte Familien haben keine
Daten und sind immer verwendbar.

## Bereit zur Fakturierung

Nur Familien mit **Bereit zur Fakturierung** (und veröffentlicht, mit heute gültigen Preisen) werden beim Hinzufügen
einer Position zu einem Angebot angeboten; die API lehnt die anderen ab. Geändert wird es mit dem Auswahlfeld
**Ja / Nein** in der Liste oder auf der Seite der Familie — nur vom Eigentümer-Unternehmen. Eine neue Familie startet als **nicht bereit**; eine Kopie oder
neue Version übernimmt die Einstellung des Originals (im Dialog änderbar). Familien, die vor dieser Einstellung existierten, wurden als bereit
markiert. Positionen, die schon in Angeboten sind, bleiben unverändert und bearbeitbar. Jede Änderung steht im Verlauf
der Familie.

## Preisfelder

- **Formel**-Variablen: `valore`, `B` (Breite), `H` (Höhe), `valore_base_in_vendita`, `ore_di_posa`.
  Funktionen: `min`, `max`, `round`, `ceil`, `floor`, `abs`, `sqrt`, `pow`.
- **Aufschlag**: `100` bedeutet kein Aufschlag.
- **Rabatt**: der Katalograbatt der Linie.

Alle Regeln: [Wie Preise berechnet werden](../pricing.md).

## Verlauf

Unten auf der Familienseite listet **Verlauf** Import, Veröffentlichung, neue Versionen, Änderungen an Freigaben und
jede Preisänderung (welche Linie oder Option, welche Felder). Nur das besitzende Unternehmen (und Super-Admins)
sehen ihn — nicht die Unternehmen, mit denen die Familie geteilt wurde.

## Reiter

- **Meine Familien** — Familien deines Unternehmens.
- **Mit mir geteilt** — Familien, die andere Unternehmen mit dir geteilt haben, mit Besitzer und **deinem Rabatt**.

## Filter

Über der Liste, für den geöffneten Reiter:

- **Suche** — Name, technischer Name, Kategorie, Marke (und Eigentümer unter *Mit mir geteilt*).
- **Kategorie**, **Marke**, **Status** (veröffentlicht / Entwurf).
- **Preisgültigkeit** — *Heute gültig* (was das Angebot anbietet; Familien ohne Daten zählen mit), *Demnächst*, *Abgelaufen*, *Ohne Daten*.
- **Bereit zur Fakturierung** (unter *Weitere Filter*) — Ja / Nein.
- **Weitere Filter** — *Preise gültig am* bestimmten Tag, *Aktualisiert ab / bis*, *Nur neueste Versionen* (blendet Versionen aus, die eine neuere ersetzt); unter *Mit mir geteilt* zusätzlich **Eigentümer** und **Ihr Rabatt** (mit / ohne).
- **Sortieren** — neueste zuerst (Standard), zuletzt aktualisiert, Name, Preise laufen zuerst ab.

Die Filter sind Teil der Seitenadresse: Sie können sie speichern oder teilen, und **Zurück** macht die letzte Änderung rückgängig.

## Noch nicht umgesetzt

Festlegen, welche Merkmale für welche Linien gelten, ohne die Excel-Datei neu zu importieren.
