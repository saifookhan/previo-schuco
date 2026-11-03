import nodemailer from 'nodemailer'
import { Resend } from 'resend'

import { logger } from './logger'

export type SendEmailResult = { outcome: 'sent-smtp' | 'sent-resend' } | { outcome: 'skipped-dev-bypass' }

let resendClient: Resend | null = null
const getResendClient = (): Resend | null => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

let smtpTransport: nodemailer.Transporter | null = null
const getSmtpTransport = (): nodemailer.Transporter | null => {
  const host = process.env.SMTP_HOST
  if (!host) {
    return null
  }
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
      // Mailpit (local docker-compose service) accepts unauthenticated
      // mail with no TLS — this transport is only ever pointed at it or
      // an equivalent local/trusted catcher, never a real internet MTA.
      ignoreTLS: true,
    })
  }
  return smtpTransport
}

/**
 * Sends one transactional email — three tiers, in order:
 * 1. **Resend** (`RESEND_API_KEY` set) — a deliberately-configured real
 *    provider always wins, even if `SMTP_HOST` also happens to be set
 *    (e.g. the self-host Compose profile's `mailpit` default).
 * 2. **SMTP** (`SMTP_HOST` set, no `RESEND_API_KEY`) — local dev / the
 *    default docker-compose's `mailpit` service: a real SMTP catcher
 *    with a web UI (http://localhost:8025) to actually see what got
 *    sent, not just a logged link.
 * 3. **Dev-bypass** (neither configured) — logs the link instead of
 *    sending, so nothing crashes if you skip email setup entirely.
 */
const sendEmail = async (input: { to: string; subject: string; html: string; devLogLabel: string; devLogLink?: string }): Promise<SendEmailResult> => {
  const from = process.env.RESEND_FROM_EMAIL ?? 'PREVIO <onboarding@resend.dev>'

  const resend = getResendClient()
  if (resend) {
    const { error } = await resend.emails.send({ from, to: input.to, subject: input.subject, html: input.html })
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`)
    }
    return { outcome: 'sent-resend' }
  }

  const smtp = getSmtpTransport()
  if (smtp) {
    await smtp.sendMail({ from, to: input.to, subject: input.subject, html: input.html })
    return { outcome: 'sent-smtp' }
  }

  // Dev-only fallback: the link is logged on purpose so a local developer can still follow it.
  logger.warn(
    { to: input.to, email: input.devLogLabel, link: input.devLogLink },
    'email not sent: neither RESEND_API_KEY nor SMTP_HOST configured',
  )
  return { outcome: 'skipped-dev-bypass' }
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

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** "<Company> wants to connect with your company" email, to the admins and managers of the company that was asked. */
export const sendPartnerRequestEmail = (input: { to: string; fromCompanyName: string; partnersUrl: string }): Promise<SendEmailResult> =>
  sendEmail({
    to: input.to,
    subject: `${input.fromCompanyName} wants to connect with your company on PREVIO`,
    devLogLabel: 'partner request email',
    devLogLink: input.partnersUrl,
    html: `
      <p>${escapeHtml(input.fromCompanyName)} wants to connect with your company on PREVIO.</p>
      <p>Once you accept, you can share product families with each other.</p>
      <p><a href="${input.partnersUrl}">Open Partners to accept or refuse</a></p>
    `,
  })
