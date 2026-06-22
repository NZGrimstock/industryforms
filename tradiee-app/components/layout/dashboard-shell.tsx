'use client'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import { useSidebar } from './sidebar-context'
import { accentForPath, hasRouteAccent } from '@/lib/route-accent'
import { darken } from '@/lib/extract-color'

export function DashboardShell({ children, brandAccent }: { children: React.ReactNode; brandAccent?: string | null }) {
  const { collapsed } = useSidebar()
  const pathname = usePathname()
  // Route accent wins on mapped pages; on unscoped pages (dashboard, upgrade,
  // settings) the company's brand accent (or orange) takes over.
  const routed = hasRouteAccent(pathname)
  const brand = brandAccent ?? '#f97316'
  const accent = routed ? accentForPath(pathname) : {
    solid: brand, solidHover: darken(brand, 0.1),
    soft: '#fff7ed', softText: darken(brand, 0.3), ring: brand,
  }
  const style = {
    '--accent': accent.solid,
    '--accent-hover': accent.solidHover,
    '--accent-soft': accent.soft,
    '--accent-soft-text': accent.softText,
    '--accent-ring': accent.ring,
    // --brand is always the company brand (independent of route) for the
    // global "+ New" pill and any other route-agnostic brand chrome.
    '--brand': brand,
    '--brand-hover': darken(brand, 0.1),
  } as React.CSSProperties
  return (
    <main
      style={style}
      className={cn(
        'flex-1 min-h-screen bg-gray-50 pb-16 md:pb-0 transition-all duration-200',
        // On mobile: no left margin (sidebar hidden)
        // On md+: match sidebar width (icon 3.5rem or full 14rem)
        collapsed ? 'md:ml-14' : 'md:ml-56'
      )}
    >
      {children}
    </main>
  )
}
