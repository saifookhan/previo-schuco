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
| Visualizza | Il nome della famiglia, o l'icona a sinistra della riga (apre una nuova scheda) | Un clic sul resto della riga la espande. È aperta una sola riga alla volta. Il nome mostra la versione tra parentesi, per esempio Demo Window W70 (2); passandoci sopra compare Versione 2. La riga espansa indica la versione attuale e collega la precedente in una nuova scheda |
| Modifica prezzi | **Modifica** su una linea, caratteristica o tabella | Valore, formula, sconto, markup, ore di posa |
| Modifica una tabella | Modifica → aggiungi/rimuovi righe e colonne | Griglia larghezza × altezza |
| Pubblica / ritira | Interruttore **Stato (pubblicato)** nella riga espansa (pulsante nella pagina della famiglia) | La riga mostra Pubblicato o Bozza. Solo le famiglie pubblicate si possono condividere |
| Nuova versione | **Nuova versione** nella pagina della famiglia | Stessa finestra dell'importazione; la nuova versione ha la sua validità prezzi e quella vecchia mantiene le sue date |
| Duplica | Icona copia nella riga | Una finestra chiede nome, validità prezzi e pubblicazione della copia (parte dalle date dell'originale, non pubblicata) |
| Elimina | **Elimina** nella riga espansa (pulsante nella pagina della famiglia) | |
| Cambia validità prezzi | **Valido dal** e **Valido fino al** nella riga espansa, poi **Salva** (o **Modifica** nella pagina della famiglia) | Solo il proprietario (o il super-admin). La colonna **Date di validità** mostra le date come GG.MM.AAAA |
| Pronta per la fatturazione | Etichetta nella colonna **Tag** quando è attiva; interruttore nella riga espansa (Sì/No nella pagina della famiglia) | Solo le famiglie pronte per la fatturazione sono proposte nel preventivo. Solo il proprietario |
| Con listino | Etichetta nella colonna **Tag** quando è attiva; interruttore nella riga espansa (Sì/No nella pagina della famiglia) | Se dietro la famiglia ci sono dei prezzi — mostrato nel preventivo. Solo il proprietario |
| In libreria | Etichetta nella colonna **Tag** quando è attiva; interruttore nella riga espansa (Sì/No nella pagina della famiglia) | Se il preventivo della tua azienda propone la famiglia — per le tue famiglie e per quelle condivise. Amministratori e responsabili |

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
rifiuta. Le posizioni già nei preventivi mantengono i loro prezzi e restano modificabili. L'elenco mostra le due date
come un intervallo, con il badge **Futura** o **Scaduta**; le famiglie importate prima di questa funzione non hanno date e sono sempre usabili.
Nell'elenco il proprietario apre la riga, modifica **Valido dal** e **Valido fino al** insieme e salva. La *Data inizio
validità* non si può svuotare; svuotare la *Data fine validità* significa fino a nuovo avviso.
Due versioni di una famiglia non possono avere un giorno in comune: date che si sovrappongono a un'altra versione
(nell'elenco, nella pagina della famiglia o caricando una nuova versione) vengono rifiutate indicando numero e date di
quella versione, e non si salva nulla. Per iniziare una nuova versione, dai prima a quella attuale una *Data fine
validità* precedente alla *Data inizio validità* della nuova (la finestra di caricamento fa poi partire la nuova dal
giorno dopo). Una versione senza date conta come valida ogni giorno.

## Pronta per la fatturazione

Solo le famiglie segnate **Pronta per la fatturazione** (e pubblicate, con prezzi validi oggi) sono proposte quando
si aggiunge una posizione a un preventivo; l'API rifiuta le altre. La colonna **Tag** lo mostra quando è attivo. Si cambia con l'interruttore nella riga espansa o
con il menu **Sì / No** nella pagina della famiglia — solo l'azienda proprietaria può farlo. Una famiglia nuova parte **non pronta**; una copia o una nuova
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

## Versioni e modifiche

Quando una famiglia ha più di una versione, o è stata copiata, la sua pagina mostra **Versioni e modifiche**: un
grafico come un git graph. Una corsia contiene le versioni di questa famiglia (bozza, in vigore, scaduta o futura), una
corsia per ogni copia fatta con **Duplica** parte dalla versione da cui è stata copiata e, se la famiglia è a sua volta
una copia, una corsia grigia mostra la famiglia di origine. Ogni collegamento mostra quante modifiche ci sono. Clicca una
versione — o una copia, o l'originale — per confrontarla con quella che stai guardando; **Apri** porta alla sua pagina.

Le modifiche sono disegnate come un albero — dati della famiglia, linee di prodotto, opzioni — e ognuna è di uno di
quattro tipi:

- **Aggiunte** — una nuova linea, opzione o misura della tabella prezzi; oppure una linea che ora offre un'opzione.
- **Rimosse** — una linea, opzione o misura tolta; oppure una linea che non offre più un'opzione.
- **Economiche** — prezzi, formule, sconti, ricarichi, ore di posa, validità dei prezzi, tabelle prezzi.
- **Descrittive** — nomi, descrizioni, unità e impostazioni.

Attiva o nascondi ogni tipo con i pulsanti sopra l'albero, clicca una linea o un'opzione per chiuderla, e clicca una
modifica per vedere prima e dopo; una tabella prezzi cambiata si apre con le misure cambiate colorate (arancione più
cara, blu più economica). **Elenco** mostra le stesse modifiche come elenco. Linee e opzioni sono abbinate per nome,
quindi una linea rinominata appare come una rimossa e una aggiunta. Le aziende con cui la famiglia è condivisa vedono
solo le versioni condivise con loro.

## Cronologia

In fondo alla pagina della famiglia, **Cronologia** elenca importazione, pubblicazione, nuove versioni, modifiche
alle condivisioni e ogni modifica di prezzo (quale linea o opzione, quali campi). La vede solo l’azienda proprietaria
(e i super-admin) — non le aziende con cui la famiglia è condivisa.

## Schede

- **Le mie famiglie** — le famiglie della tua azienda.
- **Condivise con me** — famiglie che altre aziende hanno condiviso con te, con proprietario e **il tuo sconto max** (il più alto che la condivisione dà su una linea o opzione).

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
