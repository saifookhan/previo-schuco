---
sidebar_position: 3
title: Angebote
---

# Angebote

**Wo:** *Angebote* in der Seitenleiste · Ansehen benötigt `quote.view`, Erstellen und Bearbeiten benötigt
`quote.edit`, das nur Unternehmen mit Fähigkeit **supplier** haben (in den Demo-Daten: Suppli).

![Angebotsliste](/img/screens/quotes.png)

## Ablauf

1. **Neues Angebot** → Referenz, Kundenname, Steuernummer, Adresse, Ort, Projektstandort.
2. Angebot öffnen. Es hat drei Bereiche:
   - **Links — Positionen:** die Angebotsübersicht, jede Position mit ihrem Preis, **Neue Position** und die Summe. Eine
     Position anklicken, um sie zu bearbeiten; die ausgewählte hat außerdem **nach oben / unten**, **duplizieren** und
     **löschen**.
   - **Mitte — das Formular der Position:**
     - **Produkt** — eine Familie (eigene oder mit dir geteilte) und eine Produktlinie wählen.
     - **Maße & Position** — Positionsname/-code (eigene Codes erlaubt), Breite, Höhe, Menge.
     - **Merkmale** — eine Zeile pro Option der Linie, jede automatisch (**A**) oder manuell (**M**) bepreist.
     - **Preis** — der Preis der Linie wird automatisch berechnet (**A**); auf manuell (**M**) umschalten, um ihn zu
       überschreiben. Rabatt und Aufschlag.
   - **Rechts — Vorschau:**
     - **Berechnung** — wie sich der Preis zusammensetzt, live beim Tippen: Listenpreis der Linie, Rabatt und Aufschlag,
       jede Option zu ihren eigenen Konditionen, Stückpreis, Menge und Summe, dazu ein **Formelverlauf** mit jedem
       Schritt.
     - **PDF** — das PDF des Angebots, wie es gespeichert ist. Es lädt neu, nachdem du eine Position hinzufügst oder
       speicherst.
3. **Position hinzufügen** / **Änderungen speichern**. Nach dem Speichern bleibt die Position ausgewählt. Wer mit
   ungespeicherten Änderungen eine andere Position (oder **Neue Position**) anklickt, wird vorher gefragt.
4. **PDF herunterladen** (oben rechts).

Auf einem kleineren Bildschirm rückt die Vorschau unter das Formular; auf dem Handy sind die drei Bereiche Tabs
(**Positionen**, **Bearbeiten**, **Vorschau**).

![Angebot: Positionen, Formular und Berechnung](/img/screens/quote-detail.png)

![Die PDF-Vorschau](/img/screens/add-position.png)

Positionen aus einer geteilten Familie starten mit Rabatt, Aufschlag und Montagestunden, die die Freigabe für diese Linie und ihre Optionen festlegt. Wie jede Zahl berechnet wird: [Wie Preise berechnet werden](../pricing.md).

## Familienversionen im Angebot

- Die Familienliste zeigt die Version jeder Familie, z. B. „Finestra (v2)“. Sobald eine Familie gewählt ist, öffnet
  sich darunter als Baum, was diese Version gegenüber der vorherigen geändert hat (hinzugefügt, entfernt,
  wirtschaftlich, Beschreibung), wie auf der Seite der Familie: Änderungsarten ausblenden, zur Liste wechseln, eine
  Änderung anklicken für vorher und nachher (oder die Preistabelle Zelle für Zelle). **Änderungen ausblenden** klappt
  ihn zu; **Familienseite** öffnet dort den Vergleich.
- Die Änderungen werden beim Hochladen der neuen Version aus dem Inhalt der beiden Versionen erkannt, nicht aus dem
  Dateinamen oder markierten Zellen, und mit der Version gespeichert.
- Wenn eine neuere Version der Familie einer Position angeboten werden kann, zeigt die Position in der Liste ein
  Verzweigungssymbol, und beim Öffnen **v3 verfügbar** mit den Änderungen und dem Link zum Vergleich. Die Position
  behält ihren Preis, bis du wechselst: wähle in ihrem Formular die neue Version — Maße, Menge und Code bleiben, ebenso
  die Linie und die Optionen mit gleichem Namen in der neuen Version — und dann **Änderungen speichern**.
- Im PDF zeigt die Überschrift jeder Familie ihre Version und darunter, was sich seit der vorherigen Version geändert
  hat: was hinzugefügt oder entfernt wurde und welche Einträge Preisänderungen (Preistabellen mit ihrer %-Spanne) oder
  Textänderungen haben. Die erste Version einer Kopie wird nicht mit der Familie verglichen, aus der sie kopiert wurde.

## Verlauf

In den Positionen **Angebotsübersicht** und dann **Verlauf** öffnen, um zu sehen, wer es erstellt hat und wer welche Position hinzugefügt,
bearbeitet, dupliziert, umsortiert oder entfernt hat, und wann. Wer das Angebot sehen kann, sieht auch den Verlauf.

![Angebotsverlauf](/img/screens/quote-history.png)

## Noch nicht umgesetzt

- Status-Ablauf — jedes Angebot bleibt **Entwurf** (Gesendet / Angenommen / Abgelehnt gibt es nur im Datenmodell).
- Kopfdaten bearbeiten, ganzes Angebot löschen, ganzes Angebot duplizieren.
