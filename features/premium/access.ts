import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

export async function hasPremiumAccess(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const supabase = createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (profile?.role === 'admin') return true
  const { data: entitlement, error } = await supabase.from('premium_subscriptions')
    .select('status, expires_at').eq('user_id', userId).maybeSingle()
  if (error || entitlement?.status !== 'active') return false
  return !entitlement.expires_at || new Date(entitlement.expires_at).getTime() > Date.now()
}

export async function getPremiumPostBody(
  postId: string,
  userId: string | null | undefined,
  authorId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null
  const hasAccess = authorId === userId || await hasPremiumAccess(userId)
  if (!hasAccess) return null
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('premium_post_contents')
    .select('content').eq('post_id', postId).maybeSingle()
  if (error) return null
  return data?.content ?? null
}
