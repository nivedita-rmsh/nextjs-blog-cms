'use server'

import { cookies } from 'next/headers'
import { createOAuthClient } from '@/lib/auth/oauth-server'
import { AUTH_ERRORS, isOAuthProvider, OAUTH_CALLBACK_PATH, OAUTH_CONTEXT_COOKIE } from '@/lib/auth/oauth'
import { safeReturnPath } from '@/lib/auth/navigation'

export async function startOAuth(provider: unknown, next: unknown) {
  if (!isOAuthProvider(provider)) return { error: AUTH_ERRORS.oauth_unavailable }
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '')
    if (site.username || site.password || (site.protocol !== 'https:' &&
      !(site.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(site.hostname)))) {
      return { error: AUTH_ERRORS.oauth_unavailable }
    }
    const callback = new URL(OAUTH_CALLBACK_PATH, site.origin).toString()
    const { supabase, commit } = await createOAuthClient()
    const { data: existing, error: identityError } = await supabase.auth.getUser()
    if (existing.user) return { error: 'You are already signed in. Sign out before choosing another account.' }
    // A missing session is expected; other identity failures must not initiate account switching.
    if (identityError && identityError.name !== 'AuthSessionMissingError') return { error: AUTH_ERRORS.oauth_unavailable }
    // signInWithOAuth only builds a URL; check public Auth settings first so a
    // disabled provider/outage produces an in-app retry message, not an Auth JSON page.
    const settings = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (!settings.ok || (await settings.json()).external?.[provider] !== true) return { error: AUTH_ERRORS.oauth_unavailable }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callback,
        scopes: provider === 'github' ? 'user:email' : 'openid email profile',
        skipBrowserRedirect: true,
      },
    })
    if (error || !data.url) return { error: AUTH_ERRORS.oauth_unavailable }
    const authorize = new URL(data.url)
    const authBase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    if (authorize.origin !== authBase.origin || authorize.pathname !== `${authBase.pathname.replace(/\/$/, '')}/auth/v1/authorize`) {
      return { error: AUTH_ERRORS.oauth_unavailable }
    }
    // The installed SDK returns the verifier-slot ID separately. Keep it out
    // of the URL so exact callback allowlists work without wildcards.
    const flowId = data.flowId
    if (!flowId || !/^[a-f0-9]{32}$/.test(flowId) || authorize.searchParams.get('redirect_to') !== callback) {
      return { error: AUTH_ERRORS.oauth_unavailable }
    }
    commit({ verifierSlotsOnly: true })
    const store = await cookies()
    store.set(OAUTH_CONTEXT_COOKIE, JSON.stringify({ provider, next: safeReturnPath(next), flowId }), {
      httpOnly: true, secure: site.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 600,
    })
    return { url: authorize.toString() }
  } catch {
    return { error: AUTH_ERRORS.oauth_unavailable }
  }
}
