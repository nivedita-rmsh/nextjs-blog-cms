import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ verify: vi.fn(), exchange: vi.fn(), grant: vi.fn(), clear: vi.fn() }))
vi.mock('@/app/auth/oauth/callback', () => ({ completeOAuth: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { verifyOtp: mocks.verify, exchangeCodeForSession: mocks.exchange } }) }))
vi.mock('@/lib/auth/recovery', () => ({ createRecoveryGrant: mocks.grant, clearRecoveryGrant: mocks.clear }))
import { GET } from '@/app/auth/callback/route'

const request = (query: string) => new Request(`https://example.com/auth/callback?${query}`)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.verify.mockResolvedValue({ data: { session: { user: { id: 'user' } } }, error: null })
  mocks.exchange.mockResolvedValue({ error: null })
})
describe('auth callback recovery', () => {
  it('verifies recovery OTP and mints a grant before redirecting', async () => {
    const response = await GET(request('token_hash=hash&type=recovery&next=https://evil.invalid'))
    expect(mocks.verify).toHaveBeenCalledWith({ token_hash: 'hash', type: 'recovery' })
    expect(mocks.grant).toHaveBeenCalledOnce()
    expect(response.headers.get('location')).toBe('https://example.com/reset-password')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
  it.each(['missing', 'expired', 'used'])('rejects %s recovery links', async reason => {
    mocks.verify.mockResolvedValue({ data: { session: null }, error: { message: reason } })
    const response = await GET(request(reason === 'missing' ? 'type=recovery' : 'type=recovery&token_hash=hash'))
    expect(response.headers.get('location')).toBe('https://example.com/reset-password?error=invalid_recovery')
    expect(mocks.grant).not.toHaveBeenCalled()
    expect(mocks.clear).toHaveBeenCalled()
  })
  it('fails closed if storing the grant fails', async () => {
    mocks.grant.mockRejectedValue(new Error('database unavailable'))
    expect((await GET(request('type=recovery&token_hash=hash'))).headers.get('location')).toContain('invalid_recovery')
  })
  it('does not treat ordinary auth as recovery', async () => {
    expect((await GET(request('code=signup'))).headers.get('location')).toBe('https://example.com/dashboard')
    expect(mocks.grant).not.toHaveBeenCalled()
  })
  it.each(['.attacker.invalid/reset', '//evil.invalid', 'https://evil.invalid', '/dashboard/admin'])('ignores untrusted destination %s', async next => {
    expect((await GET(request(`code=signup&next=${encodeURIComponent(next)}`))).headers.get('location')).toBe('https://example.com/dashboard')
  })
  it('rejects old recovery templates instead of redirecting to dashboard', async () => {
    expect((await GET(request('code=old&next=/reset-password'))).headers.get('location')).toContain('invalid_recovery')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
})
