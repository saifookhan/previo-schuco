import { Resend } from 'resend'

let client: Resend | null = null

const getClient = (): Resend | null => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }
  if (!client) {
    client = new Resend(apiKey)
  }
  return client
}

export type SendEmailResult = { outcome: 'sent' } | { outcome: 'skipped-dev-bypass' }

/**
 * Sends one transactional email via Resend. In local/dev-bypass mode (no
 * `RESEND_API_KEY` configured), this is a no-op that logs the link
 * instead — mirrors the existing dev-bypass philosophy elsewhere in the
 * codebase (see the old Cognito invite path this replaced).
 */
const sendEmail = async (input: { to: string; subject: string; html: string; devLogLabel: string; devLogLink?: string }): Promise<SendEmailResult> => {
  const resend = getClient()
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn(
      `[resend] RESEND_API_KEY not configured — ${input.devLogLabel} for ${input.to} not sent.` +
        (input.devLogLink ? ` Link: ${input.devLogLink}` : ''),
    )
    return { outcome: 'skipped-dev-bypass' }
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'PREVIO <onboarding@resend.dev>'
  const { error } = await resend.emails.send({ from, to: input.to, subject: input.subject, html: input.html })
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`)
  }
  return { outcome: 'sent' }
}

/** "You've been invited — set your password" email. */
export const sendInviteEmail = (input: { to: string; name: string | null; setPasswordUrl: string }): Promise<SendEmailResult> =>
  sendEmail({
    to: input.to,
    subject: "You've been invited to PREVIO",
    devLogLabel: 'invite email',
    devLogLink: input.setPasswordUrl,
    html: `
      <p>Hi ${input.name ?? input.to},</p>
      <p>You've been invited to PREVIO. Click below to set your password and activate your account:</p>
      <p><a href="${input.setPasswordUrl}">${input.setPasswordUrl}</a></p>
      <p>This link expires in 7 days.</p>
    `,
  })

/** "Reset your password" email. */
export const sendPasswordResetEmail = (input: { to: string; resetUrl: string }): Promise<SendEmailResult> =>
  sendEmail({
    to: input.to,
    subject: 'Reset your PREVIO password',
    devLogLabel: 'password reset email',
    devLogLink: input.resetUrl,
    html: `
      <p>We received a request to reset your PREVIO password.</p>
      <p><a href="${input.resetUrl}">${input.resetUrl}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
  })
