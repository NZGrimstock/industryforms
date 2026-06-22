'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import {
  LayoutDashboard, Briefcase, Calendar, Receipt, MoreHorizontal,
  Users, FileText, Clock, Package, ClipboardList, CheckSquare,
  BarChart3, Settings, MessageSquare, Map, Wrench, X, Globe
} from 'lucide-react'

const primary = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
]

const more = [
  { href: '/enquiries', label: 'Enquiries', icon: MessageSquare },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/quotes', label: 'Quotes', icon: FileText },
  { href: '/jobs/map', label: 'Job Map', icon: Map },
  { href: '/timesheets', label: 'Timesheets', icon: Clock },
  { href: '/price-list', label: 'Price List', icon: Package },
  { href: '/forms', label: 'Forms', icon: ClipboardList },
  { href: '/todos', label: 'To-Do', icon: CheckSquare },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/website', label: 'Website', icon: Globe },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const STAFF_HREFS = new Set(['/dashboard', '/jobs', '/jobs/map', '/schedule', '/timesheets', '/forms', '/todos', '/settings'])

export function MobileNav({ isStaff = false }: { isStaff?: boolean }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const moreItems = isStaff ? more.filter(i => STAFF_HREFS.has(i.href)) : more
  // Staff don't see Invoices — swap it for Timesheets in the bottom bar.
  const primaryItems = isStaff
    ? [primary[0], primary[1], primary[2], { href: '/timesheets', label: 'Time', icon: Clock }]
    : primary

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === href
    if (href === '/jobs') return pathname === '/jobs' || (pathname.startsWith('/jobs/') && !pathname.startsWith('/jobs/map'))
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50 md:hidden safe-area-pb">
        <div className="flex">
          {primaryItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors',
                isActive(href) ? 'text-orange-500' : 'text-gray-400'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive(href) ? 'text-orange-500' : 'text-gray-400')} />
              {label}
            </Link>
          ))}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors',
              drawerOpen ? 'text-orange-500' : 'text-gray-400'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {/* "More" drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 safe-area-pb"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[var(--accent,#f97316)] flex items-center justify-center">
                  <Wrench className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-semibold text-sm text-gray-900">IndustryForms</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors',
                    isActive(href)
                      ? 'bg-orange-50 text-[var(--accent,#f97316)]'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Icon className={cn('h-5 w-5', isActive(href) ? 'text-orange-500' : 'text-gray-400')} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
