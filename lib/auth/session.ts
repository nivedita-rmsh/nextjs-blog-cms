import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { can } from '@/lib/permissions'
import type { Permission, Role } from '@/lib/permissions'
import type { Profile } from '@/lib/supabase/types'

/**
 * Returns the current user's full profile, or null if not authenticated.
 * Use this in server actions where you need to check auth without redirecting.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return null

  // Provider login is not an MFA exemption. Protect actions/APIs using this
  // shared helper, including routes that do not pass through the dashboard proxy.
  try {
    const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const enrolled = user.factors?.some(factor => factor.status === 'verified')
    if (error || !assurance?.currentLevel || !assurance.nextLevel || ((enrolled || assurance.nextLevel === 'aal2') && assurance.currentLevel !== 'aal2')) return null
  } catch {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}

/**
 * Returns the current user's profile or redirects to /login.
 * Use this in pages and layouts that require authentication.
 */
export async function requireAuth(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  return profile
}

/**
 * Returns the current user's profile if they have the given permission,
 * redirects to /login if not authenticated, or to /dashboard if unauthorized.
 * Use this in pages and actions that require a specific role/permission.
 */
export async function requirePermission(permission: Permission): Promise<Profile> {
  const profile = await requireAuth()
  if (!can(profile.role as Role, permission)) redirect('/dashboard')
  return profile
}
