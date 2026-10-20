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
| Aus Excel importieren | **Import from Excel** in der Liste | Legt eine neue, unveröffentlichte Familie im Entwurf an — Format: [Excel-Importformat](../excel-format.md) |
| Ansehen | Familie anklicken | Linien, Merkmale, Preistabellen |
| Preise bearbeiten | **Bearbeiten** an einer Linie, einem Merkmal oder einer Tabelle | Wert, Formel, Rabatt, Aufschlag, Montagestunden |
| Tabelle bearbeiten | Bearbeiten → Zeilen und Spalten hinzufügen/entfernen | Raster Breite × Höhe |
| Veröffentlichen / zurückziehen | Aktionsmenü | Nur veröffentlichte Familien können geteilt werden |
| Neue Version | **Neue Version** an einer veröffentlichten Familie | Veröffentlichte Familien sind **für die Bearbeitung gesperrt**; eine neue Version ist eine bearbeitbare Entwurfskopie, die die alte ersetzt |
| Duplizieren / löschen | Aktionsmenü | |

![Produktfamilie im Detail](/img/screens/product-family-detail.png)

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

## Noch nicht umgesetzt

Festlegen, welche Merkmale für welche Linien gelten, ohne die Excel-Datei neu zu importieren.
