---
sidebar_position: 2
title: Condivisione delle famiglie
---

# Condivisione delle famiglie

Un'azienda decide chi può usare ciascuna delle sue famiglie di prodotto, e cosa ottiene ogni azienda su ogni linea di
prodotto e opzione: uno sconto, un ricarico e le ore di posa.

**Dove:** elenco famiglie o pagina della famiglia → **Condividi** · richiede `catalog.share`. Puoi condividere
solo con aziende connesse nella pagina [Partner](./partners.md); la ricerca della finestra elenca solo quelle.

![Finestra di condivisione](/img/screens/share-dialog.png)

## Regole

- Una famiglia deve essere **pubblicata** prima di poter essere condivisa.
- Ogni condivisione è *"l'azienda A condivide la famiglia F con l'azienda B"*, con uno **Sconto %**, un
  **Ricarico %** e le **Ore di posa** per unità su ogni linea di prodotto e ogni opzione. Sono i valori con cui
  partono le posizioni di preventivo di B — B può comunque cambiare sconto e ricarico della posizione.
- Quando aggiungi un'azienda, i valori partono da quelli della famiglia (dell'Excel caricato). Dove la cella
  dell'Excel è vuota (o per un'opzione di versione 1), partono da 0% di sconto, 100% di ricarico e 0 ore. Un ricarico del `100%` significa
  nessun ricarico; `130%` aggiunge il 30%.
- **Nuova versione:** le condivisioni appartengono a una versione. Quando aggiungi a una nuova versione un'azienda
  con cui avevi condiviso una versione precedente, i suoi valori di allora completano ciò che il nuovo Excel lascia
  vuoto, abbinati per nome di linea e opzione ("Valori da un'altra versione"). Un valore presente nel nuovo Excel
  vince sempre. Una linea o opzione nuova in questa versione parte dai valori dell'Excel. Puoi cambiarli tutti prima
  di salvare.
- Solo il **proprietario**, o un'azienda con cui la famiglia è stata condivisa, può condividerla a sua volta.
  Si crea così una catena, es. produttore → rivenditore → cliente.
- **Ritirare dalla pubblicazione** la famiglia, o rimuovere una condivisione a monte, la nasconde subito
  a tutti più in basso nella catena.

## Come testare

La famiglia demo *Demo Window W70* è già condivisa con Technometal al 10% su ogni linea e opzione.

1. Come `admin@technometal-demo.it`: *Famiglie di prodotto → Condivise con me* la mostra con "Il tuo sconto max 10%"
   (lo sconto più alto su una linea o opzione).

   ![Scheda Condivise con me](/img/screens/product-families-shared.png)

2. Come `admin@suppli-demo.it`: condividila anche con **Fabbrikka** (prima connettiti con Fabbrikka in
   *Partner* se non compare). Le sue linee e opzioni si aprono con i valori dell'Excel; imposta *Finestra 1 anta*
   al 5% e salva. Svuota un valore e salva → l'azienda si riapre con un messaggio, non viene salvato nulla.
3. Come `admin@fabbrikka-demo.it`: ora compare con il 10% (il 10% dell'Excel su *Finestra 2 ante* è il più alto).
   Rimuovi di nuovo la condivisione → sparisce.
4. Di nuovo come Suppli: ritirala dalla pubblicazione → sparisce per Technometal.
