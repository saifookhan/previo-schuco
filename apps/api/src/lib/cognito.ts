import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose'

export interface CognitoConfig {
  region: string
  userPoolId: string
}

export interface VerifiedToken extends JWTPayload {
  sub: string
  email?: string
  name?: string
  token_use?: string
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

/**
 * Load Cognito config from environment variables.
 */
export const getCognitoConfig = (): CognitoConfig | null => {
  const region = process.env.COGNITO_REGION
  const userPoolId = process.env.COGNITO_USER_POOL_ID

  if (!region || !userPoolId) {
    return null
  }

  return { region, userPoolId }
}

/**
 * Verify a Cognito-issued JWT access or id token.
 * @param token - Bearer token string
 */
export const verifyCognitoToken = async (token: string): Promise<VerifiedToken> => {
  const config = getCognitoConfig()
  if (!config) {
    throw new Error('Cognito is not configured')
  }

  if (!jwks) {
    const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
  }

  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`
  const { payload } = await jwtVerify(token, jwks, { issuer })

  if (!payload.sub) {
    throw new Error('Invalid token: missing sub')
  }

  return payload as VerifiedToken
}

/**
 * Parse Authorization header Bearer token.
 * @param header - Authorization header value
 */
export const parseBearerToken = (header: string | undefined): string | null => {
  if (!header?.startsWith('Bearer ')) {
    return null
  }

  return header.slice(7).trim() || null
}
