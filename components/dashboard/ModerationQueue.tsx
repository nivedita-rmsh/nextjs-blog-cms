'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { approvePostForPublication, rejectPostForPublication } from '@/features/posts/moderation-actions'

export type ModerationQueueItem = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  authorName: string
  authorEmail: string
  updatedAt: string | null
}

export function ModerationQueue({ posts }: { posts: ModerationQueueItem[] }) {
  const router = useRouter()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDecision(id: string, decision: 'approve' | 'reject') {
    setProcessingId(id)
    startTransition(async () => {
      const result = decision === 'approve' ? await approvePostForPublication(id) : await rejectPostForPublication(id)
      if (result.error) toast.error(result.error)
      else {
        toast.success(decision === 'approve' ? 'Article approved and published.' : 'Article rejected and returned to draft.')
        if (result.newsletterWarning) toast.warning(result.newsletterWarning)
        router.refresh()
      }
      setProcessingId(null)
    })
  }

  if (posts.length === 0) return <div className="rounded-xl border p-8 text-center text-muted-foreground">No articles are waiting for moderation.</div>
  return (
    <div className="space-y-4">
      {posts.map(post => (
        <article key={post.id} className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-lg font-semibold">{post.title || 'Untitled draft'}</h2>
              <p className="text-sm text-muted-foreground">Submitted by {post.authorName}{post.authorEmail ? ` · ${post.authorEmail}` : ''}{post.updatedAt ? ` · Updated ${new Date(post.updatedAt).toLocaleString()}` : ''}</p>
              <p className="text-sm text-muted-foreground">{post.excerpt || 'No excerpt provided.'}</p>
              <Link className="text-sm underline underline-offset-4" href={`/dashboard/posts/${post.id}/edit`}>Review article</Link>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isPending} onClick={() => handleDecision(post.id, 'approve')}>{isPending && processingId === post.id ? 'Approving…' : 'Approve & publish'}</Button>
              <Button variant="outline" disabled={isPending} onClick={() => handleDecision(post.id, 'reject')}>{isPending && processingId === post.id ? 'Working…' : 'Reject'}</Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
