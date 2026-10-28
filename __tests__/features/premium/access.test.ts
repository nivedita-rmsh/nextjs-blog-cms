import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))

import { createServiceClient } from '@/lib/supabase/service'
import { getPremiumPostBody, hasPremiumAccess } from '@/features/premium/access'

function useService(results: Record<string, { data: unknown; error?: unknown }>) {
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => results[table] ?? { data: null, error: null }),
    }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    return chain
  })
  vi.mocked(createServiceClient).mockReturnValue({ from } as never)
  return { from }
}

beforeEach(() => vi.resetAllMocks())

describe('premium entitlement checks', () => {
  it('denies anonymous users without querying the database', async () => {
    expect(await hasPremiumAccess(null)).toBe(false)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('accepts an active entitlement with no expiry', async () => {
    useService({
      profiles: { data: { role: 'author' } },
      premium_subscriptions: { data: { status: 'active', expires_at: null } },
    })
    expect(await hasPremiumAccess('subscriber-1')).toBe(true)
  })

  it('accepts an active entitlement only before its expiry', async () => {
    useService({
      profiles: { data: { role: 'author' } },
      premium_subscriptions: { data: { status: 'active', expires_at: '2000-01-01T00:00:00Z' } },
    })
    expect(await hasPremiumAccess('subscriber-1')).toBe(false)
  })

  it('denies revoked subscriptions and treats admins as entitled', async () => {
    useService({
      profiles: { data: { role: 'author' } },
      premium_subscriptions: { data: { status: 'revoked', expires_at: null } },
    })
    expect(await hasPremiumAccess('subscriber-1')).toBe(false)
    vi.mocked(createServiceClient).mockClear()
    useService({ profiles: { data: { role: 'admin' } } })
    expect(await hasPremiumAccess('admin-1')).toBe(true)
  })
})

describe('premium body retrieval', () => {
  it('allows the author to load their own premium article body', async () => {
    const db = useService({ premium_post_contents: { data: { content: '{"type":"doc"}' } } })
    expect(await getPremiumPostBody('post-1', 'author-1', 'author-1')).toBe('{"type":"doc"}')
    expect(db.from).toHaveBeenCalledWith('premium_post_contents')
  })

  it('does not query protected content when an entitlement is inactive', async () => {
    const db = useService({
      profiles: { data: { role: 'author' } },
      premium_subscriptions: { data: { status: 'revoked', expires_at: null } },
      premium_post_contents: { data: { content: 'private body' } },
    })
    expect(await getPremiumPostBody('post-1', 'reader-1', 'author-1')).toBeNull()
    expect(db.from).not.toHaveBeenCalledWith('premium_post_contents')
  })
})
