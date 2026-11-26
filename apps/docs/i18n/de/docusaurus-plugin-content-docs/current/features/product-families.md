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
| Ansehen | Name der Familie, oder das Symbol links in der Zeile (öffnet einen neuen Tab) | Ein Klick auf den Rest der Zeile klappt sie auf. Es ist immer nur eine Zeile offen |
| Preise bearbeiten | **Bearbeiten** an einer Linie, einem Merkmal oder einer Tabelle | Wert, Formel, Rabatt, Aufschlag, Montagestunden |
| Tabelle bearbeiten | Bearbeiten → Zeilen und Spalten hinzufügen/entfernen | Raster Breite × Höhe |
| Veröffentlichen / zurückziehen | Schalter **Status (veröffentlicht)** in der aufgeklappten Zeile (Schaltfläche auf der Seite der Familie) | Die Zeile zeigt Veröffentlicht oder Entwurf. Nur veröffentlichte Familien können geteilt werden |
| Neue Version | **Neue Version** auf der Seite der Familie | Derselbe Dialog wie beim Import; die neue Version bekommt eine eigene Preisgültigkeit, die alte behält ihre Daten |
| Duplizieren | Kopier-Symbol in der Zeile | Ein Dialog fragt nach Name, Preisgültigkeit und Veröffentlichung der Kopie (startet mit den Daten des Originals, unveröffentlicht) |
| Löschen | **Löschen** in der aufgeklappten Zeile (Schaltfläche auf der Seite der Familie) | |
| Preisgültigkeit ändern | **Gültig ab** und **Gültig bis** in der aufgeklappten Zeile, dann **Speichern** (oder **Bearbeiten** auf der Seite der Familie) | Nur Eigentümer (oder Super-Admin). Die Spalte **Gültigkeitsdaten** zeigt beide Daten als einen Zeitraum |
| Bereit zur Fakturierung | Ja/Nein-Markierung in der Zeile; Schalter in der aufgeklappten Zeile (Ja/Nein auf der Seite der Familie) | Nur Familien, die bereit zur Fakturierung sind, werden im Angebot angeboten. Nur Eigentümer |
| Mit Preisliste | Ja/Nein-Markierung in der Zeile; Schalter in der aufgeklappten Zeile (Ja/Nein auf der Seite der Familie) | Ob hinter der Familie Preise stehen — wird im Angebot angezeigt. Nur Eigentümer |
| In Bibliothek | Ja/Nein-Markierung in der Zeile; Schalter in der aufgeklappten Zeile (Ja/Nein auf der Seite der Familie) | Ob das Angebot Ihres Unternehmens die Familie anbietet — für eigene und geteilte Familien. Administratoren und Manager |

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
zeigt beide Daten als einen Zeitraum, mit dem Badge **Demnächst** oder **Abgelaufen**; vor dieser Funktion importierte Familien haben keine
Daten und sind immer verwendbar.
In der Liste klappt der Eigentümer die Zeile auf, ändert **Gültig ab** und **Gültig bis** gemeinsam und speichert.
*Gültig ab* kann nicht geleert werden; ein leeres *Gültig bis* bedeutet bis auf Weiteres.
Zwei Versionen einer Familie dürfen keinen Tag gemeinsam haben: Daten, die sich mit einer anderen Version überschneiden
(in der Liste, auf der Seite der Familie oder beim Hochladen einer neuen Version), werden mit Nummer und Daten dieser
Version abgelehnt, und nichts wird gespeichert. Für eine neue Version geben Sie der aktuellen zuerst ein *Gültig bis*
vor dem *Gültig ab* der neuen (der Upload-Dialog lässt die neue dann am Tag danach beginnen). Eine Version ohne Daten
gilt an jedem Tag.

## Bereit zur Fakturierung

Nur Familien mit **Bereit zur Fakturierung** (und veröffentlicht, mit heute gültigen Preisen) werden beim Hinzufügen
einer Position zu einem Angebot angeboten; die API lehnt die anderen ab. Die Zeile zeigt Ja oder Nein. Geändert wird es mit dem Schalter
in der aufgeklappten Zeile oder dem Auswahlfeld **Ja / Nein** auf der Seite der Familie — nur vom Eigentümer-Unternehmen. Eine neue Familie startet als **nicht bereit**; eine Kopie oder
neue Version übernimmt die Einstellung des Originals (im Dialog änderbar). Familien, die vor dieser Einstellung existierten, wurden als bereit
markiert. Positionen, die schon in Angeboten sind, bleiben unverändert und bearbeitbar. Jede Änderung steht im Verlauf
der Familie.

## Mit Preisliste

**Mit Preisliste** (Ja / Nein) gibt an, ob hinter der Familie Preise stehen. Es wird vom Eigentümer-Unternehmen von
Hand gesetzt — es kommt nicht aus der Excel-Datei — und ist für jede Familie **Ja**, bis jemand es ändert; eine Kopie
übernimmt die Einstellung des Originals. Es ist nur eine Information: im Angebot wird eine Familie ohne Preisliste als
*(ohne Preisliste)* markiert und zeigt einen Hinweis, die Preise zu prüfen, kann aber trotzdem verwendet werden.

## In Bibliothek

**In Bibliothek** (Ja / Nein) ist die eigene Wahl Ihres Unternehmens, welche Familien sein Angebot anbietet — nützlich,
wenn ein Lieferant viele Familien teilt, die Sie nicht verwenden. Es gilt für eigene und für mit Ihnen geteilte
Familien, und jedes Unternehmen entscheidet selbst: eine geteilte Familie aus Ihrer Bibliothek zu nehmen, ändert sie
für niemand anderen.

