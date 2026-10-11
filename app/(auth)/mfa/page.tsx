import MfaChallenge from '@/components/auth/MfaChallenge'
import { safeReturnPath } from '@/lib/auth/navigation'

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams
  return <MfaChallenge next={safeReturnPath(params.next)} />
}
