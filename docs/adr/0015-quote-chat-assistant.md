# 0015 — Quote assistant is a library, not a stored chat

## Status

Accepted. Copying one variant into a new quote is [0016](./0016-quote-variants.md); this decision still keeps that action out of the assistant.

**Date:** 2026-11-25

## Context

Sales users want to create and edit a quote by conversation: search the catalog, add a family as a new row, duplicate a row or a family, move a row, change quantity, width, height, extra markup, unit price, discount, VAT, and installation hours, including by Pos such as “pos 1”, add a closing activity to Included or Not included, and add a text module. Net and total stay calculated.

The demo runs on the existing Schüco catalog in PostgreSQL. Near-duplicate family names are the real problem, not the number of rows. Drafts and expired price lists must stay out of the quote unless the user asks to see them, and even then they are not added. Prices must come from the existing calculation, never from the model.

Chat transcripts are not a product requirement for this demo. Customer data in the demo is demo data; a later production pin to an EU model is out of scope here.

## Decision

The model loop lives in `packages/ai-quote-agent`. It owns the prompt, the tool definitions, and the call to Cloudflare Workers AI (`@cf/mistralai/mistral-small-3.1-24b-instruct` by default). It does not import the API, Drizzle, or Postgres.

`apps/api` executes the tools as the signed-in user, under the same RLS and quote services as the builder (`createQuote`, `saveQuoteVersion`, `priceQuoteLines`). One mutating tool saves through those services, so the existing quote audit remains the audit. The route `POST /api/quote-chat` requires `quote.edit` and streams server-sent events. The conversation is not written to a table.

The panel is on `/app/quotes` and `/app/quotes/[id]` only. The browser keeps the messages until the panel closes. After a save, the editor reloads the quote so its local document matches the saved one.

Catalog search is SQL plus accent-insensitive name matching. A query that matches more than one current family or line adds nothing and returns those rows, with version and price validity, as suggestion chips. `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` configure the model. Without them the route answers that chat is not configured.

## Consequences

- Refreshing the page clears the conversation. The quote itself remains.
- Workers AI inference is not region-pinned. That is accepted for this demo.
- Whole-quote duplicate, a server PDF, and confirm-before-delete stay out of this slice.
- A stored transcript, or an EU-pinned model, is a later change and needs its own decision.
