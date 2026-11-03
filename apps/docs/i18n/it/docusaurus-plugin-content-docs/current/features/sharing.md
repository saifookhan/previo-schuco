---
sidebar_position: 2
title: Condivisione delle famiglie
---

# Condivisione delle famiglie

Un'azienda decide chi può usare ciascuna delle sue famiglie di prodotto, e con quale sconto predefinito.

**Dove:** elenco famiglie o pagina della famiglia → **Condividi** · richiede `catalog.share`. Puoi condividere
solo con aziende connesse nella pagina [Partner](./partners.md); la ricerca della finestra elenca solo quelle.

![Finestra di condivisione](/img/screens/share-dialog.png)

## Regole

- Una famiglia deve essere **pubblicata** prima di poter essere condivisa.
- Ogni condivisione è *"l'azienda A condivide la famiglia F con l'azienda B con sconto d"*. Lo sconto è il
  valore iniziale delle posizioni di preventivo di B — si può comunque cambiare per posizione.
  `0%` significa nessuno sconto specifico: vale lo sconto a catalogo della linea.
- Solo il **proprietario**, o un'azienda con cui la famiglia è stata condivisa, può condividerla a sua volta.
  Si crea così una catena, es. produttore → rivenditore → cliente.
- **Ritirare dalla pubblicazione** la famiglia, o rimuovere una condivisione a monte, la nasconde subito
  a tutti più in basso nella catena.

## Come testare

La famiglia demo *Demo Window W70* è già condivisa con Technometal al 10%.

1. Come `admin@technometal-demo.it`: *Famiglie di prodotto → Condivise con me* la mostra con "Il tuo sconto 10%".

   ![Scheda Condivise con me](/img/screens/product-families-shared.png)

2. Come `admin@suppli-demo.it`: condividila anche con **Fabbrikka** al 5% (prima connettiti con Fabbrikka in
   *Partner* se non compare).
3. Come `admin@fabbrikka-demo.it`: ora compare con il 5%. Rimuovi di nuovo la condivisione → sparisce.
4. Di nuovo come Suppli: ritirala dalla pubblicazione → sparisce per Technometal.
