import { safeReturnPath } from '@/lib/auth/navigation'
import { authErrorMessage } from '@/lib/auth/oauth'
import LoginForm from '@/components/auth/LoginForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams
  return <LoginForm next={safeReturnPath(params.next)} initialError={authErrorMessage(params.error)} />
}
