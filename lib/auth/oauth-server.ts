import 'server-only'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { fetchWithoutProviderTokens } from '@/lib/auth/token-fetch'

/** Buffer Auth cookie writes until the caller has validated the new identity. */
export async function createOAuthClient() {
  const cookieStore = await cookies()
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithoutProviderTokens },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: values => { for (const item of values) pending.set(item.name, item) },
      },
    },
  )
  return {
    supabase,
    commit({ verifierSlotsOnly = false } = {}) {
      for (const { name, value, options } of pending.values()) {
        // OAuth must use its explicit verifier slot, never signup's legacy slot.
        // This also invalidates an older signup attempt in this browser.
        if (verifierSlotsOnly && /-auth-token-code-verifier(?:\.\d+)?$/.test(name)) {
          cookieStore.set(name, '', { ...options, maxAge: 0 })
        } else {
          cookieStore.set(name, value, options)
        }
      }
    },
  }
}
