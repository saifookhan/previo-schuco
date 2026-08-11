/**
 * Cognito and app auth environment configuration.
 */
export const authConfig = {
  region: process.env.NEXT_PUBLIC_COGNITO_REGION ?? process.env.COGNITO_REGION ?? 'eu-central-1',
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? process.env.COGNITO_CLIENT_ID ?? '',
  domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  authSecret: process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me',
}

/** Whether Cognito OIDC is fully configured. */
export const isCognitoConfigured = (): boolean =>
  Boolean(authConfig.userPoolId && authConfig.clientId && authConfig.domain)

/** OAuth redirect URI registered in Cognito app client. */
export const getRedirectUri = (): string => `${authConfig.appUrl}/api/auth/callback`

/** Cognito hosted UI base URL. */
export const getCognitoBaseUrl = (): string =>
  `https://${authConfig.domain}.auth.${authConfig.region}.amazoncognito.com`
