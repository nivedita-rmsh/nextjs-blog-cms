'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function MfaChallenge({ next }: { next: string }) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: factorData, error: factorsErr } = await supabase.auth.mfa.listFactors()
      if (factorsErr || !factorData.totp.length) {
        setError('Unable to load a verified authenticator. Reload to try again, or contact an administrator.')
        setInitializing(false)
        return
      }

      const factor = factorData.totp.find((f) => f.status === 'verified')
      if (!factor) {
        setError('Unable to load a verified authenticator. Reload to try again, or contact an administrator.')
        setInitializing(false)
        return
      }

      setFactorId(factor.id)

      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (challengeErr) {
        setError('Unable to start verification. Reload and try again.')
        setInitializing(false)
        return
      }

      setChallengeId(challengeData.id)
      setInitializing(false)
    }
    void init().catch(() => {
      setError('Unable to connect. Reload to try two-factor verification again.')
      setInitializing(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleVerify() {
    if (loading || !factorId || !challengeId || code.length !== 6) return
    setLoading(true)
    setError(null)

    try {
      const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
      if (verifyErr) {
        setError('Invalid code — please try again')
        return
      }

      window.location.replace(next)
    } catch {
      setError('Unable to connect. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (initializing) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mt-1">Enter the 6-digit code from your authenticator app</p>
      </div>

      <div className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="mfa-code">Verification Code</Label>
          <Input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="text-center tracking-widest text-lg h-12"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            autoFocus
          />
        </div>

        <Button
          onClick={handleVerify}
          disabled={loading || !challengeId || code.length !== 6}
          className="w-full h-10 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0"
        >
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</> : 'Verify'}
        </Button>
      </div>
    </div>
  )
}
