---
sidebar_position: 1
title: Famiglie di prodotto (catalogo)
---

# Famiglie di prodotto (catalogo)

Una **famiglia di prodotto** è il catalogo di un produttore per un tipo di prodotto (ad esempio una serie di finestre).
Contiene **linee di prodotto** (gli articoli vendibili), **caratteristiche** (opzioni come vetro o
colore, ognuna con il proprio prezzo) e **tabelle prezzi** (prezzo per larghezza × altezza).

**Dove:** *Famiglie di prodotto* nella barra laterale · richiede `catalog.view`; la modifica richiede `catalog.edit`
(solo aziende manufacturer).

Ogni ambiente ne ha già una: **Demo Window W70** (vedi [Dati demo](../demo-data.md)).

![Elenco famiglie di prodotto](/img/screens/product-families.png)

## Cosa puoi fare

| Azione | Come | Note |
|---|---|---|
| Importa da Excel | **Import from Excel** nell'elenco | Crea una nuova famiglia in bozza, non pubblicata — formato: [Formato di importazione Excel](../excel-format.md) |
| Visualizza | Clicca una famiglia | Linee, caratteristiche, tabelle prezzi |
| Modifica prezzi | **Modifica** su una linea, caratteristica o tabella | Valore, formula, sconto, markup, ore di posa |
| Modifica una tabella | Modifica → aggiungi/rimuovi righe e colonne | Griglia larghezza × altezza |
| Pubblica / ritira | Menu azioni | Solo le famiglie pubblicate si possono condividere |
| Nuova versione | **Nuova versione** su una famiglia pubblicata | Le famiglie pubblicate sono **bloccate in modifica**; una nuova versione è una copia in bozza modificabile che sostituisce la precedente |
| Duplica / elimina | Menu azioni | |

![Dettaglio famiglia di prodotto](/img/screens/product-family-detail.png)

## Campi di prezzo

- Variabili della **formula**: `valore`, `B` (larghezza), `H` (altezza), `valore_base_in_vendita`, `ore_di_posa`.
  Funzioni: `min`, `max`, `round`, `ceil`, `floor`, `abs`, `sqrt`, `pow`.
- **Markup**: `100` significa nessun ricarico.
- **Sconto**: lo sconto a catalogo della linea.

Regole complete: [Come vengono calcolati i prezzi](../pricing.md).

## Schede

- **Le mie famiglie** — le famiglie della tua azienda.
- **Condivise con me** — famiglie che altre aziende hanno condiviso con te, con proprietario e **il tuo sconto**.

## Non ancora realizzato

Modificare quali caratteristiche valgono per quali linee senza reimportare il file Excel.
