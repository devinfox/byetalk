'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  Target,
  Phone,
  Settings,
  LogOut,
  Calendar,
  CheckSquare,
  Mail,
  Inbox,
  FolderOpen,
  Video,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Presentation,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@/types/database.types'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  subitems?: NavItem[]
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Leads', href: '/dashboard/leads', icon: Users },
  { name: 'Deals', href: '/dashboard/deals', icon: Target },
  { name: 'Calls', href: '/dashboard/calls', icon: Phone },
  { name: 'Meetings', href: '/dashboard/meetings', icon: Video },
  { name: 'Tasks', href: '/dashboard/tasks', icon: CheckSquare },
  {
    name: 'Email',
    href: '/dashboard/email',
    icon: Inbox,
    subitems: [
      { name: 'Templates', href: '/dashboard/email-templates', icon: FileText },
      { name: 'Funnels', href: '/dashboard/email-templates?tab=funnels', icon: Filter },
    ]
  },
  { name: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
  { name: 'Presentations', href: '/dashboard/presentations', icon: Presentation },
]

const bottomNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
  user: User | null
  unreadEmailCount?: number
}

export function Sidebar({ user, unreadEmailCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [expandedItems, setExpandedItems] = useState<string[]>(['Email'])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const toggleExpanded = (name: string) => {
    setExpandedItems(prev =>
      prev.includes(name)
        ? prev.filter(n => n !== name)
        : [...prev, name]
    )
  }

  const renderNavItem = (item: NavItem, isSubitem = false) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    const hasSubitems = item.subitems && item.subitems.length > 0
    const isExpanded = expandedItems.includes(item.name)
    const showBadge = item.name === 'Email' && unreadEmailCount > 0

    if (hasSubitems) {
      const isParentActive = isActive || item.subitems!.some(sub =>
        pathname === sub.href || pathname.startsWith(sub.href + '/')
      )

      return (
        <div key={item.name}>
          <div className="flex items-center">
            <Link
              href={item.href}
              className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-l-xl text-sm font-medium transition-all duration-200 ${
                isParentActive
                  ? 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 text-yellow-400 border-y border-l border-yellow-500/30'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isParentActive ? 'text-yellow-400' : ''}`} />
              <span className="flex-1">{item.name}</span>
              {showBadge && (
                <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
                  {unreadEmailCount > 99 ? '99+' : unreadEmailCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => toggleExpanded(item.name)}
              className={`px-2 py-2.5 rounded-r-xl transition-all duration-200 ${
                isParentActive
                  ? 'bg-gradient-to-r from-yellow-600/10 to-yellow-500/5 text-yellow-400 border-y border-r border-yellow-500/30'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-2">
              {item.subitems!.map(subitem => renderNavItem(subitem, true))}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link
        key={item.name}
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 text-yellow-400 border border-yellow-500/30'
            : 'text-gray-300 hover:bg-white/5 hover:text-white'
        } ${isSubitem ? 'text-xs py-2' : ''}`}
      >
        <item.icon className={`w-4 h-4 ${isActive ? 'text-yellow-400' : ''} ${isSubitem ? 'w-4 h-4' : 'w-5 h-5'}`} />
        <span className="flex-1">{item.name}</span>
        {showBadge && (
          <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
            {unreadEmailCount > 99 ? '99+' : unreadEmailCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="w-64 glass-card flex flex-col relative z-10 m-2 mr-0 rounded-2xl">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center">
          <Image
            src="/citadel-gold-logo.png"
            alt="Citadel Gold"
            width={180}
            height={40}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => renderNavItem(item))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        {bottomNavigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 text-yellow-400 border border-yellow-500/30'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'text-yellow-400' : ''}`} />
              {item.name}
            </Link>
          )
        })}

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          Sign out
        </button>
      </div>

      {/* User Info */}
      {user && (
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white/5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-sm">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-xs text-yellow-400/70 truncate capitalize">
                {user.role?.replace('_', ' ')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
