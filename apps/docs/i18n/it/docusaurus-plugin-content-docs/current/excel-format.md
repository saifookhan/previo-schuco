---
sidebar_position: 5
title: Formato di importazione Excel
---

# Formato di importazione Excel

Una famiglia di prodotto si importa da un file Excel (`.xlsx`). Nomi dei fogli e intestazioni delle
colonne devono corrispondere **esattamente** (gli spazi attorno alle intestazioni vengono ignorati).
Scarica [il file di esempio](pathname:///samples/previo-sample-family.xlsx) per vedere un esempio funzionante.

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
| `Brand/Fornitore` | no | PREVIO Demo |
| `Descrizione_1`, `Descrizione_2` | no | Testo libero |

Le immagini inserite in questo foglio diventano le immagini della famiglia.

## `Product lines`

Una riga per linea. Le righe senza nome, nome unità, simbolo unità o prezzo vengono saltate.

| Colonna | Significato | Esempio |
|---|---|---|
| `Nome_linea_prodotto` | Nome della linea | Finestra 2 ante |
| `Descrizione_opzionale` | Descrizione (facoltativa) | |
| `Tipo_Listino` | Tipo di prezzo — vedi [Tipi di listino](#tipi-di-listino) | `Superficie x [€/m2]` |
| `Listino_acquisto` | Il valore del prezzo, **oppure il nome di un foglio tabella prezzi** | `280` o `Matrice_1anta` |
| `Nome_UM` / `Simbolo_UM` | Nome / simbolo dell'unità | Metro quadro / m² |
| `Sconto %` | Sconto, come percentuale Excel (`0.1` = 10%) | `0.1` |
| `MarkUp %` | Moltiplicatore di ricarico (`1.3` = 130%; `1` = nessun ricarico) | `1.3` |
| `Ore di posa x UM` | Ore di posa per unità | `2` |

:::caution Percentuali
`Sconto %` e `MarkUp %` sono letti come percentuali Excel — una cella che mostra *10%* vale `0.1`.
Scrivere `10` significa 1000%.
:::

## `Caracteristics`

Una griglia, tre colonne per caratteristica:

- **Riga 2**: i nomi delle caratteristiche, ognuno all'inizio di un blocco di tre colonne (A, D, G, …).
- **Una riga di intestazione** con `Nome valore` in ogni blocco.
- **Ogni riga sotto**: un'opzione per blocco — `[nome opzione, tipo listino, valore]`.

|   | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| 1 | Caratteristiche | | | | | |
| 2 | **Vetro** | | | **Colore** | | |
| 3 | Nome valore | Tipo listino | Valore | Nome valore | Tipo listino | Valore |
| 4 | Doppio vetro | Superficie x [€/m2] | 0 | Bianco | Valore_Fisso [€/Pz] | 0 |
| 5 | Triplo vetro | Superficie x [€/m2] | 45 | Antracite | % sul valore base del prodotto | 0.08 |

Per `% sul valore base del prodotto` anche il valore è una percentuale Excel (`0.08` = 8%).
Per `Tabella BxH [€/Pz]` il valore è il nome di un foglio tabella prezzi.

## `Relations` (facoltativo)

La prima colonna `Product line / Caracteristics` contiene i nomi delle linee; una colonna per ogni
caratteristica. Qualsiasi cella non vuota significa "questa caratteristica vale per questa linea".

| Product line / Caracteristics | Vetro | Colore | Maniglia |
|---|---|---|---|
| Finestra 1 anta | x | x | x |
| Zanzariera | | x | |

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
| `Superficie x [€/m2]` | superficie in m² × valore |
| `2xAltezza x [€/m]` | 2 × larghezza in m × valore |
| `Base+2xAltezza x [€/m]` | (larghezza + 2 × altezza) in m × valore |
| `Ore di posa x [€/h]` | ore di posa × valore |
| `% sul valore base del prodotto` | valore % del prezzo della linea (solo opzioni) |
| `Tabella BxH [€/Pz]` | cercato in un foglio tabella prezzi |

Le formule esatte sono in [Come vengono calcolati i prezzi](./pricing.md).

## Errori di importazione comuni

| Messaggio | Soluzione |
|---|---|
| The workbook does not have a sheet named "…" | Aggiungi / rinomina il foglio — i nomi distinguono maiuscole e grafia |
| The "Product Family" sheet must have a "Nome_famiglia" row | Aggiungi una riga `Nome_famiglia` con un valore |
| Unknown Tipo_Listino "…" | Usa esattamente una delle etichette sopra (spazi e parentesi inclusi) |
| Failed to read the uploaded file as an Excel workbook | Salva come `.xlsx` |
