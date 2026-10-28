import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PostList } from '@/features/posts/components/PostList'
import type { PostWithRelations } from '@/features/posts/types'

export const revalidate = 60

interface TagPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const { createStaticClient } = await import('@/lib/supabase/static')
  const supabase = createStaticClient()
  if (!supabase) return []
  const { data } = await supabase.from('tags').select('slug').is('merged_into', null)
  return ((data ?? []) as { slug: string }[]).map((t) => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: tag } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tag) return {}
  if (tag.merged_into) {
    const { data: canonical } = await supabase.from('tags').select('slug').is('merged_into', null).eq('id', tag.merged_into).single()
    if (canonical) permanentRedirect(`/blog/tag/${canonical.slug}`)
  }
  return {
    title: `#${tag.name} - Blog`,
    description: `Posts tagged with ${tag.name}`,
  }
}

export default async function TagPage({ params }: TagPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tag } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tag) notFound()
  if (tag.merged_into) {
    const { data: canonical } = await supabase.from('tags').select('slug').is('merged_into', null).eq('id', tag.merged_into).single()
    if (!canonical) notFound()
    permanentRedirect(`/blog/tag/${canonical.slug}`)
  }

  const { data: postTagsData } = await supabase
    .from('post_tags')
    .select(`
      post:posts!post_tags_post_id_fkey(
        *,
        author:public_author_profiles!posts_author_id_fkey(id, full_name, avatar_url),
        category:categories(id, name, slug),
        tags:post_tags(tag:tags(id, name, slug))
      )
    `)
    .eq('tag_id', tag.id)

  type AnyRow = Record<string, unknown>
  const posts = ((postTagsData ?? []) as AnyRow[])
    .map((pt) => pt.post as PostWithRelations)
    .filter(Boolean)
    .filter((p) => p.status === 'published' && p.moderation_status === 'approved')
    .map((p) => ({
      ...p,
      tags: ((p.tags ?? []) as AnyRow[]).map((pt) => pt.tag).filter(Boolean),
    })) as PostWithRelations[]

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 space-y-10">
      <div className="space-y-2 border-b pb-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          Back to Blog
        </Link>
        <p className="text-sm font-medium text-primary uppercase tracking-widest">Tag</p>
        <h1 className="text-4xl font-bold tracking-tight">#{tag.name}</h1>
      </div>
      <PostList posts={posts} />
    </div>
  )
}
