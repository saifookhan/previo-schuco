# 0016 — A quote is a matrix of versions and alternatives

## Status

Accepted

**Date:** 2026-11-27

## Context

A quote was one chain of versions (`v1`, `v2`). Sales needs a second axis on the same offer: alternatives such as wood and aluminium, shown as `V1A1`, `V1A2`, `V2A2`.

A new version must not copy every alternative. Promoting `V1A2` creates only `V2A2`. The other cells on that version stay empty. "Not copied" and "excluded" are the same thing: no row was stored there.

The status set draft / sent / accepted / rejected does not match the work. The statuses in use are draft, invoiced and accepted. The dashboard should follow the one variant a quote marks as final, not the latest save.

Quotes and product families also need a soft archive. The list hides archived rows until the user asks for them. Only a company admin (or a super admin) may archive or restore.

## Decision

1. **Identity.** A saved cell is unique on `(quote_id, version, alternative)`. The code is `V{version}A{alternative}`. A label is optional (`Wood`, `Aluminium`). Rows that existed before this decision are alternative 1.

2. **New alternative.** Same version, next free alternative number starting at the source alternative plus one (`V1A2` → `V1A3`, skipping a number already used on that version). It copies the document the editor submits for the open cell. The new cell is a draft, has no label, and is not final. The source cell is left as it was.

3. **New version.** The target is the source version plus one, same alternative (`V1A2` → `V2A2`). Only that cell is created. If that cell already exists, the copy is refused. Saving "as a new version" from the editor uses the submitted document. The matrix copies the stored document, so unsaved editor edits are not included. Promoting does not move the final flag.

4. **Empty cells are not stored.** Opening a quote without an alternative opens the lowest alternative that exists on the requested version (the latest version when none is named). Alternative 1 of the latest version may not exist.

5. **List mirror.** The customer, status and total on the quote row are the lowest alternative of the highest version. They are rewritten after a save, a promote and a status change. The dashboard does not use this mirror.

6. **One final variant.** A partial unique index allows at most one `is_final` row per quote. A new quote, a new version and a duplicate are not marked final. Anyone with `quote.edit` may mark one. The dashboard's open quotes, pipeline, conversion and recent list use final variants of quotes that are not archived. The customer name on that list is the quote summary's customer.

7. **Status.** Draft, invoiced or accepted. Any of the three may be set except the current value. Only a draft is edited in place. Leaving a draft for invoiced or accepted still requires every catalog family on the document to have prices valid today. A quote that is already invoiced may be accepted later, including after those prices expire. `sent_at` is set when the status becomes invoiced. The application schema uses only the three values. Existing `sent` rows become invoiced and existing `rejected` rows become draft. That data move runs after the migration transaction commits: Postgres will not use a new enum value in the same transaction that adds it, and Drizzle applies every migration in one transaction.

8. **Archive.** `archived_at` on quotes and on product families. A company admin or super admin may set it; a product family must also belong to the caller's company. Archiving one family version does not archive the rest of the chain. Archived families leave the quote picker. A family already on a quote may stay. A direct link still opens an archived quote or family. Sales users see archived rows when the list checkbox is on, and cannot archive or restore.

9. **Duplicate.** One variant becomes a new quote whose only cell is `V1A1`. The stored document, total and label are copied. Anyone with `quote.edit` may do it. If the editor is dirty, the source is not saved; the user confirms that first.

10. **Pricing flag.** `isAlternative` on a line or a family inside the document still means that line or family is left out of the total. It is not a quote alternative.

## Consequences

- The quotes list can show a latest version that has no `A1`. The badges on the row are the alternatives that exist on that version.
- The matrix fills one step at a time. An empty cell can be filled only from the cell directly above it.
- [0015](./0015-quote-chat-assistant.md) still keeps a whole-quote duplicate out of the assistant. The builder copies one variant, as decided here.
- Word and Excel export, and emailing a quote from the app, stay out of scope.
- The dashboard's active-user count is still a placeholder. The quote cards are not.
