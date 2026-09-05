import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider'

import { getCognitoConfig } from './cognito'

let client: CognitoIdentityProviderClient | null = null

const getClient = (region: string): CognitoIdentityProviderClient => {
  if (!client) {
    client = new CognitoIdentityProviderClient({ region })
  }
  return client
}

export type CreateCognitoInviteResult =
  | { outcome: 'created' | 'resent' }
  | { outcome: 'skipped-dev-bypass' }

/**
 * Create (or resend an invite for) a Cognito user, for the admin-invite
 * flow (ADR 0004). Cognito auto-generates and emails a temporary password
 * — no custom SES/email setup needed. Cognito stays identity-only (ADR
 * 0002): no custom attributes are set here.
 *
 * Idempotent by construction: if the Cognito identity already exists
 * (e.g. a retry after the DB write succeeded but a previous attempt's
 * response was lost), resends the invite instead of erroring.
 *
 * In local/dev-bypass mode (no Cognito configured), this is a no-op —
 * the caller creates the DB row only and logs that no real invite email
 * was sent, mirroring the existing dev-bypass philosophy elsewhere in
 * the codebase.
 * @param email - Invitee's email (used as the Cognito username)
 */
export const createCognitoInvite = async (email: string): Promise<CreateCognitoInviteResult> => {
  const config = getCognitoConfig()
  if (!config) {
    return { outcome: 'skipped-dev-bypass' }
  }

  const cognito = getClient(config.region)

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: config.userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    )
    return { outcome: 'created' }
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: config.userPoolId,
          Username: email,
          MessageAction: 'RESEND',
        }),
      )
      return { outcome: 'resent' }
    }
    throw error
  }
}
