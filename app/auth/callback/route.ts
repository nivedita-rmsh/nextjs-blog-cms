import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { completeOAuth } from '@/app/auth/oauth/callback'
import { clearRecoveryGrant, createRecoveryGrant } from '@/lib/auth/recovery'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const isRecovery = searchParams.get('type') === 'recovery'
  // Fixed application destinations only; never concatenate an untrusted next URL.
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin))
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }

  if (searchParams.get('flow') === 'oauth') {
    return redirect(await completeOAuth(searchParams))
  }

  if (isRecovery) {
    try {
      await clearRecoveryGrant()
      if (tokenHash) {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (!error && data.session) {
          await createRecoveryGrant(supabase)
          return redirect('/reset-password')
        }
      }
    } catch {
      // Never expose Auth/provider errors or recovery tokens in the URL.
    }
    return redirect('/reset-password?error=invalid_recovery')
  }

  // A recovery link with an old/default email template must not fall through to
  // the dashboard. Use the documented token-hash recovery email template.
  if (searchParams.get('next') === '/reset-password') {
    return redirect('/reset-password?error=invalid_recovery')
  }
  if (code) {
    try {
      const supabase = await createClient()
      // Signup uses its legacy PKCE verifier. Never borrow an OAuth verifier
      // slot from query parameters if the OAuth flow marker was removed.
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return redirect('/dashboard')
    } catch {
      // Present a safe retry message for network and unexpected Auth failures.
    }
  }
  return redirect('/login?error=auth_callback_failed')
}
