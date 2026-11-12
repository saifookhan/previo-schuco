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
2. Angebot öffnen → **Position hinzufügen**:
   - **Produkt** — eine Familie (eigene oder mit dir geteilte) und eine Produktlinie wählen.
   - **Maße & Position** — Breite, Höhe, Menge, Positionsname/-code (eigene Codes erlaubt).
   - **Preis** — wird automatisch berechnet (**A**); auf manuell (**M**) umschalten, um ihn zu überschreiben.
     Eine Live-Preisvorschau aktualisiert sich beim Tippen.
   - **Merkmale** — Optionen der Linie, jede ebenfalls automatisch oder manuell bepreist.
3. Positionen bearbeiten, duplizieren, löschen und **umsortieren**.
4. **PDF herunterladen**.

![Angebot mit drei Positionen](/img/screens/quote-detail.png)

![Formular zum Hinzufügen einer Position](/img/screens/add-position.png)

Positionen aus einer geteilten Familie starten mit dem Rabatt der Freigabe. Wie jede Zahl berechnet wird: [Wie Preise berechnet werden](../pricing.md).

## Familienversionen im Angebot

- Die Familienliste zeigt die Version jeder Familie, z. B. „Finestra (v2)“. Sobald eine Familie gewählt ist, öffnet
  sich darunter als Baum, was diese Version gegenüber der vorherigen geändert hat (hinzugefügt, entfernt,
  wirtschaftlich, Beschreibung), wie auf der Seite der Familie: Änderungsarten ausblenden, zur Liste wechseln, eine
  Änderung anklicken für vorher und nachher (oder die Preistabelle Zelle für Zelle). **Änderungen ausblenden** klappt
  ihn zu; **Familienseite** öffnet dort den Vergleich.
- Die Änderungen werden beim Hochladen der neuen Version aus dem Inhalt der beiden Versionen erkannt, nicht aus dem
  Dateinamen oder markierten Zellen, und mit der Version gespeichert.
- Eine Position aus einer älteren Version zeigt die Version unter dem Namen der Linie und, wenn eine neuere Version
  angeboten werden kann, das Abzeichen **v3 verfügbar**: anklicken für die Änderungen und den Link zum Vergleich. Die
  Position behält ihren Preis; bearbeite sie, um zur neuen Version zu wechseln.
- Im PDF zeigt die Überschrift jeder Familie ihre Version und darunter, was sich seit der vorherigen Version geändert
  hat: was hinzugefügt oder entfernt wurde und welche Einträge Preisänderungen (Preistabellen mit ihrer %-Spanne) oder
  Textänderungen haben. Die erste Version einer Kopie wird nicht mit der Familie verglichen, aus der sie kopiert wurde.

## Verlauf

Unten im Angebot **Verlauf** öffnen, um zu sehen, wer es erstellt hat und wer welche Position hinzugefügt,
bearbeitet, dupliziert, umsortiert oder entfernt hat, und wann. Wer das Angebot sehen kann, sieht auch den Verlauf.

![Angebotsverlauf](/img/screens/quote-history.png)

## Noch nicht umgesetzt

- Status-Ablauf — jedes Angebot bleibt **Entwurf** (Gesendet / Angenommen / Abgelehnt gibt es nur im Datenmodell).
- Kopfdaten bearbeiten, ganzes Angebot löschen, ganzes Angebot duplizieren.
