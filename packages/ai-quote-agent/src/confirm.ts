import { createHmac, timingSafeEqual } from 'node:crypto'

const FIVE_MINUTES = 5 * 60 * 1000

export interface ConfirmClaims {
  quoteId: string
  revision: number
  tool: string
  args: Record<string, unknown>
}

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'confirmToken')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    )
  }
  return value
}

const sign = (secret: string, body: string): string => createHmac('sha256', secret).update(body).digest('base64url')

/** HMAC over the quote, revision, tool, and args. Valid for five minutes. */
export const issueConfirmToken = (secret: string, claims: ConfirmClaims, now = Date.now()): string => {
  const body = JSON.stringify({ ...claims, args: stable(claims.args), exp: now + FIVE_MINUTES })
  return `${Buffer.from(body).toString('base64url')}.${sign(secret, body)}`
}

export const verifyConfirmToken = (
  secret: string,
  token: string,
  expected: ConfirmClaims,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } => {
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature || !secret) return { ok: false, reason: 'missing' }
  const body = Buffer.from(encoded, 'base64url').toString('utf8')
  const expectedSignature = sign(secret, body)
  const left = Buffer.from(signature)
  const right = Buffer.from(expectedSignature)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false, reason: 'signature' }
  let parsed: { quoteId?: string; revision?: number; tool?: string; args?: unknown; exp?: number }
  try {
    parsed = JSON.parse(body) as typeof parsed
  } catch {
    return { ok: false, reason: 'payload' }
  }
  if (typeof parsed.exp !== 'number' || parsed.exp <= now) return { ok: false, reason: 'expired' }
  if (parsed.quoteId !== expected.quoteId || parsed.revision !== expected.revision || parsed.tool !== expected.tool) {
    return { ok: false, reason: 'subject' }
  }
  if (JSON.stringify(stable(parsed.args)) !== JSON.stringify(stable(expected.args))) return { ok: false, reason: 'args' }
  return { ok: true }
}
