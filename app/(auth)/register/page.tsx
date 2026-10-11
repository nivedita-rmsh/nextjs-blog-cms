import { safeReturnPath } from '@/lib/auth/navigation'
import { authErrorMessage } from '@/lib/auth/oauth'
import RegisterForm from '@/components/auth/RegisterForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Account',
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams
  return <RegisterForm next={safeReturnPath(params.next)} initialError={authErrorMessage(params.error)} />
}
