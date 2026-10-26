# 0014 — Loading states for data tables

## Status

Accepted

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-10-26

## Context

List pages are server components: the page fetches its rows from the API and renders the table. Until now nothing showed while that happened — on a slow connection, opening a page or changing a filter looked like nothing was happening, and a refresh after an action (publish, edit a user) silently swapped the rows a moment later. The product families filters made this obvious: every filter change is a navigation, and the list only changed when the new render arrived.

## Decision

Every data table has the same two loading states, built from shared components in `apps/web/src/components/ui/`:

**1. First load of a page — a skeleton.** Each route that shows a table has a `loading.tsx` that renders `PageSkeleton` (title, optional tabs/filters/button, and a `TableSkeleton` with the table's column count). Next.js shows it while the page's data loads. Admin panel pages pass `tone="dark"`.

**2. Reload on a user action — the rows stay, with a progress bar and an overlay.** Filters, sort, tabs, paging, and the refresh after an action keep the current rows visible under a thin progress bar; after 150 ms (so fast reloads don't flash) the rows dim and an "Updating…" pill appears. The table is never blanked out.

- Server-rendered tables: wrap the controls and the table in `LoadingRegionProvider`, wrap the table in `LoadingRegion`, and start every navigation or `router.refresh()` that reloads it inside `useLoadingTransition().startTransition(...)`. Links that reload the same table (tabs, "Clear filters") use `PendingLink`.
- Client-fetched tables (e.g. the audit log): render `TableSkeleton` until the first response, then `LoadingRegion pending={…}` while new filters load. "Load more" keeps its own spinner under the rows, since the existing rows don't change.

## Consequences

- A new table page is not done until it has a `loading.tsx` and its reloads run through the loading region — reviews check for both.
- `useLoadingTransition()` falls back to a local transition outside a provider, so a shared component (row actions, a share button) can use it on pages with or without a table.
- The skeleton's column count is maintained by hand next to the page; if a table gains a column, its `loading.tsx` should follow.
