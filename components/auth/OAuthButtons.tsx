'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startOAuth } from '@/app/auth/oauth/actions'
import { AUTH_ERRORS, OAUTH_PROVIDERS, type OAuthProvider } from '@/lib/auth/oauth'

function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  return provider === 'google' ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" data-icon="inline-start">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.06a10 10 0 0 0 0 9.04l3.34-2.59Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.59A5.99 5.99 0 0 1 12 5.95Z" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" data-icon="inline-start">
      <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.16 1.74 1.16 1.01 1.73 2.64 1.23 3.28.94.1-.73.4-1.23.72-1.51-2.5-.29-5.13-1.25-5.13-5.57 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.64 0c2.15-1.46 3.09-1.15 3.09-1.15.62 1.55.23 2.69.12 2.98.72.79 1.15 1.79 1.15 3.02 0 4.33-2.64 5.28-5.15 5.56.41.35.77 1.03.77 2.08v3.11c0 .3.2.65.77.54A11.25 11.25 0 0 0 12 .75Z" />
    </svg>
  )
}

export function OAuthButtons({ next, disabled, onPendingChange, onError }: {
  next: string
  disabled: boolean
  onPendingChange: (pending: boolean) => void
  onError: (message: string | null) => void
}) {
  const busy = useRef(false)
  const [provider, setProvider] = useState<OAuthProvider | null>(null)
  useEffect(() => {
    function restore(event: PageTransitionEvent) {
      if (!event.persisted) return
      busy.current = false
      setProvider(null)
      onPendingChange(false)
    }
    window.addEventListener('pageshow', restore)
    return () => window.removeEventListener('pageshow', restore)
  }, [onPendingChange])

  async function begin(selected: OAuthProvider) {
    if (disabled || busy.current) return
    busy.current = true
    setProvider(selected)
    onError(null)
    onPendingChange(true)
    try {
      const result = await startOAuth(selected, next)
      if (result.url) {
        window.location.assign(result.url)
        return
      }
      onError(result.error ?? AUTH_ERRORS.oauth_unavailable)
    } catch {
      onError('Unable to connect. Check your connection and try signing in again.')
    }
    busy.current = false
    setProvider(null)
    onPendingChange(false)
  }
  return (
    <div className="mb-6 flex flex-col gap-3" role="group" aria-label="Other sign-in methods">
      {OAUTH_PROVIDERS.map(item => (
        <Button key={item} variant="outline" className="min-h-11 w-full motion-reduce:transition-none"
          disabled={disabled || !!provider} aria-busy={provider === item} onClick={() => begin(item)}>
          {provider === item ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" data-icon="inline-start" /> : <ProviderIcon provider={item} />}
          Continue with {item === 'google' ? 'Google' : 'GitHub'}
        </Button>
      ))}
      <p role="status" className={provider ? 'text-center text-sm text-muted-foreground' : 'sr-only'}>
        {provider ? `Connecting to ${provider === 'google' ? 'Google' : 'GitHub'}…` : ''}
      </p>
      <p className="text-center text-sm text-muted-foreground">Or continue with email</p>
    </div>
  )
}
