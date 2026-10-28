import { savePostAtomic } from '@/features/posts/persistence'
import { type NextRequest } from 'next/server'
import { postApiSchema, validatePublication } from '@/features/posts/publication'
import { planSlug, isSlugConflict, SLUG_CONFLICT, SLUG_CHANGE_CONFIRMATION } from '@/features/posts/slugs'
import { refreshPostPaths, refreshDraftPaths } from '@/features/posts/cache'
import { scheduleNewsletterSend, cancelNewsletterSend } from '@/features/newsletter/actions'
import { requireApiKey } from '@/lib/apiAuth'
import { apiSuccess, apiError } from '@/lib/apiHelpers'
import { checkRateLimit } from '@/lib/rateLimit'
import { createServiceClient } from '@/lib/supabase/service'
import {
  resolveCategoryId,
  hashApiKey,
} from '@/features/api-keys/apiKeyService'

const POST_FULL_SELECT = `
  id, title, slug, content, excerpt, seo_title, seo_description,
  status, cover_image, cover_image_alt, author_id, created_at, updated_at, published_at, is_premium,
  category:categories(name),
  tags:post_tags(tag:tags(name))
`

type RawPostFull = {
  id: string
  title: string
  slug: string
  content: string | null
  excerpt: string | null
  seo_title: string | null
  seo_description: string | null
  status: string
  is_premium: boolean
  cover_image_alt: string
  cover_image: string | null
  author_id: string | null
  created_at: string | null
  updated_at: string | null
  published_at: string | null
  category: { name: string } | null
  tags: { tag: { name: string } | null }[]
}

function normalizeFullPost(raw: RawPostFull) {
  return {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    content: raw.content,
    excerpt: raw.excerpt,
    meta_title: raw.seo_title,
    meta_description: raw.seo_description,
    status: raw.status,
    is_premium: raw.is_premium,
    category: raw.category?.name ?? null,
    tags: (raw.tags ?? []).map((pt) => pt.tag?.name).filter(Boolean) as string[],
    image_url: raw.cover_image,
    image_alt: raw.cover_image_alt,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    published_at: raw.published_at,
  }
}

