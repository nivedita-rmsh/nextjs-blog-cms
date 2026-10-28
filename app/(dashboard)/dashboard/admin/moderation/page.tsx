import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/service'
import { ModerationQueue } from '@/components/dashboard/ModerationQueue'

export const dynamic = 'force-dynamic'

export default async function ModerationPage() {
  const profile = await requireAuth()
  if (profile.role !== 'admin') redirect('/dashboard')
  const supabase = createServiceClient()
  const { data: posts, error } = await supabase.from('posts')
    .select('id, title, slug, excerpt, author_id, updated_at')
    .eq('moderation_status', 'pending').order('updated_at', { ascending: false })
  if (error) throw new Error('The moderation queue could not be loaded.')
  const authorIds = [...new Set((posts ?? []).map(post => post.author_id).filter((id): id is string => Boolean(id)))]
  const { data: authors } = authorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', authorIds)
    : { data: [] }
  const authorById = new Map((authors ?? []).map(author => [author.id, author]))
  const items = (posts ?? []).map(post => {
    const author = post.author_id ? authorById.get(post.author_id) : undefined
    return {
      id: post.id, title: post.title, slug: post.slug, excerpt: post.excerpt,
      authorName: author?.full_name ?? 'Unknown author', authorEmail: author?.email ?? '',
      updatedAt: post.updated_at,
    }
  })
  return (
    <div className="container max-w-5xl mx-auto py-10 px-6 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Admin</p>
        <h1 className="text-3xl font-bold">Content moderation</h1>
        <p className="mt-2 text-muted-foreground">Review submitted articles before they become public. Approval publishes the reviewed version; rejection returns it to draft.</p>
      </div>
      <ModerationQueue posts={items} />
    </div>
  )
}
