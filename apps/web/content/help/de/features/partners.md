---
sidebar_position: 2
title: Partner
---

# Partner

Bevor zwei Unternehmen Produktfamilien teilen können, verbinden sie sich auf der Seite **Partner**: eines
fragt an, das andere nimmt an. Der Freigabe-Dialog bietet nur verbundene Unternehmen an.

**Wo:** Seitenleiste → **Partner** · erfordert `partners.manage` (Unternehmensadmins und Manager).

## Tabs

- **Kunden** — Unternehmen, die Ihre Familien erhalten können (Händler und Kunden). Sichtbar für Hersteller,
  Händler und das Plattform-Unternehmen.
- **Lieferanten** — Unternehmen, die ihre Familien mit Ihnen teilen können (Hersteller, Händler, das
  Plattform-Unternehmen). Sichtbar für Händler und Kunden.

Ein Kunde sieht also nur *Lieferanten*, ein Hersteller nur *Kunden*, ein Händler beide. Die Suche berücksichtigt
den Unternehmensnamen sowie Namen und Adressen der Niederlassungen; die Karte zeigt die Adresse der ersten Niederlassung.

## Verbindungsstatus

| Status | Was Sie tun können |
|---|---|
| Nicht verbunden | **Verbinden** — sendet eine Anfrage |
| Ausstehend | Sie haben angefragt und warten — Anfrage **zurückziehen** |
| Anfrage erhalten | **Anfrage annehmen** oder **Ablehnen** |
| Verbunden | **Verbindung entfernen** (mit Bestätigung) |

- Eine Anfrage an ein Unternehmen, das Sie bereits angefragt hat, verbindet Sie sofort.
- Eine abgelehnte Anfrage kann später erneut gesendet werden.
- **Das Entfernen einer Verbindung beendet alle Familienfreigaben zwischen den beiden Unternehmen, in beide
  Richtungen** — und, wie beim Entfernen einer Freigabe, alles, was von diesen Familien weitergeteilt wurde.
- Unternehmen, die bereits Familien miteinander teilten, wurden mit Einführung dieser Seite automatisch verbunden.

## Benachrichtigungen

Die Glocke neben Ihrem Namen (obere Leiste auf dem Telefon) zeigt, wie viele Benachrichtigungen neu sind. Sie werden benachrichtigt, wenn:

- ein Unternehmen eine Verbindung anfragt — mit **Annehmen** / **Ablehnen** direkt in der Benachrichtigung;
- Ihre Anfrage angenommen oder abgelehnt wird;
- ein Unternehmen die Verbindung mit Ihrem entfernt.

Das Öffnen der Glocke markiert sie als gelesen. Die Partner-Seite zeigt dieselbe Liste rechts. Eine
Verbindungsanfrage sendet außerdem eine **E-Mail** an die Admins und Manager des angefragten Unternehmens (lokal: Mailpit).

## So testen Sie

1. Als `admin@technometal-demo.it`: *Partner* zeigt nur *Lieferanten*. Suppli ist **Verbunden**. Beim
   Plattform-Unternehmen auf **Verbinden** klicken → es zeigt **Ausstehend**.
2. Als `admin@schuco-demo.it`: die Glocke zeigt **1**, die Anfrage-E-Mail ist in Mailpit. Über die Glocke oder
   die Partner-Seite **annehmen**.
3. Wieder als Technometal: die Glocke meldet die angenommene Anfrage; die Karte zeigt **Verbunden**.
4. Als `admin@suppli-demo.it`: **Teilen** bei *Demo Window W70* — die Suche listet nur verbundene Unternehmen.
   Ist Fabbrikka noch nicht verbunden, **Verbinden** und als `admin@fabbrikka-demo.it` annehmen; danach
   erscheint es im Freigabe-Dialog.
5. **Verbindung entfernen** mit einem Unternehmen, mit dem Sie Familien teilen → nach der Bestätigung
   verschwinden diese Familien aus dessen *Mit mir geteilt*.
6. Als `sales@technometal-demo.it`: kein *Partner* in der Seitenleiste und keine Glocke.
