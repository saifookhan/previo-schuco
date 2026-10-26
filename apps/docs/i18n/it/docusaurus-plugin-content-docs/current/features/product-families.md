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
| Importa da Excel | **Importa da Excel** nell'elenco | Scegli il file, controllalo, imposta la validità dei prezzi — vedi [Importare da Excel](#importare-da-excel) |
| Visualizza | Clicca una famiglia | Linee, caratteristiche, tabelle prezzi |
| Modifica prezzi | **Modifica** su una linea, caratteristica o tabella | Valore, formula, sconto, markup, ore di posa |
| Modifica una tabella | Modifica → aggiungi/rimuovi righe e colonne | Griglia larghezza × altezza |
| Pubblica / ritira | Menu azioni | Solo le famiglie pubblicate si possono condividere |
| Nuova versione | **Nuova versione** nella pagina della famiglia | Stessa finestra dell'importazione; la nuova versione ha la sua validità prezzi e quella vecchia mantiene le sue date |
| Duplica | Icona copia nelle azioni | Una finestra chiede nome, validità prezzi e pubblicazione della copia (parte dalle date dell'originale, non pubblicata) |
| Elimina | Menu azioni | |
| Cambia validità prezzi | **Modifica** accanto alle date nella pagina della famiglia | Solo il proprietario (o il super-admin) |

![Dettaglio famiglia di prodotto](/img/screens/product-family-detail.png)

## Importare da Excel

1. Clicca **Importa da Excel** e scegli il file `.xlsx`. Viene solo **controllato** — non si salva ancora nulla.
2. Una finestra mostra cosa contiene il file: il nome della famiglia, quante linee di prodotto, caratteristiche,
   opzioni, tabelle prezzi, relazioni e immagini, e cosa conviene controllare (ad esempio una riga di Relations che
   nomina una linea inesistente — quella riga verrà saltata). Un file non importabile viene rifiutato qui, con il motivo.
3. Compila:
   - **Nome della famiglia** — preso dal file; puoi cambiarlo.
   - **Valido dal** (obbligatorio, oggi di default) e **Valido fino al** (vuoto = fino a nuovo avviso).
   - **Pubblica subito** — altrimenti viene salvata in bozza.
4. **Importa famiglia** la salva e apre la sua pagina.

![Finestra di caricamento](/img/screens/product-family-upload.png)

Formato del file: [Formato di importazione Excel](../excel-format.md).

## Validità dei prezzi

I prezzi di una famiglia si possono usare nelle **nuove posizioni dei preventivi** solo da *Valido dal* a *Valido fino
al* (giorni inclusi, ora italiana). Fuori da questi giorni la famiglia non è proposta nel preventivo e l'API la
rifiuta. Le posizioni già nei preventivi mantengono i loro prezzi e restano modificabili. L'elenco mostra le date con
il badge **Futura** o **Scaduta**; le famiglie importate prima di questa funzione non hanno date e sono sempre usabili.

## Campi di prezzo

- Variabili della **formula**: `valore`, `B` (larghezza), `H` (altezza), `valore_base_in_vendita`, `ore_di_posa`.
  Funzioni: `min`, `max`, `round`, `ceil`, `floor`, `abs`, `sqrt`, `pow`.
- **Markup**: `100` significa nessun ricarico.
- **Sconto**: lo sconto a catalogo della linea.

Regole complete: [Come vengono calcolati i prezzi](../pricing.md).

## Cronologia

In fondo alla pagina della famiglia, **Cronologia** elenca importazione, pubblicazione, nuove versioni, modifiche
alle condivisioni e ogni modifica di prezzo (quale linea o opzione, quali campi). La vede solo l’azienda proprietaria
(e i super-admin) — non le aziende con cui la famiglia è condivisa.

## Schede

- **Le mie famiglie** — le famiglie della tua azienda.
- **Condivise con me** — famiglie che altre aziende hanno condiviso con te, con proprietario e **il tuo sconto**.

## Filtri

Sopra l'elenco, per la scheda aperta:

- **Cerca** — nome, nome tecnico, categoria, marca (e proprietario in *Condivise con me*).
- **Categoria**, **Marca**, **Stato** (pubblicata / bozza).
- **Validità prezzi** — *Validi oggi* (quello che propone il preventivo; contano anche le famiglie senza date), *In arrivo*, *Scaduti*, *Senza date*.
- **Altri filtri** — *Prezzi validi il* un certo giorno, *Aggiornata dal / al*, *Solo ultime versioni* (nasconde le versioni sostituite da una più recente); in *Condivise con me* anche **Proprietario** e **Il tuo sconto** (con / senza).
- **Ordina** — più recenti prima (predefinito), aggiornate di recente, nome, prezzi in scadenza prima.

I filtri fanno parte dell'indirizzo della pagina: puoi salvarlo o condividerlo, e **Indietro** annulla l'ultima modifica.

## Non ancora realizzato

Modificare quali caratteristiche valgono per quali linee senza reimportare il file Excel.
