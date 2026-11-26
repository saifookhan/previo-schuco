# @schuco/ai-quote-agent

The model loop for the PREVIO quote assistant. No HTTP server, no database, no Drizzle. `apps/api` executes the tools as the signed-in user; this package only decides what to say and which tool to call.

## What it does

One turn is a short loop:

1. Send the system prompt, the browser's messages, and the tool definitions to Cloudflare Workers AI.
2. If the model calls a tool, hand the name and arguments to the caller and append the tool result.
3. Repeat until the model replies in text, or until eight tool rounds.
4. Stream that text in small pieces, then any suggestion chips from the last tool result.

The default model is `@cf/mistralai/mistral-small-3.1-24b-instruct`. Set `LLM_MODEL` in the API process to use another Workers AI model. `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` stay in the API process. This package receives them as arguments and does not read the environment.

The conversation is not stored here. The browser keeps it until the panel closes.

## Tools

The model may call these. It never receives a company id or a user id. Prices and catalog ids come back from the API, not from the model.

| Tool | Effect |
|------|--------|
| `catalog_summary` | How many current families and product lines there are, and how many are draft or expired. |
| `search_catalog` | Families and product lines matching the user's words, including a partial or slightly misspelled name. Drafts and expired price lists are omitted unless the user asked to see them. At most eight rows, with version and validity. |
| `describe_family` | Lines, option groups, and matrix bounds of one family. No matrix cells. |
| `create_quote` | A new draft for a customer. |
| `add_product` | A new catalog row. Width and height are required. Several matching lines are returned as choices and nothing is added. |
| `duplicate_line` | A copy of one row, with the next position number. "The first one" is Pos 1. A size written after the name is ignored. |
| `duplicate_family` | A copy of one family block and its rows. |
| `move_line` | Move a row up or down inside its family. "Make the first product the second" moves Pos 1 down. |
| `add_activity` | One closing activity in Included or Not included. The same description is not added twice; a later call moves it. |
| `update_line` | Quantity, width, height, extra %, discount, €/pc, VAT (`22%`, `10%`, `4%`, `Es.`), and installation hours. `lineName` may be the Pos, such as `pos 1`. Net € and the total are not inputs. |

## Exports

| Export | Description |
|--------|-------------|
| `runQuoteAgent` | The tool loop. The caller supplies `complete`, `execute`, and `emit`. |
| `completeWithCloudflare` | One Workers AI chat completion, OpenAI-compatible tools included. |
| `QUOTE_TOOLS` | Tool name, description, and JSON schema. |
| `SYSTEM_PROMPT` | Instructions: reply in the user's language, never invent a price, ask when names collide. |
| `nameMatches`, `foldName`, `expandQuery` | Accent-insensitive name matching, plus a few synonyms such as insect screen / zanzariera. |
| `AgentEvent`, `ModelMessage`, `Suggestion`, … | Types for the stream and the tool results. |

## Usage

```typescript
import { completeWithCloudflare, runQuoteAgent } from '@schuco/ai-quote-agent'

await runQuoteAgent({
  messages: [{ role: 'user', content: 'Nuovo preventivo per Studio Rossi' }],
  complete: (messages) => completeWithCloudflare(messages, { accountId, apiToken }),
  execute: async (name, args) => {
    // Run the tool in apps/api, under the caller's RLS, and return a short result.
    return { content: 'Created quote …' }
  },
  emit: async (event) => {
    // status | text | suggestions | error — the API writes these as server-sent events.
  },
})
```

`apps/api` wires this in `src/routes/quote-chat.ts` and `src/services/quote-chat-service.ts`. The panel is `apps/web/src/components/quote-chat/quote-chat.tsx`, on the quotes list and the quote editor, for users with `quote.edit`.

## Scripts

```bash
pnpm --filter @schuco/ai-quote-agent test
pnpm --filter @schuco/ai-quote-agent build
```
