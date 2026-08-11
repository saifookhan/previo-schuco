import { createHash, randomBytes } from 'node:crypto'

import { authConfig, getCognitoBaseUrl, getRedirectUri } from './config'

/**
 * Generate PKCE verifier and S256 challenge.
 */
export const createPkcePair = (): { verifier: string; challenge: string } => {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/**
 * Build Cognito hosted UI authorization URL.
 * @param state - CSRF state token
 * @param codeChallenge - PKCE S256 challenge
 */
export const buildAuthorizeUrl = (state: string, codeChallenge: string): string => {
  const params = new URLSearchParams({
    client_id: authConfig.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: getRedirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return `${getCognitoBaseUrl()}/oauth2/authorize?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  id_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

/**
 * Exchange authorization code for tokens at Cognito token endpoint.
 * @param code - Authorization code from callback
 * @param codeVerifier - PKCE verifier
 */
export const exchangeCodeForTokens = async (
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: authConfig.clientId,
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: codeVerifier,
  })

  const response = await fetch(`${getCognitoBaseUrl()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  return response.json() as Promise<TokenResponse>
}

/**
 * Decode JWT payload without verification (id_token fields for session bootstrap).
 * @param token - JWT string
 */
export const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const part = token.split('.')[1]
  if (!part) {
    throw new Error('Invalid JWT')
  }
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
}
