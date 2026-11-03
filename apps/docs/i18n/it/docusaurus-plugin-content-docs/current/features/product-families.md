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
| Cambia validità prezzi | I campi **Data inizio / fine validità** nell'elenco, o **Modifica** accanto alle date nella pagina della famiglia | Solo il proprietario (o il super-admin) |
| Pronta per la fatturazione | **Sì / No** nell'elenco (o nella pagina della famiglia) | Solo le famiglie pronte per la fatturazione sono proposte nel preventivo. Solo il proprietario |
| Con listino | **Sì / No** nell'elenco (o nella pagina della famiglia) | Se dietro la famiglia ci sono dei prezzi — mostrato nel preventivo. Solo il proprietario |
| In libreria | **Sì / No** nell'elenco (o nella pagina della famiglia) | Se il preventivo della tua azienda propone la famiglia — per le tue famiglie e per quelle condivise. Amministratori e responsabili |

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
   - **Pronta per la fatturazione** — spuntala per proporre la famiglia nel preventivo; le nuove famiglie partono non pronte, copie e nuove versioni dall'impostazione dell'originale.
4. **Importa famiglia** la salva e apre la sua pagina.

![Finestra di caricamento](/img/screens/product-family-upload.png)

Formato del file: [Formato di importazione Excel](../excel-format.md).

## Validità dei prezzi

I prezzi di una famiglia si possono usare nelle **nuove posizioni dei preventivi** solo da *Valido dal* a *Valido fino
al* (giorni inclusi, ora italiana). Fuori da questi giorni la famiglia non è proposta nel preventivo e l'API la
rifiuta. Le posizioni già nei preventivi mantengono i loro prezzi e restano modificabili. L'elenco mostra le date con
il badge **Futura** o **Scaduta**; le famiglie importate prima di questa funzione non hanno date e sono sempre usabili.
Nell'elenco il proprietario cambia le date direttamente nella riga: la modifica si salva quando esci dal campo (o con
Invio). La *Data inizio validità* non si può svuotare; svuotare la *Data fine validità* significa fino a nuovo avviso.

## Pronta per la fatturazione

Solo le famiglie segnate **Pronta per la fatturazione** (e pubblicate, con prezzi validi oggi) sono proposte quando
si aggiunge una posizione a un preventivo; l'API rifiuta le altre. Si cambia con il menu **Sì / No** nell'elenco o
nella pagina della famiglia — solo l'azienda proprietaria può farlo. Una famiglia nuova parte **non pronta**; una copia o una nuova
versione parte dall'impostazione dell'originale (modificabile nella finestra). Quelle esistenti prima di questa impostazione sono state segnate pronte. Le posizioni già nei
preventivi non cambiano e restano modificabili. Ogni modifica compare nella cronologia della famiglia.

## Con listino

**Con listino** (Sì / No) indica se dietro la famiglia ci sono dei prezzi. Si imposta a mano dall'azienda proprietaria —
non viene dal file Excel — ed è **Sì** per ogni famiglia finché qualcuno non lo cambia; una copia mantiene
l'impostazione dell'originale. È solo un'informazione: nel preventivo una famiglia senza listino è segnata
*(senza listino)* con un promemoria di controllare i prezzi, ma si può comunque usare.

## In libreria

**In libreria** (Sì / No) è la scelta della tua azienda su quali famiglie propone il suo preventivo — utile quando un
fornitore condivide molte famiglie che non usate. Vale per le tue famiglie e per quelle condivise con te, e ogni
azienda decide per sé: togliere dalla libreria una famiglia condivisa non la cambia per nessun altro.

- Fuori dalla libreria, la famiglia non è più proposta quando si aggiunge una posizione a un preventivo (anche l'API la
  rifiuta), per tutti nella tua azienda. Le posizioni già nei preventivi non cambiano e restano modificabili.
- Solo amministratori e responsabili (chi può condividere famiglie) lo cambiano, e solo loro vedono ancora nell'elenco
  le famiglie fuori dalla libreria — per gli altri utenti spariscono dal catalogo.
- Ogni famiglia è in libreria finché qualcuno non la toglie, anche quelle condivise con te più avanti.

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
- **Pronta per la fatturazione** (in *Più filtri*) — Sì / No.
- **Con listino** e **In libreria** (in *Più filtri*) — Sì / No.
- **Altri filtri** — *Prezzi validi il* un certo giorno, *Aggiornata dal / al*, *Solo ultime versioni* (nasconde le versioni sostituite da una più recente); in *Condivise con me* anche **Proprietario** e **Il tuo sconto** (con / senza).
- **Ordina** — più recenti prima (predefinito), aggiornate di recente, nome, prezzi in scadenza prima.

I filtri fanno parte dell'indirizzo della pagina: puoi salvarlo o condividerlo, e **Indietro** annulla l'ultima modifica.

## Non ancora realizzato

Modificare quali caratteristiche valgono per quali linee senza reimportare il file Excel.
