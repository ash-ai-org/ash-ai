'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useHealth } from '@/lib/hooks'
import {
  Activity,
  Bot,
  Code2,
  Key,
  LayoutDashboard,
  ListOrdered,
  Lock,
  ScrollText,
  Settings,
  TrendingUp,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  external?: boolean
}

interface DashboardNavProps {
  extraItems?: NavItem[]
  extraBottomLinks?: NavItem[]
  branding?: string
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/playground', label: 'Playground', icon: Code2 },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/sessions', label: 'Sessions', icon: Activity },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/analytics', label: 'Analytics', icon: TrendingUp },
]

const bottomLinks: NavItem[] = [
  { href: '/settings/api-keys', label: 'API Keys', icon: Key },
  { href: '/settings/credentials', label: 'Credentials', icon: Lock },
  { href: '/queue', label: 'Queue', icon: ListOrdered },
]

export function DashboardNav({ extraItems, extraBottomLinks, branding }: DashboardNavProps) {
  const pathname = usePathname()
  const { health } = useHealth()

  const allItems = extraItems ? [...navItems, ...extraItems] : navItems
  const allBottomLinks = extraBottomLinks ? [...bottomLinks, ...extraBottomLinks] : bottomLinks

  const isHealthy = health?.status === 'ok'

  return (
    <nav className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-white/10 bg-[#0d1117]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-white/10">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500">
          <span className="text-sm font-bold text-white">A</span>
        </div>
        <div className="min-w-0">
          <span className="text-white font-bold tracking-tight block">
            {branding || 'Ash'}
          </span>
          <div className="flex items-center gap-1.5 text-white/40 text-xs font-mono">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isHealthy ? 'bg-green-400 animate-pulse' : 'bg-red-400'
              )}
            />
            {isHealthy ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="flex-1 overflow-auto px-3 py-4 scrollbar-thin">
        <div className="space-y-0.5">
          {allItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Bottom links */}
      <div className="border-t border-white/10 px-3 py-3 space-y-0.5">
        {allBottomLinks.map((item) => {
          const isActive = !item.external && pathname.startsWith(item.href)
          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 transition-all duration-200"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </a>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'text-indigo-400'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
        {health?.version && (
          <div className="px-3 py-2 text-xs text-white/20 font-mono">
            v{health.version}
          </div>
        )}
      </div>
    </nav>
  )
}
