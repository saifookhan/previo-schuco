/**
 * The Postgres error code of a failed query, if any. Drizzle wraps the driver's
 * error (the code ends up on `cause`), while a raw driver error carries it
 * directly, so both shapes are checked.
 * @param error - Anything thrown by a query
 */
export const pgErrorCode = (error: unknown): string | undefined => {
  const codeOf = (value: unknown): string | undefined =>
    typeof value === 'object' && value !== null && typeof (value as { code?: unknown }).code === 'string'
      ? (value as { code: string }).code
      : undefined
  return codeOf(error) ?? codeOf((error as { cause?: unknown } | null)?.cause)
}

export const PG_UNIQUE_VIOLATION = '23505'
export const PG_FOREIGN_KEY_VIOLATION = '23503'
