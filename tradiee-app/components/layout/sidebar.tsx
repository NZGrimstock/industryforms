'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from './sidebar-context'
import {
  LayoutDashboard, Users, FileText, Briefcase, Calendar,
  Clock, Receipt, BarChart3, Settings, Wrench, Package,
  MessageSquare, CheckSquare, Map, ClipboardList, ChevronLeft, ChevronRight,
  Truck, ShoppingCart, FileMinus, Globe, FolderKanban
} from 'lucide-react'

// Top-level items shown above the groups. Each owns its own gradient.
type TopItem = { href: string; label: string; icon: typeof LayoutDashboard; restingIcon: string; active: string; hover: string }
const topItems: TopItem[] = [
  {
    href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard,
    restingIcon: 'text-orange-500',
    active: 'bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500',
    hover: 'hover:bg-gradient-to-r hover:from-orange-100 hover:via-amber-100 hover:to-yellow-100',
  },
  {
    href: '/projects', label: 'Projects', icon: FolderKanban,
    restingIcon: 'text-emerald-500',
    active: 'bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500',
    hover: 'hover:bg-gradient-to-r hover:from-sky-50 hover:via-cyan-50 hover:to-emerald-50',
  },
]

type Group = {
  label: string
  hover: string           // full literal hover-gradient classes (Tailwind v4 needs literals)
  activeGradient: string  // saturated wash used when an item is selected
  iconColor: string       // resting icon tint inside this group
  items: Array<{ href: string; label: string; icon: typeof LayoutDashboard }>
}

const groups: Group[] = [
  {
    label: 'Customers & Jobs',
    hover: 'hover:bg-gradient-to-r hover:from-sky-50 hover:via-cyan-50 hover:to-emerald-50',
    activeGradient: 'bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500',
    iconColor: 'text-sky-600',
    items: [
      { href: '/enquiries', label: 'Enquiries', icon: MessageSquare },
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/quotes', label: 'Quotes', icon: FileText },
      { href: '/jobs', label: 'Jobs', icon: Briefcase },
      { href: '/jobs/map', label: 'Job Map', icon: Map },
      { href: '/schedule', label: 'Schedule', icon: Calendar },
      { href: '/timesheets', label: 'Timesheets', icon: Clock },
      { href: '/invoices', label: 'Invoices', icon: Receipt },
      { href: '/forms', label: 'Forms', icon: ClipboardList },
      { href: '/todos', label: 'To-Do', icon: CheckSquare },
    ],
  },
  {
    label: 'Suppliers & Orders',
    hover: 'hover:bg-gradient-to-r hover:from-amber-50 hover:via-orange-50 hover:to-rose-50',
    activeGradient: 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500',
    iconColor: 'text-[var(--accent,#f97316)]',
    items: [
      { href: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
      { href: '/bills', label: 'Bills', icon: FileMinus },
      { href: '/suppliers', label: 'Suppliers', icon: Truck },
      { href: '/price-list', label: 'Price List', icon: Package },
    ],
  },
  {
    label: 'Admin',
    hover: 'hover:bg-gradient-to-r hover:from-violet-50 hover:via-fuchsia-50 hover:to-pink-50',
    activeGradient: 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500',
    iconColor: 'text-violet-600',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/website', label: 'Website', icon: Globe },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href
  if (href === '/jobs') return pathname === '/jobs' || (pathname.startsWith('/jobs/') && !pathname.startsWith('/jobs/map'))
  return pathname.startsWith(href)
}

// Field staff get a focused nav — no sales/financial/procurement/projects pages.
const STAFF_HREFS = new Set(['/dashboard', '/jobs', '/jobs/map', '/schedule', '/timesheets', '/forms', '/todos', '/settings'])
const STAFF_TOP_HREFS = new Set(['/dashboard'])

export function Sidebar({ isStaff = false }: { isStaff?: boolean }) {
  const pathname = usePathname()
  const { collapsed, setCollapsed } = useSidebar()
  const visibleGroups = isStaff
    ? groups.map(g => ({ ...g, items: g.items.filter(i => STAFF_HREFS.has(i.href)) })).filter(g => g.items.length > 0)
    : groups

  return (
    // Hidden on mobile; icon-only on md (tablet); full on lg (desktop) unless toggled
    <aside className={cn(
      'hidden md:flex fixed inset-y-0 left-0 bg-white border-r border-gray-200 flex-col z-40 transition-all duration-200',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-gray-100 shrink-0',
        collapsed ? 'justify-center px-0' : 'px-5 justify-between'
      )}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-sm">
            <Wrench className="h-4 w-4 text-white" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-sm shrink-0">
                <Wrench className="h-4 w-4 text-white" />
              </div>
              <span className="text-gray-900 font-bold text-[15px] tracking-tight truncate">IndustryForms</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {/* Top-level items (each owns its own gradient) */}
        <ul className="space-y-0.5">
          {topItems.filter(t => !isStaff || STAFF_TOP_HREFS.has(t.href)).map(({ href, label, icon: Icon, restingIcon, active: activeClass, hover }) => {
            const active = isActive(pathname, href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg text-sm font-medium transition-all',
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                    active
                      ? `${activeClass} text-white shadow-sm`
                      : `text-gray-700 ${hover} hover:text-gray-900`
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : restingIcon)} />
                  {!collapsed && label}
                </Link>
              </li>
            )
          })}
        </ul>

        {visibleGroups.map(group => (
          <div key={group.label} className="mt-4">
            {collapsed
              ? <div className="mx-2 mb-1.5 border-t border-gray-100" />
              : <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
            }
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={collapsed ? label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg text-sm font-medium transition-all',
                        collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                        active
                          ? `${group.activeGradient} text-white shadow-sm`
                          : `text-gray-700 ${group.hover} hover:text-gray-900`
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : group.iconColor)} />
                      {!collapsed && label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="p-2 border-t border-gray-100">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex justify-center text-gray-400 hover:text-gray-700 transition-colors p-1.5 rounded"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  )
}
