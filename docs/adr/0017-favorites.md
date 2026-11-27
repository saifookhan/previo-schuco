# 0017 — Favorites are separate from the final offer

## Status

Accepted

**Date:** 2026-11-27

## Context

[0016](./0016-quote-variants.md) lets a quote mark exactly one variant as final. The dashboard uses that variant. Sales also wants to mark variants, and product-family versions, that are worth coming back to. That mark is not the chosen offer, and there can be more than one.

## Decision

1. **Quote variant.** `is_favorite` on `quote_versions`. Any number of a quote's variants can be favorites. Toggling one does not change the others, and does not change which variant is final. Anyone with `quote.edit` may toggle it. A new version, a new alternative and a duplicate start unfavorited. The quotes list can be narrowed to quotes that have at least one favorite variant.

2. **Product-family version.** `product_family_favorites` is one row per company and family version. Each version is its own family, so marking V2 does not mark V1. A company may favorite a version it can see, including one shared with it; that does not change the owner's favorites. Anyone with `catalog.edit` may toggle it. The product-families list can be narrowed to those versions.

3. **The final offer stays the dashboard.** Open quotes, pipeline, conversion and the recent list still use the variant marked final. A favorite is not a substitute for it.

## Consequences

- A quote variant can be both final and a favorite. The amber star is the final offer. The blue star is the favorite.
- A newly uploaded family version is not a favorite until someone marks it.
