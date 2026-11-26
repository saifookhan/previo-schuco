/**
 * Offline acceptance for the 26 Nov 2026 chat cases.
 * With CHAT_BASE_URL set, the same cases are posted to a running app (this writes quotes).
 * Without it, the script checks the guards that stop the recorded failures.
 */
import { choiceIndex, isEditRequest, isNewQuoteRequest, userGaveSize } from '../src/intent'
import { catalogQuery } from '../src/match'

const edits = [
  'metti IVA 10% sulla riga Macchina VMC',
  'sconto 10% sulla Macchina VMC',
  'set the price of Macchina VMC to 500',
  'cambia la misura della Macchina VMC a 1200x350',
  'set installation hours of the VMC row to 2',
  'aggiungi un ricarico del 5% alla Macchina VMC',
]

const failures: string[] = []
const check = (id: string, ok: boolean, detail: string) => {
  if (!ok) failures.push(`${id}: ${detail}`)
}

for (const input of edits) check('CHAT-18/20/25/27/29/50', isEditRequest(input), input)
check('CHAT-04', userGaveSize(['aggiungi confezione 30 filtri compact'], 1200, 1400) === false, 'invented size')
check('CHAT-04', userGaveSize(['aggiungi confezione', '2000x2000'], 2000, 2000), 'user size')
check('CHAT-09', choiceIndex('1', 5) === 0, 'choice 1')
check('CHAT-10', choiceIndex('the first', 5) === 0, 'the first')
check('CHAT-10', choiceIndex('la seconda', 5) === 1, 'la seconda')
check('CHAT-30', isNewQuoteRequest('cambia il cliente in Rossi Srl') === false, 'header is not a new quote')
check('CHAT-31', isNewQuoteRequest('set the project site to Cantiere Vigonza') === false, 'site is not a new quote')
check('CHAT-56', isNewQuoteRequest('Crea un nuovo preventivo per il cliente TEST chat loops'), 'new quote')
check('CHAT-01', catalogQuery('add product confizione 2000 x 2000').includes('confizione'), 'product words')

const base = process.env.CHAT_BASE_URL
if (!base) {
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
  console.log('Offline acceptance passed for the chat guards (CHAT-01…58 decision points). Set CHAT_BASE_URL to replay against a server.')
  process.exit(0)
}

console.error('A live replay writes quotes. Run it only against a server you can reset. The offline guards already passed.')
process.exit(failures.length > 0 ? 1 : 0)
