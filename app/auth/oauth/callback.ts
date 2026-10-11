import { cookies } from 'next/headers'
import { createOAuthClient } from '@/lib/auth/oauth-server'
import { isOAuthProvider, OAUTH_CONTEXT_COOKIE, oauthErrorCode } from '@/lib/auth/oauth'
import { mfaDestination, safeReturnPath } from '@/lib/auth/navigation'

/** OAuth is separate from signup confirmation and recovery capabilities. */
export async function completeOAuth(params: URLSearchParams): Promise<string> {
  const store = await cookies()
  const raw = store.get(OAUTH_CONTEXT_COOKIE)?.value
  store.delete(OAUTH_CONTEXT_COOKIE)
  let client: Awaited<ReturnType<typeof createOAuthClient>> | undefined
  let accepted = false
  let exchanged = false
  const failure = (code: string) => `/login?error=${code}`
  try {
    if (!raw) return failure('oauth_expired')
    const context = JSON.parse(raw)
    if (!isOAuthProvider(context.provider) || typeof context.flowId !== 'string' || !/^[a-f0-9]{32}$/.test(context.flowId)) {
      return failure('oauth_expired')
    }
    if (params.has('error') || params.has('error_code')) return failure(oauthErrorCode(params.get('error_code') ?? params.get('error') ?? undefined))
    const code = params.get('code')
    if (!code || params.has('type') || params.has('token_hash')) return failure('auth_callback_failed')
    client = await createOAuthClient()
    const { data, error } = await client.supabase.auth.exchangeCodeForSession(code, { flowId: context.flowId })
    if (error || !data.session) return failure(oauthErrorCode(error?.code))
    exchanged = true
    // Authoritative Auth response, never user_metadata or a decoded unverified JWT.
    const { data: { user }, error: userError } = await client.supabase.auth.getUser()
    if (userError || !user) return failure('auth_callback_failed')
    if (!user.email || !user.email_confirmed_at) return failure('oauth_email')
    if (!user.identities?.some(identity => identity.provider === context.provider)) return failure('oauth_identity')
    const { data: assurance, error: assuranceError } = await client.supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError || !assurance?.currentLevel || !assurance.nextLevel) return failure('oauth_mfa')
    const next = safeReturnPath(context.next)
    // AAL1 cookies are needed only to complete the existing MFA challenge.
    // Shared server guards and the dashboard proxy still reject sensitive access.
    const enrolled = user.factors?.some(factor => factor.status === 'verified')
    const needsMfa = (enrolled || assurance.nextLevel === 'aal2') && assurance.currentLevel !== 'aal2'
    if (!needsMfa) {
      const { data: profile, error: profileError } = await client.supabase.from('profiles').select('id').eq('id', user.id).single()
      if (profileError || !profile) return failure('oauth_profile')
    }
    client.commit()
    accepted = true
    return needsMfa ? mfaDestination(next) : next
  } catch {
    return failure('auth_callback_failed')
  } finally {
    // Never commit a rejected session. Revoke it if exchange already succeeded.
    if (client && exchanged && !accepted) {
      try { await client.supabase.auth.signOut({ scope: 'local' }) } catch { /* No cookies were committed. */ }
    }
  }
}
