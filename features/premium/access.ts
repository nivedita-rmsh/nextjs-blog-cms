import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

export async function hasPremiumAccess(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false //denies anonymous users.
  const supabase = createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (profile?.role === 'admin') return true //checks the user's role
  const { data: entitlement, error } = await supabase.from('premium_subscriptions') // retrieves subscription status and expiry.
    .select('status, expires_at').eq('user_id', userId).maybeSingle()
  if (error || entitlement?.status !== 'active') return false //denies access if the query fails or the subscription is inactive or revoked
  return !entitlement.expires_at || new Date(entitlement.expires_at).getTime() > Date.now()
}

export async function getPremiumPostBody( 
  postId: string,
  userId: string | null | undefined,
  authorId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null //reject anonymous users
  const hasAccess = authorId === userId || await hasPremiumAccess(userId) //check for premium access
  if (!hasAccess) return null
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('premium_post_contents')
    .select('content').eq('post_id', postId).maybeSingle()
  if (error) return null
  return data?.content ?? null // only after authorization, retrieve article body if query fails, return null
}
