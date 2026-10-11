// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ values: new Map<string, string>(), set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({
  getAll: () => [...state.values].map(([name, value]) => ({ name, value })),
  get: (name: string) => state.values.has(name) ? { value: state.values.get(name) } : undefined,
  set: state.set,
  delete: (name: string) => state.values.delete(name),
}) }))
import { createOAuthClient } from '@/lib/auth/oauth-server'
import { fetchWithoutProviderTokens } from '@/lib/auth/token-fetch'
import { completeOAuth } from '@/app/auth/oauth/callback'
import { startOAuth } from '@/app/auth/oauth/actions'
import { OAUTH_CONTEXT_COOKIE } from '@/lib/auth/oauth'

const authUser = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.com',
  email_confirmed_at: '2026-10-11T00:00:00Z', created_at: '2026-10-11T00:00:00Z', app_metadata: { provider: 'github' }, user_metadata: {}, identities: [{ provider: 'google' }, { provider: 'github' }] }
const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: authUser.id, exp: Math.floor(Date.now() / 1000) + 3600, aal: 'aal1' })).toString('base64url')}.${Buffer.from('test-signature').toString('base64url')}`
const tokenResponse = (user = authUser) => Response.json({ access_token: jwt, refresh_token: 'supabase-refresh', token_type: 'bearer', expires_in: 3600,
  provider_token: 'SECRET-provider-access', provider_refresh_token: 'SECRET-provider-refresh', user })

beforeEach(() => {
  vi.clearAllMocks()
  state.values.clear()
  state.set.mockImplementation((name: string, value: string) => state.values.set(name, value))
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.example.com')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://dedicated-test.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => {
    if (input.endsWith('/settings')) return Response.json({ external: { google: true, github: true } })
    if (input.endsWith('/user')) return Response.json(authUser)
    if (input.includes('/rest/v1/profiles')) return Response.json({ id: authUser.id })
    return tokenResponse()
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('installed Supabase SDK integration (network stubbed)', () => {
  it.each(['google', 'github'])('preserves real %s PKCE verifier slots with an exact callback URL', async provider => {
    const result = await startOAuth(provider, '/dashboard/posts')
    expect(result.error).toBeUndefined()
    const authorize = new URL(result.url!)
    expect(authorize.searchParams.get('provider')).toBe(provider)
    expect(authorize.searchParams.get('code_challenge_method')).toBe('s256')
    expect(authorize.searchParams.get('code_challenge')).toBeTruthy()
    expect(authorize.searchParams.get('redirect_to')).toBe('https://cms.example.com/auth/callback?flow=oauth')
    const context = JSON.parse(state.values.get(OAUTH_CONTEXT_COOKIE)!)
    expect([...state.values.keys()]).toContain(`sb-dedicated-test-auth-token-flow-${context.flowId}-code-verifier`)

    const untyped = await createOAuthClient()
    expect((await untyped.supabase.auth.exchangeCodeForSession('code-without-oauth-marker')).error).toBeTruthy()
    const client = await createOAuthClient()
    const { data, error } = await client.supabase.auth.exchangeCodeForSession('one-time-auth-code', { flowId: context.flowId })
    expect(error).toBeNull()
    expect(data.session?.provider_token).toBeUndefined()
    expect(data.session?.provider_refresh_token).toBeUndefined()
    const requestBody = JSON.parse(vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes('/token?'))![1]!.body as string)
    expect(requestBody.auth_code).toBe('one-time-auth-code')
    expect(requestBody.code_verifier).toBeTruthy()
    // Session writes wait until the callback accepts identity and MFA.
    expect(state.values.get('sb-dedicated-test-auth-token')).toBeUndefined()
    client.commit()
    const cookie = state.values.get('sb-dedicated-test-auth-token')!
    const session = JSON.parse(Buffer.from(cookie.slice('base64-'.length), 'base64url').toString())
    expect(session.access_token).toBe(jwt)
    expect(session.refresh_token).toBe('supabase-refresh')
    expect(session.provider_token).toBeUndefined()
    expect(session.provider_refresh_token).toBeUndefined()
    expect(JSON.stringify([...state.values])).not.toContain('SECRET-provider')
  })
  it.each(['google', 'github'])('completes %s through the actual SDK and callback, then rejects replay', async provider => {
    expect((await startOAuth(provider, '/dashboard/posts')).url).toBeTruthy()
    expect(await completeOAuth(new URLSearchParams('code=valid'))).toBe('/dashboard/posts')
    expect(state.values.has(OAUTH_CONTEXT_COOKIE)).toBe(false)
    expect(state.values.get('sb-dedicated-test-auth-token')).toBeTruthy()
    expect(await completeOAuth(new URLSearchParams('code=valid'))).toContain('oauth_expired')
  })
  it('uses the SDK assurance result to require an enrolled authenticator', async () => {
    const enrolledUser = { ...authUser, factors: [{ id: 'totp-id', factor_type: 'totp', status: 'verified' }] }
    vi.mocked(fetch).mockImplementation(async input => {
      const url = String(input)
      if (url.endsWith('/settings')) return Response.json({ external: { google: true } })
      if (url.endsWith('/user')) return Response.json(enrolledUser)
      return tokenResponse(enrolledUser)
    })
    await startOAuth('google', '/dashboard/posts')
    expect(await completeOAuth(new URLSearchParams('code=valid'))).toBe('/mfa?next=%2Fdashboard%2Fposts')
  })
  it('rejects a code when the initiating verifier is missing without making a token request', async () => {
    const { supabase } = await createOAuthClient()
    const { error } = await supabase.auth.exchangeCodeForSession('code', { flowId: 'a'.repeat(32) })
    expect(error).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
    expect(state.set).not.toHaveBeenCalled()
  })
  it('does not rewrite non-token responses', async () => {
    const response = Response.json({ provider_token: 'unrelated-column' })
    vi.mocked(fetch).mockResolvedValue(response)
    expect(await fetchWithoutProviderTokens('https://dedicated-test.supabase.co/rest/v1/data')).toBe(response)
  })
})
