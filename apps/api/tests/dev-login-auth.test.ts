process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`
process.env.AUTH_SECRET ??= 'dev-login-auth-test-secret'

import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { companies, roles, users, withSystemTransaction } from '@schuco/db'

import { getDb } from '../src/lib/db'
import { requireAuth, type AuthVariables } from '../src/middleware/auth'

const DEV_SUB = 'seed-dev-login-auth-test'
const ORIGINAL_FLAG = process.env.ALLOW_DEV_LOGIN
let companyId = ''
let userId = ''

const app = new Hono<{ Variables: AuthVariables }>()
app.get('/me', requireAuth, (c) => c.json({ email: c.get('user').email }))

const sign = (claims: Record<string, unknown>) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET))

const callWith = (headers: Record<string, string>) => app.request('/me', { headers })

beforeAll(async () => {
  await withSystemTransaction(getDb(), async (tx) => {
    await tx
      .insert(roles)
      .values({ id: 'user', name: 'User', description: 'test role' })
      .onConflictDoNothing({ target: roles.id })
    const [company] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'Dev Login Auth Test', vatNumber: 'DEV-LOGIN-AUTH' })
      .returning({ id: companies.id })
    companyId = company.id
    const [user] = await tx
      .insert(users)
      .values({ email: 'dev-login-auth@example.com', companyId, roleId: 'user', status: 'active', cognitoSub: DEV_SUB })
      .returning({ id: users.id })
    userId = user.id
  })
})

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.ALLOW_DEV_LOGIN
  else process.env.ALLOW_DEV_LOGIN = ORIGINAL_FLAG
})

afterAll(async () => {
  await withSystemTransaction(getDb(), async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, [companyId]))
    await tx.delete(companies).where(inArray(companies.id, [companyId]))
  })
})

describe('requireAuth and the demo login', () => {
  it('ignores a bare X-Dev-User-Sub header, even with the shortcut on', async () => {
    process.env.ALLOW_DEV_LOGIN = 'true'
    const response = await callWith({ 'X-Dev-User-Sub': DEV_SUB })
    expect(response.status).toBe(401)
  })

  it('accepts a signed demo-login session while ALLOW_DEV_LOGIN=true', async () => {
    process.env.ALLOW_DEV_LOGIN = 'true'
    const token = await sign({ sub: DEV_SUB, isDevLogin: true })
    const response = await callWith({ Authorization: `Bearer ${token}` })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ email: 'dev-login-auth@example.com' })
  })

  it('refuses the same session once the shortcut is off', async () => {
    process.env.ALLOW_DEV_LOGIN = 'false'
    const token = await sign({ sub: DEV_SUB, isDevLogin: true })
    const response = await callWith({ Authorization: `Bearer ${token}` })
    expect(response.status).toBe(401)
  })

  it('refuses a demo-login session not signed with AUTH_SECRET', async () => {
    process.env.ALLOW_DEV_LOGIN = 'true'
    const forged = await new SignJWT({ sub: DEV_SUB, isDevLogin: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('not-the-secret'))
    const response = await callWith({ Authorization: `Bearer ${forged}` })
    expect(response.status).toBe(401)
  })

  it('still resolves a normal session by user id, whatever the flag', async () => {
    process.env.ALLOW_DEV_LOGIN = 'false'
    const token = await sign({ sub: userId, isDevLogin: false })
    const response = await callWith({ Authorization: `Bearer ${token}` })
    expect(response.status).toBe(200)
  })
})
