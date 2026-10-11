import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeReturnPath } from '@/lib/auth/navigation'
import { authErrorMessage, OAUTH_CONTEXT_COOKIE } from '@/lib/auth/oauth'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), remove: vi.fn(), commit: vi.fn(), user: vi.fn(), start: vi.fn(), exchange: vi.fn(),
  assurance: vi.fn(), profile: vi.fn(), signOut: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set, delete: mocks.remove }) }))
vi.mock('@/lib/auth/oauth-server', () => ({ createOAuthClient: async () => ({
  commit: mocks.commit,
  supabase: {
    auth: { getUser: mocks.user, signInWithOAuth: mocks.start, exchangeCodeForSession: mocks.exchange,
      signOut: mocks.signOut, mfa: { getAuthenticatorAssuranceLevel: mocks.assurance } },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
  },
}) }))
import { startOAuth } from '@/app/auth/oauth/actions'
import { completeOAuth } from '@/app/auth/oauth/callback'

const flowId = 'a'.repeat(32)
const user = { id: 'existing-or-new-id', email: 'private@example.com', email_confirmed_at: '2026-10-11',
  identities: [{ provider: 'github' }, { provider: 'google' }] }
const callback = (query = 'code=valid') => completeOAuth(new URLSearchParams(query))
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ external: { google: true, github: true } })))
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.example.com')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  mocks.get.mockReturnValue({ value: JSON.stringify({ provider: 'github', next: '/dashboard/posts', flowId }) })
  mocks.user.mockResolvedValue({ data: { user }, error: null })
  mocks.exchange.mockResolvedValue({ data: { session: { user } }, error: null })
  mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
  mocks.profile.mockResolvedValue({ data: { id: user.id }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
  mocks.start.mockResolvedValue({ data: { flowId, url: `https://test.supabase.co/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent('https://cms.example.com/auth/callback?flow=oauth')}` }, error: null })
})

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('safe authentication navigation', () => {
  it.each(['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/%2f%2fevil.invalid', '/dashboard/../../auth/signout', '/dashboard/%5cevil', '/dashboard/%252f', '/dashboard\n', '/auth/callback', '/api/posts', '/reset-password', '/dashboard/%zz'])('rejects %s', path => {
    expect(safeReturnPath(path)).toBe('/dashboard')
  })
  it('keeps internal paths, query and fragment', () => {
    expect(safeReturnPath('/dashboard/posts?tab=drafts#new')).toBe('/dashboard/posts?tab=drafts#new')
  })
  it('never displays arbitrary provider text', () => {
    expect(authErrorMessage('<script>secret</script>')).toBeNull()
    expect(authErrorMessage('oauth_cancelled')).toContain('cancelled')
  })
})

describe('OAuth initiation', () => {
  it.each(['google', 'github'])('starts %s using the trusted callback and a private verifier context', async provider => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError' } })
    const result = await startOAuth(provider, '//evil.invalid')
    expect(mocks.start).toHaveBeenCalledWith({ provider, options: {
      redirectTo: 'https://cms.example.com/auth/callback?flow=oauth',
      scopes: provider === 'github' ? 'user:email' : 'openid email profile', skipBrowserRedirect: true,
    } })
    expect(new URL(result.url!).searchParams.get('redirect_to')).toBe('https://cms.example.com/auth/callback?flow=oauth')
    expect(mocks.set).toHaveBeenCalledWith(OAUTH_CONTEXT_COOKIE, JSON.stringify({ provider, next: '/dashboard', flowId }), expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 }))
  })
  it('reports a disabled provider before leaving the application', async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null })
    vi.mocked(fetch).mockResolvedValue(Response.json({ external: { google: false } }))
    expect((await startOAuth('google', '/dashboard')).error).toContain('unavailable')
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('does not initiate linking from an authenticated session', async () => {
    expect((await startOAuth('google', '/dashboard')).error).toContain('already signed in')
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it.each(['facebook', '', null])('rejects unsupported provider %s', async provider => {
    expect((await startOAuth(provider, '/dashboard')).error).toBeTruthy()
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('handles outages without exposing details or committing cookies', async () => {
    mocks.user.mockRejectedValue(new Error('secret'))
    expect((await startOAuth('google', '/dashboard')).error).not.toContain('secret')
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})

describe('OAuth completion', () => {
  it.each(['google', 'github'])('accepts a verified %s identity and existing provisioned profile', async provider => {
    mocks.get.mockReturnValue({ value: JSON.stringify({ provider, next: '/dashboard/posts', flowId }) })
    expect(await callback()).toBe('/dashboard/posts')
    expect(mocks.exchange).toHaveBeenCalledWith('valid', { flowId })
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith(OAUTH_CONTEXT_COOKIE)
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
  it('requires a matching initiation, even when a code exists', async () => {
    mocks.get.mockReturnValue(undefined)
    expect(await callback()).toContain('oauth_expired')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it.each(['error=access_denied', 'error_code=access_denied&error_description=secret'])('handles cancellation without exchanging a code: %s', async query => {
    expect(await callback(query)).toBe('/login?error=oauth_cancelled')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it.each(['code=valid&type=recovery', 'code=valid&token_hash=hash', ''])('never treats a recovery/invalid request as OAuth: %s', async query => {
    expect(await callback(query)).toContain('auth_callback_failed')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it.each(['email_not_found', 'email_not_confirmed', 'identity_already_exists'])('handles provider failure %s without persisting a session', async code => {
    mocks.exchange.mockResolvedValue({ data: { session: null }, error: { code, message: 'private detail' } })
    expect(await callback()).toContain(code === 'identity_already_exists' ? 'oauth_identity' : 'oauth_email')
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it.each([{ ...user, email: undefined }, { ...user, email_confirmed_at: undefined }])('rejects missing/unverified email', async invalidUser => {
    mocks.user.mockResolvedValue({ data: { user: invalidUser }, error: null })
    expect(await callback()).toContain('oauth_email')
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
  it('rejects an identity not belonging to the selected provider', async () => {
    mocks.user.mockResolvedValue({ data: { user: { ...user, identities: [{ provider: 'email' }] } }, error: null })
    expect(await callback()).toContain('oauth_identity')
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('routes enrolled accounts to MFA while preserving their destination', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    expect(await callback()).toBe('/mfa?next=%2Fdashboard%2Fposts')
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.profile).not.toHaveBeenCalled()
  })
  it.each([{ data: null, error: { message: 'secret' } }, { data: { currentLevel: null, nextLevel: null }, error: null }])('fails closed on assurance failure', async assurance => {
    mocks.assurance.mockResolvedValue(assurance)
    expect(await callback()).toContain('oauth_mfa')
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('does not invent a profile or role when provisioning fails', async () => {
    mocks.profile.mockResolvedValue({ data: null, error: { message: 'failed' } })
    expect(await callback()).toContain('oauth_profile')
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('handles thrown exchange errors safely', async () => {
    mocks.exchange.mockRejectedValue(new Error('secret'))
    expect(await callback()).toBe('/login?error=auth_callback_failed')
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})


it('requires MFA from authoritative user factors even if cached assurance understates enrollment', async () => {
  mocks.user.mockResolvedValue({ data: { user: { ...user, factors: [{ status: 'verified' }] } }, error: null })
  expect(await callback()).toBe('/mfa?next=%2Fdashboard%2Fposts')
})
