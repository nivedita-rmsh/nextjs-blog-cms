'use server'

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/service'
import { validatePublication, type FieldErrors } from '@/features/posts/publication'
import { cancelNewsletterSend, scheduleNewsletterSend } from '@/features/newsletter/actions'
import { refreshDraftPaths, refreshPostPaths } from '@/features/posts/cache'

type ModerationActionResult = { error?: string; fieldErrors?: FieldErrors; newsletterWarning?: string }

export async function approvePostForPublication(id: string): Promise<ModerationActionResult> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { error: 'Only administrators may approve articles.' }
  const supabase = createServiceClient()
  const { data: post, error } = await supabase.from('posts').select('*').eq('id', id).eq('moderation_status', 'pending').single()
  if (error || !post) return { error: 'This article is no longer waiting for moderation. Refresh the queue.' }
  let validationPost = post
  if (post.is_premium) {
    const { data: premiumBody } = await supabase.from('premium_post_contents').select('content').eq('post_id', id).maybeSingle()
    validationPost = { ...post, content: premiumBody?.content ?? null }
  }
  const fieldErrors = await validatePublication(supabase, validationPost, true, id)
  if (Object.keys(fieldErrors).length) return { error: 'Approval blocked. The article no longer meets publication requirements.', fieldErrors }
  const now = new Date().toISOString()
  const { data: approved, error: updateError } = await supabase.from('posts')
    .update({ status: 'published', moderation_status: 'approved', published_at: now, updated_at: now })
    .eq('id', id).eq('moderation_status', 'pending').eq('updated_at', post.updated_at)
    .select('id, slug').maybeSingle()
  if (updateError || !approved) return { error: 'The article changed while moderation was in progress. Refresh and review it again.' }
  let newsletterWarning: string | undefined
  try { await scheduleNewsletterSend(approved.id, { resetPendingDelay: true }) } catch (err) {
    console.error('[approvePostForPublication] Newsletter scheduling failed:', err)
    newsletterWarning = 'Article approved and published, but newsletter scheduling could not be confirmed.'
  }
  refreshPostPaths(approved.slug)
  revalidatePath('/dashboard/posts')
  revalidatePath('/dashboard/admin/moderation')
  return { newsletterWarning }
}

export async function rejectPostForPublication(id: string): Promise<ModerationActionResult> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { error: 'Only administrators may reject articles.' }
  const supabase = createServiceClient()
  const { data: post, error } = await supabase.from('posts').select('id, slug, updated_at')
    .eq('id', id).eq('moderation_status', 'pending').single()
  if (error || !post) return { error: 'This article is no longer waiting for moderation. Refresh the queue.' }
  const now = new Date().toISOString()
  const { data: rejected, error: updateError } = await supabase.from('posts')
    .update({ status: 'draft', moderation_status: 'rejected', published_at: null, updated_at: now })
    .eq('id', id).eq('moderation_status', 'pending').eq('updated_at', post.updated_at)
    .select('id, slug').maybeSingle()
  if (updateError || !rejected) return { error: 'The article changed while moderation was in progress. Refresh and review it again.' }
  try { await cancelNewsletterSend(id) } catch (err) {
    console.error('[rejectPostForPublication] Newsletter cancellation failed:', err)
  }
  refreshPostPaths(rejected.slug)
  refreshDraftPaths()
  revalidatePath('/dashboard/admin/moderation')
  return {}
}
