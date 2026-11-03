/** Base URL of the web app, for links in emails. */
export const appPublicUrl = (): string => process.env.APP_PUBLIC_URL ?? 'http://localhost:3000'
