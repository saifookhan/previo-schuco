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

## Noch nicht umgesetzt

- Status-Ablauf — jedes Angebot bleibt **Entwurf** (Gesendet / Angenommen / Abgelehnt gibt es nur im Datenmodell).
- Kopfdaten bearbeiten, ganzes Angebot löschen, ganzes Angebot duplizieren.
