import { savePostAtomic, creationIdentity, findCreatedPost } from '@/features/posts/persistence'
import type { Post } from '@/features/posts/types'
import { NextResponse } from 'next/server'
import { postApiSchema, validatePublication, type PostApiBody } from '@/features/posts/publication'
import { refreshPostPaths, refreshDraftPaths } from '@/features/posts/cache'
import { scheduleNewsletterSend } from '@/features/newsletter/actions'
import {
  validateApiKey,
  resolveCategoryId,
} from '@/features/api-keys/apiKeyService'
import { planSlug, writeWithSlug, isSlugConflict, SLUG_CONFLICT } from '@/features/posts/slugs'
import { createServiceClient } from '@/lib/supabase/service'

function buildPostPayload(body: PostApiBody, slug: string, categoryId: string | null, userId: string) {
  const postStatus = body.status === 'published' ? 'published' : 'draft'
  const seoDescription = typeof body.meta_description === 'string'
    ? body.meta_description
    : (typeof body.excerpt === 'string' ? body.excerpt : null)

  return {
    title: (body.title ?? '').trim(),
    slug,
    content: body.content ?? '',
    excerpt: typeof body.excerpt === 'string' ? body.excerpt : null,
    cover_image: typeof body.image_url === 'string' ? body.image_url : null,
    cover_image_alt: body.image_alt?.trim() ?? '',
    status: postStatus,
    author_id: userId,
    category_id: categoryId,
    seo_title: typeof body.meta_title === 'string' ? body.meta_title : (body.title ?? '').trim(),
    seo_description: seoDescription,
    published_at: postStatus === 'published' ? new Date().toISOString() : null,
    moderation_status: postStatus === 'published' ? 'pending' : 'not_submitted',
  }
}

export async function POST(request: Request) {
  // 1. Authenticate via API key
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid Authorization header' },
      { status: 401 }
    )
  }

  const userId = await validateApiKey(authHeader.slice(7))
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Invalid or revoked API key' }, { status: 401 })
  }

  // 2. Parse and validate body
  let rawBody: Record<string, unknown>
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = postApiSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid post fields', details: { field_errors: parsed.error.flatten().fieldErrors } }, { status: 422 })
  }
  const body = parsed.data
  const requestedPublication = body.status === 'published'
  const identity = creationIdentity('rest', body, request.headers.get('Idempotency-Key'))
  const previous = await findCreatedPost(userId, identity)
  if (previous.error) return NextResponse.json({ success: false, error: previous.error }, { status: previous.status })
  if (previous.post) return NextResponse.json({ success: true, data: { post: previous.post } }, { status: 201, headers: { 'Idempotent-Replayed': 'true' } })
  const supabase = createServiceClient()
  const plan = planSlug(body.slug, body.title ?? '')
  if (plan.error) return NextResponse.json({ success: false, error: plan.error, details: { field_errors: { slug: [plan.error] } } }, { status: 422 })
  const payload = buildPostPayload(body, plan.slug, null, userId)
  if (payload.status === 'published') {
    const fieldErrors = await validatePublication(supabase, payload, body.editorial_reviewed, undefined, plan.automatic)
    if (Object.keys(fieldErrors).length) {
      // Another retry may have committed after the first receipt lookup.
      const committed = await findCreatedPost(userId, identity)
      if (committed.post) return NextResponse.json({ success: true, data: { post: committed.post } }, { status: 201, headers: { 'Idempotent-Replayed': 'true' } })
      return NextResponse.json({ success: false, error: 'Publication blocked', details: { field_errors: fieldErrors } }, { status: 422 })
    }
  }
  if (requestedPublication) {
    payload.status = 'draft'
    payload.published_at = null
  }
  payload.category_id = body.category ? await resolveCategoryId(body.category, supabase) : null

  // 4. Insert post with tags
  let replayed = false
  const { data: post, error: writeError } = await writeWithSlug<Post>(plan, async slug => {
    const result = await savePostAtomic({ actorId: userId, payload: { ...payload, slug }, tagNames: body.tags ?? [], ...identity })
    replayed = result.data?.replayed ?? false
    return { data: result.data?.post ?? null, error: result.error }
  })
  let error: string | null = null
  if (writeError) {
    error = 'The post and tags could not be saved. No changes were applied.'
    if (isSlugConflict(writeError)) error = SLUG_CONFLICT
    else if (writeError.code === '22023') error = writeError.message
  }

  if (error) {
    return NextResponse.json({ success: false, error, ...(error === SLUG_CONFLICT ? { details: { field_errors: { slug: [error] } } } : {}) }, { status: error === SLUG_CONFLICT || writeError?.code === '22023' ? 409 : 500 })
  }

  let newsletterWarning: string | undefined
  if (post?.status === 'published' && !replayed) {
    try { await scheduleNewsletterSend(post.id, { resetPendingDelay: true }) } catch (err) {
      console.error('[API] Newsletter scheduling failed:', err)
      newsletterWarning = 'Post published, but newsletter scheduling could not be confirmed. Check newsletter status in the dashboard before retrying.'
    }
  }
  if (post?.status === 'published') refreshPostPaths(post.slug)
  else refreshDraftPaths()
  const moderationWarning = requestedPublication && post?.moderation_status === 'pending'
    ? 'The post was saved as a draft and submitted for administrator moderation; it is not public yet.'
    : undefined
  return NextResponse.json({ success: true, data: { post }, ...(newsletterWarning ? { newsletter_warning: newsletterWarning } : {}), ...(moderationWarning ? { moderation_warning: moderationWarning } : {}) }, { status: 201, ...(replayed ? { headers: { 'Idempotent-Replayed': 'true' } } : {}) })
}
