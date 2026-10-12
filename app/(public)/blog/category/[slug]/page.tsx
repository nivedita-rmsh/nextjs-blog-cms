import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PostList } from '@/features/posts/components/PostList'
import type { PostWithRelations } from '@/features/posts/types'

export const revalidate = 60

interface CategoryPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const { createStaticClient } = await import('@/lib/supabase/static')
  const supabase = createStaticClient()
  if (!supabase) return []
  const { data } = await supabase.from('categories').select('slug')
  return ((data ?? []) as { slug: string }[]).map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!category) return {}
  return {
    title: `${category.name} - Blog`,
    description: category.description ?? `Posts in ${category.name}`,
  }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!category) notFound()

  const { data: postsData } = await supabase
    .from('posts')
    .select(`
      *,
      author:public_author_profiles!posts_author_id_fkey(id, full_name, avatar_url),
      category:categories(id, name, slug),
      tags:post_tags(tag:tags(id, name, slug))
    `)
    .eq('status', 'published')
    .eq('moderation_status', 'approved')
    .eq('category_id', category.id)
    .order('published_at', { ascending: false })

  const posts = (postsData ?? []).map((p) => ({
    ...p,
    // @ts-expect-error nested join shape
    tags: (p.tags ?? []).map((pt) => pt.tag).filter(Boolean),
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
        <p className="text-sm font-medium text-primary uppercase tracking-widest">Category</p>
        <h1 className="text-4xl font-bold tracking-tight">{category.name}</h1>
        {category.description && (
          <p className="text-muted-foreground text-base max-w-xl">{category.description}</p>
        )}
      </div>
      <PostList posts={posts} />
    </div>
  )
}
