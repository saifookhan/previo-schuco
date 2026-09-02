# @schuco/calculation

Pure quote pricing engine for the PREVIO platform. No HTTP, no database — only deterministic pricing logic.

## Purpose

Takes a product configuration (type, dimensions, glazing, security, color, quantity) and returns a priced quote with line items, VAT, and feasibility checks against Schüco technical limits.

Used by `apps/api` today via in-process import. May be wrapped by `apps/calculation-service` (Phase 3) when independent scaling is needed.

## Exports

| Export | Description |
|--------|-------------|
| `calculateQuote(config)` | Area-based pricing with glazing multipliers and surcharges |
| `validateConfiguration(config)` | Returns feasibility notes (dimension/quantity limits) |
| `generateQuoteReference()` | Human-readable reference e.g. `SCH-2026-12345` |
| `QuoteConfiguration`, `QuoteResult`, … | Shared TypeScript types |

## Usage

```typescript
import { calculateQuote } from '@schuco/calculation'

const result = calculateQuote({
  productType: 'window',
  widthMm: 1200,
  heightMm: 1400,
  glazing: 'triple',
  security: 'enhanced',
  color: 'anthracite',
  quantity: 2,
})
```

## Dependencies

None (TypeScript only). Request/response validation lives in `@schuco/contracts`; this package holds the pricing math.

## Scripts

```bash
pnpm --filter @schuco/calculation build
```
