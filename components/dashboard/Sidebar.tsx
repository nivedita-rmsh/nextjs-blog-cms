'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, FileText, PlusCircle, Users, FolderOpen, Tag, LogOut, Menu, X, MessageSquare, Loader2, Code, Bot, UserCircle, Mail, ShieldCheck,
} from 'lucide-react'
import { allowEditorNavigation } from '@/features/posts/drafts/navigation'
import { cn } from '@/lib/utils'
import { can } from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import type { Profile } from '@/lib/supabase/types'

interface SidebarProps {
  readonly profile: Profile
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [previousPathname, setPreviousPathname] = useState(pathname)
  const role = profile.role as Role
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Close drawer on navigation
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname)
    setMobileOpen(false)
  }

  function handleLogout() {
    if (!allowEditorNavigation()) return
    startTransition(async () => {
      try {
        await fetch('/api/auth/signout', { method: 'POST' })
      } finally {
        router.replace('/login')
        router.refresh()
      }
    })
  }

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: true, section: 'main' as const },
    { href: '/dashboard/profile', icon: UserCircle, label: 'Profile', show: true, section: 'main' as const },
    { href: '/dashboard/posts', icon: FileText, label: 'Posts', show: true, section: 'main' as const },
    { href: '/dashboard/posts/new', icon: PlusCircle, label: 'New Post', show: true, section: 'main' as const },
    { href: '/dashboard/ai-assistant', icon: Bot, label: 'AI Assistant', show: true, section: 'main' as const },
    { href: '/dashboard/developer', icon: Code, label: 'Developer', show: can(role, 'api_keys:write'), section: 'main' as const },
    { href: '/dashboard/admin/users', icon: Users, label: 'Users', show: can(role, 'users:read'), section: 'admin' as const },
    { href: '/dashboard/admin/categories', icon: FolderOpen, label: 'Categories', show: can(role, 'categories:write'), section: 'admin' as const },
    { href: '/dashboard/admin/tags', icon: Tag, label: 'Tags', show: can(role, 'tags:write'), section: 'admin' as const },
    { href: '/dashboard/comments', icon: MessageSquare, label: 'Comments', show: can(role, 'comments:delete:all'), section: 'admin' as const },
    { href: '/dashboard/admin/newsletter', icon: Mail, label: 'Newsletter', show: can(role, 'users:read'), section: 'admin' as const },
    { href: '/dashboard/admin/moderation', icon: ShieldCheck, label: 'Moderation', show: role === 'admin', section: 'admin' as const },
  ]

  const initials = profile.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : profile.email[0].toUpperCase()

  const mainItems = navItems.filter((item) => item.show && item.section === 'main')
  const adminItems = navItems.filter((item) => item.show && item.section === 'admin')

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group hover:opacity-80 transition-opacity">
          <Image src="/logo.png" alt="The Practical Engineer" width={36} height={36} className="rounded-lg shrink-0" />
          <span className="font-bold text-white text-lg tracking-tight">The Practical Engineer</span>
        </Link>
        <button
          className="md:hidden text-slate-400 hover:text-white p-1"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
        {/* Main */}
        <div className="space-y-0.5">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
            Main
          </p>
          {mainItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-slate-500 group-hover:text-white')} />
                {item.label}
                {item.href === '/dashboard/posts/new' && (
                  <span className="ml-auto text-[10px] font-semibold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                    New
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Admin */}
        {adminItems.length > 0 && (
          <div className="space-y-0.5">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
              Admin
            </p>
            {adminItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-slate-500')} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-slate-800">
        <Link href="/dashboard/profile" className="flex items-center gap-3 px-3 py-3 rounded-lg mb-1 hover:bg-slate-800 transition-colors">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt={profile.full_name ?? profile.email} className="w-8 h-8 rounded-full object-cover shrink-0" />
          ) : (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile.full_name ?? profile.email}</p>
            <p className="text-xs text-slate-500 capitalize">{profile.role}</p>
          </div>
        </Link>
        <button
          onClick={handleLogout}
          disabled={isPending}
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            : <LogOut className="h-4 w-4 shrink-0" />
          }
          {isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-14 bg-slate-950 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <Image src="/logo.png" alt="The Practical Engineer" width={32} height={32} className="rounded-lg shrink-0" />
          <span className="font-bold text-white text-base tracking-tight">The Practical Engineer</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="text-slate-400 hover:text-white p-1"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — drawer on mobile, static on md+ */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-slate-950 flex flex-col border-r border-slate-800 transition-transform duration-300 ease-in-out',
          'md:relative md:translate-x-0 md:z-auto md:h-auto md:min-h-screen',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
