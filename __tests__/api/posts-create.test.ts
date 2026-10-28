import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/api-keys/apiKeyService', () => ({
  validateApiKey: vi.fn(), resolveTagIds: vi.fn().mockResolvedValue([]),
  resolveCategoryId: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/features/posts/cache', () => ({ refreshPostPaths: vi.fn(), refreshDraftPaths: vi.fn() }))
vi.mock('@/features/newsletter/actions', () => ({ scheduleNewsletterSend: vi.fn() }))

import { POST } from '@/app/api/posts/create/route'
import { validateApiKey } from '@/features/api-keys/apiKeyService'
import { createServiceClient } from '@/lib/supabase/service'
import { scheduleNewsletterSend } from '@/features/newsletter/actions'
import { postClient, validPost } from '../helpers/publication'

const validApiPost = { title: validPost.title, slug: validPost.slug, content: validPost.content, excerpt: validPost.excerpt, tags: ['testing'] }

function request(body: unknown, auth = 'Bearer fmblog_valid') {
  return new Request('http://localhost/api/posts/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body),
  })
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(validateApiKey).mockResolvedValue('user-1') })

describe('POST /api/posts/create', () => {
  it('requires authorization and a valid API key', async () => {
    expect((await POST(request({}, ''))).status).toBe(401)
    vi.mocked(validateApiKey).mockResolvedValue(null)
    expect((await POST(request({}))).status).toBe(401)
  })
  it('allows incomplete work as a draft', async () => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    expect((await POST(request({}))).status).toBe(201)
    expect(db.posts[0]).toMatchObject({ title: '', content: '', status: 'draft', author_id: 'user-1' })
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it.each([
    {}, { title: '   ', content: '   ' }, { title: 'hello this is for test', content: '<p><br></p>' },
    { title: validPost.title, content: '<p>' + 'lorem ipsum '.repeat(200) + '</p>' },
    { ...validApiPost, slug: '!!!' }, { ...validApiPost, editorial_reviewed: false },
  ])('blocks an incomplete or placeholder publication before any writes', async fields => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await POST(request({ editorial_reviewed: true, ...fields, status: 'published' }))
    expect(res.status).toBe(422)
    expect((await res.json()).details.field_errors).toBeDefined()
    expect(db.writes).toEqual([])
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it.each([null, [], { title: 7 }, { content: {} }, { status: 'anything' }, { editorial_reviewed: 'true' }])('rejects malformed JSON fields %j', async body => {
    const res = await POST(request(body))
    expect(res.status).toBe(422)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
  it('queues reviewed API publication requests for moderator approval', async () => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await POST(request({ ...validApiPost, status: 'published', editorial_reviewed: true }))
    expect(res.status).toBe(201)
    expect(db.posts[0]).toMatchObject({ status: 'draft', moderation_status: 'pending', title: validPost.title })
    expect((await res.json()).moderation_warning).toContain('administrator moderation')
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('cannot publish under a missing or unnamed author', async () => {
    const db = postClient([], null)
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await POST(request({ ...validApiPost, status: 'published', editorial_reviewed: true }))
    expect(res.status).toBe(422)
    expect((await res.json()).details.field_errors.author_id).toBeDefined()
    expect(db.writes).toEqual([])
  })
  it('returns a field error for a duplicate slug without publishing', async () => {
    const db = postClient([validPost])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await POST(request({ ...validApiPost, status: 'published', editorial_reviewed: true }))
    expect(res.status).toBe(422)
    expect((await res.json()).details.field_errors.slug).toBeDefined()
    expect(db.writes).toEqual([])
  })
})

it('normalizes a custom draft URL and returns 409 for a duplicate without suffixing it', async () => {
  const db = postClient()
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  const created = await POST(request({ title: 'Draft', slug: ' Custom Draft URL ' }))
  expect(created.status).toBe(201)
  expect(db.posts[0].slug).toBe('custom-draft-url')
  const duplicate = await POST(request({ title: 'Duplicate', slug: 'custom-draft-url' }))
  expect(duplicate.status).toBe(409)
  expect((await duplicate.json()).details.field_errors.slug[0]).toContain('Choose another')
  expect(db.posts).toHaveLength(1)
})
it('retries automatic slugs after a uniqueness race and supports punctuation-only titles', async () => {
  const db = postClient()
  db.simulateSlugRace()
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  expect((await POST(request({ title: 'Concurrent Draft' }))).status).toBe(201)
  expect(db.posts[0].slug).toBe('concurrent-draft-2')
  expect((await POST(request({ title: '!!!' }))).status).toBe(201)
  expect(db.posts[1].slug).toMatch(/^draft-[0-9a-f-]{36}$/)
})
it('blocks malformed custom draft slugs before writes', async () => {
  const db = postClient()
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  for (const slug of ['!!!', 'x'.repeat(201)]) {
    const result = await POST(request({ title: 'Draft', slug }))
    expect(result.status).toBe(422)
    expect((await result.json()).details.field_errors.slug).toBeDefined()
  }
  expect(db.writes).toHaveLength(0)
})

it('rolls back tag failures and permits retry after failure', async () => {
  const failed = postClient(); failed.failAtomic()
  vi.mocked(createServiceClient).mockReturnValue(failed.client)
  expect((await POST(request(validApiPost))).status).toBe(500)
  expect(failed.posts).toHaveLength(0)
  expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  failed.clearAtomicFailure()
  expect((await POST(request(validApiPost))).status).toBe(201)
  expect(failed.posts).toHaveLength(1)
})
it('replays successful publication before duplicate-slug validation and schedules once', async () => {
  const db = postClient()
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  const body = { ...validApiPost, status: 'published', editorial_reviewed: true }
  const first = request(body); first.headers.set('Idempotency-Key', 'publish-attempt')
  const retry = request(body); retry.headers.set('Idempotency-Key', 'publish-attempt')
  expect((await POST(first)).status).toBe(201)
  const replay = await POST(retry)
  expect(replay.status).toBe(201)
  expect(replay.headers.get('Idempotent-Replayed')).toBe('true')
  expect(db.posts).toHaveLength(1)
  expect(scheduleNewsletterSend).toHaveBeenCalledTimes(1)
})
it('rejects reusing an explicit creation key with different input', async () => {
  const db = postClient()
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  const keyed = (title: string) => {
    const req = request({ title })
    req.headers.set('Idempotency-Key', 'operation-71')
    return req
  }
  expect((await POST(keyed('First draft'))).status).toBe(201)
  expect((await POST(keyed('Changed draft'))).status).toBe(409)
  expect(db.posts).toHaveLength(1)
})

it('creates separate drafts for identical keyless requests', async () => {
  const db = postClient(); vi.mocked(createServiceClient).mockReturnValue(db.client)
  expect((await POST(request({ title: 'Recurring draft' }))).status).toBe(201)
  expect((await POST(request({ title: 'Recurring draft' }))).status).toBe(201)
  expect(db.posts).toHaveLength(2)
})
it('returns structured validation for invalid tag names', async () => {
  const res = await POST(request({ title: 'Draft', tags: ['!!!'] }))
  expect(res.status).toBe(422)
  expect((await res.json()).details.field_errors.tags).toBeDefined()
  expect(createServiceClient).not.toHaveBeenCalled()
})

it('returns 503 for a transient receipt read failure', async () => {
  const db = postClient()
  vi.mocked(db.client.from).mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'Database unavailable' } }) }) }) }) } as unknown as ReturnType<typeof db.client.from>)
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  const req = request({ title: 'Draft' }); req.headers.set('Idempotency-Key', 'retry-read')
  expect((await POST(req)).status).toBe(503)
  expect(db.posts).toHaveLength(0)
})
