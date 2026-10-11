import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/permissions', () => ({
  can: vi.fn(),
}))

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { can } from '@/lib/permissions'
import { getProfile, requireAuth, requirePermission } from '@/lib/auth/session'

const mockRedirect = vi.mocked(redirect)
const mockCreateClient = vi.mocked(createClient)
const mockCan = vi.mocked(can)

const fakeProfile = { id: 'u1', role: 'admin', email: 'a@b.com', full_name: 'Admin' }

function makeSupabase(userId: string | null, profile: unknown = fakeProfile) {
  return {
    auth: {
      mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: profile }),
        }),
      }),
    }),
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('getProfile', () => {
  it('returns null when no user is authenticated', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(null) as any)
    const result = await getProfile()
    expect(result).toBeNull()
  })

  it('returns the profile for an authenticated user', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase('u1') as any)
    const result = await getProfile()
    expect(result).toEqual(fakeProfile)
  })
})

describe('requireAuth', () => {
  it('returns the profile when authenticated', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase('u1') as any)
    const result = await requireAuth()
    expect(result).toEqual(fakeProfile)
  })

  it('redirects to /login when not authenticated', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(null) as any)
    // redirect() in Next.js throws internally; we mock it as a no-op so requireAuth() continues
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
    await expect(requireAuth()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})

describe('requirePermission', () => {
  it('returns the profile when user has the required permission', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase('u1') as any)
    mockCan.mockReturnValue(true)
    const result = await requirePermission('posts:create')
    expect(result).toEqual(fakeProfile)
  })

  it('redirects to /dashboard when user lacks the permission', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase('u1') as any)
    mockCan.mockReturnValue(false)
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
    await expect(requirePermission('posts:delete:all')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects to /login when not authenticated', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(null) as any)
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
    await expect(requirePermission('posts:create')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})


describe('server MFA authorization for every sign-in method', () => {
  it.each([
    { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null },
    { data: null, error: { message: 'unavailable' } },
    { data: null, error: null },
    { data: { currentLevel: null, nextLevel: null }, error: null },
  ])('denies sensitive profile access before MFA or on missing assurance', async assurance => {
    const client = makeSupabase('u1')
    client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(assurance as never)
    mockCreateClient.mockResolvedValue(client as never)
    expect(await getProfile()).toBeNull()
    expect(client.from).not.toHaveBeenCalled()
  })
  it('allows completed MFA', async () => {
    const client = makeSupabase('u1')
    client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
    mockCreateClient.mockResolvedValue(client as never)
    expect(await getProfile()).toEqual(fakeProfile)
  })
})


it('uses authoritative enrolled factors even when cached session data says AAL1 is enough', async () => {
  const client = makeSupabase('u1')
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', factors: [{ status: 'verified' }] } } } as never)
  mockCreateClient.mockResolvedValue(client as never)
  expect(await getProfile()).toBeNull()
  expect(client.from).not.toHaveBeenCalled()
})
