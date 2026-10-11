import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth/session'
import { GeneralInfoForm } from '@/features/profile/components/GeneralInfoForm'
import { AvatarUpload } from '@/features/profile/components/AvatarUpload'
import { SocialLinksForm } from '@/features/profile/components/SocialLinksForm'
import { ChangePasswordForm } from '@/features/profile/components/ChangePasswordForm'
import { TwoFactorSetup } from '@/features/profile/components/TwoFactorSetup'

export const metadata: Metadata = { title: 'My Profile' }

export default async function ProfilePage() {
  const profile = await requireAuth()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const useEmailRecovery = !!user?.identities?.some(identity => identity.provider === 'google' || identity.provider === 'github')

  return (
    <div className="p-8 animate-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your public author information and account settings
        </p>
        <Link href={`/authors/${profile.id}`} className="inline-block mt-2 text-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          View your public author profile
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Main column */}
        <div className="space-y-6">
          <GeneralInfoForm profile={profile} />
          <SocialLinksForm profile={profile} />
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <AvatarUpload profile={profile} />
          <ChangePasswordForm useEmailRecovery={useEmailRecovery} />
          <TwoFactorSetup />
        </div>
      </div>
    </div>
  )
}
