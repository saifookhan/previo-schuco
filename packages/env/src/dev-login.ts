/**
 * Whether the password-less seeded-user shortcut may run.
 *
 * The docs call the switch `ALLOW_DEV_LOGIN`. The login form used to read
 * only `NEXT_PUBLIC_ALLOW_DEV_LOGIN`, which Next.js inlines when the client
 * bundle is built, so a deployment can hide the form while the route stays
 * live (Compose's runtime default, or any non-production `NODE_ENV`).
 * This reads the environment at call time — dynamic access, so the value
 * is not frozen at build — and treats `NODE_ENV` as irrelevant.
 *
 * When `ALLOW_DEV_LOGIN` is set, it is the only switch (`true` on,
 * anything else off). When it is unset, `NEXT_PUBLIC_ALLOW_DEV_LOGIN` is
 * the same switch, which is what local `pnpm dev` sets in `.env.local`.
 */
export const isDevLoginAllowed = (): boolean => {
  const serverFlag = process.env['ALLOW_DEV_LOGIN']
  if (typeof serverFlag === 'string' && serverFlag !== '') {
    return serverFlag === 'true'
  }
  return process.env['NEXT_PUBLIC_ALLOW_DEV_LOGIN'] === 'true'
}