- Außerhalb der Bibliothek wird die Familie beim Hinzufügen einer Position zu einem Angebot nicht mehr angeboten (auch
  die API lehnt sie ab), für alle in Ihrem Unternehmen. Positionen, die schon in Angeboten sind, bleiben unverändert
  und bearbeitbar.
- Nur Administratoren und Manager (wer Familien teilen darf) ändern es, und nur sie sehen Familien außerhalb der
  Bibliothek noch in der Liste — für die anderen Benutzer verschwinden sie aus dem Katalog.
- Jede Familie ist in der Bibliothek, bis jemand sie herausnimmt, auch später mit Ihnen geteilte Familien.

## Preisfelder

- **Formel**-Variablen: `valore`, `B` (Breite), `H` (Höhe), `valore_base_in_vendita`, `ore_di_posa`.
  Funktionen: `min`, `max`, `round`, `ceil`, `floor`, `abs`, `sqrt`, `pow`.
- **Aufschlag**: `100` bedeutet kein Aufschlag.
- **Rabatt**: der Katalograbatt der Linie.

Alle Regeln: [Wie Preise berechnet werden](../pricing.md).

## Versionen und Änderungen

Hat eine Familie mehr als eine Version oder wurde sie kopiert, zeigt ihre Seite **Versionen und Änderungen**: einen
Graphen wie einen Git-Graphen. Eine Spur enthält die Versionen dieser Familie (Entwurf, gültig, abgelaufen oder
künftig), je eine Spur pro mit **Duplizieren** erstellter Kopie zweigt von der Version ab, aus der sie kopiert wurde,
und ist die Familie selbst eine Kopie, zeigt eine graue Spur die Ursprungsfamilie. Jede Verbindung zeigt, wie viele
Änderungen dazwischen liegen. Klicke eine Version — oder eine Kopie oder das Original —, um sie mit der angezeigten zu
vergleichen; **Öffnen** führt zu ihrer Seite.

Die Änderungen werden als Baum gezeigt — Familiendaten, Produktlinien, Optionen — und jede gehört zu einer von vier
Arten:

- **Hinzugefügt** — eine neue Linie, Option oder Preistabellen-Größe; oder eine Linie bietet jetzt eine Option an.
- **Entfernt** — eine entfernte Linie, Option oder Größe; oder eine Linie bietet eine Option nicht mehr an.
- **Wirtschaftlich** — Preise, Formeln, Rabatte, Aufschläge, Montagestunden, Preisgültigkeit, Preistabellen.
- **Beschreibung** — Namen, Beschreibungen, Einheiten und Einstellungen.

Blende jede Art mit den Schaltflächen über dem Baum ein oder aus, klicke eine Linie oder Option, um sie zuzuklappen,
und klicke eine Änderung für vorher und nachher; eine geänderte Preistabelle öffnet sich mit farbigen geänderten Größen
(Orange teurer, Blau günstiger). **Liste** zeigt dieselben Änderungen als Liste. Linien und Optionen werden über den
Namen zugeordnet, eine umbenannte Linie erscheint also als entfernt und hinzugefügt. Unternehmen, mit denen die Familie
geteilt ist, sehen nur die mit ihnen geteilten Versionen.

## Verlauf

Unten auf der Familienseite listet **Verlauf** Import, Veröffentlichung, neue Versionen, Änderungen an Freigaben und
jede Preisänderung (welche Linie oder Option, welche Felder). Nur das besitzende Unternehmen (und Super-Admins)
sehen ihn — nicht die Unternehmen, mit denen die Familie geteilt wurde.

## Reiter

- **Meine Familien** — Familien deines Unternehmens.
- **Mit mir geteilt** — Familien, die andere Unternehmen mit dir geteilt haben, mit Besitzer und **Ihrem max. Rabatt** (dem höchsten, den die Freigabe auf einer Linie oder Option gibt).

## Filter

Über der Liste, für den geöffneten Reiter:

- **Suche** — Name, technischer Name, Kategorie, Marke (und Eigentümer unter *Mit mir geteilt*).
- **Kategorie**, **Marke**, **Status** (veröffentlicht / Entwurf).
- **Preisgültigkeit** — *Heute gültig* (was das Angebot anbietet; Familien ohne Daten zählen mit), *Demnächst*, *Abgelaufen*, *Ohne Daten*.
- **Bereit zur Fakturierung** (unter *Weitere Filter*) — Ja / Nein.
- **Mit Preisliste** und **In Bibliothek** (unter *Weitere Filter*) — Ja / Nein.
- **Weitere Filter** — *Preise gültig am* bestimmten Tag, *Aktualisiert ab / bis*, *Nur neueste Versionen* (blendet Versionen aus, die eine neuere ersetzt); unter *Mit mir geteilt* zusätzlich **Eigentümer** und **Ihr Rabatt** (mit / ohne).
- **Sortieren** — neueste zuerst (Standard), zuletzt aktualisiert, Name, Preise laufen zuerst ab.

Die Filter sind Teil der Seitenadresse: Sie können sie speichern oder teilen, und **Zurück** macht die letzte Änderung rückgängig.

## Noch nicht umgesetzt

Festlegen, welche Merkmale für welche Linien gelten, ohne die Excel-Datei neu zu importieren.
