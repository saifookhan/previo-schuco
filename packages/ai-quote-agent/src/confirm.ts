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

/** Signature and expiry only. The caller decides whether the args still name the same row. */
export const readConfirmToken = (
  secret: string,
  token: string,
  now = Date.now(),
): { ok: true; exp: number; claims: ConfirmClaims } | { ok: false; reason: string } => {
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
  if (!parsed.quoteId || typeof parsed.revision !== 'number' || !parsed.tool || !parsed.args || typeof parsed.args !== 'object') {
    return { ok: false, reason: 'payload' }
  }
  return {
    ok: true,
    exp: parsed.exp,
    claims: { quoteId: parsed.quoteId, revision: parsed.revision, tool: parsed.tool, args: parsed.args as Record<string, unknown> },
  }
}

const spentTokens = new Map<string, number>()

/** A token that already confirmed an action. A second click must not apply it or mint another. */
export const markConfirmTokenSpent = (token: string, exp: number): void => {
  spentTokens.set(token, exp)
}

export const isConfirmTokenSpent = (token: string, now = Date.now()): boolean => {
  const exp = spentTokens.get(token)
  if (exp === undefined) return false
  if (exp <= now) {
    spentTokens.delete(token)
    return false
  }
  return true
}

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(stable(left)) === JSON.stringify(stable(right))

/** Exact args, or the same identity fields when the chip added a family id. Revision is not compared. */
const argsAllow = (tool: string, signed: Record<string, unknown>, requested: Record<string, unknown>): boolean => {
  if (sameValue(signed, requested)) return true
  const keys = Object.keys(signed)
  if (keys.length === 0 || !keys.every((key) => sameValue(signed[key], requested[key]))) return false
  if (tool === 'remove_line') return typeof signed.lineName === 'string'
  if (tool === 'remove_family' || tool === 'switch_family_version') return typeof signed.familyName === 'string'
  if (tool === 'set_quote_status') return typeof signed.status === 'string'
  if (tool === 'restore_revision') return typeof signed.revisionNumber === 'number'
  if (tool === 'update_line' || tool === 'update_lines') return true
  if (tool === 'remove_activity') return typeof signed.description === 'string'
  if (tool === 'remove_text_module') return signed.place !== undefined && signed.index !== undefined
  return false
}

/**
 * Any gated tool: signature and expiry must hold, the quote and tool must match, and the
 * signed fields must still be the action. A moved revision does not invalidate the click.
 */
export const confirmTokenAllows = (
  secret: string,
  token: string,
  expected: { quoteId: string; tool: string; args: Record<string, unknown> },
  now = Date.now(),
): { ok: true; exp: number } | { ok: false; reason: string } => {
  if (isConfirmTokenSpent(token, now)) return { ok: false, reason: 'spent' }
  const read = readConfirmToken(secret, token, now)
  if (!read.ok) return read
  if (read.claims.quoteId !== expected.quoteId || read.claims.tool !== expected.tool) return { ok: false, reason: 'subject' }
  if (!argsAllow(expected.tool, read.claims.args, expected.args)) return { ok: false, reason: 'args' }
  return { ok: true, exp: read.exp }
}

/** Proceed once, reject a bad or repeated token, or ask when the click has no token yet. */
export const decideConfirm = (input: {
  secret: string
  token: string | undefined
  expected: { quoteId: string; tool: string; args: Record<string, unknown> }
  now?: number
}): 'proceed' | 'invalid' | 'ask' => {
  if (!input.secret) return 'invalid'
  if (!input.token) return 'ask'
  const allowed = confirmTokenAllows(input.secret, input.token, input.expected, input.now)
  if (!allowed.ok) return 'invalid'
  markConfirmTokenSpent(input.token, allowed.exp)
  return 'proceed'
}

/** A remove token still deletes this line when the chip also carries familyName, or the revision moved. */
export const removeTokenAllows = (
  secret: string,
  token: string,
  expected: { quoteId: string; lineName: string },
  now = Date.now(),
): boolean => {
  const read = readConfirmToken(secret, token, now)
  if (!read.ok || read.claims.quoteId !== expected.quoteId || read.claims.tool !== 'remove_line') return false
  return read.claims.args.lineName === expected.lineName
}