function getRateLimitKey(req: NextRequest): string {
  return hashApiKey(req.headers.get('Authorization')!.slice(7).trim())
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req)
  if (!auth.success) return apiError(auth.error, auth.status)

  const rl = checkRateLimit(getRateLimitKey(req), 60, 60_000)
  if (!rl.allowed) return apiError('Rate limit exceeded.', 429, { retry_after: rl.retryAfter })

  const { id } = await context.params
  const supabase = createServiceClient()

  // Detect UUID vs slug to avoid PostgREST injection via .or() with unvalidated input
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isUuid = UUID_PATTERN.test(id)

  const { data, error } = await supabase
    .from('posts')
    .select(POST_FULL_SELECT)
    .eq(isUuid ? 'id' : 'slug', id)
    .eq('author_id', auth.userId)
    .single()

  if (error || !data) return apiError('Post not found.', 404)
  let post = data as unknown as RawPostFull
  if (post.is_premium) {
    const { data: premiumBody } = await supabase.from('premium_post_contents').select('content').eq('post_id', post.id).maybeSingle()
    post = { ...post, content: premiumBody?.content ?? null }
  }
  return apiSuccess({ data: normalizeFullPost(post) })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req)
  if (!auth.success) return apiError(auth.error, auth.status)

  const rl = checkRateLimit(getRateLimitKey(req), 60, 60_000)
  if (!rl.allowed) return apiError('Rate limit exceeded.', 429, { retry_after: rl.retryAfter })

  const { id } = await context.params
  const supabase = createServiceClient()

  // Verify post exists and is owned by this user
  const { data: existing, error: fetchError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('author_id', auth.userId)
    .single()

  if (fetchError || !existing) return apiError('Post not found.', 404)
  if (existing.is_premium) {
    const { data: premiumBody } = await supabase.from('premium_post_contents').select('content').eq('post_id', id).maybeSingle()
    existing.content = premiumBody?.content ?? null
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return apiError('Invalid JSON body.', 400)
  }

  const parsed = postApiSchema.safeParse(rawBody)
  if (!parsed.success) return apiError('Invalid post fields', 422, { field_errors: parsed.error.flatten().fieldErrors })
  const body = parsed.data
  if (body.status === 'published' && existing.moderation_status !== 'approved') {
    return apiError('This post must be approved by an administrator before it can be published.', 422)
  }
  const hasEditorialChanges = body.title !== undefined || body.content !== undefined || body.slug !== undefined ||
    body.excerpt !== undefined || body.meta_title !== undefined || body.meta_description !== undefined ||
    body.image_url !== undefined || body.image_alt !== undefined || body.category !== undefined || body.tags !== undefined
  if (body.slug !== undefined) {
    const plan = planSlug(body.slug, body.title ?? existing.title, false, existing.slug)
    if (plan.error) return apiError(plan.error, 422, { field_errors: { slug: [plan.error] } })
    body.slug = plan.slug
    if (existing.status === 'published' && body.slug !== existing.slug && body.confirm_slug_change !== true) {
      return apiError(SLUG_CHANGE_CONFIRMATION, 422, { field_errors: { slug: [SLUG_CHANGE_CONFIRMATION] } })
    }
  }
  const candidate = {
    ...existing,
    ...(body.title !== undefined ? { title: body.title.trim() } : {}),
    ...(body.content !== undefined ? { content: body.content } : {}),
    ...(body.slug !== undefined ? { slug: body.slug } : {}),
    ...(body.excerpt !== undefined ? { excerpt: body.excerpt } : {}),
    ...(body.meta_title !== undefined ? { seo_title: body.meta_title } : {}),
    ...(body.meta_description !== undefined ? { seo_description: body.meta_description } : {}),
    ...(body.image_url !== undefined ? { cover_image: body.image_url } : {}),
    ...(body.image_alt !== undefined ? { cover_image_alt: body.image_alt.trim() } : {}),
    status: body.status ?? existing.status,
  }
  // Validate the entire resulting document, including PATCHes without status.
  if (candidate.status === 'published') {
    const fieldErrors = await validatePublication(supabase, candidate, body.editorial_reviewed, id)
    if (Object.keys(fieldErrors).length) return apiError('Publication blocked', 422, { field_errors: fieldErrors })
  } else if (body.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) {
    return apiError('Invalid slug', 422, { field_errors: { slug: ['Use lowercase letters, numbers and hyphens.'] } })
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.title !== undefined) updatePayload.title = body.title.trim()
  if (body.content !== undefined) updatePayload.content = body.content
  if (body.slug !== undefined) updatePayload.slug = body.slug
  if (body.excerpt !== undefined) updatePayload.excerpt = body.excerpt
  if (body.meta_title !== undefined) updatePayload.seo_title = body.meta_title
  if (body.meta_description !== undefined) updatePayload.seo_description = body.meta_description
  if (body.image_url !== undefined) updatePayload.cover_image = body.image_url
  if (body.image_alt !== undefined) updatePayload.cover_image_alt = body.image_alt.trim()

  // Handle status transitions
  if (body.status !== undefined) {
    updatePayload.status = body.status
    const currentPost = existing as { status: string; published_at: string | null }
    if (body.status === 'published' && !currentPost.published_at) {
      updatePayload.published_at = new Date().toISOString()
    } else if (body.status === 'draft') {
      updatePayload.published_at = null
    }
  }

  // Handle category
  if (body.category !== undefined) {
    updatePayload.category_id = body.category
      ? await resolveCategoryId(body.category, supabase)
      : null
  }

  if (existing.status === 'published' && hasEditorialChanges) {
    updatePayload.status = 'draft'
    updatePayload.moderation_status = 'pending'
    updatePayload.published_at = null
  } else if (existing.status === 'published' && body.status === 'draft') {
    updatePayload.moderation_status = 'not_submitted'
  }

  const { data: saved, error: updateError } = await savePostAtomic({ actorId: auth.userId,
    postId: id, payload: updatePayload, expectedUpdatedAt: existing.updated_at,
    expectedStatus: existing.status, tagNames: body.tags,
  })
  const updated = saved?.post

  if (isSlugConflict(updateError)) return apiError(SLUG_CONFLICT, 409, { field_errors: { slug: [SLUG_CONFLICT] } })
  if (updateError || !updated) {
    console.error('[PATCH /api/posts/[id]] Update failed:', updateError?.message)
    return apiError(updateError?.code === '40001' ? 'The post changed. Reload before trying again.' : 'The post and tags could not be saved. No changes were applied. Try again.', updateError?.code === '40001' ? 409 : 500)
  }

  let newsletterWarning: string | undefined
  if (updated.status === 'draft' && existing.status === 'published') {
    try { await cancelNewsletterSend(id) } catch (err) {
      console.error('[API] Newsletter cancellation failed:', err)
      newsletterWarning = 'Post unpublished, but newsletter cancellation could not be confirmed. Delivery checks block new batches while unpublished.'
    }
  } else if (updated.status === 'published' && existing.status !== 'published') {
    try { await scheduleNewsletterSend(id, { resetPendingDelay: true }) } catch (err) {
      console.error('[API] Newsletter scheduling failed:', err)
      newsletterWarning = 'Post published, but newsletter scheduling could not be confirmed. Check newsletter status in the dashboard before retrying.'
    }
  }
  if (existing.status === 'published' || updated.status === 'published') refreshPostPaths(existing.slug, updated.slug)
  else refreshDraftPaths()
  const { data: fullPost } = await supabase.from('posts').select(POST_FULL_SELECT).eq('id', id).single()
  let responsePost = (fullPost ?? updated) as unknown as RawPostFull
  if (responsePost.is_premium) {
    const { data: premiumBody } = await supabase.from('premium_post_contents').select('content').eq('post_id', id).maybeSingle()
    responsePost = { ...responsePost, content: premiumBody?.content ?? null }
  }
  const moderationWarning = updated.moderation_status === 'pending'
    ? 'The updated article is a draft awaiting administrator moderation before it can be public again.'
    : undefined
  return apiSuccess({ data: normalizeFullPost(responsePost), ...(newsletterWarning ? { newsletter_warning: newsletterWarning } : {}), ...(moderationWarning ? { moderation_warning: moderationWarning } : {}) })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req)
  if (!auth.success) return apiError(auth.error, auth.status)

  const rl = checkRateLimit(getRateLimitKey(req), 60, 60_000)
  if (!rl.allowed) return apiError('Rate limit exceeded.', 429, { retry_after: rl.retryAfter })

  const { id } = await context.params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id)
    .eq('author_id', auth.userId)
    .select('id, slug')
    .single()

  if (error || !data) return apiError('Post not found.', 404)

  refreshPostPaths(data.slug)
  return apiSuccess({ message: 'Post deleted successfully.' })
}
