---
sidebar_position: 5
title: Formato di importazione Excel
---

# Formato di importazione Excel

Una famiglia di prodotto si importa da un file Excel (`.xlsx`). Nomi dei fogli e intestazioni delle
colonne devono corrispondere **esattamente** (gli spazi attorno alle intestazioni vengono ignorati).
Scarica [il file di esempio](pathname:///samples/previo-sample-family.xlsx) per vedere un esempio funzionante.

Questa pagina descrive la **versione 2** del modello. I file fatti con la versione 1 si importano
ancora: la versione si riconosce dalle intestazioni, e le colonne aggiunte dalla versione 2 restano vuote.

| Foglio | Obbligatorio | Contiene |
|---|---|---|
| `Product Family` | sì | Nome e dati della famiglia |
| `Product lines` | sì | Gli articoli vendibili |
| `Caracteristics` | sì | Opzioni (vetro, colore, …) e i loro prezzi |
| `Relations` | no | Quali opzioni valgono per quale linea |
| *qualsiasi altro nome* | — | Tabelle prezzi (larghezza × altezza), richiamate dai fogli sopra |

Attenzione alla grafia **`Caracteristics`** — l'importazione cerca esattamente quel nome.

## `Product Family`

Due colonne, `Label` e `Value`, una riga per campo:

| Label | Obbligatorio | Esempio |
|---|---|---|
| `Nome_famiglia` | sì | Demo Window W70 |
| `Nome_tecnico_famiglia` | no | W70-DEMO |
| `Categoria prodotti` | no | Finestre |
| `Brand` | no | PREVIO Demo (versione 1: `Brand/Fornitore`) |
| `Distributore` | no | Da chi si acquista la famiglia |
| `Note` | no | Testo libero, ad es. un link alla documentazione tecnica |
| `Descrizione_1`, `Descrizione_2` | no | Testo libero |

Le immagini inserite in questo foglio diventano le immagini della famiglia.

## `Product lines`

Una riga per linea. Le righe senza nome, nome unità o simbolo unità vengono saltate. Un prezzo vuoto
vale 0 — una famiglia può avere i prezzi tutti nelle opzioni.

| Colonna | Significato | Esempio |
|---|---|---|
| `Nome_linea_prodotto` | Nome della linea | Finestra 2 ante |
| `Descrizione_opzionale` | Descrizione (facoltativa) | |
| `Tipo_Listino` | Tipo di prezzo — vedi [Tipi di listino](#tipi-di-listino) | `Superficie x [€/m2]` |
| `Listino_acquisto` | Il valore del prezzo, **oppure il nome di un foglio tabella prezzi** | `280` o `Matrice_1anta` |
| `MinValue` | Prezzo d'acquisto minimo al pezzo (facoltativo) — vedi [Prezzo minimo](./pricing.md#prezzo-minimo) | `120` |
| `Nome_UM` / `Simbolo_UM` | Nome / simbolo dell'unità | Metro quadro / m² |
| `Sconto %` | Sconto, come percentuale Excel (`0.1` = 10%) | `0.1` |
| `MarkUp %` | Moltiplicatore di ricarico (`1.3` = 130%; `1` = nessun ricarico) | `1.3` |
| `Ore di posa x UM` | Ore di posa per unità | `2` |

:::caution Percentuali
`Sconto %` e `MarkUp %` sono letti come percentuali Excel — una cella che mostra *10%* vale `0.1`.
Scrivere `10` significa 1000%.
:::

## `Caracteristics`

Una griglia, sette colonne per caratteristica:

- **Riga 2**: i nomi delle caratteristiche, ognuno all'inizio di un blocco di sette colonne (B, I, P, …).
- **Una riga di intestazione** con `Nome valore` in ogni blocco.
- **Ogni riga sotto**: un'opzione per blocco — `[Nome valore, Tipo_Listino, Listino_acquisto,
  MinValue, Sconto %, MarkUp %, Ore di posa x UM]`.

|   | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| 2 | **Vetro** | | | | | | |
| 4 | Nome valore | Tipo_Listino | Listino_acquisto | MinValue | Sconto % | MarkUp % | Ore di posa x UM |
| 5 | Doppio vetro | Superficie x [€/m2] | 0 | | 0 | 1 | 0 |
| 6 | Vetro acustico | Superficie x [€/m2] | 60 | 30 | 0.05 | 1.2 | 0.5 |

- `MinValue`, `Sconto %` e `MarkUp %` funzionano come quelli di una linea, per **il prezzo di questa
  opzione** — vedi [Come vengono calcolati i prezzi](./pricing.md#2-ogni-opzione-scelta).
- `Ore di posa x UM` è il tempo di posa che l'opzione **aggiunge** a quello della linea (ad es. un vetro
  più pesante). Un'opzione `Ore di posa x [€/h]` si calcola sul totale.
- Per `% sul valore base del prodotto` anche il valore è una percentuale Excel (`0.08` = 8%).
- Per `Tabella BxH [€/Pz]` il valore è il nome di un foglio tabella prezzi — l'importazione si ferma se
  il file non ha quel foglio.

Un file della versione 1 ha tre colonne per caratteristica (`[nome opzione, tipo listino, valore]`); le
sue opzioni usano sconto e ricarico della posizione e non aggiungono ore di posa.

## `Relations` (facoltativo)

La prima colonna `Product line / Caracteristics` contiene i nomi delle linee; una colonna per ogni
caratteristica. `SI` significa "questa caratteristica vale per questa linea"; `NO` o una cella vuota no.

| Product line / Caracteristics | Vetro | Colore | Maniglia |
|---|---|---|---|
| Finestra 1 anta | SI | SI | SI |
| Zanzariera | NO | SI | NO |

## Fogli tabella prezzi

Larghezze nella prima riga, altezze nella prima colonna, prezzi nelle celle (mm e €):

| H \ B | 600 | 800 | 1000 |
|---|---|---|---|
| 800 | 210 | 240 | 270 |
| 1200 | 260 | 295 | 330 |

Larghezze e altezze devono essere in ordine crescente. Le intestazioni non numeriche vengono ignorate.

## Tipi di listino

`Tipo_Listino` deve essere esattamente una di queste etichette, altrimenti l'importazione viene rifiutata:

| Tipo_Listino | Prezzo = |
|---|---|
| `Valore_Fisso [€/Pz]` | valore (fisso al pezzo) |
| `Perimetro x [€/m]` | perimetro in m × valore |
| `Base x [€/m]` | larghezza in m × valore |
| `Altezza x [€/m]` | altezza in m × valore |
| `Superficie x [€/m2]` | superficie in m² × valore |
| `2xAltezza x [€/m]` | 2 × altezza in m × valore |
| `Base+2xAltezza x [€/m]` | (larghezza + 2 × altezza) in m × valore |
| `Ore di posa x [€/h]` | ore di posa (della linea più quelle delle opzioni) × valore |
| `% sul valore base del prodotto` | valore % del prezzo della linea (solo opzioni) |
| `Tabella BxH [€/Pz]` | cercato in un foglio tabella prezzi |

Le formule esatte sono in [Come vengono calcolati i prezzi](./pricing.md).

## Errori di importazione comuni

| Messaggio | Soluzione |
|---|---|
| The workbook does not have a sheet named "…" | Aggiungi / rinomina il foglio — i nomi distinguono maiuscole e grafia |
| The "Product Family" sheet must have a "Nome_famiglia" row | Aggiungi una riga `Nome_famiglia` con un valore |
| Unknown Tipo_Listino "…" | Usa esattamente una delle etichette sopra (spazi e parentesi inclusi) |
| … uses the price table "…", but the workbook has no sheet with that name | Aggiungi il foglio tabella prezzi, o correggi il nome in `Listino_acquisto` |
| … has the price "…", which is neither a number nor a sheet of the workbook | Scrivi un numero, o il nome di un foglio tabella prezzi |
| Failed to read the uploaded file as an Excel workbook | Salva come `.xlsx` |
