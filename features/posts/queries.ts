import { createClient } from '@/lib/supabase/server'
import type { PostWithRelations } from './types'
import { getProfile } from '@/lib/auth/session'
import { getPremiumPostBody } from '@/features/premium/access'

export const POST_SELECT = `
  *,
  author:public_author_profiles!posts_author_id_fkey(id, full_name, avatar_url),
  category:categories(id, name, slug),
  tags:post_tags(tag:tags(id, name, slug))
`

export function normalizePost(raw: PostWithRelations): PostWithRelations {
  return {
    ...raw,
    // @ts-expect-error nested join shape
    tags: (raw.tags ?? []).map((pt: { tag: unknown }) => pt.tag).filter(Boolean),
  }
}

export async function getPublishedPosts(page = 1, limit = 10) {
  const supabase = await createClient()
  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await supabase
    .from('posts')
    .select(POST_SELECT, { count: 'exact' })
    .eq('status', 'published')
    .eq('moderation_status', 'approved')
    .order('published_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return {
    posts: (data ?? []).map(normalizePost) as PostWithRelations[],
    total: count ?? 0,
  }
}

export async function getPostBySlug(slug: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('moderation_status', 'approved')
    .single()

  if (error) return null
  return normalizePost(data as PostWithRelations)
}

export async function getAllPostsForDashboard(authorId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .order('updated_at', { ascending: false })

  if (authorId) {
    query = query.eq('author_id', authorId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(normalizePost) as PostWithRelations[]
}

export async function getPostById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .single()

  if (error) return null
  const post = normalizePost(data as PostWithRelations)
  if (!post.is_premium) return post
  const profile = await getProfile()
  const content = await getPremiumPostBody(post.id, profile?.id, post.author_id)
  return { ...post, content }
}

export async function getPostsByCategory(categorySlug: string, page = 1, limit = 10) {
  const supabase = await createClient()
  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await supabase
    .from('posts')
    .select(POST_SELECT, { count: 'exact' })
    .eq('status', 'published')
    .eq('moderation_status', 'approved')
    .eq('category.slug', categorySlug)
    .order('published_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return {
    posts: (data ?? []).map(normalizePost) as PostWithRelations[],
    total: count ?? 0,
  }
}

export async function getAllPublishedSlugs() {
  const { createStaticClient } = await import('@/lib/supabase/static')
  const supabase = createStaticClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('posts')
    .select('slug')
    .eq('status', 'published')
    .eq('moderation_status', 'approved')

  return ((data ?? []) as { slug: string }[]).map((p) => p.slug)
}

export type TagWithCount = { id: string; name: string; slug: string; count: number }

export async function getPopularTags(limit = 8): Promise<TagWithCount[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_popular_tags', { tag_limit: limit })

  if (error) throw error

  return ((data ?? []) as TagWithCount[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    count: Number(row.count),
  }))
}

// Resolve every former URL directly to the current slug, avoiding redirect
// chains and loops. RLS and the status check keep unpublished posts private.
export async function getPostRedirect(slug: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: route, error } = await supabase.from('post_slug_routes')
    .select('post_id').eq('slug', slug).eq('was_published', true).maybeSingle()
  if (error || !route) return null
  const { data: post } = await supabase.from('posts').select('slug')
    .eq('id', route.post_id).eq('status', 'published')
    .eq('moderation_status', 'approved').maybeSingle()
  return post && post.slug !== slug ? post.slug : null
}
