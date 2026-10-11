import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { POST } from '@/app/api/auth/signout/route'
import { createClient } from '@/lib/supabase/server'

const mockCreateClient = vi.mocked(createClient)

beforeEach(() => vi.clearAllMocks())

describe('POST /api/auth/signout', () => {
  it('calls supabase.auth.signOut and returns 204', async () => {
    const mockSignOut = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient.mockResolvedValue({ auth: { signOut: mockSignOut } } as never)

    const res = await POST()

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(res.status).toBe(204)
  })

  it('still returns 204 even if signOut returns an error', async () => {
    const mockSignOut = vi.fn().mockResolvedValue({ error: new Error('network error') })
    mockCreateClient.mockResolvedValue({ auth: { signOut: mockSignOut } } as never)

    const res = await POST()

    expect(res.status).toBe(204)
  })
})
