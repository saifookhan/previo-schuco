const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether `value` is a UUID — check before handing an id to a `uuid` column, or Postgres answers with a 500-causing cast error. */
export const isUuid = (value: string): boolean => UUID_RE.test(value)
