import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/features/posts/cache', () => ({ refreshPostPaths: vi.fn(), refreshDraftPaths: vi.fn() }))
vi.mock('@/features/newsletter/actions', () => ({ scheduleNewsletterSend: vi.fn(), cancelNewsletterSend: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
import { createPost, publishPost, updatePost, unpublishPost, retryNewsletterScheduling } from '@/features/posts/actions'
import { getProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { refreshDraftPaths, refreshPostPaths } from '@/features/posts/cache'
import { scheduleNewsletterSend, cancelNewsletterSend } from '@/features/newsletter/actions'
import { validPost, postClient } from '../../helpers/publication'
import type { PostFormValues } from '@/features/posts/types'

const values: PostFormValues = {
  ...validPost, cover_image: '', category_id: '', seo_title: validPost.title, tag_ids: [], editorial_reviewed: true,
}
function useDb(posts = [validPost]) {
  const db = postClient(posts)
  vi.mocked(createClient).mockResolvedValue(db.client as unknown as Awaited<ReturnType<typeof createClient>>)
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  return db
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(scheduleNewsletterSend).mockResolvedValue(undefined)
  vi.mocked(cancelNewsletterSend).mockResolvedValue(undefined)
  vi.mocked(getProfile).mockResolvedValue({ id: 'user-1', role: 'author', full_name: 'Frank Mendez' } as Awaited<ReturnType<typeof getProfile>>)
})
describe('dashboard publication actions', () => {
  it('cannot create a second post from the same recovery document after cleanup or acknowledgement failure', async () => {
    const db = useDb([])
    const documentId = '00000000-0000-4000-8000-000000000003'
    expect((await createPost(values, 'user-1', documentId)).data?.id).toBe(documentId)
    const retry = await createPost({ ...values, content: 'Newer local writing' }, 'user-1', documentId)
    expect(retry.error).toContain('already created')
    expect(db.posts).toHaveLength(1)
    expect(db.posts[0].content).toBe(values.content)
  })
  it.each([false, true])('reports an already published recovery document before slug validation (auto slug: %s)', async auto_slug => {
    const db = useDb([])
    const documentId = '00000000-0000-4000-8000-000000000004'
    expect((await createPost({ ...values, auto_slug }, 'user-1', documentId, true)).data).toMatchObject({ status: 'draft', moderation_status: 'pending' })
    const writes = db.writes.length
    const retry = await createPost({ ...values, auto_slug, content: 'Newer unsaved writing' }, 'user-1', documentId, true)
    expect(retry.error).toContain('already created')
    expect(retry.fieldErrors).toBeUndefined()
    expect(db.writes).toHaveLength(writes)
    expect(db.posts[0].content).toBe(values.content)
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('creates incomplete drafts', async () => {
    const db = useDb([])
    expect((await createPost({ ...values, title: '', content: '', excerpt: '', slug: '' })).error).toBeUndefined()
    expect(db.posts[0]).toMatchObject({ title: '', content: null, status: 'draft' })
    expect(refreshDraftPaths).toHaveBeenCalledOnce()
    expect(refreshPostPaths).not.toHaveBeenCalled()
  })
  it('saves incomplete drafts without invalidating public pages', async () => {
    useDb()
    expect((await updatePost('post-1', { ...values, content: '' })).error).toBeUndefined()
    expect(refreshDraftPaths).toHaveBeenCalledOnce()
    expect(refreshPostPaths).not.toHaveBeenCalled()
  })
  it('preserves a draft when publication fails and does not queue notifications', async () => {
    const db = useDb()
    const result = await publishPost('post-1', { ...values, content: '<p><br></p>' })
    expect(result.fieldErrors).toHaveProperty('content')
    expect(db.posts[0]).toEqual(validPost)
    expect(db.writes).toEqual([])
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('rejects invalid published edits before changing any live content or taxonomy', async () => {
    const published = { ...validPost, status: 'published' }
    const db = useDb([published])
    expect((await updatePost('post-1', { ...values, title: 'hello this is for test', tag_ids: ['new-tag'] })).fieldErrors).toHaveProperty('title')
    expect(db.posts[0]).toEqual(published)
    expect(db.writes).toEqual([])
  })
  it('requires editorial review on publication and published edits', async () => {
    const db = useDb()
    expect((await publishPost('post-1', { ...values, editorial_reviewed: false })).fieldErrors).toHaveProperty('editorial_reviewed')
    expect(db.writes).toEqual([])
  })
  it('queues valid publish requests for administrator moderation', async () => {
    const db = useDb()
    const result = await publishPost('post-1', values)
    expect(result.error).toBeUndefined()
    expect(db.posts[0]).toMatchObject({ status: 'draft', moderation_status: 'pending', content: values.content })
    expect(db.writes.filter(write => write.table === 'posts')).toHaveLength(1)
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
    expect(result.moderationWarning).toContain('administrator moderation')
    expect(refreshDraftPaths).toHaveBeenCalledOnce()
  })
  it('rejects concurrent edits without newsletter side effects', async () => {
    const db = useDb(); db.simulateRace()
    expect((await publishPost('post-1', values)).error).toContain('changed')
    expect(db.posts[0]).toEqual(validPost)
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('rejects a manual save from a stale loaded post before attempting writes', async () => {
    const db = useDb([{ ...validPost, updated_at: '2026-10-07T00:00:00Z' }])
    expect((await updatePost('post-1', values, false, validPost.updated_at)).error).toContain('another editor')
    expect(db.writes).toEqual([])
  })
  it('cannot publish another author’s post', async () => {
    const db = useDb([{ ...validPost, author_id: 'other-author' }])
    expect((await publishPost('post-1', values)).error).toBe('Unauthorized')
    expect(db.writes).toEqual([])
  })
  it('cancels newsletter notifications on unpublication', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    expect((await unpublishPost('post-1')).error).toBeUndefined()
    expect(db.posts[0].status).toBe('draft')
    expect(cancelNewsletterSend).toHaveBeenCalledWith('post-1')
  })
  it('does not queue newsletter delivery before moderator approval', async () => {
    const db = useDb()
    vi.mocked(scheduleNewsletterSend).mockRejectedValueOnce(new Error('Database unavailable'))
    const result = await publishPost('post-1', values)
    expect(result.error).toBeUndefined()
    expect(result.moderationWarning).toContain('administrator moderation')
    expect(db.posts[0]).toMatchObject({ status: 'draft', moderation_status: 'pending' })
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('reports unpublish success even when queue cancellation fails', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    vi.mocked(cancelNewsletterSend).mockRejectedValueOnce(new Error('Database unavailable'))
    const result = await unpublishPost('post-1')
    expect(result.error).toBeUndefined()
    expect(result.newsletterWarning).toContain('Post unpublished')
    expect(db.posts[0].status).toBe('draft')
    expect(refreshPostPaths).toHaveBeenCalled()
  })
})

describe('newsletter scheduling retry authorization', () => {
  it('allows the author to retry a missing notification', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    expect(await retryNewsletterScheduling('post-1', 'user-1')).toEqual({})
    expect(scheduleNewsletterSend).toHaveBeenCalledExactlyOnceWith('post-1')
    expect(db.writes).toEqual([])
  })
  it('allows a never-claimed failed send to be retried', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    db.sends.push({ post_id: 'post-1', status: 'failed', sending_started_at: null, sent_at: null })
    expect(await retryNewsletterScheduling('post-1')).toEqual({})
    expect(scheduleNewsletterSend).toHaveBeenCalledOnce()
  })
  it('allows a claimed failure to be retried if there was no provider handoff', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    db.sends.push({ post_id: 'post-1', status: 'failed', sending_started_at: '2026-01-01T00:00:00Z', delivery_started_at: null, sent_at: null })
    expect(await retryNewsletterScheduling('post-1')).toEqual({})
    expect(scheduleNewsletterSend).toHaveBeenCalledOnce()
  })
  it.each(['pending', 'sending', 'sent', 'failed'])('refuses retries of queued or previously claimed %s sends', async status => {
    const db = useDb([{ ...validPost, status: 'published' }])
    db.sends.push({ post_id: 'post-1', status, sending_started_at: status === 'pending' ? null : '2026-01-01T00:00:00Z', delivery_started_at: status === 'pending' ? null : '2026-01-01T00:00:00Z' })
    expect((await retryNewsletterScheduling('post-1')).error).toContain('duplicate')
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('refuses anonymous, changed-account, other-author and unpublished retries', async () => {
    useDb([{ ...validPost, status: 'published' }])
    vi.mocked(getProfile).mockResolvedValueOnce(null)
    expect((await retryNewsletterScheduling('post-1')).error).toBe('Unauthorized')
    expect((await retryNewsletterScheduling('post-1', 'other-user')).error).toContain('account changed')
    useDb([{ ...validPost, status: 'published', author_id: 'other-user' }])
    expect((await retryNewsletterScheduling('post-1')).error).toBe('Unauthorized')
    useDb()
    expect((await retryNewsletterScheduling('post-1')).error).toContain('Publish')
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('fails closed when queue status is unavailable', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    db.failQuery('newsletter_sends', 'select')
    expect((await retryNewsletterScheduling('post-1')).error).toContain('unavailable')
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('reports retry scheduling failure without modifying the published post', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    vi.mocked(scheduleNewsletterSend).mockRejectedValueOnce(new Error('DB unavailable'))
    expect((await retryNewsletterScheduling('post-1')).error).toContain('remains published')
    expect(db.writes).toEqual([])
  })
})

describe('slug safety', () => {
  it('normalizes custom slugs server-side and rejects empty or overlong results', async () => {
    const db = useDb([])
    expect((await createPost({ ...values, slug: '  My Custom URL  ' })).data?.slug).toBe('my-custom-url')
    for (const slug of ['!!!', 'x'.repeat(201)]) {
      expect((await createPost({ ...values, slug })).fieldErrors?.slug).toBeDefined()
    }
    expect(db.posts).toHaveLength(1)
  })
  it('preserves existing URLs when the title changes or the submitted slug is cleared', async () => {
    useDb()
    expect((await updatePost(validPost.id, { ...values, title: 'A Different Engineering Title', slug: '' })).data?.slug).toBe(validPost.slug)
  })
  it('suffixes automatic slugs after both existing conflicts and uniqueness races', async () => {
    const base = 'integration-testing-at-service-boundaries'
    const db = useDb([{ ...validPost, slug: base }])
    expect((await createPost({ ...values, slug: base, auto_slug: true })).data?.slug).toBe(base + '-2')
    db.simulateSlugRace()
    expect((await createPost({ ...values, title: 'Concurrent Creation', slug: '', auto_slug: true })).data?.slug).toBe('concurrent-creation-2')
  })
  it('bounds collision retries and returns an actionable field error', async () => {
    const db = useDb([]); db.simulateSlugRace(100)
    expect((await createPost({ ...values, slug: '', auto_slug: true })).fieldErrors?.slug[0]).toContain('Choose another')
    expect(db.writes).toHaveLength(20)
    expect(db.posts).toHaveLength(0)
  })
  it('reports custom slug conflicts without silently suffixing them', async () => {
    const db = useDb()
    expect((await createPost(values)).fieldErrors?.slug[0]).toContain('Choose another')
    expect(db.writes).toHaveLength(1)
    db.simulateSlugRace()
    expect((await updatePost(validPost.id, { ...values, slug: 'new-url' })).fieldErrors?.slug).toBeDefined()
    expect(db.posts[0].slug).toBe(validPost.slug)
  })
  it('provides a nonempty fallback for punctuation-only titles', async () => {
    useDb([])
    expect((await createPost({ ...values, title: '!!!', slug: '', auto_slug: true })).data?.slug).toMatch(/^draft-[0-9a-f-]{36}$/)
  })
  it('requires confirmation before changing a published URL, then keeps the old route', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    const changed = { ...values, slug: 'changed-public-url' }
    expect((await updatePost(validPost.id, changed)).fieldErrors?.slug[0]).toContain('Confirm')
    expect(db.writes).toHaveLength(0)
    expect((await updatePost(validPost.id, { ...changed, confirm_slug_change: true })).error).toBeUndefined()
    expect(db.routes).toEqual(expect.arrayContaining([{ slug: validPost.slug, post_id: validPost.id, was_published: true }]))
    expect(refreshPostPaths).toHaveBeenCalledWith(validPost.slug, changed.slug)
  })
  it('rejects a former published URL belonging to another post', async () => {
    const db = postClient([validPost], 'Frank Mendez', [], [{ slug: 'reserved-old-url', post_id: 'other-post', was_published: true }])
    vi.mocked(createClient).mockResolvedValue(db.client as unknown as Awaited<ReturnType<typeof createClient>>)
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const result = await publishPost(validPost.id, { ...values, slug: 'reserved-old-url' })
    expect(result.fieldErrors?.slug[0]).toContain('reserved')
    expect(db.posts[0].slug).toBe(validPost.slug)
    expect(db.writes).toHaveLength(1)
  })
})

it('creates a draft with an automatic URL after a manually edited slug is cleared', async () => {
  useDb([])
  expect((await createPost({ ...values, title: 'Cleared Slug Draft', slug: '   ', auto_slug: false })).data?.slug).toBe('cleared-slug-draft')
})

describe('atomic persistence failures', () => {
  it('does not acknowledge or invalidate a draft when tag insertion fails', async () => {
    const db = useDb([]); db.failAtomic()
    expect((await createPost({ ...values, tag_ids: ['missing-tag'] })).error).toBeDefined()
    expect(db.posts).toEqual([])
    expect(refreshDraftPaths).not.toHaveBeenCalled()
  })
  it.each([false, true])('preserves the document and avoids newsletters on failed save/publish (%s)', async publish => {
    const db = useDb(); db.failAtomic()
    expect((await updatePost(validPost.id, { ...values, tag_ids: ['missing-tag'] }, publish)).error).toContain('No changes')
    expect(db.posts[0]).toEqual(validPost)
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
    expect(refreshPostPaths).not.toHaveBeenCalled()
  })
})


describe('publication directly from the new writing screen', () => {
  it('publishes reviewed input atomically without an intermediate draft', async () => {
    const db = useDb([])
    const result = await createPost(values, 'user-1', undefined, true)
    expect(result.data).toMatchObject({ status: 'published', content: values.content })
    expect(db.writes.filter(write => write.table === 'posts')).toHaveLength(1)
    expect(scheduleNewsletterSend).toHaveBeenCalledExactlyOnceWith(result.data!.id, { resetPendingDelay: true })
  })
  it.each([{ content: '' }, { editorial_reviewed: false }])('blocks invalid new publication before any write (%j)', async invalid => {
    const db = useDb([])
    const result = await createPost({ ...values, ...invalid }, 'user-1', undefined, true)
    expect(result.fieldErrors).toBeDefined()
    expect(db.posts).toEqual([])
    expect(db.writes).toEqual([])
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('preserves automatic slug collision retries when publishing', async () => {
    const db = useDb([{ ...validPost, slug: 'integration-testing-at-service-boundaries' }])
    const result = await createPost({ ...values, auto_slug: true }, 'user-1', undefined, true)
    expect(result.data?.slug).toBe('integration-testing-at-service-boundaries-2')
    expect(db.posts).toHaveLength(2)
    expect(scheduleNewsletterSend).toHaveBeenCalledOnce()
  })
  it('never publishes for an account different from the opened editor', async () => {
    const db = useDb([])
    expect((await createPost(values, 'other-author', undefined, true)).error).toContain('account changed')
    expect(db.writes).toEqual([])
  })
  it('reports newsletter failure after successful new publication', async () => {
    useDb([])
    vi.mocked(scheduleNewsletterSend).mockRejectedValueOnce(new Error('Queue unavailable'))
    const result = await createPost(values, 'user-1', undefined, true)
    expect(result.data?.status).toBe('published')
    expect(result.error).toBeUndefined()
    expect(result.newsletterWarning).toContain('could not be confirmed')
  })
})
