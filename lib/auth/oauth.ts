export const OAUTH_PROVIDERS = ['google', 'github'] as const
export type OAuthProvider = typeof OAUTH_PROVIDERS[number]
export const OAUTH_CONTEXT_COOKIE = 'cms-oauth-context'
export const OAUTH_CALLBACK_PATH = '/auth/callback?flow=oauth'

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === 'google' || value === 'github'
}

export const AUTH_ERRORS = {
  auth_callback_failed: 'We could not finish signing you in. Try again in the browser where you started, or use email and password.',
  oauth_cancelled: 'Sign-in was cancelled or permission was denied. Try again and allow access to your email, or use another sign-in method.',
  oauth_unavailable: 'This sign-in provider is unavailable. Try again later or use email and password.',
  oauth_email: 'A verified email address is required. Verify an email with your provider, allow email access, and try again.',
  oauth_expired: 'This sign-in attempt expired or another attempt replaced it. Start again in this browser.',
  oauth_identity: 'This identity could not be used. Sign in with your existing method or contact an administrator. Accounts are not merged by this application.',
  oauth_mfa: 'We could not check two-factor authentication. Please start sign-in again.',
  oauth_profile: 'Your account profile could not be loaded. Try again or contact an administrator.',
} as const

export function authErrorMessage(value: unknown): string | null {
  return typeof value === 'string' && Object.hasOwn(AUTH_ERRORS, value)
    ? AUTH_ERRORS[value as keyof typeof AUTH_ERRORS] : null
}

/** Never echo provider descriptions, codes, tokens or arbitrary query strings. */
export function oauthErrorCode(code: string | undefined): keyof typeof AUTH_ERRORS {
  if (code === 'access_denied') return 'oauth_cancelled'
  if (['email_not_found', 'email_not_confirmed', 'provider_email_needs_verification'].includes(code ?? '')) return 'oauth_email'
  if (['identity_already_exists', 'email_exists', 'manual_linking_disabled'].includes(code ?? '')) return 'oauth_identity'
  if (['provider_disabled', 'oauth_provider_not_supported'].includes(code ?? '')) return 'oauth_unavailable'
  return 'auth_callback_failed'
}
