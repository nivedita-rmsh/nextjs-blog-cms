'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { AlertCircle, Loader2, Mail, Lock } from 'lucide-react'
import { login } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { Alert, AlertDescription } from '@/components/ui/alert'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginForm({ next = '/dashboard', initialError = null }: { next?: string; initialError?: string | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [oauthPending, setOauthPending] = useState(false)
  const submitting = useRef(false)

  const { register, handleSubmit, clearErrors, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(values: LoginFormValues) {
    if (submitting.current || oauthPending) return
    submitting.current = true
    setError(null)
    setLoading(true)
    const formData = new FormData()
    formData.set('email', values.email)
    formData.set('password', values.password)
    try {
      const result = await login(formData)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
      } else if (result?.success) {
        router.push(next)
        return
      }
    } catch {
      setError('Unable to connect. Check your connection and try again.')
    }
    submitting.current = false
    setLoading(false)
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
        <p className="text-sm text-gray-500 mt-1">Sign in to your account to continue</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <OAuthButtons next={next} disabled={loading || oauthPending} onPendingChange={setOauthPending} onError={setError} />

      <form aria-busy={loading || oauthPending} onSubmit={event => void handleSubmit(onSubmit)(event)} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-gray-700">
            Email address
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              disabled={loading || oauthPending}
              id="email"
              type="email"
              placeholder="you@example.com"
              className="pl-9 h-10"
              {...register('email', { onChange: () => clearErrors('email') })}
            />
          </div>
          {errors.email && (
            <p className="flex items-center gap-1 text-xs text-red-600 animate-in fade-in duration-150">
              <AlertCircle className="size-3 shrink-0" />{errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium text-gray-700">
            Password
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              disabled={loading || oauthPending}
              id="password"
              type="password"
              placeholder="••••••••"
              className="pl-9 h-10"
              {...register('password', { onChange: () => clearErrors('password') })}
            />
          </div>
          {errors.password && (
            <p className="flex items-center gap-1 text-xs text-red-600 animate-in fade-in duration-150">
              <AlertCircle className="size-3 shrink-0" />{errors.password.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading || oauthPending}
          className="w-full h-10 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 shadow-xs shadow-blue-500/20 transition-all duration-200 hover:shadow-md hover:shadow-blue-500/20 hover:-translate-y-px active:translate-y-0"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <p className="text-sm text-center mt-6">
        <Link href="/forgot-password" className="text-blue-600 font-medium hover:text-blue-700 transition-colors">
          Forgot password?
        </Link>
      </p>

      <p className="text-sm text-gray-500 text-center mt-6">
        Don&apos;t have an account?{' '}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-blue-600 font-medium hover:text-blue-700 transition-colors">
          Create one
        </Link>
      </p>
    </div>
  )
}
