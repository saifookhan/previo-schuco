---
sidebar_position: 6
title: Admin-Bereich
---

# Admin-Bereich

Nur Super-Admin (`admin@schuco-demo.it`). Über **Admin portal** in der Seitenleiste öffnen.

| Seite | Funktion |
|---|---|
| Dashboard | Summen: Benutzer, aktive Benutzer, Unternehmen, Super-Admins; neueste Benutzer |
| Benutzer | Alle Benutzer aller Unternehmen, dazu **offene Freigaben** (Einladungen freigeben / ablehnen) |
| Unternehmen | Unternehmen anlegen und bearbeiten, Fähigkeiten setzen (manufacturer / supplier / client / platform), deaktivieren und reaktivieren |
| Aktivitätsprotokoll | Jede Änderung auf der Plattform — wer, was, wann, welcher Datensatz — über alle Unternehmen; Filter nach Unternehmen, Typ, Datum, Person oder Anfrage-ID |

![Admin-Dashboard](/img/screens/admin-dashboard.png)

![Alle Benutzer](/img/screens/admin-users.png)

![Unternehmen](/img/screens/admin-companies.png)

## Aktivitätsprotokoll

Unternehmensadmins haben dasselbe Protokoll für ihr eigenes Unternehmen unter **Einstellungen → Aktivitätsprotokoll**.
Einträge können nicht bearbeitet oder gelöscht werden. Es erfasst Änderungen (Katalog, Freigaben, Angebote,
Benutzer, Rollen, Unternehmen) und Anmeldungen: erfolgreiche Anmeldungen, fehlgeschlagene Anmeldungen an einem
echten Konto, festgelegte Passwörter und angeforderte Passwort-Resets. Auf eine Person klicken, um nur ihre
Aktionen zu sehen; eine Zeile öffnen für Details und Anfrage-ID.

![Aktivitätsprotokoll](/img/screens/audit-log.png)

Ein Super-Admin kann auch innerhalb eines bestimmten Unternehmens handeln (Tenant-Override), und jede
Änderung wird in ein unveränderliches **Audit-Log** geschrieben.
